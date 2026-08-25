import re

def clean_wafer_id(raw):
    """Format wafer_id into standard two-digit string without letter W/w (e.g. W10 -> '10', W1 -> '01')"""
    if not raw:
        return None
    raw_str = str(raw).strip()
    m = re.search(r'^[Ww]?(\d{1,2})$', raw_str)
    if m:
        return f"{int(m.group(1)):02d}"
    m_sub = re.search(r'[Ww](\d{1,2})\b', raw_str)
    if m_sub:
        return f"{int(m_sub.group(1)):02d}"
    return raw_str

"""
ftp_service.py
FTP 自动抓取服务：连接测试、目录扫描、CSV/ZIP/GZ 下载解析入库、去重日志。
所有耗时操作在独立线程中运行，不阻塞 FastAPI 主线程。
支持 .csv / .txt / .zip / .gz 文件；.gz 解压后仅处理其中的 CSV 和 TXT 格式。
"""
import os
import io
import ftplib
import ssl
import tempfile
import traceback
import threading
import subprocess
import stat
import posixpath
import paramiko
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.core.database import SessionLocal
from app.services.smtp_dynamic import decrypt_password


def get_memory_usage_percent() -> float:
    try:
        if os.path.exists("/proc/meminfo"):
            with open("/proc/meminfo", "r") as f:
                lines = f.readlines()
            mem_total = 0
            mem_avail = 0
            for line in lines:
                if line.startswith("MemTotal:"):
                    mem_total = int(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    mem_avail = int(line.split()[1])
            if mem_total > 0:
                return 100.0 * (1.0 - (mem_avail / mem_total))
    except Exception:
        pass
    
    try:
        import psutil
        return psutil.virtual_memory().percent
    except ImportError:
        pass
        
    return 0.0

class DynamicConcurrencyController:
    def __init__(self, normal_limit: int = 3, high_mem_limit: int = 1):
        self.normal_limit = normal_limit
        self.high_mem_limit = high_mem_limit
        self.current_limit = normal_limit
        self.running_count = 0
        self.cond = threading.Condition()

    def acquire(self, timeout: int = 300) -> bool:
        """Acquire a concurrency slot. Returns True if acquired, False if timed out."""
        import time as _time
        with self.cond:
            start_ts = _time.time()
            while True:
                percent = get_memory_usage_percent()
                if percent >= 80.0:
                    if self.current_limit != self.high_mem_limit:
                        print(f"[concurrency] Memory usage is {percent:.1f}%, throttling concurrency limit to {self.high_mem_limit} thread.")
                    self.current_limit = self.high_mem_limit
                elif percent <= 60.0:
                    if self.current_limit != self.normal_limit:
                        print(f"[concurrency] Memory usage is {percent:.1f}%, restoring concurrency limit to {self.normal_limit} threads.")
                    self.current_limit = self.normal_limit

                if self.running_count < self.current_limit:
                    self.running_count += 1
                    return True
                if _time.time() - start_ts >= timeout:
                    print(f"[concurrency] Acquire timeout after {timeout}s, giving up to avoid blocking other OSATs.")
                    return False
                self.cond.wait(timeout=1.0)

    def release(self):
        with self.cond:
            self.running_count -= 1
            self.cond.notify_all()

concurrency_controller = DynamicConcurrencyController(normal_limit=3, high_mem_limit=1)




def _detect_osat_data_type(osat, filename: str, parsed_test_stage: Optional[str]) -> str:
    base_name = os.path.splitext(os.path.basename(filename))[0].strip()
    # 文件名中只要包含 QA（如 xxx(QA).csv、xxxQA.csv），就归为 QA 类型
    if 'QA' in base_name.upper():
        return 'QA'
    if parsed_test_stage:
        return parsed_test_stage
    return getattr(osat, 'data_type', None) or 'FT'


def _extract_rar_archive(archive_path: str, extract_dir: str) -> None:
    try:
        import rarfile

        with rarfile.RarFile(archive_path, "r") as rf:
            rf.extractall(extract_dir)
        return
    except Exception as rar_exc:
        result = subprocess.run(
            ["unar", "-quiet", "-force-overwrite", "-output-directory", extract_dir, archive_path],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return

        msg = (result.stderr or result.stdout or str(rar_exc)).strip()
        raise Exception(f"RAR extraction failed: {msg or 'unknown error'}")


class ImplicitFTP_TLS(ftplib.FTP_TLS):
    """FTP_TLS variant for implicit FTPS, where TLS starts immediately after connect."""
    def connect(self, host='', port=0, timeout=-999, source_address=None):
        if port == 0:
            port = 990
        super().connect(host, port, timeout, source_address)
        context = self.context or ssl.create_default_context()
        self.sock = context.wrap_socket(self.sock, server_hostname=self.host)
        self.af = self.sock.family
        self.file = self.sock.makefile('r', encoding=self.encoding)
        self.welcome = self.getresp()
        return self.welcome

    def login(self, user='', passwd='', acct='', secure=True):
        return ftplib.FTP.login(self, user, passwd, acct)

# ──────────────────────────────────────────
# 进程内并发去重锁（防止多线程同时处理同一文件）
# key: (osat_id, remote_path)  value: threading.Lock 的占用标记
# ──────────────────────────────────────────
_file_in_progress: set = set()
_file_in_progress_lock = threading.Lock()

# Concurrent execution lock for OSAT fetch jobs
# Concurrent execution lock for OSAT fetch jobs with start timestamp tracking
_osat_in_progress: dict = {}
_osat_in_progress_lock = threading.Lock()
_OSAT_FETCH_TIMEOUT_SECONDS = 1800.0  # 30 minutes maximum lock duration


class SftpAdapter:
    def __init__(self, ssh_client, sftp_client):
        self.ssh = ssh_client
        self.sftp = sftp_client

    def getwelcome(self) -> str:
        try:
            banner = self.ssh.get_transport().get_banner()
            if banner:
                return banner.decode('utf-8', errors='ignore').strip()
        except Exception:
            pass
        return "SSH SFTP Connection Successful"

    def quit(self):
        try:
            self.sftp.close()
        except Exception:
            pass
        try:
            self.ssh.close()
        except Exception:
            pass

    def close(self):
        self.quit()

    def retrlines(self, cmd: str, callback):
        # cmd is like "LIST /path/to/dir"
        path = cmd[5:] if cmd.startswith("LIST ") else cmd
        if not path:
            path = "."
        # Normalize path to avoid posix double slashes and Windows issues
        path = posixpath.normpath(path)
        
        try:
            attrs = self.sftp.listdir_attr(path)
            for attr in attrs:
                is_dir = stat.S_ISDIR(attr.st_mode)
                dir_char = 'd' if is_dir else '-'
                size = attr.st_size
                perms = "rwxr-xr-x"
                # Simulating a basic UNIX ftp directory entry format
                line = f"{dir_char}{perms} 1 owner group {size} Jan 01 2026 {attr.filename}"
                callback(line)
        except Exception as e:
            raise Exception(f"SFTP listdir error: {e}")

    def sendcmd(self, cmd: str):
        pass

    def size(self, remote_path: str) -> int:
        try:
            remote_path = posixpath.normpath(remote_path)
            return self.sftp.stat(remote_path).st_size
        except Exception:
            return 0

    def retrbinary(self, cmd: str, callback):
        # cmd is like "RETR /path/to/file"
        path = cmd[5:] if cmd.startswith("RETR ") else cmd
        path = posixpath.normpath(path)
        try:
            with self.sftp.open(path, 'rb') as remote_file:
                while True:
                    chunk = remote_file.read(32768)
                    if not chunk:
                        break
                    callback(chunk)
        except Exception as e:
            raise Exception(f"SFTP download error: {e}")


def _make_sftp(osat) -> SftpAdapter:
    password = decrypt_password(osat.ftp_pass_enc) if osat.ftp_pass_enc else ""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    port = osat.ftp_port if osat.ftp_port else 22
    # If the user has default FTP port 21 but protocol is SFTP, override to 22
    if port == 21:
        port = 22
    ssh.connect(
        hostname=osat.ftp_host,
        port=port,
        username=osat.ftp_user,
        password=password,
        timeout=120,
        allow_agent=False,
        look_for_keys=False
    )
    sftp = ssh.open_sftp()
    return SftpAdapter(ssh, sftp)


# ──────────────────────────────────────────
# FTP 连接工厂（每次新建，线程安全）
# ──────────────────────────────────────────

def _make_ftp(osat):
    """建立 FTP 或 SFTP 连接并登录（被调用方需自行 close()/quit()）"""
    protocol = getattr(osat, "protocol", "ftp") or "ftp"
    if protocol == "sftp":
        return _make_sftp(osat)

    password = decrypt_password(osat.ftp_pass_enc) if osat.ftp_pass_enc else ""
    encryption = getattr(osat, "ftp_encryption", "plain") or "plain"
    if encryption == "implicit_tls_required":
        ftp = ImplicitFTP_TLS()
        ftp.connect(osat.ftp_host, osat.ftp_port or 990, timeout=120)
    elif encryption in ("explicit_tls_optional", "explicit_tls_required"):
        ftp = ftplib.FTP_TLS()
        ftp.connect(osat.ftp_host, osat.ftp_port, timeout=120)
        try:
            ftp.auth()
        except Exception:
            if encryption == "explicit_tls_required":
                raise
    else:
        ftp = ftplib.FTP()
        ftp.connect(osat.ftp_host, osat.ftp_port, timeout=120)
    # Use UTF-8 encoding for FTP filenames to support Chinese characters
    ftp.encoding = 'utf-8'
    ftp.login(osat.ftp_user, password)
    if isinstance(ftp, ftplib.FTP_TLS) and encryption != "plain":
        try:
            ftp.prot_p()
        except Exception:
            if encryption in ("explicit_tls_required", "implicit_tls_required"):
                raise
    ftp.set_pasv(True)
    return ftp


# ──────────────────────────────────────────
# 测试 FTP 连接
# ──────────────────────────────────────────

def test_ftp_connection(osat) -> dict:
    """
    测试 FTP 连接是否正常。
    返回 {"ok": True, "welcome": "..."} 或 {"error": "..."}
    """
    try:
        ftp = _make_ftp(osat)
        welcome = ftp.getwelcome()
        ftp.quit()
        return {"ok": True, "welcome": welcome}
    except ftplib.all_errors as e:
        return {"error": f"FTP连接失败: {str(e)}"}
    except Exception as e:
        return {"error": f"连接异常: {str(e)}"}


# ──────────────────────────────────────────
# 递归扫描 FTP 目录，收集所有 .csv 和 .zip 文件路径
# ──────────────────────────────────────────

def _parse_ftp_line(line: str) -> Optional[tuple]:
    """
    解析 FTP LIST 输出的一行，兼容 Unix/Linux 和 Windows/IIS 目录列表格式。
    返回 (name, is_dir) 或者 None
    """
    parts = line.split()
    if not parts:
        return None

    # 1. Unix/Linux 格式 (例如: drwxr-xr-x  2 root  root  4096 Jan  1 00:00 foldername)
    # 首字段以 'd', '-', 'l' 开头且长度通常为 10
    if len(parts) >= 9 and (parts[0].startswith('-') or parts[0].startswith('d') or parts[0].startswith('l')):
        perms = parts[0]
        is_dir = perms.startswith('d')
        name = ' '.join(parts[8:])
        return name, is_dir

    # 2. Windows/IIS 格式 (例如: 02-11-26  03:04PM       <DIR>          foldername)
    if len(parts) >= 4:
        if parts[2].upper() == '<DIR>':
            name = ' '.join(parts[3:])
            return name, True
        elif parts[2].isdigit():
            name = ' '.join(parts[3:])
            return name, False

    return None


def _walk_ftp(ftp: ftplib.FTP, current_dir: str, result: List[str], visited: set, skip_sum_files: bool = True):
    """
    DFS 递归遍历 FTP 目录，收集符合条件的原始数据文件路径。
    """
    import os
    # 路径标准化，防止大小写/斜杠引起的回环判断失效
    normalized_path = os.path.normpath(current_dir).replace('\\', '/')
    if normalized_path in visited:
        print(f"[ftp_scan] 发现循环符号链接或已访问过的目录: {normalized_path}，跳过")
        return
    visited.add(normalized_path)

    try:
        items = []
        ftp.retrlines(f'LIST {current_dir or "."}', items.append)

        subdirs = []
        for item in items:
            parsed = _parse_ftp_line(item)
            if not parsed:
                continue
            name, is_dir = parsed

            # 排除当前目录 '.' 和上级目录 '..'
            if name in ('.', '..'):
                continue

            full_path = f"{current_dir}/{name}" if current_dir else name

            if is_dir:
                subdirs.append(full_path)
            else:
                lower_name = name.lower()
                # 排除 .std 和 .mdb 相关文件（例如 .std, .std.zip, .mdb, .mdb.zip 等）
                if ('.std.' in lower_name or lower_name.endswith('.std')
                        or '.mdb.' in lower_name or lower_name.endswith('.mdb')):
                    continue
                # 排除 Summary 文件：sum.csv / sum.csv.gz / sum.csv.zip
                # （即解压后内部文件名带 _sum 后缀的所有变体）
                if skip_sum_files and (lower_name.endswith('sum.csv')
                        or lower_name.endswith('sum.csv.gz')
                        or lower_name.endswith('sum.csv.zip')):
                    continue
                if (lower_name.endswith('.csv') or lower_name.endswith('.zip') or lower_name.endswith('.rar')
                        or lower_name.endswith('.txt') or lower_name.endswith('.gz')
                        or lower_name.endswith('.xls') or lower_name.endswith('.xlsx')):
                    result.append(full_path)

        # 递归遍历子目录
        for subdir in subdirs:
            _walk_ftp(ftp, subdir, result, visited, skip_sum_files)

    except Exception as e:
        print(f"[ftp_scan] 递归遍历目录 {current_dir} 时出错 (跳过该子目录): {e}")


def scan_ftp_files(osat, scan_type: str = 'both') -> List[str]:
    """
    递归扫描 osat 的远程目录，
    收集完整 FTP 路径列表。scan_type 支持 'both', 'data', 'summary'。
    """
    ftp = _make_ftp(osat)
    result = []
    visited = set()
    try:
        scan_roots = []
        if scan_type in ('both', 'data'):
            scan_roots.append((osat.ftp_remote_dir or "/", True, "Data"))
        if scan_type in ('both', 'summary'):
            scan_roots.append((getattr(osat, "ftp_summary_dir", None) or "", False, "Summary"))
        seen_roots = set()
        for raw_path, skip_sum_files, label in scan_roots:
            path = raw_path.rstrip('/') or '/'
            scan_key = (path, skip_sum_files)
            if scan_key in seen_roots:
                continue
            seen_roots.add(scan_key)
            print(f"[ftp_scan] 开始对 OSAT={osat.name} 的 {label} 目录进行递归扫描: {path or '.'}")
            _walk_ftp(ftp, path, result, visited, skip_sum_files)
        print(f"[ftp_scan] 递归扫描完毕，共发现 {len(result)} 个符合要求的源数据文件")
    except Exception as e:
        print(f"[ftp_scan] 扫描目录 {osat.ftp_remote_dir} 出错: {e}")
    finally:
        try:
            ftp.quit()
        except Exception:
            pass
    return result


# ──────────────────────────────────────────
# 计算待上传文件（去重）
# ──────────────────────────────────────────

# Maximum failed retries allowed for a single file (files exceeding this limit will be skipped)
_MAX_FAIL_RETRIES = 3
PROCESSING_TIMEOUT_MINUTES = 30   # Records stuck in processing for more than this many minutes are marked as failed
_DOWNLOAD_WORKERS = 8            # Number of concurrent FTP download threads
_PARSE_WORKERS = 5

def get_parse_workers_count() -> int:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    try:
        tz = ZoneInfo("Asia/Shanghai")
        now = datetime.now(tz)
        is_weekday = now.weekday() < 5
        is_work_hours = 9 <= now.hour < 19
        if is_weekday and is_work_hours:
            return 16
        else:
            return 24
    except Exception as e:
        print("[concurrency] Failed to calculate dynamic parse workers count: " + str(e))
        return 16                # 并发解析线程数


def get_new_files(db, osat_id: int, all_remote_paths: list) -> list:
    """
    Check ftp_upload_logs to filter out remote paths that are already processed.
    Excluded cases:
    1. status='success' or 'processing' or 'pending' or 'downing'
    2. status='failed' and total failures >= _MAX_FAIL_RETRIES
    3. status='failed' and within the retry backoff window
    4. status='failed' due to parsing error (should not be re-downloaded)
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from sqlalchemy import func
    from datetime import datetime, timezone

    already_done = set(
        row.remote_path
        for row in db.query(FtpUploadLog.remote_path)
        .filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.status.in_(['success', 'processing', 'pending', 'downing', 'skipped', 'manual skip', 'ignored'])
        )
        .all()
    )

    failure_stats = db.query(
        FtpUploadLog.remote_path,
        func.count(FtpUploadLog.id).label('fail_count'),
        func.max(FtpUploadLog.uploaded_at).label('last_fail_time')
    ).filter(
        FtpUploadLog.osat_id == osat_id,
        FtpUploadLog.status == 'failed'
    ).group_by(FtpUploadLog.remote_path).all()

    too_many_failures = set()
    too_soon_to_retry = set()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for path, fail_count, last_fail_time in failure_stats:
        if fail_count >= _MAX_FAIL_RETRIES:
            too_many_failures.add(path)
            continue
        
        if fail_count == 1:
            backoff_minutes = 10
        elif fail_count == 2:
            backoff_minutes = 30
        else:
            backoff_minutes = 60
            
        last_fail_time_naive = last_fail_time.replace(tzinfo=None) if last_fail_time else now
        if (now - last_fail_time_naive).total_seconds() < backoff_minutes * 60:
            too_soon_to_retry.add(path)

    # Exclude files that failed during parsing to avoid redundant download
    parse_failed = set(
        row.remote_path
        for row in db.query(FtpUploadLog.remote_path)
        .filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.status == 'failed',
            FtpUploadLog.error_msg.like('%[Parse Failed]%')
        )
        .all()
    )

    if too_many_failures:
        print(f"[ftp_fetch] Filtered {len(too_many_failures)} files exceeding retry limit ({_MAX_FAIL_RETRIES})")
    if too_soon_to_retry:
        print(f"[ftp_fetch] Filtered {len(too_soon_to_retry)} files in backoff period")
    if parse_failed:
        print(f"[ftp_fetch] Filtered {len(parse_failed)} files that failed during parsing")

    excluded = already_done | too_many_failures | too_soon_to_retry | parse_failed
    return [p for p in all_remote_paths if p not in excluded]
# ??????????????????????????????????????????
# ?? processing ????
# ??????????????????????????????????????????

def _reset_stuck_processing_logs(db) -> int:
    """
    Reset logs stuck in processing status for more than PROCESSING_TIMEOUT_MINUTES to failed.
    Compare using the database server time to avoid client/server timezone differences.
    Returns the count of reset records.
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from sqlalchemy import func

    stuck = db.query(FtpUploadLog).filter(
        FtpUploadLog.status.in_(['processing', 'downing', 'pending']),
        FtpUploadLog.uploaded_at < func.now() - timedelta(minutes=PROCESSING_TIMEOUT_MINUTES)
    ).all()

    count = len(stuck)
    for log in stuck:
        log.status = 'failed'
        log.error_msg = (
            f'Processing timeout (not completed within {PROCESSING_TIMEOUT_MINUTES} minutes, automatically marked as failed)'
        )
        print(f"[ftp_fetch] ⏰ Timeout reset: {log.filename} "
              f"(id={log.id}, started={log.uploaded_at})")
    if stuck:
        try:
            db.commit()
        except Exception as commit_ex:
            print(f"[ftp_fetch] Error committing stuck processing logs reset: {commit_ex}")
            db.rollback()
            try:
                db.commit()
            except Exception as retry_ex:
                print(f"[ftp_fetch] Retry commit also failed: {retry_ex}")
                db.rollback()
    return count


def _reset_all_unfinished_logs(db) -> int:
    """
    Reset ALL unfinished logs (processing/downing/pending) across ALL OSATs to failed.
    Called before FTP scan to ensure clean state for re-processing after scan completes.
    Returns the count of reset records.
    """
    from app.models.ftp_upload_log import FtpUploadLog

    unfinished = db.query(FtpUploadLog).filter(
        FtpUploadLog.status.in_(['processing', 'downing', 'pending'])
    ).all()

    count = len(unfinished)
    for log in unfinished:
        prev_status = log.status
        log.status = 'failed'
        log.error_msg = 'Reset to failed before FTP scan (all unfinished logs cleared for re-processing)'
        print(f"[ftp_fetch] Reset unfinished log: {log.filename} (id={log.id}, osat_id={log.osat_id}, prev_status={prev_status})")
    if unfinished:
        try:
            db.commit()
        except Exception as commit_ex:
            print(f"[ftp_fetch] Error committing reset all unfinished logs: {commit_ex}")
            db.rollback()
            try:
                db.commit()
            except Exception:
                db.rollback()
    return count


# ──────────────────────────────────────────
# 去除 csv / csv.gz 重复对
# ──────────────────────────────────────────

def _deduplicate_csv_gz(all_paths: List[str]) -> List[str]:
    """
    若同目录下同时存在 abc.csv 和 abc.csv.gz（解压后是同一内容），
    只保留 abc.csv，跳过 abc.csv.gz，避免重复入库。
    同理，若只有 abc.csv.gz 则正常保留。
    """
    # 构建所有路径的小写集合，用于快速查找
    path_set_lower = {p.lower() for p in all_paths}
    result = []
    for path in all_paths:
        lower = path.lower()
        if lower.endswith('.csv.gz'):
            # 去掉 .gz 得到对应 csv 路径
            csv_counterpart = path[:-3]   # abc.csv.gz -> abc.csv
            if csv_counterpart.lower() in path_set_lower:
                print(f"[ftp_scan] 跳过 {path}（同目录已有对应 {csv_counterpart}，避免重复入库）")
                continue
        elif lower.endswith('.txt.gz'):
            txt_counterpart = path[:-3]   # abc.txt.gz -> abc.txt
            if txt_counterpart.lower() in path_set_lower:
                print(f"[ftp_scan] 跳过 {path}（同目录已有对应 {txt_counterpart}，避免重复入库）")
                continue
        result.append(path)
    return result


# ──────────────────────────────────────────
# 下载并处理单个 CSV 文件
# ──────────────────────────────────────────

def process_one_file(db, osat, remote_path: str, admin_user_id: int) -> dict:
    """
    下载单个 CSV、TXT、ZIP 或 GZ 压缩文件，解析，写入数据库（同手动上传流程）。
    GZ 文件解压后仅处理其中的 CSV 和 TXT 格式，其他格式忽略。
    返回 {"ok": True, "lot_id": <id>} 或 {"error": "..."}
    """
    from app.models.ftp_upload_log import FtpUploadLog
    effective_osat_name = osat.name.split('_')[0] if osat.name and '_' in osat.name else osat.name
    from app.models.lot import Lot
    from app.core.config import settings as app_settings
    from app.services.parsers.detector import detect_tester
    from app.services.parsers import parse_file
    from app.services.parsers.acco_parser import parse_datetime_str
    from datetime import timedelta
    import zipfile
    import gzip
    import shutil

    filename = os.path.basename(remote_path)
    UPLOAD_DIR = os.path.expanduser(app_settings.UPLOAD_DIR)

    # ── 进程内线程锁：防止两个并发线程同时处理同一文件（竞态条件）──────────
    _lock_key = (osat.id, remote_path)
    with _file_in_progress_lock:
        if _lock_key in _file_in_progress:
            print(f"[ftp_fetch] ⚠ 文件 {filename} 正在被其他线程处理，本线程跳过（防重复）")
            return {"ok": True, "lot_id": None, "skipped": True}
        _file_in_progress.add(_lock_key)

    try:
        existing_log = db.query(FtpUploadLog).filter(
            FtpUploadLog.osat_id == osat.id,
            FtpUploadLog.remote_path == remote_path,
            FtpUploadLog.status.in_(['success', 'processing', 'pending', 'downing'])
        ).first()
        if existing_log:
            print(f"[ftp_fetch] ⚠ 文件 {filename} 已存在有效日志记录"
                  f"(status={existing_log.status})，跳过重复处理")
            return {"ok": True, "lot_id": existing_log.lot_id_created, "skipped": True}
    finally:
        # 注意：锁在整个 process 结束后才释放（见函数末尾的 finally 块）
        pass

    # 标记为处理中
    log = FtpUploadLog(
        osat_id=osat.id,
        remote_path=remote_path,
        filename=filename,
        status='processing',
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    # 下载到临时目录
    tmp_dir = tempfile.mkdtemp(prefix='ftp_dl_')
    local_file = os.path.join(tmp_dir, filename)

    try:
        ftp = _make_ftp(osat)
        file_size = 0
        try:
            ftp.sendcmd('TYPE I')
            file_size = ftp.size(remote_path) or 0
            if file_size > 50 * 1024 * 1024 * 1024:
                raise Exception(f"Remote file size {file_size} exceeds 50GB limit, download aborted")
            with open(local_file, 'wb') as f:
                ftp.retrbinary(f'RETR {remote_path}', f.write)
        finally:
            try:
                ftp.quit()
            except Exception:
                pass

        log.file_size = file_size

        _, ext = os.path.splitext(filename)
        ext = ext.lower()

        # 待解析的 CSV 本地文件列表
        csv_files_to_process = []

        if ext in ('.zip', '.rar'):
            # ZIP 文件：解压并查找所有 CSV / TXT / XLS / XLSX 文件
            extract_dir = os.path.join(tmp_dir, 'extracted')
            os.makedirs(extract_dir, exist_ok=True)
            if ext == '.zip':
                with zipfile.ZipFile(local_file, 'r') as z:
                    z.extractall(extract_dir)
            else:
                _extract_rar_archive(local_file, extract_dir)
            has_log_files = False
            for root, _, files in os.walk(extract_dir):
                for f in files:
                    flower = f.lower()
                    if (flower.endswith('.csv') or (flower.endswith('.txt') and 'ets' in flower)
                            or flower.endswith('.xls') or flower.endswith('.xlsx')):
                        csv_files_to_process.append(os.path.join(root, f))
                    elif flower.endswith('.log'):
                        has_log_files = True
            if not csv_files_to_process:
                if has_log_files:
                    print(f"[ftp_fetch] Archive only contains .log files, marking as success")
                    log.status = 'success'
                    log.uploaded_at = datetime.now(timezone.utc)
                    db.commit()
                    return {"ok": True, "lot_id": None}
                else:
                    raise Exception("Archive does not contain any valid .csv, .txt, .xls or .xlsx files")

        elif ext == '.gz':
            # GZ 文件：解压，仅当内部文件是 CSV 或 TXT 时才处理
            # GZ 通常包含单个文件，内部文件名为去掉 .gz 后缀的部分
            inner_name = os.path.splitext(filename)[0]  # e.g. data.csv.gz -> data.csv
            inner_ext = os.path.splitext(inner_name)[1].lower()
            if inner_ext not in ('.csv', '.txt'):
                # 内部文件不是 CSV/TXT，跳过（标记为成功但不导入数据）
                print(f"[ftp_fetch] GZ 内部文件 '{inner_name}' 不是 CSV/TXT 格式，跳过解析")
                log.status = 'success'
                log.uploaded_at = datetime.now(timezone.utc)
                db.commit()
                return {"ok": True, "lot_id": None}

            extract_dir = os.path.join(tmp_dir, 'extracted')
            os.makedirs(extract_dir, exist_ok=True)
            inner_path = os.path.join(extract_dir, inner_name)
            with gzip.open(local_file, 'rb') as gz_f:
                with open(inner_path, 'wb') as out_f:
                    shutil.copyfileobj(gz_f, out_f)

            csv_files_to_process.append(inner_path)
            print(f"[ftp_fetch] GZ 已解压: {filename} -> {inner_name}")

        elif ext == '.log':
            print(f"[ftp_fetch] 发现 .log 文件 '{filename}'，放弃并标记成功")
            log.status = 'success'
            log.uploaded_at = datetime.now(timezone.utc)
            db.commit()
            return {"ok": True, "lot_id": None}

        elif ext in ('.csv', '.xls', '.xlsx') or (ext == '.txt' and 'ets' in filename.lower()):
            # 单个 CSV, TXT, XLS 或 XLSX 文件
            csv_files_to_process.append(local_file)
        else:
            raise Exception(f"不支持的文件格式: {ext}")

        # 确保 txt/xls/xlsx 文件排在 csv 文件后面进行处理
        csv_files_to_process.sort(key=lambda p: (1 if (p.lower().endswith('.txt') and 'ets' in os.path.basename(p).lower() or p.lower().endswith(('.xls', '.xlsx'))) else 0, p))

        last_lot_id = None

        # 逐个处理解压出来的 CSV 或 TXT 文件
        for csv_filepath in csv_files_to_process:
            csv_filename = os.path.basename(csv_filepath)
            save_name = csv_filename
            target_dir = SUMMARY_DIR if is_summary_file(save_name) else DATA_DIR
            save_path = os.path.join(target_dir, save_name)

            # ── 重名文件处理：检查是否已有对应 Lot 记录 ──
            existing_lot = db.query(Lot).filter(
                Lot.filename == csv_filename,
                Lot.osat_name == effective_osat_name,
                Lot.status.in_(['processed', 'pending', 'processing'])
            ).first()
            if existing_lot:
                # 已有有效 Lot 记录，跳过此文件，不重复入库
                print(f"[ftp_fetch] 文件 {csv_filename} 已有对应 Lot 记录"
                      f"（id={existing_lot.id}, status={existing_lot.status}），跳过")
                last_lot_id = existing_lot.id
                continue
            
            if os.path.exists(save_path):
                # 孤立文件（无 Lot 记录），覆盖写入
                print(f"[ftp_fetch] 文件 {csv_filename} 在本地 uploads 目录中已存在但无对应 Lot 记录，覆盖写入")

            shutil.copy2(csv_filepath, save_path)

            if csv_filename.lower().endswith(('.xls', '.xlsx')):
                try:
                    from app.services.parsers.xls_summary_parser import parse_and_save_xls_summary
                    created_lots = parse_and_save_xls_summary(save_path, db, None, osat_name=effective_osat_name)
                    
                    # FTP XLS/XLSX Summary compression in _do_download
                    zip_path = save_path + ".zip"
                    import zipfile
                    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                        zf.write(save_path, save_name)
                    
                    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
                        if os.path.exists(save_path):
                            os.remove(save_path)
                        active_lots = db.query(Lot).filter(Lot.filename == save_name).all()
                        for lot in active_lots:
                            lot.storage_path = zip_path
                            db.add(lot)
                        db.commit()

                    active_lots = db.query(Lot).filter(Lot.filename == save_name).all()
                    if active_lots:
                        last_lot_id = active_lots[-1].id
                except Exception as ex:
                    traceback.print_exc()
                    raise ex
                continue

            if csv_filename.lower().endswith('.txt') and 'ets' in csv_filename.lower():
                # Process Summary txt file
                lot = Lot(
                    filename=save_name,
                    storage_path=save_path,
                    file_size=os.path.getsize(save_path),
                    status='processed',
                    data_source='ftp',
                    storage_type='local',
                    local_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
                    upload_date=datetime.now(timezone.utc),
                    test_machine='ETS364',
                    user_id=admin_user_id,
                    osat_name=effective_osat_name,
                    data_type='Summary',
                    ftp_path=remote_path,
                )

                from app.services.parsers.summary_parser import parse_summary_txt, apply_summary_to_csv, find_corresponding_csv_filename
                summary_data = parse_summary_txt(save_path)
                if summary_data.get('beginning_time'):
                    lot.beginning_time = summary_data['beginning_time']
                    lot.test_date = summary_data['beginning_time']
                if summary_data.get('ending_time'):
                    lot.ending_time = summary_data['ending_time']
                if summary_data.get('tester'):
                    lot.mp_tester = summary_data['tester']
                if summary_data.get('probecard'):
                    lot.probecard = summary_data['probecard']
                if summary_data.get('program'):
                    lot.program = summary_data['program']
                    prefix = summary_data['program'].split('_')[0]
                    from app.models.product_mapping import ProductMapping
                    mapping = db.query(ProductMapping).filter(
                        ProductMapping.program_prefix == prefix
                    ).first()
                    if mapping:
                        lot.product_name = mapping.product_name
                    elif not lot.product_name and '_' in lot.program:
                        lot.product_name = prefix.strip()
                if summary_data.get('lot_id'):
                    lot.lot_id = summary_data['lot_id']
                if summary_data.get('wafer_id'):
                    lot.wafer_id = clean_wafer_id(summary_data['wafer_id'])
                if summary_data.get('handler'):
                    lot.handler = summary_data['handler']
                if summary_data.get('die_count') is not None:
                    lot.die_count = summary_data['die_count']
                if summary_data.get('pass_count') is not None:
                    lot.pass_count = summary_data['pass_count']
                if summary_data.get('fail_count') is not None:
                    lot.fail_count = summary_data['fail_count']
                if summary_data.get('yield_rate') is not None:
                    lot.yield_rate = summary_data['yield_rate']

                db.add(lot)
                db.commit()
                db.refresh(lot)

                # FTP TXT Summary compression in _do_download
                zip_path = save_path + ".zip"
                import zipfile
                with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                    zf.write(save_path, save_name)
                
                if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
                    if os.path.exists(save_path):
                        os.remove(save_path)
                    lot.storage_path = zip_path
                    db.add(lot)
                    db.commit()

                from app.models.bin_summary import BinSummary
                for bin_num, bin_info in summary_data.get('bins', {}).items():
                    bin_name = bin_info['name']
                    bin_count = bin_info['count']
                    bin_pct = float(bin_count) / lot.die_count * 100.0 if lot.die_count and lot.die_count > 0 else 0.0
                    bin_sum = BinSummary(
                        lot_id=lot.id,
                        bin_number=bin_num,
                        bin_name=bin_name,
                        site=0,
                        count=bin_count,
                        percentage=bin_pct,
                        data_range="final",
                    )
                    db.add(bin_sum)
                db.commit()

                # Update corresponding CSV
                csv_mapped_name = find_corresponding_csv_filename(csv_filename)
                csv_base = os.path.splitext(csv_mapped_name)[0]
                csv_lots = db.query(Lot).filter(
                    Lot.filename.like(f"%{csv_base}%"),
                    Lot.data_source == lot.data_source
                ).all()
                for csv_lot in csv_lots:
                    apply_summary_to_csv(db, csv_lot.id, summary_data)

                last_lot_id = lot.id
                continue

            # 快速解析元数据（使用统一分发器，支持 LBS / ETS364 / ACCO 等所有格式）
            tester = detect_tester(save_path)
            # LBS 格式对外显示为 STS8200
            display_tester = 'STS8200' if tester == 'LBS' else tester
            try:
                meta_result = parse_file(save_path)
                # 如果没有有效数据行，直接丢弃该文件，跳过 Lot 数据库记录创建
                if meta_result.error == "未找到有效数据行":
                    print(f"[ftp_parse] 文件 {csv_filename} 没有有效数据行，抛弃该文件，跳过 Lot 创建")
                    if os.path.exists(save_path):
                        os.remove(save_path)
                    continue

                meta = {} if meta_result.error else {
                    'program': meta_result.program,
                    'lot_id': meta_result.lot_id,
                    'wafer_id': meta_result.wafer_id,
                    'handler': meta_result.handler,
                    'test_stage': meta_result.test_stage,
                    'beginning_time': meta_result.beginning_time,
                    'ending_time': meta_result.ending_time,
                    'test_date': meta_result.test_date,
                }
            except Exception:
                meta = {}

            lot = Lot(
                filename=save_name,
                storage_path=save_path,
                file_size=os.path.getsize(save_path),
                status='pending',
                data_source='ftp',
                storage_type='local',
                local_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
                upload_date=datetime.now(timezone.utc),
                test_machine=display_tester,
                user_id=admin_user_id,
                osat_name=effective_osat_name,
                program=meta.get('program'),
                lot_id=meta.get('lot_id'),
                wafer_id=meta.get('wafer_id'),
                handler=meta.get('handler'),
                data_type=_detect_osat_data_type(osat, save_name, meta.get('test_stage')),
                ftp_path=remote_path,
            )

            # 解析时间
            for field in ['test_date', 'beginning_time', 'ending_time']:
                val = meta.get(field)
                if val:
                    std_val = parse_datetime_str(val)
                    if std_val:
                        try:
                            if len(std_val) == 19:
                                setattr(lot, field, datetime.strptime(std_val, '%Y-%m-%d %H:%M:%S'))
                            elif len(std_val) == 10:
                                setattr(lot, field, datetime.strptime(std_val, '%Y-%m-%d'))
                        except Exception:
                            pass

            db.add(lot)
            db.commit()
            db.refresh(lot)

            # 异步解析（在当前后台线程中同步执行，不另开线程）
            from app.api.routes.lots import _parse_and_save
            _parse_and_save(lot.id, save_path, db)
            last_lot_id = lot.id

        # 更新日志为成功
        log.status = 'success'
        log.lot_id_created = last_lot_id
        log.uploaded_at = datetime.now(timezone.utc)
        
        # Physically delete all previous failed history logs for this file to keep logs list clean
        try:
            db.query(FtpUploadLog).filter(
                FtpUploadLog.osat_id == log.osat_id,
                FtpUploadLog.remote_path == log.remote_path,
                FtpUploadLog.status == 'failed'
            ).delete(synchronize_session=False)
        except Exception as ex:
            print(f"[ftp_service] Cleanup failed logs error in process_one_file: {ex}")
            
        db.commit()

        return {"ok": True, "lot_id": last_lot_id}

    except Exception as e:
        traceback.print_exc()
        err_msg = str(e)[:500]
        log.status = 'failed'
        log.error_msg = err_msg
        log.uploaded_at = datetime.now(timezone.utc)
        try:
            db.commit()
        except Exception:
            db.rollback()
        return {"error": err_msg}
    finally:
        # 释放进程内线程锁
        with _file_in_progress_lock:
            _file_in_progress.discard(_lock_key)
        # 清理临时目录
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


# ──────────────────────────────────────────
# 下载阶段（线程安全，独立 DB 会话）
# ──────────────────────────────────────────

def send_failure_alert(db, osat, filename, error_msg):
    """?????????????????????"""
    from app.models.user import User
    from app.services.smtp_dynamic import send_smtp_auto
    from datetime import datetime
    
    # ???????????????????????????
    alert_users = db.query(User).filter(
        User.receive_alerts == True,
        User.is_active == True,
        User.email.isnot(None)
    ).all()
    
    emails = [u.email for u in alert_users]
    
    # ????????????????????????
    if not emails:
        admin = db.query(User).filter(User.role == 'admin').first()
        if admin and admin.email:
            emails = [admin.email]
            
    if not emails:
        print("[ftp_alert] ????????????????????")
        return
        
    subject = f"?ATE?????FTP?????????? - {osat.name}"
    html = f"""
    <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;padding:20px;border-radius:8px">
      <h2 style="color:#d9534f">?? ATE ????????</h2>
      <p>????? OSAT ? <b>{osat.name}</b> ? FTP ?????????????????????</p>
      <hr style="border:0;border-top:1px solid #eee"/>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:8px 0;color:#666;width:120px">OSAT ??:</td>
          <td style="padding:8px 0;font-weight:bold">{osat.name}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">????:</td>
          <td style="padding:8px 0">{osat.ftp_host}:{osat.ftp_port}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">????:</td>
          <td style="padding:8px 0;font-family:monospace;color:#c7254e;background:#f9f2f4;padding:2px 4px;border-radius:4px">{filename}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">????:</td>
          <td style="padding:8px 0;color:#d9534f;font-weight:bold">{error_msg}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">????:</td>
          <td style="padding:8px 0">{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</td>
        </tr>
      </table>
      <hr style="border:0;border-top:1px solid #eee"/>
      <p style="color:#666;font-size:14px">??????????????????</p>
    </div>
    """
    try:
        for email in emails:
            send_smtp_auto(db, email, subject, html)
            print(f"[ftp_alert] ???????? {email}")
    except Exception as e:
        print(f"[ftp_alert] ????????: {e}")

def _do_download_with_ftp(ftp, osat_id: int, remote_path: str, admin_user_id: int):
    """
    ?????? FTP ???????????????????
    ??????? FTP ???
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from app.models.osat_config import OsatConfig
    import zipfile, gzip, shutil

    filename = os.path.basename(remote_path)
    _lock_key = (osat_id, remote_path)
    tmp_dir = None

    with _file_in_progress_lock:
        if _lock_key in _file_in_progress:
            print(f"[ftp_dl] ? {filename} ???????????")
            return None
        _file_in_progress.add(_lock_key)

    db = SessionLocal()
    log_id = None
    try:
        osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
        if not osat:
            raise Exception(f"OSAT id={osat_id} ???")

        existing = db.query(FtpUploadLog).filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.remote_path == remote_path,
            FtpUploadLog.status == 'success'
        ).first()
        if existing:
            print(f"[ftp_dl] Warning: {filename} already has a success record, marking current log as skipped")
            cur_log = db.query(FtpUploadLog).filter(FtpUploadLog.osat_id == osat_id, FtpUploadLog.remote_path == remote_path, FtpUploadLog.status.in_(['scanned', 'pending', 'downing', 'processing'])).first()
            if cur_log:
                cur_log.status = 'skipped'
                cur_log.error_msg = 'Skipped: A success record already exists for this remote_path'
                db.commit()
            return None

        log = FtpUploadLog(
            osat_id=osat_id,
            remote_path=remote_path,
            filename=filename,
            status='processing',
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        log_id = log.id

        tmp_dir = tempfile.mkdtemp(prefix='ftp_dl_')
        local_file = os.path.join(tmp_dir, filename)

        # ?? ?????????? ftp ?? ??
        ftp.sendcmd('TYPE I')
        file_size = ftp.size(remote_path) or 0
        with open(local_file, 'wb') as f:
            ftp.retrbinary(f'RETR {remote_path}', f.write)

        log.file_size = file_size
        db.commit()

        # ?? ?? ??
        _, ext = os.path.splitext(filename)
        ext = ext.lower()
        csv_files_to_process = []

        if ext in ('.zip', '.rar'):
            extract_dir = os.path.join(tmp_dir, 'extracted')
            os.makedirs(extract_dir, exist_ok=True)
            if ext == '.zip':
                with zipfile.ZipFile(local_file, 'r') as z:
                    z.extractall(extract_dir)
            else:
                _extract_rar_archive(local_file, extract_dir)
            has_log_files = False
            for root, _, files in os.walk(extract_dir):
                for f in files:
                    flower = f.lower()
                    if (flower.endswith('.csv') or (flower.endswith('.txt') and 'ets' in flower)
                            or flower.endswith('.xls') or flower.endswith('.xlsx')):
                        csv_files_to_process.append(os.path.join(root, f))
                    elif flower.endswith('.log'):
                        has_log_files = True
            if not csv_files_to_process:
                if has_log_files:
                    print(f"[ftp_dl] Archive only contains .log files, marking as success")
                    log.status = 'success'
                    log.uploaded_at = datetime.now(timezone.utc)
                    db.commit()
                    shutil.rmtree(tmp_dir, ignore_errors=True)
                    return None
                else:
                    raise Exception("Archive does not contain any valid .csv, .txt, .xls or .xlsx files")

        elif ext == '.gz':
            inner_name = os.path.splitext(filename)[0]
            inner_ext = os.path.splitext(inner_name)[1].lower()
            if inner_ext not in ('.csv', '.txt'):
                print(f"[ftp_dl] GZ 内部文件 '{inner_name}' 不是 CSV/TXT，跳过解析")
                log.status = 'success'
                log.uploaded_at = datetime.now(timezone.utc)
                db.commit()
                shutil.rmtree(tmp_dir, ignore_errors=True)
                return None

            extract_dir = os.path.join(tmp_dir, 'extracted')
            os.makedirs(extract_dir, exist_ok=True)
            inner_path = os.path.join(extract_dir, inner_name)
            with gzip.open(local_file, 'rb') as gz_f:
                with open(inner_path, 'wb') as out_f:
                    shutil.copyfileobj(gz_f, out_f)
            csv_files_to_process.append(inner_path)
            print(f"[ftp_dl] GZ 已解压: {filename} -> {inner_name}")

        elif ext == '.log':
            print(f"[ftp_dl] 发现 .log 文件 '{filename}'，放弃并标记成功")
            log.status = 'success'
            log.uploaded_at = datetime.now(timezone.utc)
            db.commit()
            shutil.rmtree(tmp_dir, ignore_errors=True)
            return None

        elif ext in ('.csv', '.xls', '.xlsx') or (ext == '.txt' and 'ets' in filename.lower()):
            csv_files_to_process.append(local_file)
        else:
            raise Exception(f"不支持的文件格式: {ext}")

        csv_files_to_process.sort(key=lambda p: (1 if (p.lower().endswith('.txt') and 'ets' in os.path.basename(p).lower() or p.lower().endswith(('.xls', '.xlsx'))) else 0, p))
        print(f"[ftp_dl] 下载完成: {filename} ({len(csv_files_to_process)} 个待处理)")
        return (log_id, tmp_dir, csv_files_to_process)

    except Exception as e:
        traceback.print_exc()
        err_msg = str(e)[:500]
        if log_id is not None:
            try:
                log_rec = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
                if log_rec:
                    log_rec.status = 'failed'
                    log_rec.error_msg = err_msg
                    log_rec.uploaded_at = datetime.now(timezone.utc)
                    db.commit()
                    
                    # 屏蔽单条即时报错发信规则
                    # fail_count = db.query(FtpUploadLog).filter(
                    #     FtpUploadLog.osat_id == osat_id,
                    #     FtpUploadLog.remote_path == remote_path,
                    #     FtpUploadLog.status == 'failed'
                    # ).count()
                    # if fail_count >= _MAX_FAIL_RETRIES:
                    #     send_failure_alert(db, osat, filename, err_msg)
            except Exception:
                db.rollback()
        if tmp_dir:
            try:
                import shutil as _shutil
                _shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass
        raise
    finally:
        with _file_in_progress_lock:
            _file_in_progress.discard(_lock_key)
        db.close()


def _do_download(log_id: int, osat_id: int, remote_path: str, admin_user_id: int):
    """
    [Download Stage] Run in a separate thread with its own DB session:
    1. Mark log status as 'downing'
    2. Download file from FTP to DOWNLOAD_DIR
    3. Extract if it's an archive, classify files to EXTRACTED_DIR or DEL_DIR
    4. Clean up downloaded archive immediately
    5. Set FtpUploadLog status to 'processing' (maps to frontend Processing badge)
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from app.models.osat_config import OsatConfig
    from app.models.lot import Lot
    import zipfile, gzip, shutil
    
    filename = os.path.basename(remote_path)
    _lock_key = (osat_id, remote_path)
    
    with _file_in_progress_lock:
        if _lock_key in _file_in_progress:
            print(f"[ftp_dl] Warning: {filename} is already being processed by another thread, skipping")
            return None
        _file_in_progress.add(_lock_key)

    db = SessionLocal()
    try:
        osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
        if not osat:
            raise Exception(f"OSAT id={osat_id} does not exist")
        effective_osat_name = osat.name.split('_')[0] if osat.name and '_' in osat.name else osat.name

        # Prevent concurrent scan race conditions
        existing = db.query(FtpUploadLog).filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.remote_path == remote_path,
            FtpUploadLog.status == 'success'
        ).first()
        if existing:
            print(f"[ftp_dl] Warning: {filename} already has a success record, marking current log as skipped")
            pending_logs = db.query(FtpUploadLog).filter(
                FtpUploadLog.osat_id == osat_id,
                FtpUploadLog.remote_path == remote_path,
                FtpUploadLog.status.in_(['scanned', 'pending', 'processing', 'downing'])
            ).all()
            for pl in pending_logs:
                pl.status = 'skipped'
                pl.error_msg = 'Skipped: A success record already exists for this remote_path'
            if pending_logs:
                db.commit()
            return None

        # Update status to downing
        log = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
        if log:
            from datetime import timezone
            log.status = 'downing'
            log.uploaded_at = datetime.now(timezone.utc)
            db.commit()

        # Initialize directories
        DOWNLOAD_DIR = "/tmp/FTP/download"
        EXTRACTED_DIR = "/tmp/FTP/extracted"
        DEL_DIR = "/tmp/FTP/del"
        os.makedirs(DOWNLOAD_DIR, exist_ok=True)
        os.makedirs(EXTRACTED_DIR, exist_ok=True)
        os.makedirs(DEL_DIR, exist_ok=True)

        # Check download folder size limit (Circuit breaker: 50GB pause, 5GB resume)
        total_size = 0
        for root, _, files in os.walk(DOWNLOAD_DIR):
            for f_name in files:
                fp = os.path.join(root, f_name)
                try:
                    total_size += os.path.getsize(fp)
                except Exception:
                    pass
        
        limit_50gb = 50 * 1024 * 1024 * 1024
        limit_5gb = 5 * 1024 * 1024 * 1024
        is_paused = False

        try:
            from app.core.redis_client import get_redis
            r = get_redis()
            is_paused = r.get("watchdog:download_paused") == "true"
            if is_paused:
                if total_size < limit_5gb:
                    r.delete("watchdog:download_paused")
                    is_paused = False
            else:
                if total_size > limit_50gb:
                    r.set("watchdog:download_paused", "true")
                    is_paused = True
        except Exception:
            is_paused = total_size > limit_50gb

        if is_paused:
            raise Exception(f"Download directory /tmp/FTP/download size ({total_size / (1024**3):.1f}GB) exceeds 50GB limit, download suspended until size drops below 5GB")

        local_file = os.path.join(DOWNLOAD_DIR, f"{log_id}_{filename}")
        ftp = _make_ftp(osat)
        db.close()
        
        file_size = 0
        try:
            ftp.sendcmd('TYPE I')
            file_size = ftp.size(remote_path) or 0
            if file_size > 50 * 1024 * 1024 * 1024:
                raise Exception(f"Remote file size {file_size} exceeds 50GB limit, download aborted")
            with open(local_file, 'wb') as f:
                ftp.retrbinary(f'RETR {remote_path}', f.write)
        finally:
            try:
                ftp.quit()
            except Exception:
                pass

        # Reopen DB session
        db = SessionLocal()
        log = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
        if log:
            log.file_size = file_size
            db.commit()

        # Check for empty remote / downloaded file (0 bytes)
        actual_size = os.path.getsize(local_file) if os.path.exists(local_file) else 0
        if actual_size == 0 or file_size == 0:
            if os.path.exists(local_file):
                try:
                    os.remove(local_file)
                except Exception:
                    pass
            print(f"[ftp_dl] Remote file '{filename}' is empty (0 bytes), marking status as 'skipped'")
            log.status = 'skipped'
            log.error_msg = 'Remote file is empty (0 bytes)'
            log.uploaded_at = datetime.now(timezone.utc)
            db.commit()
            return None

        # Helper functions to check if file already exists/processed
        def file_exists_in_db(fname: str) -> bool:
            existing_lot = db.query(Lot).filter(
                Lot.filename == fname,
                Lot.status == 'processed'
            ).first()
            return existing_lot is not None

        def is_processable_file(fname: str) -> bool:
            name_lower = fname.lower()
            if name_lower.endswith(('.csv', '.xls', '.xlsx')):
                return True
            if name_lower.endswith('.txt') and ('ets' in name_lower or 'summary' in name_lower):
                return True
            return False

        def is_archive_file(fname: str) -> bool:
            name_lower = fname.lower()
            return name_lower.endswith(('.zip', '.rar', '.gz'))

        csv_files_to_process = []

        if is_archive_file(filename):
            _, ext = os.path.splitext(filename)
            ext = ext.lower()
            extract_temp_dir = tempfile.mkdtemp(prefix=f'extracted_temp_{log_id}_')
            try:
                if ext == '.zip':
                    with zipfile.ZipFile(local_file, 'r') as z:
                        z.extractall(extract_temp_dir)
                elif ext == '.rar':
                    _extract_rar_archive(local_file, extract_temp_dir)
                elif ext == '.gz':
                    inner_name = os.path.splitext(filename)[0]
                    inner_path = os.path.join(extract_temp_dir, inner_name)
                    with gzip.open(local_file, 'rb') as gz_f:
                        with open(inner_path, 'wb') as out_f:
                            shutil.copyfileobj(gz_f, out_f)

                # Classify all files inside the archive
                for root, _, files in os.walk(extract_temp_dir):
                    for f in files:
                        full_f_path = os.path.join(root, f)
                        if is_processable_file(f):
                            # Overwrite cleanup: remove any old extracted file with the same original name
                            for old_f in os.listdir(EXTRACTED_DIR):
                                if old_f.endswith(f"_{f}"):
                                    try:
                                        os.remove(os.path.join(EXTRACTED_DIR, old_f))
                                        print(f"[ftp_dl] Overwrote old extracted file: {old_f}")
                                    except Exception as e:
                                        print(f"[ftp_dl] Overwrite cleanup failed for {old_f}: {e}")
                            
                            # Duplicate check: skip if already successfully processed in Lot DB
                            if file_exists_in_db(f):
                                print(f"[ftp_dl] Duplicate file '{f}' already processed, discarding")
                                continue
                            
                            dest_path = os.path.join(EXTRACTED_DIR, f"{log_id}_{f}")
                            shutil.copy2(full_f_path, dest_path)
                            csv_files_to_process.append(dest_path)
                        else:
                            # Move non-processable files to DEL_DIR
                            dest_path = os.path.join(DEL_DIR, f"{log_id}_{f}")
                            shutil.copy2(full_f_path, dest_path)
                            try:
                                from app.models.ftp_extracted_file import FtpExtractedFile
                                db_ext = SessionLocal()
                                ext_file = FtpExtractedFile(
                                    ftp_log_id=log_id,
                                    filename=f,
                                    status='del',
                                    error_msg='Non-processable file format'
                                )
                                db_ext.add(ext_file)
                                db_ext.commit()
                                db_ext.close()
                            except Exception as db_ex:
                                print(f"[ftp_dl] Failed to write archive del log: {db_ex}")
            finally:
                # Clean up extract temp dir and raw archive file
                shutil.rmtree(extract_temp_dir, ignore_errors=True)
                if os.path.exists(local_file):
                    os.remove(local_file)

            if not csv_files_to_process:
                print(f"[ftp_dl] Archive '{filename}' contains no new processable files, marking success")
                log.status = 'success'
                log.uploaded_at = datetime.now(timezone.utc)
                db.commit()
                return None

        else:
            # Single file download
            if is_processable_file(filename):
                # Overwrite cleanup: remove any old extracted file with the same original name
                for old_f in os.listdir(EXTRACTED_DIR):
                    if old_f.endswith(f"_{filename}"):
                        try:
                            os.remove(os.path.join(EXTRACTED_DIR, old_f))
                            print(f"[ftp_dl] Overwrote old extracted file: {old_f}")
                        except Exception as e:
                            print(f"[ftp_dl] Overwrite cleanup failed for {old_f}: {e}")

                if file_exists_in_db(filename):
                    print(f"[ftp_dl] Duplicate file '{filename}' already processed, discarding")
                    log.status = 'success'
                    log.uploaded_at = datetime.now(timezone.utc)
                    db.commit()
                    if os.path.exists(local_file):
                        os.remove(local_file)
                    return None

                dest_path = os.path.join(EXTRACTED_DIR, f"{log_id}_{filename}")
                shutil.copy2(local_file, dest_path)
                csv_files_to_process.append(dest_path)
            else:
                dest_path = os.path.join(DEL_DIR, f"{log_id}_{filename}")
                shutil.copy2(local_file, dest_path)
                print(f"[ftp_dl] Single file '{filename}' is non-processable, moved to del folder")
                log.status = 'success'
                try:
                    from app.models.ftp_extracted_file import FtpExtractedFile
                    db_ext = SessionLocal()
                    ext_file = FtpExtractedFile(
                        ftp_log_id=log_id,
                        filename=filename,
                        status='del',
                        error_msg='Non-processable file format'
                    )
                    db_ext.add(ext_file)
                    db_ext.commit()
                    db_ext.close()
                except Exception as db_ex:
                    print(f"[ftp_dl] Failed to write single file del log: {db_ex}")
                log.uploaded_at = datetime.now(timezone.utc)
                db.commit()
                if os.path.exists(local_file):
                    os.remove(local_file)
                return None

            if os.path.exists(local_file):
                os.remove(local_file)

        if csv_files_to_process:
            names = []
            for p in csv_files_to_process:
                base = os.path.basename(p)
                if '_' in base:
                    parts = base.split('_', 1)
                    if parts[0].isdigit():
                        names.append(parts[1])
                    else:
                        names.append(base)
                else:
                    names.append(base)
            log.filename = ", ".join(names)

        # Mark log status as 'processing'
        log.status = 'processing'
        db.commit()

        csv_files_to_process.sort()
        print(f"[ftp_dl] ✅ Download and classification completed for {filename}: {len(csv_files_to_process)} files to parse")
        return (log_id, None, csv_files_to_process)

    except Exception as e:
        traceback.print_exc()
        err_msg = str(e)[:500]
        local_file = os.path.join(DOWNLOAD_DIR, f"{log_id}_{filename}")
        if os.path.exists(local_file):
            try:
                os.remove(local_file)
            except Exception:
                pass

        if log_id is not None:
            err_db = SessionLocal()
            try:
                log_rec = err_db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
                if log_rec:
                    if "exceeds 50GB limit" in err_msg or "No such file or directory" in err_msg or "FileNotFoundError" in err_msg:
                        # Auto fallback to scanned for missing cache files to re-download from FTP
                        log_rec.status = 'scanned'
                        log_rec.error_msg = None
                    elif "0 bytes" in err_msg or "empty" in err_msg.lower():
                        log_rec.status = 'skipped'
                        log_rec.error_msg = 'Remote file is empty (0 bytes)'
                    else:
                        log_rec.status = 'failed'
                        log_rec.error_msg = err_msg
                    log_rec.uploaded_at = datetime.now(timezone.utc)
                    err_db.commit()
            except Exception:
                err_db.rollback()
            finally:
                err_db.close()
        raise
    finally:
        with _file_in_progress_lock:
            _file_in_progress.discard(_lock_key)
        try:
            db.close()
        except Exception:
            pass
# ──────────────────────────────────────────
# 解析阶段（线程安全，独立 DB 会话）
# ──────────────────────────────────────────

def _do_parse(log_id: int, osat_id: int, remote_path: str,
              tmp_dir: str, csv_files_to_process: list, admin_user_id: int) -> dict:
    from app.models.ftp_upload_log import FtpUploadLog
    if not concurrency_controller.acquire(timeout=300):
        raise Exception("Concurrency controller acquire timeout (300s), skipping parse to avoid blocking other OSATs")
    try:
        import multiprocessing
        p = multiprocessing.Process(
            target=_do_parse_internal,
            args=(log_id, osat_id, remote_path, tmp_dir, csv_files_to_process, admin_user_id)
        )
        p.start()
        
        # Wait for at most 30 minutes (1800 seconds)
        p.join(timeout=1800)
        
        if p.is_alive():
            print(f"[ftp_fetch] Timeout reached: killing parsing process for log_id={log_id}")
            p.terminate()
            p.join(timeout=5)
            if p.is_alive():
                p.kill()
                p.join()
            
            # Mark record as failed in database
            db = SessionLocal()
            try:
                log_rec = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
                if log_rec:
                    log_rec.status = 'failed'
                    log_rec.error_msg = 'Parsing timeout (not completed within 30 minutes, automatically marked as failed)'
                    db.commit()
                    print(f"[ftp_fetch] Marked log_id={log_id} as failed in DB due to timeout")
            except Exception as db_exc:
                print(f"[ftp_fetch] Database update error on timeout: {db_exc}")
            finally:
                db.close()
            
            return {"status": "timeout"}
            
        return {"status": "completed"}
    finally:
        concurrency_controller.release()

def _do_parse_internal(log_id: int, osat_id: int, remote_path: str,
                       tmp_dir: str, csv_files_to_process: list, admin_user_id: int) -> dict:
    """
    [Parse Stage] Run in a separate process:
    1. Parse files in csv_files_to_process from EXTRACTED_DIR
    2. If filename already exists in DB: delete file from EXTRACTED_DIR and skip
    3. On success: copy to UPLOAD_DIR, compress it, delete from EXTRACTED_DIR
    4. On failure: keep in EXTRACTED_DIR, mark log status as 'failed' with '[Parse Failed]' error prefix
    """
    # Reset SQLAlchemy database connection pool in child process to isolate sockets
    from app.core.database import engine, SessionLocal
    try:
        engine.dispose(close=False)
    except Exception as eng_ex:
        print(f"[ftp_parse] Warning resetting engine pool in child process: {eng_ex}")

    from app.models.ftp_upload_log import FtpUploadLog
    from app.models.lot import Lot
    from app.models.osat_config import OsatConfig
    from app.core.config import settings as app_settings
    from app.services.parsers.detector import detect_tester
    from app.services.parsers import parse_file
    from app.services.parsers.acco_parser import parse_datetime_str
    import shutil

    db = SessionLocal()
    filename = os.path.basename(remote_path)
    try:
        osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
        effective_osat_name = osat.name.split('_')[0] if osat and osat.name and '_' in osat.name else (osat.name if osat else "Unknown")
        log_rec = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
        if log_rec:
            log_rec.status = 'processing'
            log_rec.uploaded_at = datetime.now(timezone.utc)
            db.commit()
        db.close()
        
        UPLOAD_DIR = os.path.expanduser(app_settings.UPLOAD_DIR)
        DATA_DIR = os.path.join(UPLOAD_DIR, "Data")
        SUMMARY_DIR = os.path.join(UPLOAD_DIR, "Summary")
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(SUMMARY_DIR, exist_ok=True)

        def is_summary_file(fname: str) -> bool:
            name_lower = fname.lower()
            if name_lower.endswith(('.xls', '.xlsx')):
                return True
            if name_lower.endswith('.txt') and ('ets' in name_lower or 'summary' in name_lower):
                return True
            return False

        last_lot_id = None
        parsed_successfully = []

        for csv_filepath in csv_files_to_process:
            csv_filename = os.path.basename(csv_filepath)
            
            # Restore original filename from log_id prefix
            if '_' in csv_filename:
                parts = csv_filename.split('_', 1)
                if parts[0].isdigit() and int(parts[0]) == log_id:
                    save_name = parts[1]
                else:
                    save_name = csv_filename
            else:
                save_name = csv_filename
                
            target_dir = SUMMARY_DIR if is_summary_file(save_name) else DATA_DIR
            save_path = os.path.join(target_dir, save_name)

            db = SessionLocal()
            osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()

            # Double check lot duplication
            # 1. Skip if already processed successfully
            existing_processed_lot = db.query(Lot).filter(
                Lot.filename == save_name,
                Lot.status == 'processed'
            ).first()
            if existing_processed_lot:
                print(f"[ftp_parse] File '{save_name}' already exists in Lot DB as processed, skipping and deleting from extracted")
                last_lot_id = existing_processed_lot.id
                db.close()
                parsed_successfully.append(csv_filepath)
                try:
                    from app.models.ftp_extracted_file import FtpExtractedFile
                    db_ext = SessionLocal()
                    ext_file = FtpExtractedFile(
                        ftp_log_id=log_id,
                        filename=save_name,
                        status='success',
                        error_msg='Duplicate processed lot skipped'
                    )
                    db_ext.add(ext_file)
                    db_ext.commit()
                    db_ext.close()
                except Exception as db_ex:
                    print(f"[ftp_parse] Failed to write duplicate success log: {db_ex}")
                continue

            # 2. Clean up any existing failed or stuck lots for this file before parsing
            stuck_lots = db.query(Lot).filter(
                Lot.filename == save_name,
                Lot.osat_name == effective_osat_name,
                Lot.status.in_(['pending', 'processing', 'failed'])
            ).all()
            for stuck_lot in stuck_lots:
                print(f"[ftp_parse] Cleaning up stuck/failed lot record (id={stuck_lot.id}, status={stuck_lot.status}) for '{save_name}'")
                stuck_id = stuck_lot.id
                from app.models.bin_summary import BinSummary
                from app.models.test_item import TestItem
                db.query(BinSummary).filter(BinSummary.lot_id == stuck_id).delete(synchronize_session=False)
                db.query(TestItem).filter(TestItem.lot_id == stuck_id).delete(synchronize_session=False)
                db.delete(stuck_lot)
            db.commit()
            # Clear stale ORM references from session after commit
            db.expire_all()

            if os.path.exists(save_path):
                print(f"[ftp_parse] File '{save_name}' already exists in local uploads, overwriting")

            # Copy to UPLOAD_DIR
            shutil.copy2(csv_filepath, save_path)

            if save_name.lower().endswith(('.xls', '.xlsx')):
                try:
                    from app.services.parsers.xls_summary_parser import parse_and_save_xls_summary
                    created_lots = parse_and_save_xls_summary(save_path, db, None, osat_name=effective_osat_name)
                    
                    # FTP XLS/XLSX Summary compression
                    zip_path = save_path + ".zip"
                    import zipfile
                    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                        zf.write(save_path, save_name)
                    
                    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
                        if os.path.exists(save_path):
                            os.remove(save_path)
                        active_lots = db.query(Lot).filter(Lot.filename == save_name).all()
                        for lot in active_lots:
                            lot.storage_path = zip_path
                            db.add(lot)
                        db.commit()

                    active_lots = db.query(Lot).filter(Lot.filename == save_name).all()
                    if active_lots:
                        last_lot_id = active_lots[-1].id
                    parsed_successfully.append(csv_filepath)
                    try:
                        from app.models.ftp_extracted_file import FtpExtractedFile
                        db_ext = SessionLocal()
                        ext_file = FtpExtractedFile(
                            ftp_log_id=log_id,
                            filename=save_name,
                            status='success'
                        )
                        db_ext.add(ext_file)
                        db_ext.commit()
                        db_ext.close()
                    except Exception as db_ex:
                        print(f"[ftp_parse] Failed to write xls success log: {db_ex}")
                except Exception as ex:
                    try:
                        from app.models.ftp_extracted_file import FtpExtractedFile
                        db_ext = SessionLocal()
                        ext_file = FtpExtractedFile(
                            ftp_log_id=log_id,
                            filename=save_name,
                            status='failed',
                            error_msg=str(ex)[:500]
                        )
                        db_ext.add(ext_file)
                        db_ext.commit()
                        db_ext.close()
                    except Exception as db_ex:
                        print(f"[ftp_parse] Failed to write xls failure log: {db_ex}")
                    traceback.print_exc()
                    raise ex
                db.close()
                continue

            if save_name.lower().endswith('.txt') and ('ets' in save_name.lower() or 'summary' in save_name.lower()):
                try:
                    if not os.path.exists(save_path) and os.path.exists(csv_filepath):
                        import shutil
                        shutil.copy2(csv_filepath, save_path)
                    lot = Lot(
                        filename=save_name,
                        storage_path=save_path,
                        file_size=os.path.getsize(save_path),
                        status='processed',
                        data_source='ftp',
                        storage_type='local',
                        local_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
                        upload_date=datetime.now(timezone.utc),
                        test_machine='ETS364',
                        user_id=admin_user_id,
                        osat_name=effective_osat_name,
                        data_type='Summary',
                        ftp_path=remote_path,
                    )
                    from app.services.parsers.summary_parser import (
                        parse_summary_txt, apply_summary_to_csv, find_corresponding_csv_filename
                    )
                    summary_data = parse_summary_txt(save_path)
                    if summary_data.get('beginning_time'):
                        lot.beginning_time = summary_data['beginning_time']
                        lot.test_date = summary_data['beginning_time']
                    if summary_data.get('ending_time'):
                        lot.ending_time = summary_data['ending_time']
                    if summary_data.get('tester'):
                        lot.mp_tester = summary_data['tester']
                    if summary_data.get('probecard'):
                        lot.probecard = summary_data['probecard']
                    if summary_data.get('program'):
                        lot.program = summary_data['program']
                        prefix = summary_data['program'].split('_')[0]
                        from app.models.product_mapping import ProductMapping
                        mapping = db.query(ProductMapping).filter(
                            ProductMapping.program_prefix == prefix
                        ).first()
                        if mapping:
                            lot.product_name = mapping.product_name
                        elif not lot.product_name and '_' in lot.program:
                            lot.product_name = prefix.strip()
                    if summary_data.get('lot_id'):
                        lot.lot_id = summary_data['lot_id']
                    if summary_data.get('wafer_id'):
                        lot.wafer_id = clean_wafer_id(summary_data['wafer_id'])
                    if summary_data.get('handler'):
                        lot.handler = summary_data['handler']
                    if summary_data.get('die_count') is not None:
                        lot.die_count = summary_data['die_count']
                    if summary_data.get('pass_count') is not None:
                        lot.pass_count = summary_data['pass_count']
                    if summary_data.get('fail_count') is not None:
                        lot.fail_count = summary_data['fail_count']
                    if summary_data.get('yield_rate') is not None:
                        lot.yield_rate = summary_data['yield_rate']

                    db.add(lot)
                    db.commit()
                    db.refresh(lot)

                    # Save bin_summary records if available from summary_data
                    if summary_data.get('bins'):
                        from app.models.bin_summary import BinSummary
                        db.query(BinSummary).filter(BinSummary.lot_id == lot.id).delete()
                        total_die = summary_data.get('die_count') or 1
                        for bin_num, bin_info in summary_data['bins'].items():
                            cnt = bin_info.get('count', 0)
                            pct = (cnt / total_die * 100.0) if total_die > 0 else 0.0
                            bs = BinSummary(
                                lot_id=lot.id,
                                bin_number=bin_num,
                                bin_name=bin_info.get('name', f'Bin{bin_num}'),
                                site=0,
                                count=cnt,
                                percentage=pct,
                                data_range='final'
                            )
                            db.add(bs)
                        db.commit()

                    # FTP TXT Summary compression
                    zip_path = save_path + ".zip"
                    import zipfile
                    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                        zf.write(save_path, save_name)
                    
                    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
                        if os.path.exists(save_path):
                            os.remove(save_path)
                        lot.storage_path = zip_path
                        db.add(lot)
                        db.commit()

                    from app.models.bin_summary import BinSummary
                    for bin_num, bin_info in summary_data.get('bins', {}).items():
                        bin_name = bin_info['name']
                        bin_count = bin_info['count']
                        bin_pct = float(bin_count) / lot.die_count * 100.0 if lot.die_count and lot.die_count > 0 else 0.0
                        bin_sum = BinSummary(
                            lot_id=lot.id,
                            bin_number=bin_num,
                            bin_name=bin_name,
                            site=0,
                            count=bin_count,
                            percentage=bin_pct,
                            data_range="final",
                        )
                        db.add(bin_sum)
                    db.commit()

                    csv_mapped_name = find_corresponding_csv_filename(save_name)
                    csv_base = os.path.splitext(csv_mapped_name)[0]
                    csv_lots = db.query(Lot).filter(
                        Lot.filename.like(f"%{csv_base}%"),
                        Lot.data_source == lot.data_source
                    ).all()
                    for csv_lot in csv_lots:
                        apply_summary_to_csv(db, csv_lot.id, summary_data)

                    # Log TXT success in English
                    try:
                        from app.models.ftp_extracted_file import FtpExtractedFile
                        db_ext = SessionLocal()
                        ext_file = FtpExtractedFile(
                            ftp_log_id=log_id,
                            filename=save_name,
                            status='success'
                        )
                        db_ext.add(ext_file)
                        db_ext.commit()
                        db_ext.close()
                    except Exception as db_ex:
                        print(f"[ftp_parse] Failed to write txt success log: {db_ex}")

                except Exception as ex:
                    # Log TXT failure in English
                    try:
                        from app.models.ftp_extracted_file import FtpExtractedFile
                        db_ext = SessionLocal()
                        ext_file = FtpExtractedFile(
                            ftp_log_id=log_id,
                            filename=save_name,
                            status='failed',
                            error_msg=str(ex)[:500]
                        )
                        db_ext.add(ext_file)
                        db_ext.commit()
                        db_ext.close()
                    except Exception as db_ex:
                        print(f"[ftp_parse] Failed to write txt failure log: {db_ex}")
                    raise ex

                last_lot_id = lot.id
                db.close()
                parsed_successfully.append(csv_filepath)
                
                # Compress Summary (.txt)
                zip_path = save_path + '.zip'
                try:
                    import zipfile
                    src_file_to_zip = save_path if os.path.exists(save_path) else csv_filepath
                    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                        zf.write(src_file_to_zip, os.path.basename(save_path))
                    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
                        os.remove(save_path)
                        db = SessionLocal()
                        l = db.query(Lot).filter(Lot.id == lot.id).first()
                        if l:
                            l.storage_path = zip_path
                            db.commit()
                        db.close()
                except Exception as e:
                    print(f"[cleanup] Failed to compress summary: {e}")
                continue

            # CSV File
            tester = detect_tester(save_path)
            display_tester = 'STS8200' if tester == 'LBS' else tester
            try:
                meta_result = parse_file(save_path)
                if meta_result.error == "未找到有效数据行":
                    print(f"[ftp_parse] File '{save_name}' has no valid rows, discarding")
                    if os.path.exists(save_path):
                        os.remove(save_path)
                    db.close()
                    parsed_successfully.append(csv_filepath)
                    continue

                meta = {} if meta_result.error else {
                    'program': meta_result.program,
                    'lot_id': meta_result.lot_id,
                    'wafer_id': meta_result.wafer_id,
                    'handler': meta_result.handler,
                    'test_stage': meta_result.test_stage,
                    'beginning_time': meta_result.beginning_time,
                    'ending_time': meta_result.ending_time,
                    'test_date': meta_result.test_date,
                }
            except Exception:
                meta = {}

            lot = Lot(
                filename=save_name,
                storage_path=save_path,
                file_size=os.path.getsize(save_path),
                status='pending',
                data_source='ftp',
                storage_type='local',
                local_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
                upload_date=datetime.now(timezone.utc),
                test_machine=display_tester,
                user_id=admin_user_id,
                osat_name=effective_osat_name,
                program=meta.get('program'),
                lot_id=meta.get('lot_id'),
                wafer_id=meta.get('wafer_id'),
                handler=meta.get('handler'),
                data_type=_detect_osat_data_type(osat, save_name, meta.get('test_stage')),
                ftp_path=remote_path,
            )

            for field in ['test_date', 'beginning_time', 'ending_time']:
                val = meta.get(field)
                if val:
                    std_val = parse_datetime_str(val)
                    if std_val:
                        try:
                            if len(std_val) == 19:
                                setattr(lot, field, datetime.strptime(std_val, '%Y-%m-%d %H:%M:%S'))
                            elif len(std_val) == 10:
                                setattr(lot, field, datetime.strptime(std_val, '%Y-%m-%d'))
                        except Exception:
                            pass

            db.add(lot)
            db.commit()
            db.refresh(lot)

            lot_id = lot.id
            from app.api.routes.lots import _parse_and_save
            try:
                _parse_and_save(lot_id, save_path, db)
                parsed_successfully.append(csv_filepath)

                # Immediately mark log_rec status as success after DB commit
                try:
                    db_succ = SessionLocal()
                    succ_log = db_succ.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
                    if succ_log:
                        succ_log.status = 'success'
                        succ_log.lot_id_created = lot_id
                        succ_log.uploaded_at = datetime.now(timezone.utc)
                        db_succ.commit()
                    db_succ.close()
                except Exception as log_ex:
                    print(f"[ftp_parse] Non-critical warning marking success log status: {log_ex}")

                # Compress successfully parsed CSV file to *.csv.zip
                if os.path.exists(save_path) and save_path.lower().endswith('.csv'):
                    zip_path = save_path + '.zip'
                    try:
                        import zipfile
                        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                            zf.write(save_path, os.path.basename(save_path))
                        if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
                            os.remove(save_path)
                            # Reopen DB session to update Lot storage_path
                            db_update = SessionLocal()
                            l = db_update.query(Lot).filter(Lot.id == lot_id).first()
                            if l:
                                l.storage_path = zip_path
                                db_update.commit()
                            db_update.close()
                            print(f"[ftp_parse] Compressed parsed CSV to ZIP: {zip_path}")
                    except Exception as zip_ex:
                        print(f"[ftp_parse] Failed to compress parsed CSV to ZIP: {zip_ex}")

                # Log CSV parse success in English
                try:
                    from app.models.ftp_extracted_file import FtpExtractedFile
                    db_ext = SessionLocal()
                    ext_file = FtpExtractedFile(
                        ftp_log_id=log_id,
                        filename=save_name,
                        status='success'
                    )
                    db_ext.add(ext_file)
                    db_ext.commit()
                    db_ext.close()
                except Exception as db_ex:
                    print(f"[ftp_parse] Non-critical warning: Failed to write csv success log: {db_ex}")

            except Exception as ex:
                # Log CSV parse failure in English
                try:
                    from app.models.ftp_extracted_file import FtpExtractedFile
                    db_ext = SessionLocal()
                    ext_file = FtpExtractedFile(
                        ftp_log_id=log_id,
                        filename=save_name,
                        status='failed',
                        error_msg=str(ex)[:500]
                    )
                    db_ext.add(ext_file)
                    db_ext.commit()
                    db_ext.close()
                except Exception as db_ex:
                    print(f"[ftp_parse] Failed to write csv failure log: {db_ex}")
                raise ex
            finally:
                try:
                    db.close()
                except Exception:
                    pass
            last_lot_id = lot_id

        # Delete successfully parsed files from EXTRACTED_DIR
        for fp in parsed_successfully:
            if os.path.exists(fp):
                try:
                    os.remove(fp)
                except Exception as ex:
                    print(f"[ftp_parse] Failed to remove {fp}: {ex}")

        # Mark record as success
        db = SessionLocal()
        try:
            log_rec = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
            if log_rec:
                log_rec.status = 'success'
                log_rec.lot_id_created = last_lot_id
                log_rec.uploaded_at = datetime.now(timezone.utc)
                
                try:
                    db.query(FtpUploadLog).filter(
                        FtpUploadLog.osat_id == log_rec.osat_id,
                        FtpUploadLog.remote_path == log_rec.remote_path,
                        FtpUploadLog.status == 'failed',
                        FtpUploadLog.id != log_id
                    ).delete(synchronize_session=False)
                except Exception as ex:
                    print(f"[ftp_service] Cleanup failed logs error: {ex}")
                    
                db.commit()
                print(f"[ftp_parse] ✅ Parse success: {filename}, lot_id={last_lot_id}")
        finally:
            db.close()
        return {"ok": True, "lot_id": last_lot_id}

    except Exception as e:
        traceback.print_exc()
        if 'save_path' in locals() and save_path and os.path.exists(save_path):
            try:
                os.remove(save_path)
                print(f"[ftp_parse] Cleanup: Deleted failed parse file from uploads: {save_path}")
            except Exception as ex:
                print(f"[ftp_parse] Failed to delete failed file {save_path}: {ex}")
        # Check if the error is due to OLE2 corruption/truncation in an LBS summary file
        is_corruption = False
        err_str = str(e)
        if 'filename' in locals() and filename and 'lbs' in filename.lower() and (
            'CompDocError' in err_str or 
            'XLRDError' in err_str or 
            'MSAT' in err_str or 
            'sector' in err_str or 
            'index out of range' in err_str or 
            'Expected BOF record' in err_str
        ):
            is_corruption = True

        err_msg = f"[Parse Failed] {str(e)[:450]}"
        err_db = SessionLocal()
        try:
            log_rec = err_db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
            if log_rec:
                if is_corruption:
                    log_rec.status = 'scanned'
                    log_rec.error_msg = None
                    print(f"[ftp_parse] Corrupted/truncated LBS file detected: {filename}. Resetting status to 'scanned' for re-download.")
                else:
                    log_rec.status = 'failed'
                    log_rec.error_msg = err_msg
                log_rec.uploaded_at = datetime.now(timezone.utc)
                err_db.commit()
        except Exception as db_ex:
            print(f"[ftp_parse] Failed to update FtpUploadLog: {db_ex}")
            err_db.rollback()
        finally:
            err_db.close()

        if is_corruption:
            # 1. Clear database extracted log to allow re-extraction
            try:
                from app.models.ftp_extracted_file import FtpExtractedFile
                db_ext = SessionLocal()
                db_ext.query(FtpExtractedFile).filter(
                    FtpExtractedFile.ftp_log_id == log_id
                ).delete(synchronize_session=False)
                db_ext.commit()
                db_ext.close()
            except Exception as db_ex:
                print(f"[ftp_parse] Failed to delete FtpExtractedFile entries: {db_ex}")

            # 2. Delete the local corrupted/truncated files from extracted directory
            if 'csv_files_to_process' in locals() and csv_files_to_process:
                for fp in csv_files_to_process:
                    if os.path.exists(fp):
                        try:
                            os.remove(fp)
                            print(f"[ftp_parse] Deleted corrupted extracted file: {fp}")
                        except Exception as ex:
                            print(f"[ftp_parse] Failed to delete extracted file {fp}: {ex}")
        raise
    finally:
        try:
            if 'db' in locals() and db:
                db.close()
        except Exception:
            pass
        if tmp_dir:
            try:
                import shutil as _shutil
                _shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass
# ──────────────────────────────────────────
# 保存 FTP 扫描快照数据
# ──────────────────────────────────────────

def _should_ignore_ftp_file(path: str) -> bool:
    """
    Determine if an FTP file should be marked as ignored and skipped from download.
    Rules:
    1. Files ending with FAILSUMMARY.csv (or FAILSUMMARY.csv.gz, case-insensitive).
    2. Log archive files ending with *.log.gz or *.log.<archive_ext> (e.g., .log.zip, .log.7z, .log.tar.gz).
    """
    if not path:
        return False
    fname_lower = os.path.basename(path).lower()

    # Rule 1: Ignore FAILSUMMARY.csv files
    if 'failsummary.csv' in fname_lower:
        return True

    # Rule 2: Ignore log archive files (*.log.gz, *.log.zip, *.log.tar.gz, etc.)
    archive_exts = ('.gz', '.zip', '.7z', '.rar', '.tar', '.bz2', '.xz', '.tgz')
    if fname_lower.endswith('.log.gz'):
        return True
    if '.log.' in fname_lower:
        after_log = fname_lower[fname_lower.rfind('.log.'):]
        for ext in archive_exts:
            if after_log.endswith(ext):
                return True

    return False


def _save_scan_snapshot(db, osat_id: int, all_paths: list):
    """Save or update daily FTP scan statistics (24h success/fail & current backlog)."""
    from app.models.ftp_scan_snapshot import FtpScanSnapshot
    from app.models.ftp_upload_log import FtpUploadLog
    from datetime import datetime, timezone, timedelta
    import os
    
    try:
        # Helper to classify Summary paths inside snapshot
        def is_summary_file_path(path: str) -> bool:
            fname = os.path.basename(path).lower()
            if fname.endswith(('.xls', '.xlsx')):
                return True
            if fname.endswith('.txt') and ('ets' in fname or 'summary' in fname):
                return True
            return False
        # Get UTC_time 24 hours ago
        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
        time_24h_ago_utc = now_utc - timedelta(hours=24)
        
        # 1. Query success/failed counts in the last 24 hours
        succ_logs_24h = db.query(FtpUploadLog.filename, FtpUploadLog.remote_path).filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.status == "success",
            FtpUploadLog.uploaded_at >= time_24h_ago_utc
        ).all()

        success_cnt = len(succ_logs_24h)
        summary_succ_cnt = sum(1 for l in succ_logs_24h if is_summary_file_path(l[0] or (l[1].split('/')[-1] if l[1] else "")))
        data_succ_cnt = success_cnt - summary_succ_cnt
        
        failed_cnt = db.query(FtpUploadLog).filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.status == "failed",
            FtpUploadLog.uploaded_at >= time_24h_ago_utc
        ).count()
        
        # 2. Query all historically successful filenames for this OSAT
        success_logs = db.query(FtpUploadLog.filename).filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.status == "success"
        ).all()
        success_filenames = {l[0] for l in success_logs if l[0]}
        
        # 2. Query all historical paths and successful filenames for this OSAT
        existing_paths = set(
            r[0] for r in db.query(FtpUploadLog.remote_path).filter(FtpUploadLog.osat_id == osat_id).all()
        )

        def _is_path_processed(path: str) -> bool:
            if path in existing_paths:
                return True
            fname = os.path.basename(path)
            if fname in success_filenames:
                return True
            fname_lower = fname.lower()
            for ext in ('.gz', '.zip', '.rar', '.7z', '.tgz', '.tar'):
                if fname_lower.endswith(ext):
                    base_fname = fname[:-len(ext)]
                    if base_fname in success_filenames:
                        return True
            return False

        # 3. Count files currently on FTP that are not yet processed
        unprocessed_cnt = sum(1 for p in all_paths if not _is_path_processed(p) and not _should_ignore_ftp_file(p))
        
        # 4. Save/update to daily snapshot (Asia/Shanghai timezone)
        tz_sh = timezone(timedelta(hours=8))
        now_sh = datetime.now(tz_sh)
        today_date = now_sh.date()
        
        snapshot = db.query(FtpScanSnapshot).filter(
            FtpScanSnapshot.osat_id == osat_id,
            FtpScanSnapshot.scan_date == today_date
        ).first()
        
        if snapshot:
            snapshot.success_count = success_cnt
            snapshot.data_success_count = data_succ_cnt
            snapshot.summary_success_count = summary_succ_cnt
            snapshot.failed_count = failed_cnt
            snapshot.scanned_count = unprocessed_cnt
            snapshot.last_scan_time = now_sh
        else:
            snapshot = FtpScanSnapshot(
                osat_id=osat_id,
                scan_date=today_date,
                success_count=success_cnt,
                data_success_count=data_succ_cnt,
                summary_success_count=summary_succ_cnt,
                failed_count=failed_cnt,
                scanned_count=unprocessed_cnt,
                last_scan_time=now_sh
            )
            db.add(snapshot)
            
        db.commit()
        print(f"[ftp_fetch] Saved scan snapshot for OSAT {osat_id}: success={success_cnt}, failed={failed_cnt}, unprocessed={unprocessed_cnt}")
    except Exception as e:
        db.rollback()
        print(f"[ftp_fetch] Failed to save scan snapshot for OSAT {osat_id}: {e}")



