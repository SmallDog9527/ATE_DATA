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
        raise Exception(f"RAR 解压失败: {msg or 'unknown error'}")


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
        timeout=15,
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
        ftp.connect(osat.ftp_host, osat.ftp_port or 990, timeout=15)
    elif encryption in ("explicit_tls_optional", "explicit_tls_required"):
        ftp = ftplib.FTP_TLS()
        ftp.connect(osat.ftp_host, osat.ftp_port, timeout=15)
        try:
            ftp.auth()
        except Exception:
            if encryption == "explicit_tls_required":
                raise
    else:
        ftp = ftplib.FTP()
        ftp.connect(osat.ftp_host, osat.ftp_port, timeout=15)
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


def scan_ftp_files(osat) -> List[str]:
    """
    递归扫描 osat.ftp_remote_dir，
    收集该目录及其所有子目录下的 .csv 和 .zip 文件的完整 FTP 路径列表。
    """
    ftp = _make_ftp(osat)
    result = []
    visited = set()
    try:
        scan_roots = [
            (osat.ftp_remote_dir or "/", True, "Data"),
            (getattr(osat, "ftp_summary_dir", None) or "", False, "Summary"),
        ]
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

# 单个文件允许的最大失败重试次数（超过此次数的文件将被跳过，不再重试）
_MAX_FAIL_RETRIES = 3
PROCESSING_TIMEOUT_MINUTES = 5   # 超过此分钟数仍处于 processing 的记录自动标记为 failed
_DOWNLOAD_WORKERS = 3             # 并发 FTP 下载线程数
_PARSE_WORKERS = 3                # 并发解析线程数


def get_new_files(db, osat_id: int, all_remote_paths: List[str]) -> List[str]:
    """
    从 ftp_upload_logs 查出已上传过的 remote_path，返回差集（待上传文件列表）。
    排除规则：
    1. status='success'  → 已成功，永久跳过
    2. status='processing' → 正在处理，本轮跳过（防并发竞态）
    3. status='failed' 且失败次数 >= _MAX_FAIL_RETRIES → 已超过重试上限，跳过
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from sqlalchemy import func

    # 已成功或正在处理的路径
    already_done = set(
        row.remote_path
        for row in db.query(FtpUploadLog.remote_path)
        .filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.status.in_(['success', 'processing'])
        )
        .all()
    )

    # 失败次数已达上限的路径
    too_many_failures = set(
        row.remote_path
        for row in db.query(FtpUploadLog.remote_path)
        .filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.status == 'failed'
        )
        .group_by(FtpUploadLog.remote_path)
        .having(func.count(FtpUploadLog.id) >= _MAX_FAIL_RETRIES)
        .all()
    )
    if too_many_failures:
        print(f"[ftp_fetch] 跳过 {len(too_many_failures)} 个已达最大重试次数({_MAX_FAIL_RETRIES})的文件")

    excluded = already_done | too_many_failures
    return [p for p in all_remote_paths if p not in excluded]


# ──────────────────────────────────────────
# 超时 processing 记录重置
# ──────────────────────────────────────────

def _reset_stuck_processing_logs(db) -> int:
    """
    将超过 PROCESSING_TIMEOUT_MINUTES 分钟仍处于 processing 状态的日志重置为 failed。
    使用数据库服务器时间进行比较，避免客户端与服务器时区差异。
    返回重置的记录数量。
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from sqlalchemy import func

    stuck = db.query(FtpUploadLog).filter(
        FtpUploadLog.status == 'processing',
        FtpUploadLog.uploaded_at < func.now() - timedelta(minutes=PROCESSING_TIMEOUT_MINUTES)
    ).all()

    count = len(stuck)
    for log in stuck:
        log.status = 'failed'
        log.error_msg = (
            f'处理超时（超过 {PROCESSING_TIMEOUT_MINUTES} 分钟未完成，自动标记为失败）'
        )
        print(f"[ftp_fetch] ⏰ 超时重置: {log.filename} "
              f"(id={log.id}, started={log.uploaded_at})")
    if stuck:
        db.commit()
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
        # 再次查询 DB，防止两轮扫描间隙的竞态（双重检查）
        existing_log = db.query(FtpUploadLog).filter(
            FtpUploadLog.osat_id == osat.id,
            FtpUploadLog.remote_path == remote_path,
            FtpUploadLog.status.in_(['success', 'processing'])
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

            for root, _, files in os.walk(extract_dir):
                for f in files:
                    flower = f.lower()
                    if (flower.endswith('.csv') or flower.endswith('.txt')
                            or flower.endswith('.xls') or flower.endswith('.xlsx')):
                        csv_files_to_process.append(os.path.join(root, f))

            if not csv_files_to_process:
                raise Exception("ZIP/RAR 压缩包中未找到任何 .csv, .txt, .xls 或 .xlsx 文件")

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

        elif ext in ('.csv', '.txt', '.xls', '.xlsx'):
            # 单个 CSV, TXT, XLS 或 XLSX 文件
            csv_files_to_process.append(local_file)
        else:
            raise Exception(f"不支持的文件格式: {ext}")

        # 确保 txt/xls/xlsx 文件排在 csv 文件后面进行处理
        csv_files_to_process.sort(key=lambda p: (1 if p.lower().endswith(('.txt', '.xls', '.xlsx')) else 0, p))

        last_lot_id = None

        # 逐个处理解压出来的 CSV 或 TXT 文件
        for csv_filepath in csv_files_to_process:
            csv_filename = os.path.basename(csv_filepath)
            save_name = csv_filename
            save_path = os.path.join(UPLOAD_DIR, save_name)

            # ── 重名文件处理：不加后缀，而是检查是否已有对应 Lot 记录 ──
            if os.path.exists(save_path):
                existing_lot = db.query(Lot).filter(
                    Lot.filename == csv_filename,
                    Lot.osat_name == osat.name,
                    Lot.status.in_(['processed', 'pending', 'processing'])
                ).first()
                if existing_lot:
                    # 已有有效 Lot 记录，跳过此文件，不重复入库
                    print(f"[ftp_fetch] 文件 {csv_filename} 已有对应 Lot 记录"
                          f"（id={existing_lot.id}, status={existing_lot.status}），跳过")
                    last_lot_id = existing_lot.id
                    continue
                else:
                    # 孤立文件（无 Lot 记录），覆盖写入
                    print(f"[ftp_fetch] 文件 {csv_filename} 已存在但无对应 Lot 记录，覆盖写入")

            shutil.copy2(csv_filepath, save_path)

            if csv_filename.lower().endswith(('.xls', '.xlsx')):
                try:
                    from app.services.parsers.xls_summary_parser import parse_and_save_xls_summary
                    created_lots = parse_and_save_xls_summary(save_path, db, None, osat_name=osat.name)
                    if created_lots:
                        last_lot_id = created_lots[-1].id
                except Exception as ex:
                    import traceback
                    traceback.print_exc()
                continue

            if csv_filename.lower().endswith('.txt'):
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
                    osat_name=osat.name,
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

                db.add(lot)
                db.commit()
                db.refresh(lot)

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
                osat_name=osat.name,
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

def _do_download(osat_id: int, remote_path: str, admin_user_id: int):
    """
    【下载阶段】在独立线程中执行，拥有自己的 DB 会话：
    1. 进程内锁 + DB 双重检查（防并发重复）
    2. 标记 processing
    3. FTP 下载 + ZIP/GZ 解压
    返回 (log_id, tmp_dir, csv_files_to_process)，或 None（跳过），或抛出异常（标记 failed）。
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from app.models.osat_config import OsatConfig
    import zipfile, gzip, shutil

    filename = os.path.basename(remote_path)
    _lock_key = (osat_id, remote_path)
    tmp_dir = None

    # ── 进程内线程锁 ──────────────────────────────────────────────────────
    with _file_in_progress_lock:
        if _lock_key in _file_in_progress:
            print(f"[ftp_dl] ⚠ {filename} 正被其他线程处理，跳过")
            return None
        _file_in_progress.add(_lock_key)

    db = SessionLocal()
    log_id = None
    try:
        osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
        if not osat:
            raise Exception(f"OSAT id={osat_id} 不存在")

        # DB 双重检查（防止多轮扫描间隙竞态）
        existing = db.query(FtpUploadLog).filter(
            FtpUploadLog.osat_id == osat_id,
            FtpUploadLog.remote_path == remote_path,
            FtpUploadLog.status.in_(['success', 'processing'])
        ).first()
        if existing:
            print(f"[ftp_dl] ⚠ {filename} 已有记录(status={existing.status})，跳过")
            return None

        # 标记为处理中
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

        # ── FTP 下载 ──────────────────────────────────────────────────────
        tmp_dir = tempfile.mkdtemp(prefix='ftp_dl_')
        local_file = os.path.join(tmp_dir, filename)

        ftp = _make_ftp(osat)
        file_size = 0
        try:
            ftp.sendcmd('TYPE I')
            file_size = ftp.size(remote_path) or 0
            with open(local_file, 'wb') as f:
                ftp.retrbinary(f'RETR {remote_path}', f.write)
        finally:
            try:
                ftp.quit()
            except Exception:
                pass

        log.file_size = file_size
        db.commit()

        # ── 解压 ──────────────────────────────────────────────────────────
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
            for root, _, files in os.walk(extract_dir):
                for f in files:
                    flower = f.lower()
                    if (flower.endswith('.csv') or flower.endswith('.txt')
                            or flower.endswith('.xls') or flower.endswith('.xlsx')):
                        csv_files_to_process.append(os.path.join(root, f))
            if not csv_files_to_process:
                raise Exception("ZIP/RAR 压缩包中未找到任何 .csv, .txt, .xls 或 .xlsx 文件")

        elif ext == '.gz':
            inner_name = os.path.splitext(filename)[0]
            inner_ext = os.path.splitext(inner_name)[1].lower()
            if inner_ext not in ('.csv', '.txt'):
                # 内部文件不是 CSV/TXT，直接标记成功并跳过解析
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

        elif ext in ('.csv', '.txt', '.xls', '.xlsx'):
            csv_files_to_process.append(local_file)
        else:
            raise Exception(f"不支持的文件格式: {ext}")

        csv_files_to_process.sort(key=lambda p: (1 if p.lower().endswith(('.txt', '.xls', '.xlsx')) else 0, p))
        print(f"[ftp_dl] ✅ 下载完成: {filename} ({len(csv_files_to_process)} 个文件待解析)")
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
        # DB 记录已标记 processing，进程内锁可安全释放
        with _file_in_progress_lock:
            _file_in_progress.discard(_lock_key)
        db.close()


# ──────────────────────────────────────────
# 解析阶段（线程安全，独立 DB 会话）
# ──────────────────────────────────────────

def _do_parse(log_id: int, osat_id: int, remote_path: str,
              tmp_dir: str, csv_files_to_process: list, admin_user_id: int) -> dict:
    """
    【解析阶段】在独立线程中执行，拥有自己的 DB 会话：
    1. 逐个解析 CSV/TXT → 创建 Lot 记录 → 调用 _parse_and_save
    2. 更新 FtpUploadLog 为 success / failed
    3. 清理临时目录
    """
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
        log_rec = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
        UPLOAD_DIR = os.path.expanduser(app_settings.UPLOAD_DIR)
        last_lot_id = None

        for csv_filepath in csv_files_to_process:
            csv_filename = os.path.basename(csv_filepath)
            save_name = csv_filename
            save_path = os.path.join(UPLOAD_DIR, save_name)

            # ── 重名文件处理 ──────────────────────────────────────────────
            if os.path.exists(save_path):
                existing_lot = db.query(Lot).filter(
                    Lot.filename == csv_filename,
                    Lot.osat_name == osat.name,
                    Lot.status.in_(['processed', 'pending', 'processing'])
                ).first()
                if existing_lot:
                    print(f"[ftp_parse] 文件 {csv_filename} 已有对应 Lot 记录"
                          f"（id={existing_lot.id}, status={existing_lot.status}），跳过")
                    last_lot_id = existing_lot.id
                    continue
                else:
                    print(f"[ftp_parse] 文件 {csv_filename} 已存在但无对应 Lot 记录，覆盖写入")

            shutil.copy2(csv_filepath, save_path)

            if csv_filename.lower().endswith(('.xls', '.xlsx')):
                try:
                    from app.services.parsers.xls_summary_parser import parse_and_save_xls_summary
                    created_lots = parse_and_save_xls_summary(save_path, db, None, osat_name=osat.name)
                    if created_lots:
                        last_lot_id = created_lots[-1].id
                except Exception as ex:
                    import traceback
                    traceback.print_exc()
                continue

            if csv_filename.lower().endswith('.txt'):
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
                    osat_name=osat.name,
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

                db.add(lot)
                db.commit()
                db.refresh(lot)

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

            # CSV 文件：解析元数据
            tester = detect_tester(save_path)
            display_tester = 'STS8200' if tester == 'LBS' else tester
            try:
                meta_result = parse_file(save_path)
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
                osat_name=osat.name,
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

            from app.api.routes.lots import _parse_and_save
            _parse_and_save(lot.id, save_path, db)
            last_lot_id = lot.id

        # 全部处理完成，标记成功
        log_rec.status = 'success'
        log_rec.lot_id_created = last_lot_id
        log_rec.uploaded_at = datetime.now(timezone.utc)
        db.commit()
        print(f"[ftp_parse] ✅ 解析成功: {filename}, lot_id={last_lot_id}")
        return {"ok": True, "lot_id": last_lot_id}

    except Exception as e:
        traceback.print_exc()
        err_msg = str(e)[:500]
        try:
            log_rec = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
            if log_rec:
                log_rec.status = 'failed'
                log_rec.error_msg = err_msg
                log_rec.uploaded_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            db.rollback()
        raise
    finally:
        db.close()
        try:
            import shutil as _shutil
            _shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


# ──────────────────────────────────────────
# 执行单个 OSAT 的完整抓取流程（并发流水线版）
# ──────────────────────────────────────────

def run_osat_fetch(osat_id: int):
    """
    完整执行一个 OSAT 的 FTP 抓取任务（并发流水线版本）：
    1. 重置超时（> PROCESSING_TIMEOUT_MINUTES 分钟）的 processing 记录为 failed
    2. 连接 FTP，扫描目录，去重
    3. _DOWNLOAD_WORKERS 个线程并发下载，_PARSE_WORKERS 个线程并发解析
       下载完成立即提交解析，两阶段流水线并行，一个文件卡住不影响其余文件。
    在独立线程中调用，不阻塞主进程。
    """
    db = SessionLocal()
    try:
        from app.models.osat_config import OsatConfig
        from app.models.user import User

        osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
        if not osat:
            print(f"[ftp_fetch] OSAT id={osat_id} 不存在")
            return

        # 获取第一个 admin 用户作为上传者
        admin = db.query(User).filter(User.role == 'admin').first()
        admin_user_id = admin.id if admin else 1

        print(f"[ftp_fetch] 开始抓取 OSAT={osat.name}, 目录={osat.ftp_remote_dir}")

        # Step 0: 重置超时的 processing 记录
        reset_count = _reset_stuck_processing_logs(db)
        if reset_count:
            print(f"[ftp_fetch] ⏰ 已重置 {reset_count} 个超时 processing 记录为 failed")

        # Step 1: 扫描 FTP 目录
        all_paths = scan_ftp_files(osat)
        print(f"[ftp_fetch] FTP 扫描到 {len(all_paths)} 个文件")

        # Step 1.5: 去除 csv / csv.gz 重复对
        all_paths = _deduplicate_csv_gz(all_paths)
        print(f"[ftp_fetch] csv/gz 去重后剩余 {len(all_paths)} 个文件")

        # Step 2: 去重（排除已成功 / 处理中 / 超限失败）
        new_paths = get_new_files(db, osat_id, all_paths)
        new_paths = sorted(new_paths, key=lambda p: (1 if p.lower().endswith('.txt') else 0, p))
        print(f"[ftp_fetch] 去重后待处理 {len(new_paths)} 个文件")

        if not new_paths:
            print(f"[ftp_fetch] 无新文件，跳过")
            return

        # Step 3: 并发下载 + 并发解析（两阶段流水线）
        #   下载池（_DOWNLOAD_WORKERS 线程）：FTP 连接 / 下载 / 解压
        #   解析池（_PARSE_WORKERS 线程）  ：CSV 解析 / Lot 入库
        #   下载完成立即提交解析，两池并行运行，互不阻塞
        download_pool = ThreadPoolExecutor(max_workers=_DOWNLOAD_WORKERS,
                                           thread_name_prefix="ftp_dl")
        parse_pool = ThreadPoolExecutor(max_workers=_PARSE_WORKERS,
                                        thread_name_prefix="ftp_parse")
        parse_futures = {}

        try:
            # 提交全部下载任务
            dl_futures = {
                download_pool.submit(_do_download, osat_id, path, admin_user_id): path
                for path in new_paths
            }

            # 下载完成 → 立即提交解析（实现流水线）
            for fut in as_completed(dl_futures):
                path = dl_futures[fut]
                fname = os.path.basename(path)
                try:
                    result = fut.result()
                    if result is None:
                        print(f"[ftp_fetch] ⏭ 已跳过: {fname}")
                        continue
                    log_id, tmp_dir, csv_files = result
                    pf = parse_pool.submit(_do_parse, log_id, osat_id, path,
                                           tmp_dir, csv_files, admin_user_id)
                    parse_futures[pf] = fname
                    print(f"[ftp_fetch] 📤 {fname} 下载完成，已提交解析队列")
                except Exception as e:
                    print(f"[ftp_fetch] ❌ 下载失败 {fname}: {e}")

            # 等待所有解析完成
            for fut in as_completed(parse_futures):
                fname = parse_futures[fut]
                try:
                    fut.result()
                except Exception as e:
                    print(f"[ftp_fetch] ❌ 解析失败 {fname}: {e}")

        finally:
            download_pool.shutdown(wait=False)
            parse_pool.shutdown(wait=False)

        print(f"[ftp_fetch] OSAT={osat.name} 本轮抓取完成，"
              f"共处理 {len(new_paths)} 个文件")

    except Exception as e:
        traceback.print_exc()
        print(f"[ftp_fetch] OSAT id={osat_id} 发生异常: {e}")
    finally:
        db.close()