def has_giant_file_in_tmp() -> bool:
    """
    Check if any single file in /tmp/ exceeds 2GB (50 * 1024 * 1024 * 1024 bytes).
    Only called once per OSAT fetch run to minimize IO overhead.
    """
    import os
    limit = 50 * 1024 * 1024 * 1024  # 2GB
    target_dir = "/tmp"
    if not os.path.exists(target_dir):
        return False
    try:
        for root, _, files in os.walk(target_dir):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    if os.path.getsize(fp) > limit:
                        print(f"[ftp_fetch] Giant file found under /tmp: {fp} ({os.path.getsize(fp)} bytes)")
                        return True
                except Exception:
                    pass
    except Exception as e:
        print(f"[ftp_fetch] Error walking {target_dir}: {e}")
    return False


# ──────────────────────────────────────────
# 执行单个 OSAT 的完整抓取流程（并发流水线版）
# ──────────────────────────────────────────


def run_osat_fetch(osat_id: int, save_snapshot: bool = False):
    """
    Execute the FTP fetch task for a single OSAT (concurrent pipeline version):
    1. Lock the OSAT to prevent concurrent runs.
    2. Reset stuck processing logs to failed.
    3. Check if a scan snapshot has already been taken today. If not, scan the FTP directory,
       bulk insert newly found files to ftp_upload_logs as pending, and save/update the daily snapshot.
    4. Fetch the next batch of pending and retryable failed files from DB.
    5. Download up to max_batch_size files concurrently using _DOWNLOAD_WORKERS and parse them.
    """
    # Prevent concurrent runs of the same OSAT, with automatic stale lock expiration (30 min)
    import time
    now_ts = time.time()
    acquired_lock = False
    with _osat_in_progress_lock:
        if osat_id in _osat_in_progress:
            elapsed = now_ts - _osat_in_progress[osat_id]
            if elapsed > _OSAT_FETCH_TIMEOUT_SECONDS:
                print(f"[ftp_fetch] OSAT id={osat_id} previous fetch exceeded timeout ({elapsed:.0f}s > {_OSAT_FETCH_TIMEOUT_SECONDS}s), breaking stale lock.")
                _osat_in_progress[osat_id] = now_ts
                acquired_lock = True
            elif save_snapshot:
                print(f"[ftp_fetch] OSAT id={osat_id} lock busy during manual snapshot request, overriding lock for priority probe...")
                _osat_in_progress[osat_id] = now_ts
                acquired_lock = True
            else:
                print(f"[ftp_fetch] OSAT id={osat_id} is already running (running for {elapsed:.0f}s), skipping concurrent run")
                return
        else:
            _osat_in_progress[osat_id] = now_ts
            acquired_lock = True

    db = SessionLocal()
    # Check disk safety (Giant file check under /tmp)
    if has_giant_file_in_tmp():
        print(f"[ftp_fetch] OSAT id={osat_id} fetch aborted: Giant file (>50GB) exists under /tmp")
        with _osat_in_progress_lock:
            _osat_in_progress.pop(osat_id, None)
        db.close()
        return

    try:
        from app.models.osat_config import OsatConfig
        from app.models.user import User
        from app.models.ftp_upload_log import FtpUploadLog
        from app.models.ftp_scan_snapshot import FtpScanSnapshot
        from zoneinfo import ZoneInfo

        osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
        if not osat:
            print(f"[ftp_fetch] OSAT id={osat_id} does not exist")
            return

        # Get the first admin user as the uploader
        admin = db.query(User).filter(User.role == 'admin').first()
        admin_user_id = admin.id if admin else 1

        print(f"[ftp_fetch] Start fetching OSAT={osat.name}, Dir={osat.ftp_remote_dir}")

        # Helper to classify Summary paths
        def is_summary_file_path(path: str) -> bool:
            fname = os.path.basename(path).lower()
            if fname.endswith(('.xls', '.xlsx')):
                return True
            if fname.endswith('.txt') and ('ets' in fname or 'summary' in fname):
                return True
            return False

        # Step 0: Reset stuck processing logs and update ignored files
        reset_count = _reset_stuck_processing_logs(db)
        if reset_count:
            print(f"[ftp_fetch] Reset {reset_count} stuck processing logs to failed")

        # If this is a scan snapshot run (auto or manual), reset ALL unfinished logs across ALL OSATs
        # to ensure clean state. After scan completes, the normal fetch cycle will re-process them.
        if save_snapshot:
            all_reset_count = _reset_all_unfinished_logs(db)
            if all_reset_count:
                print(f"[ftp_fetch] Reset {all_reset_count} unfinished logs across all OSATs before scan")

        # Mark existing scanned/pending logs that match ignore rules as ignored
        existing_unprocessed = db.query(FtpUploadLog).filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.status.in_(['scanned', 'pending'])
        ).all()
        ignored_count = 0
        for log_item in existing_unprocessed:
            if _should_ignore_ftp_file(log_item.remote_path or log_item.filename):
                log_item.status = 'ignored'
                log_item.error_msg = 'Ignored by scan rule (log archive / FAILSUMMARY.csv)'
                ignored_count += 1
        if ignored_count > 0:
            db.commit()
            print(f"[ftp_fetch] Updated {ignored_count} existing scanned/pending logs to ignored status")

        # Step 1: Determine if we need to scan FTP today
        shanghai_tz = ZoneInfo("Asia/Shanghai")
        now_sh = datetime.now(shanghai_tz)
        today_date = now_sh.date()

        existing_snapshot = db.query(FtpScanSnapshot).filter(
            FtpScanSnapshot.osat_id == osat_id,
            FtpScanSnapshot.scan_date == today_date
        ).first()

        # Force re-scan if save_snapshot requested, if snapshot is missing, or if snapshot has 0 scanned/success/failed count
        snapshot_empty = False
        if existing_snapshot:
            scanned_cnt = getattr(existing_snapshot, 'scanned_count', 0) or 0
            succ_cnt = getattr(existing_snapshot, 'success_count', 0) or 0
            fail_cnt = getattr(existing_snapshot, 'failed_count', 0) or 0
            if scanned_cnt == 0 and succ_cnt == 0 and fail_cnt == 0:
                snapshot_empty = True

        need_scan = save_snapshot or (existing_snapshot is None) or snapshot_empty

        # Prepare executors for concurrency
        download_workers = _DOWNLOAD_WORKERS
        try:
            from app.tasks.ftp_scheduler import is_in_window
            if is_in_window(osat.schedule_start, osat.schedule_end):
                if download_workers < 5:
                    download_workers = 8
                    print(f"[ftp_fetch] During FTP fetch window, download workers increased to {download_workers}")
        except Exception as ex:
            print(f"[ftp_fetch] Error checking fetch window for dynamic workers adjustment: {ex}")

        download_pool = ThreadPoolExecutor(max_workers=download_workers, thread_name_prefix="ftp_dl")
        workers_count = get_parse_workers_count()
        print("[ftp_fetch] Initialized parse pool with " + str(workers_count) + " workers dynamically based on working hours.")
        parse_pool = ThreadPoolExecutor(max_workers=workers_count, thread_name_prefix="ftp_parse")

        def process_batch(paths, batch_name):
            if not paths:
                return
            print(f"[ftp_fetch] Start {batch_name} batch concurrent download and parse, count: {len(paths)}...")

            dl_futures = {}
            for path in paths:
                if _should_ignore_ftp_file(path):
                    continue
                fname = os.path.basename(path)
                existing = db.query(FtpUploadLog).filter(
                    FtpUploadLog.osat_id == osat_id,
                    FtpUploadLog.remote_path == path,
                    FtpUploadLog.status.in_(['scanned', 'pending', 'processing', 'downing'])
                ).first()
                if existing:
                    log_id = existing.id
                else:
                    log = FtpUploadLog(
                        osat_id=osat_id,
                        remote_path=path,
                        filename=fname,
                        status='scanned',
                    )
                    db.add(log)
                    db.commit()
                    db.refresh(log)
                    log_id = log.id

                df = download_pool.submit(_do_download, log_id, osat_id, path, admin_user_id)
                dl_futures[df] = (path, fname, log_id)

            parse_futures = {}
            for fut in as_completed(dl_futures):
                path, fname, log_id = dl_futures[fut]
                try:
                    result = fut.result()
                    if result is None:
                        continue
                    log_id, tmp_dir, csv_files = result
                    
                    # Update status to pending
                    log_rec = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
                    if log_rec:
                        log_rec.status = 'pending'
                        db.commit()
                        
                    pf = parse_pool.submit(_do_parse, log_id, osat_id, path,
                                           tmp_dir, csv_files, admin_user_id)
                    parse_futures[pf] = (fname, log_id)
                    print(f"[ftp_fetch] File {fname} download completed, submitted for concurrent parsing")
                except Exception as e:
                    print(f"[ftp_fetch] Concurrent download failed for {fname}: {e}")
                    try:
                        db_err = SessionLocal()
                        log_rec = db_err.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
                        if log_rec and log_rec.status != 'success':
                            if "0 bytes" in str(e) or "empty" in str(e).lower():
                                log_rec.status = 'skipped'
                                log_rec.error_msg = 'Remote file is empty (0 bytes)'
                            else:
                                log_rec.status = 'failed'
                                log_rec.error_msg = f"[Download Failed] {str(e)[:250]}"
                            db_err.commit()
                        db_err.close()
                    except Exception:
                        pass

            for fut in as_completed(parse_futures):
                fname, log_id = parse_futures[fut]
                try:
                    fut.result()
                    print(f"[ftp_fetch] File {fname} fully processed")
                except Exception as e:
                    print(f"[ftp_fetch] Concurrent parse/save failed for {fname}: {e}")
                    try:
                        db_err = SessionLocal()
                        log_rec = db_err.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
                        if log_rec and log_rec.status != 'success':
                            log_rec.status = 'failed'
                            log_rec.error_msg = f"[Parse Failed] {str(e)[:250]}"
                            db_err.commit()
                        db_err.close()
                    except Exception:
                        pass

        # Helper to query retryable failed logs
        def get_retryable_failed_paths():
            from sqlalchemy import func
            failed_stats_db = db.query(
                FtpUploadLog.remote_path,
                func.count(FtpUploadLog.id).label('fail_count'),
                func.max(FtpUploadLog.uploaded_at).label('last_fail_time')
            ).filter(
                FtpUploadLog.osat_id == osat_id,
                FtpUploadLog.status == 'failed'
            ).group_by(FtpUploadLog.remote_path).all()

            now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
            retryable = []
            for path, fail_count, last_fail_time in failed_stats_db:
                has_success = db.query(FtpUploadLog).filter(
                    FtpUploadLog.osat_id == osat_id,
                    FtpUploadLog.remote_path == path,
                    FtpUploadLog.status == 'success'
                ).first() is not None
                if has_success:
                    continue
                if fail_count >= _MAX_FAIL_RETRIES:
                    continue
                has_parse_failed = db.query(FtpUploadLog).filter(
                    FtpUploadLog.osat_id == osat_id,
                    FtpUploadLog.remote_path == path,
                    FtpUploadLog.status == 'failed',
                    FtpUploadLog.error_msg.like('%[Parse Failed]%')
                ).first() is not None
                if has_parse_failed:
                    continue

                if fail_count == 1:
                    backoff_minutes = 10
                elif fail_count == 2:
                    backoff_minutes = 30
                else:
                    backoff_minutes = 60

                last_fail_time_naive = last_fail_time.replace(tzinfo=None) if last_fail_time else now_utc
                if (now_utc - last_fail_time_naive).total_seconds() >= backoff_minutes * 60:
                    retryable.append(path)
            return retryable

        # ── STAGE 1: Scan and Process Summary (Loop until all summary files are parsed) ──
        all_summary_paths = []
        if need_scan:
            all_summary_paths = scan_ftp_files(osat, scan_type='summary')
            all_summary_paths = _deduplicate_csv_gz(all_summary_paths)
            all_summary_paths = [p for p in all_summary_paths if is_summary_file_path(p)]

            existing_paths = set(
                row.remote_path
                for row in db.query(FtpUploadLog.remote_path)
                .filter(FtpUploadLog.osat_id == osat_id)
                .all()
            )
            existing_success_filenames = set(
                row.filename
                for row in db.query(FtpUploadLog.filename)
                .filter(
                    FtpUploadLog.osat_id == osat_id,
                    FtpUploadLog.status == 'success',
                    FtpUploadLog.filename.isnot(None)
                )
                .all()
            )
            new_summary_paths = [p for p in all_summary_paths if p not in existing_paths]
            
            new_logs = []
            for path in new_summary_paths:
                fname = os.path.basename(path)
                if _should_ignore_ftp_file(path):
                    new_logs.append(FtpUploadLog(
                        osat_id=osat_id,
                        remote_path=path,
                        filename=fname,
                        status='ignored',
                        error_msg='Ignored by scan rule (log archive / FAILSUMMARY.csv)',
                    ))
                elif fname in existing_success_filenames:
                    new_logs.append(FtpUploadLog(
                        osat_id=osat_id,
                        remote_path=path,
                        filename=fname,
                        status='ignored',
                        error_msg='Ignored by deduplication rule (filename already successfully processed in history)',
                    ))
                else:
                    new_logs.append(FtpUploadLog(
                        osat_id=osat_id,
                        remote_path=path,
                        filename=fname,
                        status='scanned',
                    ))
            if new_logs:
                db.bulk_save_objects(new_logs)
                db.commit()
                print(f"[ftp_fetch] Bulk created {len(new_logs)} pending summary log entries in DB")
        else:
            print(f"[ftp_fetch] Summary FTP directory scan skipped (already scanned today)")

        # Summary loop: process until there are no scanned/pending/processing Summary files left
        max_batch_size = 100
        summary_iter = 0
        max_summary_iters = 20
        while summary_iter < max_summary_iters:
            summary_iter += 1
            scanned_summary = [
                row.remote_path
                for row in db.query(FtpUploadLog.remote_path)
                .filter(
                    FtpUploadLog.osat_id == osat_id,
                    FtpUploadLog.status.in_(['scanned', 'pending', 'processing'])
                ).all()
            ]
            scanned_summary = [p for p in scanned_summary if is_summary_file_path(p)]
            
            retryable_failed_paths = get_retryable_failed_paths()
            retryable_summary = [p for p in retryable_failed_paths if is_summary_file_path(p)]
            
            summary_to_process = list(set(scanned_summary + retryable_summary))
            if not summary_to_process:
                print(f"[ftp_fetch] Summary files fully processed in {summary_iter - 1} iterations.")
                break
                
            batch = summary_to_process[:max_batch_size]
            print(f"[ftp_fetch] [Summary Loop] Iteration {summary_iter}: processing {len(batch)} of {len(summary_to_process)} Summary files...")
            process_batch(batch, f"Summary (Iter {summary_iter})")
            db.commit()
        else:
            print(f"[ftp_fetch] Summary loop reached max iterations ({max_summary_iters})")

        # Check if there are any remaining scanned/pending/processing summary files
        remaining_summaries = [
            row.remote_path
            for row in db.query(FtpUploadLog.remote_path)
            .filter(
                FtpUploadLog.osat_id == osat_id,
                FtpUploadLog.status.in_(['scanned', 'pending', 'processing'])
            ).all()
        ]
        remaining_summaries = [p for p in remaining_summaries if is_summary_file_path(p)]
        if remaining_summaries:
            print(f"[ftp_fetch] Aborting Stage 2 because there are still {len(remaining_summaries)} Summary files in scanned/pending/processing status")
            return

        # ── STAGE 2: Scan and Process Data (only after Summary is fully completed) ──
        all_data_paths = []
        if need_scan:
            all_data_paths = scan_ftp_files(osat, scan_type='data')
            all_data_paths = _deduplicate_csv_gz(all_data_paths)
            all_data_paths = [p for p in all_data_paths if not is_summary_file_path(p)]

            existing_paths = set(
                row.remote_path
                for row in db.query(FtpUploadLog.remote_path)
                .filter(FtpUploadLog.osat_id == osat_id)
                .all()
            )
            existing_success_filenames = set(
                row.filename
                for row in db.query(FtpUploadLog.filename)
                .filter(
                    FtpUploadLog.osat_id == osat_id,
                    FtpUploadLog.status == 'success',
                    FtpUploadLog.filename.isnot(None)
                )
                .all()
            )
            new_data_paths = [p for p in all_data_paths if p not in existing_paths]
            
            new_logs = []
            for path in new_data_paths:
                fname = os.path.basename(path)
                if _should_ignore_ftp_file(path):
                    new_logs.append(FtpUploadLog(
                        osat_id=osat_id,
                        remote_path=path,
                        filename=fname,
                        status='ignored',
                        error_msg='Ignored by scan rule (log archive / FAILSUMMARY.csv)',
                    ))
                elif fname in existing_success_filenames:
                    new_logs.append(FtpUploadLog(
                        osat_id=osat_id,
                        remote_path=path,
                        filename=fname,
                        status='ignored',
                        error_msg='Ignored by deduplication rule (filename already successfully processed in history)',
                    ))
                else:
                    new_logs.append(FtpUploadLog(
                        osat_id=osat_id,
                        remote_path=path,
                        filename=fname,
                        status='scanned',
                    ))
            if new_logs:
                db.bulk_save_objects(new_logs)
                db.commit()
                print(f"[ftp_fetch] Bulk created {len(new_logs)} pending data log entries in DB")
        else:
            print(f"[ftp_fetch] Data FTP directory scan skipped (already scanned today)")

        # Save scan snapshot immediately after FTP directory probe completes
        if need_scan:
            combined_paths = all_summary_paths + all_data_paths
            _save_scan_snapshot(db, osat_id, combined_paths)
            print(f"[ftp_fetch] Fast snapshot probe completed for OSAT id={osat_id}, saved snapshot immediately!")

        # If save_snapshot was explicitly requested (manual fast snapshot scan), return immediately after directory probe!
        if save_snapshot:
            print(f"[ftp_fetch] Fast snapshot probe finished for OSAT id={osat_id}, returning immediately without waiting for download/parse loop!")
            return

        # Data loop: process until there are no scanned/pending/processing Data files left
        max_data_iters = 50
        data_iter = 0
        total_data_processed = 0
        while data_iter < max_data_iters:
            data_iter += 1
            scanned_data = [
                row.remote_path
                for row in db.query(FtpUploadLog.remote_path)
                .filter(
                    FtpUploadLog.osat_id == osat_id,
                    FtpUploadLog.status.in_(['scanned', 'pending', 'processing'])
                ).all()
            ]
            scanned_data = [p for p in scanned_data if not is_summary_file_path(p)]
            retryable_failed_paths = get_retryable_failed_paths()
            retryable_data = [p for p in retryable_failed_paths if not is_summary_file_path(p)]
            data_to_process = list(set(scanned_data + retryable_data))
            
            if not data_to_process:
                print(f"[ftp_fetch] Data files fully processed in {data_iter - 1} iterations.")
                break
                
            batch = data_to_process[:max_batch_size]
            print(f"[ftp_fetch] [Data Loop] Iteration {data_iter}: processing {len(batch)} of {len(data_to_process)} Data files...")
            process_batch(batch, f"Data (Iter {data_iter})")
            db.commit()
            total_data_processed += len(batch)
        else:
            print(f"[ftp_fetch] Data loop reached max iterations ({max_data_iters})")

        try:
            download_pool.shutdown(wait=False)
            parse_pool.shutdown(wait=False)
        except Exception:
            pass

        # Fast snapshot probe already saved earlier

        processed_count = len(summary_to_process) + len(data_to_process)
        print(f"[ftp_fetch] OSAT={osat.name} run completed, processed {processed_count} files (Summary={len(summary_to_process)}, Data={len(data_to_process)})")

    except Exception as e:
        traceback.print_exc()
        print(f"[ftp_fetch] OSAT id={osat_id} exception: {e}")
    finally:
        with _osat_in_progress_lock:
            _osat_in_progress.pop(osat_id, None)
        db.close()
