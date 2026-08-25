from sqlalchemy import or_
"""
settings.py  —  系统设置 API（仅管理员）
包含：SMTP邮箱配置、OSAT/FTP管理、上传日志查询
"""
from fastapi import APIRouter, Depends, HTTPException, Query
import os
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.core.database import get_db
from app.api.deps import require_admin, require_admin_or_eng, get_current_user
from app.models.user import User
from app.models.system_setting import SystemSetting
from app.models.osat_config import OsatConfig
from app.models.ftp_upload_log import FtpUploadLog
from app.models.lot import Lot
from app.models.pgs_upload import PgsUpload
from app.schemas.settings import (
    SmtpConfigIn, SmtpConfigOut, SmtpTestRequest,
    OsatConfigIn, OsatConfigOut,
    FtpLogItem, FtpLogPage,
    FtpExtractedLogItem, FtpExtractedLogPage,
    ManualLogItem, ManualLogPage,
    VersionUpdateIn,
)
from app.services.smtp_dynamic import encrypt_password, decrypt_password, send_test_email
from sqlalchemy import literal, desc, cast, String

router = APIRouter(prefix="/settings", tags=["settings"])


# ══════════════════════════════════════════
# SMTP 邮箱配置
# ══════════════════════════════════════════

@router.get("/smtp", response_model=SmtpConfigOut)
def get_smtp_config(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """获取当前 SMTP 配置（密码脱敏）"""
    cfg = db.query(SystemSetting).first()
    if not cfg:
        return SmtpConfigOut(is_configured=False)
    return SmtpConfigOut(
        smtp_host=cfg.smtp_host,
        smtp_port=cfg.smtp_port,
        smtp_user=cfg.smtp_user,
        smtp_from=cfg.smtp_from,
        smtp_ssl=cfg.smtp_ssl if cfg.smtp_ssl is not None else True,
        is_configured=bool(cfg.smtp_host and cfg.smtp_user),
    )


@router.put("/smtp")
def save_smtp_config(
    body: SmtpConfigIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """保存 SMTP 配置（密码加密存储）"""
    cfg = db.query(SystemSetting).first()
    if not cfg:
        cfg = SystemSetting()
        db.add(cfg)

    cfg.smtp_host = body.smtp_host.strip()
    cfg.smtp_port = body.smtp_port
    cfg.smtp_user = body.smtp_user.strip()
    cfg.smtp_pass_enc = encrypt_password(body.smtp_password)
    cfg.smtp_from = (body.smtp_from or body.smtp_user).strip()
    cfg.smtp_ssl = body.smtp_ssl
    cfg.updated_at = datetime.now(timezone.utc)

    # Synchronize admin user default email with SMTP sender address (only when configured)
    admin_user = db.query(User).filter(User.username == "admin").first()
    if admin_user and getattr(cfg, "smtp_from", None):
        admin_user.email = cfg.smtp_from

    db.commit()
    return {"message": "SMTP 配置已保存"}


@router.post("/smtp/test")
def test_smtp(
    body: SmtpTestRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """发送测试邮件，验证 SMTP 配置是否正确"""
    result = send_test_email(db, body.to_email)
    if result.get("ok"):
        return {"message": f"测试邮件已发送至 {body.to_email}，请查收"}
    raise HTTPException(status_code=400, detail=result.get("error", "发送失败"))


# ══════════════════════════════════════════
# OSAT / FTP 配置
# ══════════════════════════════════════════

@router.get("/osats", response_model=List[OsatConfigOut])
def list_osats(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
):
    """获取所有 OSAT 配置列表"""
    return db.query(OsatConfig).order_by(OsatConfig.created_at.desc()).all()


@router.post("/osats", response_model=OsatConfigOut)
def create_osat(
    body: OsatConfigIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
):
    """新建 OSAT"""
    if db.query(OsatConfig).filter(OsatConfig.name == body.name.strip()).first():
        raise HTTPException(status_code=400, detail=f"OSAT 名称 '{body.name}' 已存在")

    osat = OsatConfig(
        name=body.name.strip(),
        protocol=body.protocol,
        ftp_host=body.ftp_host.strip(),
        ftp_port=body.ftp_port,
        ftp_user=body.ftp_user.strip(),
        ftp_pass_enc=encrypt_password(body.ftp_password),
        ftp_encryption=body.ftp_encryption,
        ftp_remote_dir=body.ftp_remote_dir.strip() or "/",
        ftp_summary_dir=body.ftp_summary_dir.strip() or "/",
        schedule_start=body.schedule_start,
        schedule_end=body.schedule_end,
        enabled=body.enabled,
        data_type=body.data_type,
    )
    db.add(osat)
    db.commit()
    db.refresh(osat)
    return osat


@router.put("/osats/{osat_id}", response_model=OsatConfigOut)
def update_osat(
    osat_id: int,
    body: OsatConfigIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
):
    """修改 OSAT 配置"""
    osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
    if not osat:
        raise HTTPException(status_code=404, detail="OSAT 不存在")

    # 检查名称冲突（排除自身）
    conflict = db.query(OsatConfig).filter(
        OsatConfig.name == body.name.strip(),
        OsatConfig.id != osat_id
    ).first()
    if conflict:
        raise HTTPException(status_code=400, detail=f"OSAT 名称 '{body.name}' 已存在")

    osat.name = body.name.strip()
    osat.protocol = body.protocol
    osat.ftp_host = body.ftp_host.strip()

    osat.ftp_port = body.ftp_port
    osat.ftp_user = body.ftp_user.strip()
    osat.ftp_encryption = body.ftp_encryption
    # 密码若传入则更新，否则保留原密码
    if body.ftp_password and body.ftp_password != "******":
        osat.ftp_pass_enc = encrypt_password(body.ftp_password)
    osat.ftp_remote_dir = body.ftp_remote_dir.strip() or "/"
    osat.ftp_summary_dir = body.ftp_summary_dir.strip() or "/"
    was_enabled = osat.enabled
    osat.schedule_start = body.schedule_start
    osat.schedule_end = body.schedule_end
    osat.enabled = body.enabled
    osat.data_type = body.data_type
    osat.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(osat)

    # Automatically trigger immediate FTP scan and fetch task when re-enabling an OSAT
    if body.enabled and not was_enabled:
        try:
            from app.tasks.ftp_scheduler import trigger_osat_now
            trigger_osat_now(osat_id)
            print(f"[osat_config] Auto-triggered immediate fetch for re-enabled OSAT id={osat_id}")
        except Exception as e:
            print(f"[osat_config] Failed to auto-trigger fetch for re-enabled OSAT id={osat_id}: {e}")

    return osat


@router.delete("/osats/{osat_id}")
def delete_osat(
    osat_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
):
    """删除 OSAT（关联日志级联删除）"""
    osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
    if not osat:
        raise HTTPException(status_code=404, detail="OSAT 不存在")
    db.delete(osat)
    db.commit()
    return {"message": f"OSAT '{osat.name}' 已删除"}


@router.post("/osats/{osat_id}/test")
def test_osat_ftp(
    osat_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
):
    """测试指定 OSAT 的 FTP 连接"""
    osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
    if not osat:
        raise HTTPException(status_code=404, detail="OSAT 不存在")

    from app.services.ftp_service import test_ftp_connection
    result = test_ftp_connection(osat)
    if result.get("ok"):
        return {"message": f"FTP 连接成功！服务器响应: {result.get('welcome', '')}"}
    raise HTTPException(status_code=400, detail=result.get("error", "连接失败"))


@router.post("/osats/{osat_id}/run-now")
def run_osat_now(
    osat_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
):
    """手动立即触发一次 OSAT 抓取任务（后台异步执行）"""
    osat = db.query(OsatConfig).filter(OsatConfig.id == osat_id).first()
    if not osat:
        raise HTTPException(status_code=404, detail="OSAT 不存在")

    from app.tasks.ftp_scheduler import trigger_osat_now
    trigger_osat_now(osat_id)
    return {"message": f"OSAT '{osat.name}' 抓取任务已在后台启动"}


# ══════════════════════════════════════════
# FTP 上传日志
# ══════════════════════════════════════════

@router.get("/ftp-logs", response_model=FtpLogPage)
def get_ftp_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
    osat_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    include_scanned: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """查询 FTP 上传与快照扫描日志（支持按 LOT/文件名/路径模糊搜索，支持全部快照文件检索）"""
    query = db.query(FtpUploadLog)
    
    # Exclude scanned records by default unless searching or explicitly requested
    if not search and not include_scanned:
        query = query.filter(FtpUploadLog.status != 'scanned')
        
    if osat_id:
        query = query.filter(FtpUploadLog.osat_id == osat_id)
    if status:
        query = query.filter(FtpUploadLog.status == status)
    if search and search.strip():
        search_kw = f"%{search.strip()}%"
        query = query.filter(
            or_(
                FtpUploadLog.remote_path.ilike(search_kw),
                FtpUploadLog.filename.ilike(search_kw)
            )
        )

    total = query.count()
    logs = (
        query.order_by(FtpUploadLog.uploaded_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # 批量获取 osat 名称
    osat_names = {
        o.id: o.name
        for o in db.query(OsatConfig).all()
    }

    items = []
    for log in logs:
        items.append(FtpLogItem(
            id=log.id,
            osat_id=log.osat_id,
            osat_name=osat_names.get(log.osat_id),
            remote_path=log.remote_path,
            filename=log.filename,
            status=log.status,
            error_msg=log.error_msg,
            file_size=log.file_size,
            lot_id_created=log.lot_id_created,
            uploaded_at=log.uploaded_at,
        ))

    return FtpLogPage(total=total, page=page, page_size=page_size, items=items)


@router.post("/ftp-logs/{log_id}/retry")
def retry_failed_ftp_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_eng),
):
    """
    Retry parsing a failed FTP upload log.
    If the file is already downloaded and extracted, we re-submit parsing.
    Otherwise, we reset status to 'pending' to trigger download retry.
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from app.services.ftp_service import _do_parse, run_osat_fetch
    from app.tasks.ftp_scheduler import _executor
    
    log = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
        
    if log.status != 'failed':
        raise HTTPException(status_code=400, detail="Only failed logs can be retried")
        
    EXTRACTED_DIR = "/tmp/FTP/extracted"
    prefix = f"{log_id}_"
    files = []
    if os.path.exists(EXTRACTED_DIR):
        for name in os.listdir(EXTRACTED_DIR):
            if name.startswith(prefix):
                fpath = os.path.join(EXTRACTED_DIR, name)
                # Verify physical existence and non-zero size before using cache
                if os.path.isfile(fpath) and os.path.getsize(fpath) > 0:
                    files.append(fpath)
                
    if not files:
        # Fallback to scanned status to re-download from remote FTP automatically
        log.status = 'scanned'
        log.error_msg = None
        db.commit()
        
        _executor.submit(run_osat_fetch, log.osat_id, False)
        return {"message": "Files not found in local cache. Reset status to scanned and triggered fresh remote download."}
        
    log.status = 'pending'
    log.error_msg = None
    db.commit()
    
    admin_user_id = current_user.id if current_user else 1
    _executor.submit(_do_parse, log.id, log.osat_id, log.remote_path, None, files, admin_user_id)
    return {"message": "Re-parsing task submitted in background"}

@router.post("/ftp-logs/{log_id}/skip")
def skip_failed_ftp_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_eng),
):
    """
    Manually skip a failed FTP upload log.
    Sets status to 'manual skip' so it will not be displayed in failed logs.
    """
    from app.models.ftp_upload_log import FtpUploadLog
    
    log = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
        
    log.status = 'manual skip'
    log.error_msg = 'Manually skipped by user'
    db.commit()
    return {"message": "Log status updated to manual skip"}


@router.get("/ftp-logs/{log_id}/download")
def download_ftp_log_raw_file(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_eng),
):
    """
    Download raw original file associated with an FTP upload log.
    Checks local cache directories first, otherwise retrieves file directly from the remote FTP server.
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from app.models.osat_config import OsatConfig
    from app.services.ftp_service import _make_ftp, _make_sftp
    from urllib.parse import quote
    import io
    from fastapi.responses import FileResponse, StreamingResponse
    
    log = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="FTP log record not found")
        
    filename = log.filename or os.path.basename(log.remote_path)
    if not filename:
        filename = f"ftp_file_{log_id}.dat"
        
    # 1. Check local download cache
    DOWNLOAD_DIR = "/tmp/FTP/download"
    candidate_names = [
        f"{log_id}_{filename}",
        filename,
    ]
    for cname in candidate_names:
        cpath = os.path.join(DOWNLOAD_DIR, cname)
        if os.path.isfile(cpath) and os.path.getsize(cpath) > 0:
            encoded_name = quote(filename)
            headers = {
                "Content-Disposition": f"attachment; filename=\"{encoded_name}\"; filename*=UTF-8''{encoded_name}"
            }
            return FileResponse(cpath, filename=filename, headers=headers)
            
    # 2. Check local extracted directory
    EXTRACTED_DIR = "/tmp/FTP/extracted"
    prefix = f"{log_id}_"
    extracted_files = []
    if os.path.exists(EXTRACTED_DIR):
        for name in os.listdir(EXTRACTED_DIR):
            if name.startswith(prefix):
                fpath = os.path.join(EXTRACTED_DIR, name)
                if os.path.isfile(fpath) and os.path.getsize(fpath) > 0:
                    extracted_files.append(fpath)
                    
    if len(extracted_files) == 1:
        cpath = extracted_files[0]
        actual_name = os.path.basename(cpath)[len(prefix):]
        encoded_name = quote(actual_name or filename)
        headers = {
            "Content-Disposition": f"attachment; filename=\"{encoded_name}\"; filename*=UTF-8''{encoded_name}"
        }
        return FileResponse(cpath, filename=actual_name or filename, headers=headers)
    elif len(extracted_files) > 1:
        import zipfile
        mem_buf = io.BytesIO()
        with zipfile.ZipFile(mem_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for fpath in extracted_files:
                arc_name = os.path.basename(fpath)[len(prefix):]
                zf.write(fpath, arcname=arc_name)
        mem_buf.seek(0)
        zip_filename = f"{os.path.splitext(filename)[0]}.zip"
        encoded_name = quote(zip_filename)
        headers = {
            "Content-Disposition": f"attachment; filename=\"{encoded_name}\"; filename*=UTF-8''{encoded_name}"
        }
        return StreamingResponse(mem_buf, media_type="application/zip", headers=headers)

    # 3. Retrieve directly from remote FTP/SFTP server
    osat = db.query(OsatConfig).filter(OsatConfig.id == log.osat_id).first()
    if not osat:
        raise HTTPException(status_code=400, detail="OSAT configuration not found")
        
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    temp_target_path = os.path.join(DOWNLOAD_DIR, f"temp_{log_id}_{filename}")
    
    conn = None
    try:
        if (osat.protocol or "").upper() == "SFTP":
            conn = _make_sftp(osat)
        else:
            conn = _make_ftp(osat)
            
        with open(temp_target_path, "wb") as f_out:
            conn.retrbinary(f"RETR {log.remote_path}", f_out.write)
            
        if not os.path.exists(temp_target_path) or os.path.getsize(temp_target_path) == 0:
            raise Exception("Remote file is empty or unreachable (0 bytes)")
            
        encoded_name = quote(filename)
        headers = {
            "Content-Disposition": f"attachment; filename=\"{encoded_name}\"; filename*=UTF-8''{encoded_name}"
        }
        return FileResponse(temp_target_path, filename=filename, headers=headers)
    except Exception as e:
        if os.path.exists(temp_target_path):
            try:
                os.remove(temp_target_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Failed to download raw file from FTP: {e}")
    finally:
        if conn:
            try:
                conn.quit()
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass


@router.post("/ftp-logs/retry-all-failed")
def retry_all_failed_ftp_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_eng),
):
    """
    Reset all failed FTP upload logs to 'scanned' status and trigger re-download and re-parsing.
    """
    from app.models.ftp_upload_log import FtpUploadLog
    from app.services.ftp_service import run_osat_fetch
    from app.tasks.ftp_scheduler import _executor

    failed_logs = db.query(FtpUploadLog).filter(FtpUploadLog.status == 'failed').all()
    if not failed_logs:
        return {"message": "No failed logs found to retry", "count": 0}

    affected_osat_ids = set()
    for log in failed_logs:
        log.status = 'scanned'
        log.error_msg = None
        affected_osat_ids.add(log.osat_id)

    db.commit()

    for osat_id in affected_osat_ids:
        _executor.submit(run_osat_fetch, osat_id, False)

    return {"message": f"Successfully reset {len(failed_logs)} failed logs to scanned and triggered re-download", "count": len(failed_logs)}



@router.post("/ftp-logs/process-existing")
def process_existing_local_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_eng),
):
    """
    Scan /tmp/FTP/download and /tmp/FTP/extracted to process and import all existing files.
    """
    import os
    import zipfile
    import shutil
    import tempfile
    from app.models.ftp_upload_log import FtpUploadLog
    from app.models.lot import Lot
    from app.services.ftp_service import _do_parse
    from app.tasks.ftp_scheduler import _executor

    DOWNLOAD_DIR = "/tmp/FTP/download"
    EXTRACTED_DIR = "/tmp/FTP/extracted"
    admin_user_id = current_user.id if current_user else 1

    # 1. Unzip/copy files from DOWNLOAD_DIR to EXTRACTED_DIR if not already extracted
    if os.path.exists(DOWNLOAD_DIR):
        os.makedirs(EXTRACTED_DIR, exist_ok=True)
        for name in os.listdir(DOWNLOAD_DIR):
            filepath = os.path.join(DOWNLOAD_DIR, name)
            if not os.path.isfile(filepath):
                continue
            if '_' in name:
                parts = name.split('_', 1)
                if parts[0].isdigit():
                    log_id = int(parts[0])
                    original_name = parts[1]

                    log = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
                    if log and log.status == 'success':
                        try: os.remove(filepath)
                        except: pass
                        continue

                    # Check if already extracted
                    prefix = f"{log_id}_"
                    has_extracted = False
                    for ext_name in os.listdir(EXTRACTED_DIR):
                        if ext_name.startswith(prefix):
                            has_extracted = True
                            break

                    if not has_extracted:
                        name_lower = original_name.lower()
                        if name_lower.endswith('.zip'):
                            try:
                                tmp = tempfile.mkdtemp()
                                with zipfile.ZipFile(filepath, 'r') as z:
                                    z.extractall(tmp)
                                for root, _, files_in_tmp in os.walk(tmp):
                                    for f in files_in_tmp:
                                        dest = os.path.join(EXTRACTED_DIR, f"{log_id}_{f}")
                                        shutil.copy2(os.path.join(root, f), dest)
                                shutil.rmtree(tmp, ignore_errors=True)
                            except Exception as e:
                                print(f"[process-existing] Failed to unzip {name}: {e}")
                                # Delete corrupted zip file
                                try: os.remove(filepath)
                                except: pass
                        elif name_lower.endswith(('.csv', '.xls', '.xlsx')) or (name_lower.endswith('.txt') and 'ets' in name_lower):
                            try:
                                shutil.copy2(filepath, os.path.join(EXTRACTED_DIR, name))
                            except Exception as e:
                                print(f"[process-existing] Failed to copy {name}: {e}")
                    else:
                        # Already extracted, delete from download directory
                        try: os.remove(filepath)
                        except: pass

    # 2. Group files in EXTRACTED_DIR by log_id
    extracted_files = {}
    if os.path.exists(EXTRACTED_DIR):
        for name in os.listdir(EXTRACTED_DIR):
            filepath = os.path.join(EXTRACTED_DIR, name)
            if not os.path.isfile(filepath):
                continue
            if '_' in name:
                parts = name.split('_', 1)
                if parts[0].isdigit():
                    log_id = int(parts[0])
                    extracted_files.setdefault(log_id, []).append(filepath)

    submitted_count = 0
    cleaned_count = 0

    for log_id, files in extracted_files.items():
        original_name = os.path.basename(files[0])
        if '_' in original_name:
            parts = original_name.split('_', 1)
            if parts[0].isdigit() and int(parts[0]) == log_id:
                orig_filename = parts[1]
            else:
                orig_filename = original_name
        else:
            orig_filename = original_name

        check_names = [
            orig_filename,
            f"{log_id}_{orig_filename}",
            orig_filename + ".zip",
            f"{log_id}_{orig_filename}.zip"
        ]

        lot_rec = db.query(Lot).filter(Lot.filename.in_(check_names)).first()
        if lot_rec:
            for fp in files:
                try: os.remove(fp)
                except: pass
            # Clean up raw archive in download folder if it exists
            if os.path.exists(DOWNLOAD_DIR):
                for name in os.listdir(DOWNLOAD_DIR):
                    if name.startswith(f"{log_id}_"):
                        try: os.remove(os.path.join(DOWNLOAD_DIR, name))
                        except: pass
            cleaned_count += 1
            
            log = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
            if log and log.status != 'success':
                log.status = 'success'
                log.error_msg = None
                db.commit()
        else:
            log = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
            if log:
                log.status = 'pending'
                log.error_msg = None
                db.commit()
                _executor.submit(_do_parse, log.id, log.osat_id, log.remote_path, None, files, admin_user_id)
                submitted_count += 1

    return {
        "message": f"成功提交了 {submitted_count} 个解析任务，并清理了 {cleaned_count} 个已入库的本地缓存。"
    }


@router.delete("/ftp-logs/failed")
def reset_failed_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
    osat_id: Optional[int] = None,
    remote_path: Optional[str] = None,
):
    """
    重置「真正卡住」的 FTP 失败日志，让下次扫描重新尝试。
    只会重置「失败次数 >= 上限 且 从未成功过」的文件记录，
    不影响「先失败后成功」的正常文件。

    - 若指定 remote_path：只重置该具体文件
    - 若指定 osat_id：重置该 OSAT 下所有卡住的文件
    - 两者都不传：重置所有 OSAT 下所有卡住的文件
    """
    from sqlalchemy import func
    from app.services.ftp_service import _MAX_FAIL_RETRIES

    # 已经成功过的路径 → 不能被重置（先失败后成功的正常情况）
    success_paths = set(
        row.remote_path
        for row in db.query(FtpUploadLog.remote_path)
        .filter(FtpUploadLog.status == 'success')
        .all()
    )

    # 失败次数达到上限 且 从未成功过 → 才是「真正卡住」的文件
    stuck_query = (
        db.query(FtpUploadLog.remote_path)
        .filter(FtpUploadLog.status == 'failed')
        .group_by(FtpUploadLog.remote_path)
        .having(func.count(FtpUploadLog.id) >= _MAX_FAIL_RETRIES)
    )
    if osat_id:
        stuck_query = stuck_query.filter(FtpUploadLog.osat_id == osat_id)
    if remote_path:
        stuck_query = stuck_query.filter(FtpUploadLog.remote_path == remote_path)

    stuck_paths = [
        row.remote_path for row in stuck_query.all()
        if row.remote_path not in success_paths
    ]

    if not stuck_paths:
        return {"message": "没有需要重置的卡住文件", "reset_count": 0}

    # 删除这些路径的所有 failed 记录
    del_query = db.query(FtpUploadLog).filter(
        FtpUploadLog.status == 'failed',
        FtpUploadLog.remote_path.in_(stuck_paths)
    )
    if osat_id:
        del_query = del_query.filter(FtpUploadLog.osat_id == osat_id)

    count = del_query.count()
    del_query.delete(synchronize_session=False)
    db.commit()
    return {
        "message": f"已重置 {len(stuck_paths)} 个卡住文件（{count} 条日志），下次扫描将重新尝试",
        "reset_file_count": len(stuck_paths),
        "reset_log_count": count,
    }


@router.get("/ftp-logs/failed-summary")
def get_failed_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
    osat_id: Optional[int] = None,
):
    """
    查看失败次数已达上限且从未成功过的「卡住文件」列表。
    注意：先失败后成功的文件不会出现在这里（已被过滤）。
    管理员可据此决定是否需要手动重置以触发重试。
    """
    from sqlalchemy import func
    from app.services.ftp_service import _MAX_FAIL_RETRIES

    # 已经成功过的路径 → 不算「卡住」，排除
    success_paths = set(
        row.remote_path
        for row in db.query(FtpUploadLog.remote_path)
        .filter(FtpUploadLog.status == 'success')
        .all()
    )

    fail_query = (
        db.query(
            FtpUploadLog.osat_id,
            FtpUploadLog.remote_path,
            FtpUploadLog.filename,
            func.count(FtpUploadLog.id).label("fail_count"),
            func.max(FtpUploadLog.uploaded_at).label("last_attempt"),
            func.max(FtpUploadLog.error_msg).label("last_error"),
        )
        .filter(FtpUploadLog.status == 'failed')
        .group_by(FtpUploadLog.osat_id, FtpUploadLog.remote_path, FtpUploadLog.filename)
        .having(func.count(FtpUploadLog.id) >= _MAX_FAIL_RETRIES)
    )
    if osat_id:
        fail_query = fail_query.filter(FtpUploadLog.osat_id == osat_id)

    rows = fail_query.order_by(func.count(FtpUploadLog.id).desc()).all()

    # 过滤掉「后来成功了」的文件
    stuck_rows = [r for r in rows if r.remote_path not in success_paths]

    osat_names = {o.id: o.name for o in db.query(OsatConfig).all()}

    return {
        "max_retries": _MAX_FAIL_RETRIES,
        "total": len(stuck_rows),
        "items": [
            {
                "osat_id": r.osat_id,
                "osat_name": osat_names.get(r.osat_id),
                "remote_path": r.remote_path,
                "filename": r.filename,
                "fail_count": r.fail_count,
                "last_attempt": r.last_attempt,
                "last_error": r.last_error,
            }
            for r in stuck_rows
        ],
    }


@router.get("/ftp-logs/daily-summary")
def get_ftp_logs_daily_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
):
    """Query FTP upload logs daily summary aggregated by production date and OSAT."""
    from app.models.ftp_scan_snapshot import FtpScanSnapshot
    from app.models.ftp_upload_log import FtpUploadLog
    from sqlalchemy import func
    
    osats = [
        {"id": o.id, "name": o.name}
        for o in db.query(OsatConfig).order_by(OsatConfig.id).all()
    ]
    
    def is_summary_file(fname: str) -> bool:
        if not fname:
            return False
        nl = fname.lower()
        if nl.endswith(('.xls', '.xlsx')):
            return True
        if nl.endswith('.txt') and ('ets' in nl or 'summary' in nl):
            return True
        return False

    # 1. Calculate overall historical totals from ftp_upload_logs
    total_stats = {}
    db_totals = db.query(
        FtpUploadLog.osat_id,
        FtpUploadLog.status,
        FtpUploadLog.filename,
        FtpUploadLog.remote_path,
        func.count(FtpUploadLog.id)
    ).filter(
        FtpUploadLog.uploaded_at.isnot(None)
    ).group_by(
        FtpUploadLog.osat_id,
        FtpUploadLog.status,
        FtpUploadLog.filename,
        FtpUploadLog.remote_path
    ).all()
    
    for osat_id, status, filename, remote_path, count in db_totals:
        if osat_id not in total_stats:
            total_stats[osat_id] = {"data_pass": 0, "summary_pass": 0, "failed": 0, "success": 0}
        if status == "success":
            total_stats[osat_id]["success"] += count
            fname = filename or (remote_path.split('/')[-1] if remote_path else "")
            if is_summary_file(fname):
                total_stats[osat_id]["summary_pass"] += count
            else:
                total_stats[osat_id]["data_pass"] += count
        elif status == "failed":
            total_stats[osat_id]["failed"] += count

    # Helper to convert datetime to Shanghai naive datetime for safe comparison
    def to_shanghai_naive(dt):
        if not dt:
            return None
        from datetime import timezone, timedelta
        tz_sh = timezone(timedelta(hours=8))
        if dt.tzinfo is not None:
            return dt.astimezone(tz_sh).replace(tzinfo=None)
        return dt + timedelta(hours=8)

    # 2. Get snapshots from FtpScanSnapshot
    snapshots = db.query(FtpScanSnapshot).order_by(
        FtpScanSnapshot.scan_date.desc(),
        FtpScanSnapshot.osat_id
    ).all()
    
    # Group snapshots by scan_date
    date_groups = {}
    for snap in snapshots:
        local_time = to_shanghai_naive(snap.last_scan_time)
        date_key = snap.scan_date
        
        if date_key not in date_groups:
            date_groups[date_key] = {
                "latest_time": local_time,
                "stats": {}
            }
        else:
            if local_time and (date_groups[date_key]["latest_time"] is None or local_time > date_groups[date_key]["latest_time"]):
                date_groups[date_key]["latest_time"] = local_time
                
        d_pass = getattr(snap, "data_success_count", 0) or 0
        s_pass = getattr(snap, "summary_success_count", 0) or 0
        if d_pass == 0 and s_pass == 0 and snap.success_count > 0:
            from datetime import timezone, timedelta
            snap_utc = snap.last_scan_time.astimezone(timezone.utc).replace(tzinfo=None) if snap.last_scan_time.tzinfo else snap.last_scan_time
            time_24h_ago = snap_utc - timedelta(hours=24)
            succ_logs = db.query(FtpUploadLog.filename, FtpUploadLog.remote_path).filter(
                FtpUploadLog.osat_id == snap.osat_id,
                FtpUploadLog.status == "success",
                FtpUploadLog.uploaded_at >= time_24h_ago
            ).all()
            d_pass = sum(1 for l in succ_logs if not is_summary_file(l[0] or (l[1].split('/')[-1] if l[1] else "")))
            s_pass = len(succ_logs) - d_pass

        date_groups[date_key]["stats"][snap.osat_id] = {
            "data_pass": d_pass,
            "summary_pass": s_pass,
            "success": snap.success_count,
            "failed": snap.failed_count,
            "total": snap.scanned_count
        }

    # 3. Supplement missing OSAT statistics from FtpUploadLog if absent in FtpScanSnapshot
    all_upload_logs = db.query(FtpUploadLog).filter(FtpUploadLog.uploaded_at.isnot(None)).all()
    for log in all_upload_logs:
        local_dt = to_shanghai_naive(log.uploaded_at)
        if not local_dt:
            continue
        log_date = local_dt.date()
        osat_id = log.osat_id

        if log_date not in date_groups:
            date_groups[log_date] = {
                "latest_time": local_dt,
                "stats": {}
            }
        elif date_groups[log_date]["latest_time"] is None or local_dt > date_groups[log_date]["latest_time"]:
            date_groups[log_date]["latest_time"] = local_dt

        cur_stat = date_groups[log_date]["stats"].get(osat_id)
        if not cur_stat or (cur_stat.get("data_pass", 0) == 0 and cur_stat.get("summary_pass", 0) == 0 and cur_stat.get("success", 0) == 0):
            osat_logs = [
                l for l in all_upload_logs
                if l.osat_id == osat_id and (to_shanghai_naive(l.uploaded_at).date() == log_date)
            ]
            d_count = 0
            s_count = 0
            f_count = 0
            succ_count = 0
            for ol in osat_logs:
                if ol.status == "success":
                    succ_count += 1
                    fname = ol.filename or (ol.remote_path.split('/')[-1] if ol.remote_path else "")
                    if is_summary_file(fname):
                        s_count += 1
                    else:
                        d_count += 1
                elif ol.status == "failed":
                    f_count += 1
            if succ_count > 0 or f_count > 0 or not cur_stat:
                prev_total = cur_stat.get("total", 0) if cur_stat else 0
                date_groups[log_date]["stats"][osat_id] = {
                    "data_pass": d_count,
                    "summary_pass": s_count,
                    "success": succ_count,
                    "failed": f_count,
                    "total": max(prev_total, succ_count + f_count)
                }

    rows = []
    if total_stats:
        rows.append({
            "date": "total",
            "stats": total_stats
        })

    for date_key in sorted(date_groups.keys(), reverse=True):
        group = date_groups[date_key]
        formatted_date = group["latest_time"].strftime("%Y-%m-%d-%H:%M")
        rows.append({
            "date": formatted_date,
            "stats": group["stats"]
        })
        
    return {
        "osats": osats,
        "rows": rows
    }


@router.get("/manual-logs", response_model=ManualLogPage)
def get_manual_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    upload_type: Optional[str] = None,
    status: Optional[str] = None,
    operator: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """查询手动上传日志（包括手动上传数据 Lot 和手动上传程序 PgsUpload，支持按角色权限过滤，分页）"""
    # For manual data lots:
    q_lots = db.query(
        literal("data").label("upload_type"),
        Lot.id.label("id"),
        Lot.filename.label("filename"),
        Lot.upload_date.label("upload_date"),
        cast(Lot.status, String).label("status"),
        literal("").label("error_msg"),
        Lot.file_size.label("file_size"),
        User.username.label("uploader_name"),
        Lot.user_id.label("uploader_id")
    ).outerjoin(User, User.id == Lot.user_id).filter(Lot.data_source == 'manual')

    # For program uploads:
    q_pgs = db.query(
        literal("program").label("upload_type"),
        PgsUpload.id.label("id"),
        PgsUpload.filename.label("filename"),
        PgsUpload.upload_date.label("upload_date"),
        PgsUpload.parse_status.label("status"),
        PgsUpload.parse_error.label("error_msg"),
        literal(None).label("file_size"),
        User.username.label("uploader_name"),
        PgsUpload.uploader_id.label("uploader_id")
    ).outerjoin(User, User.id == PgsUpload.uploader_id)

    # Permission check: normal user only sees their own uploads
    if not (current_user.role == 'admin' or current_user.role == 'eng'):
        q_lots = q_lots.filter(Lot.user_id == current_user.id)
        q_pgs = q_pgs.filter(PgsUpload.uploader_id == current_user.id)

    union_q = q_lots.union_all(q_pgs)
    subq = union_q.subquery()

    query = db.query(subq)

    if upload_type:
        query = query.filter(subq.c.upload_type == upload_type)

    if status:
        if status == "success":
            query = query.filter(subq.c.status.in_(("processed", "ok")))
        elif status == "failed":
            query = query.filter(subq.c.status.in_(("failed", "error")))
        elif status == "processing":
            query = query.filter(subq.c.status.in_(("pending", "processing")))
        elif status == "deleted":
            query = query.filter(subq.c.status == "deleted")

    if operator:
        query = query.filter(subq.c.uploader_name.ilike(f"%{operator}%"))

    total = query.count()
    rows = (
        query
        .order_by(desc(subq.c.upload_date))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for r in rows:
        mapped_status = "processing"
        if r.status in ("processed", "ok"):
            mapped_status = "success"
        elif r.status in ("failed", "error"):
            mapped_status = "failed"
        elif r.status == "deleted":
            mapped_status = "deleted"

        items.append(ManualLogItem(
            upload_type=r.upload_type,
            id=r.id,
            filename=r.filename,
            upload_date=r.upload_date,
            status=mapped_status,
            error_msg=r.error_msg or None,
            file_size=r.file_size,
            uploader_name=r.uploader_name or "未知",
            uploader_id=r.uploader_id,
        ))

    return ManualLogPage(total=total, page=page, page_size=page_size, items=items)


@router.get("/manual-operators", response_model=List[str])
def get_manual_operators(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取所有手动上传过文件（程序或数据）的唯一 Operator 用户名列表"""
    if not (current_user.role == 'admin' or current_user.role == 'eng'):
        return [current_user.username]

    lot_users = db.query(User.username).join(Lot, Lot.user_id == User.id).filter(Lot.data_source == 'manual')
    pgs_users = db.query(User.username).join(PgsUpload, PgsUpload.uploader_id == User.id)

    union_users = lot_users.union(pgs_users).all()
    usernames = sorted(list(set(r[0] for r in union_users if r[0])))
    return usernames


def _resolve_manual_file_path(path: Optional[str]) -> Optional[str]:
    """Resolve file storage path across container, host mounts, and auto-zipped archives."""
    if not path:
        return None

    def _try_paths(p: str) -> Optional[str]:
        for candidate in [p, p + '.zip', p.replace('.zip', '')]:
            if candidate and os.path.exists(candidate):
                return candidate
        return None

    resolved = _try_paths(path)
    if resolved:
        return resolved

    if path.startswith('/app/uploads/'):
        alt = path.replace('/app/uploads/', '/data/ATE_DATA/uploads/')
        resolved = _try_paths(alt)
        if resolved:
            return resolved

    if path.startswith('/data/ATE_DATA/uploads/'):
        alt = path.replace('/data/ATE_DATA/uploads/', '/app/uploads/')
        resolved = _try_paths(alt)
        if resolved:
            return resolved

    from app.api.routes.lots import DATA_DIR, SUMMARY_DIR
    base = os.path.basename(path)
    for d in [DATA_DIR, SUMMARY_DIR]:
        cand = os.path.join(d, base)
        resolved = _try_paths(cand)
        if resolved:
            return resolved

    return None


def _do_manual_lot_reparse(lot_id: int, file_path: str):
    """
    Background worker to re-parse a manual lot.
    Handles zip extraction, csv parsing, or summary parsing.
    """
    from app.core.database import SessionLocal
    from app.api.routes.lots import _parse_and_save
    import zipfile
    import tempfile
    import shutil

    db = SessionLocal()
    try:
        lot = db.query(Lot).filter(Lot.id == lot_id).first()
        if not lot:
            return

        lot.status = 'processing'
        db.commit()

        lower_path = file_path.lower()
        if lower_path.endswith('.zip'):
            temp_dir = tempfile.mkdtemp(prefix=f"retry_lot_{lot_id}_")
            try:
                with zipfile.ZipFile(file_path, 'r') as zf:
                    zf.extractall(temp_dir)

                extracted_files = [
                    os.path.join(temp_dir, f) for f in os.listdir(temp_dir)
                    if os.path.isfile(os.path.join(temp_dir, f)) and not f.startswith('.')
                ]
                if not extracted_files:
                    raise ValueError("No valid files found inside zip archive")

                csv_files = [f for f in extracted_files if f.lower().endswith('.csv')]
                xls_files = [f for f in extracted_files if f.lower().endswith(('.xls', '.xlsx'))]
                txt_files = [f for f in extracted_files if f.lower().endswith('.txt')]

                if csv_files:
                    target_file = csv_files[0]
                    _parse_and_save(lot.id, target_file, db)
                elif xls_files:
                    from app.services.parsers.xls_summary_parser import parse_and_save_xls_summary
                    parse_and_save_xls_summary(xls_files[0], db, lot.user_id, osat_name="chipmore")
                    lot.status = 'processed'
                    lot.finish_date = datetime.now(timezone.utc)
                    db.commit()
                elif txt_files:
                    from app.services.parsers.summary_parser import parse_summary_txt
                    sum_data = parse_summary_txt(txt_files[0])
                    if sum_data.get('beginning_time'):
                        lot.beginning_time = sum_data['beginning_time']
                        lot.test_date = sum_data['beginning_time']
                    if sum_data.get('ending_time'):
                        lot.ending_time = sum_data['ending_time']
                    if sum_data.get('program'):
                        lot.program = sum_data['program']
                    lot.status = 'processed'
                    lot.finish_date = datetime.now(timezone.utc)
                    db.commit()
                else:
                    target_file = extracted_files[0]
                    _parse_and_save(lot.id, target_file, db)
            finally:
                shutil.rmtree(temp_dir, ignore_errors=True)

        elif lower_path.endswith(('.xls', '.xlsx')):
            from app.services.parsers.xls_summary_parser import parse_and_save_xls_summary
            parse_and_save_xls_summary(file_path, db, lot.user_id, osat_name="chipmore")
            lot.status = 'processed'
            lot.finish_date = datetime.now(timezone.utc)
            db.commit()

        elif lower_path.endswith('.txt'):
            from app.services.parsers.summary_parser import parse_summary_txt
            sum_data = parse_summary_txt(file_path)
            if sum_data.get('beginning_time'):
                lot.beginning_time = sum_data['beginning_time']
                lot.test_date = sum_data['beginning_time']
            if sum_data.get('ending_time'):
                lot.ending_time = sum_data['ending_time']
            if sum_data.get('program'):
                lot.program = sum_data['program']
            lot.status = 'processed'
            lot.finish_date = datetime.now(timezone.utc)
            db.commit()

        else:
            _parse_and_save(lot.id, file_path, db)

        print(f"[_do_manual_lot_reparse] Finished re-parsing for lot_id={lot_id}")
    except Exception as e:
        import traceback
        print(f"[_do_manual_lot_reparse] Failed to re-parse lot {lot_id}: {e}")
        traceback.print_exc()
        try:
            db.rollback()
            lot = db.query(Lot).filter(Lot.id == lot_id).first()
            if lot:
                lot.status = 'failed'
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/manual-logs/{upload_type}/{log_id}/retry")
def retry_manual_upload_log(
    upload_type: str,
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retry re-parsing a failed manual upload log (data lot or program upload).
    """
    from app.tasks.ftp_scheduler import _executor

    if upload_type == "data":
        lot = db.query(Lot).filter(Lot.id == log_id, Lot.data_source == 'manual').first()
        if not lot:
            raise HTTPException(status_code=404, detail="Manual lot record not found")
        if not (current_user.role in ('admin', 'eng') or lot.user_id == current_user.id):
            raise HTTPException(status_code=403, detail="Permission denied")
        if lot.status not in ('failed', 'error'):
            raise HTTPException(status_code=400, detail="Only failed lots can be retried")

        real_path = _resolve_manual_file_path(lot.storage_path)
        if not real_path or not os.path.exists(real_path):
            raise HTTPException(status_code=404, detail="Original data file not found on disk")

        lot.status = 'pending'
        db.commit()

        _executor.submit(_do_manual_lot_reparse, lot.id, real_path)
        return {"message": "Manual data lot re-parsing task submitted in background"}

    elif upload_type == "program":
        rec = db.query(PgsUpload).filter(PgsUpload.id == log_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="Program upload record not found")
        if not (current_user.role in ('admin', 'eng') or rec.uploader_id == current_user.id):
            raise HTTPException(status_code=403, detail="Permission denied")
        if rec.parse_status not in ('failed', 'error'):
            raise HTTPException(status_code=400, detail="Only failed program uploads can be retried")

        real_path = _resolve_manual_file_path(rec.storage_path)
        if not real_path or not os.path.exists(real_path):
            raise HTTPException(status_code=404, detail="Original program package file not found on disk")

        rec.parse_status = 'pending'
        rec.parse_error = None
        db.commit()

        from app.api.routes.programs import reparse_pgs_upload
        _executor.submit(reparse_pgs_upload, rec.id)
        return {"message": "Program re-parsing task submitted in background"}

    else:
        raise HTTPException(status_code=400, detail="Invalid upload_type. Must be 'data' or 'program'")


@router.get("/manual-logs/{upload_type}/{log_id}/download")
def download_manual_upload_log(
    upload_type: str,
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Download original raw file for a manual upload log record.
    """
    from fastapi.responses import FileResponse, StreamingResponse
    from urllib.parse import quote
    import io
    import zipfile

    if upload_type == "data":
        lot = db.query(Lot).filter(Lot.id == log_id, Lot.data_source == 'manual').first()
        if not lot:
            raise HTTPException(status_code=404, detail="Manual lot record not found")
        if not (current_user.role in ('admin', 'eng') or lot.user_id == current_user.id):
            raise HTTPException(status_code=403, detail="Permission denied")

        real_path = _resolve_manual_file_path(lot.storage_path)
        if not real_path or not os.path.exists(real_path):
            raise HTTPException(status_code=404, detail="Original data file not found on disk")

        download_name = lot.filename or os.path.basename(real_path)
        encoded_name = quote(download_name)
        disposition = f"attachment; filename=\"{download_name}\"; filename*=UTF-8''{encoded_name}"

        return FileResponse(
            real_path,
            filename=download_name,
            headers={"Content-Disposition": disposition}
        )

    elif upload_type == "program":
        rec = db.query(PgsUpload).filter(PgsUpload.id == log_id).first()
        if not rec or rec.parse_status == "deleted":
            raise HTTPException(status_code=404, detail="Program upload record not found or deleted")
        if not (current_user.role in ('admin', 'eng') or rec.uploader_id == current_user.id):
            raise HTTPException(status_code=403, detail="Permission denied")

        real_path = _resolve_manual_file_path(rec.storage_path)
        if not real_path or not os.path.exists(real_path):
            raise HTTPException(status_code=404, detail="Original program package file not found on disk")

        download_name = rec.filename or os.path.basename(real_path)
        ext = os.path.splitext(download_name)[1].lower()
        if ext in {".zip", ".rar", ".7z"}:
            encoded_name = quote(download_name)
            disposition = f"attachment; filename=\"{download_name}\"; filename*=UTF-8''{encoded_name}"
            return FileResponse(
                real_path,
                filename=download_name,
                headers={"Content-Disposition": disposition}
            )

        zip_name = os.path.splitext(download_name)[0] + ".zip"
        encoded_zip_name = quote(zip_name)
        disposition = f"attachment; filename=\"{zip_name}\"; filename*=UTF-8''{encoded_zip_name}"
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(real_path, arcname=download_name)
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/zip",
            headers={"Content-Disposition": disposition}
        )

    else:
        raise HTTPException(status_code=400, detail="Invalid upload_type. Must be 'data' or 'program'")


def get_project_version() -> str:
    import os
    import subprocess
    # 1. 尝试从本地的 app/version.txt 文件读取 (Docker 容器环境或本地部署)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # 检查 backend/app/version.txt 或是旧路径 backend/version.txt
    version_file_app = os.path.join(os.path.dirname(os.path.dirname(current_dir)), "version.txt")
    version_file_root = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(current_dir))), "version.txt")
    for version_file in (version_file_app, version_file_root):
        if os.path.exists(version_file):
            for encoding in ("utf-8", "utf-16", "gbk"):
                try:
                    with open(version_file, "r", encoding=encoding) as f:
                        ver = f.read().strip()
                        # 清除可能存在的 BOM 字符和空字符
                        ver = ver.replace('\x00', '').replace('\ufeff', '').strip()
                        if ver:
                            return ver
                except Exception:
                    pass

    # 2. 尝试执行 git 命令动态获取 (本地开发环境)
    try:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_dir))))
        result = subprocess.run(
            ["git", "describe", "--tags", "--abbrev=0"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
            cwd=project_root
        )
        tag = result.stdout.strip()
        if tag:
            return tag
    except Exception:
        pass

    # 3. 兜底默认版本号
    return "V01_20260623"


@router.get("/version")
def get_version_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前系统版本号与版本更新历史记录"""
    import json
    current_version = get_project_version()
    
    # 从 JSON 文件读取历史记录
    history = []
    current_dir = os.path.dirname(os.path.abspath(__file__))
    history_file = os.path.join(os.path.dirname(os.path.dirname(current_dir)), "version_history.json")
    if os.path.exists(history_file):
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception as e:
            print(f"[get_version_settings] Error reading history file: {e}")
            
    # 如果文件不存在或者为空，做个初始化兜底
    if not history:
        history = [
            {
                "version": "V01_20260623",
                "content": "1. 解析 KSHT Summary 后入库的 OSAT 名称统一显示为大写的 \"KSHT\"\n2. 修复明细页面中 OSAT 的搜索，支持大小写不敏感匹配",
                "updated_at": "2026-06-23 20:30:00"
            },
            {
                "version": "V1_20260618",
                "content": "系统初始发布版本",
                "updated_at": "2026-06-18 09:00:00"
            }
        ]
        try:
            with open(history_file, "w", encoding="utf-8") as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    # 找到当前版本的说明
    current_content = ""
    for item in history:
        if item.get("version") == current_version:
            current_content = item.get("content", "")
            break

    # Non-admin users (ENG and USER) only receive current version info without historical logs
    if getattr(current_user, "role", None) != "admin":
        history = []

    return {
        "version": current_version,
        "content": current_content,  # Current version update log
        "history": history           # Historical update records (empty for non-admin)
    }


@router.put("/version")
def save_version_settings(
    body: VersionUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """保存版本更新内容（仅管理员）到 JSON 文件中"""
    import json
    current_version = get_project_version()
    current_dir = os.path.dirname(os.path.abspath(__file__))
    history_file = os.path.join(os.path.dirname(os.path.dirname(current_dir)), "version_history.json")
    
    # 1. 读取现有历史
    history = []
    if os.path.exists(history_file):
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            pass
            
    if not history:
        history = []
        
    # 2. 更新或追加当前版本的内容
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    found = False
    for item in history:
        if item.get("version") == current_version:
            item["content"] = body.content
            item["updated_at"] = now_str
            found = True
            break
            
    if not found:
        # 插在最前面，按最新版本排序
        history.insert(0, {
            "version": current_version,
            "content": body.content,
            "updated_at": now_str
        })
        
    # 3. 写入回 JSON 文件
    try:
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存版本历史文件失败: {e}")
        
    # 4. 同步保存到数据库
    cfg = db.query(SystemSetting).first()
    if not cfg:
        cfg = SystemSetting()
        db.add(cfg)
    cfg.version_update_content = body.content
    cfg.updated_at = datetime.now(timezone.utc)
    # Synchronize admin user default email with SMTP sender address (only when configured)
    admin_user = db.query(User).filter(User.username == "admin").first()
    if admin_user and getattr(cfg, "smtp_from", None):
        admin_user.email = cfg.smtp_from

    db.commit()
    
    return {"message": "版本更新内容已成功保存至历史文件"}




# ----------------------------------------------
# FTP Extracted Logs API
# ----------------------------------------------

@router.get("/ftp-extracted-logs", response_model=FtpExtractedLogPage)
def get_ftp_extracted_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
    ftp_log_id: Optional[int] = None,
    status: Optional[str] = None,
    filename: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """
    Query decompressed FTP files logs (supports status and filename filter, paginated).
    All comments and logger descriptions are in English.
    """
    from app.models.ftp_extracted_file import FtpExtractedFile
    from app.schemas.settings import FtpExtractedLogItem, FtpExtractedLogPage

    query = db.query(FtpExtractedFile)
    if ftp_log_id:
        query = query.filter(FtpExtractedFile.ftp_log_id == ftp_log_id)
    if status:
        query = query.filter(FtpExtractedFile.status == status)
    if filename:
        query = query.filter(FtpExtractedFile.filename.ilike(f"%{filename}%"))

    total = query.count()
    logs = (
        query.order_by(FtpExtractedFile.processed_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for log in logs:
        items.append(FtpExtractedLogItem(
            id=log.id,
            ftp_log_id=log.ftp_log_id,
            filename=log.filename,
            status=log.status,
            error_msg=log.error_msg,
            processed_at=log.processed_at,
        ))

    return FtpExtractedLogPage(total=total, page=page, page_size=page_size, items=items)


# Helper to manage immutable permanent scan sessions list in Redis (English comments)
def _normalize_session_dict(sess_dict):
    """Normalize session mode to Auto or Manual strictly."""
    if not isinstance(sess_dict, dict):
        return sess_dict
    raw_mode = str(sess_dict.get("mode") or "").strip().lower()
    if raw_mode.startswith("man") or "manual" in raw_mode:
        sess_dict["mode"] = "Manual"
    else:
        sess_dict["mode"] = "Auto"
    return sess_dict


def _get_permanent_scan_sessions():
    """Retrieve permanent FTP scan sessions with strict normalization."""
    try:
        from app.core.redis_client import get_redis
        import json
        r = get_redis()
        data_list = r.lrange("ftp_scan:permanent_sessions_list", 0, 100)
        sessions = []
        for item in data_list:
            try:
                if isinstance(item, bytes):
                    item = item.decode('utf-8')
                sess_obj = json.loads(item)
                if isinstance(sess_obj, dict):
                    sessions.append(_normalize_session_dict(sess_obj))
            except Exception as ex:
                print(f"[ftp_scan] Error decoding session item: {ex}")
        return sessions
    except Exception as e:
        print(f"[ftp_scan] Error reading Redis permanent sessions: {e}")
    return []

def _add_or_update_permanent_session(sess_dict):
    try:
        from app.core.redis_client import get_redis
        import json
        r = get_redis()
        sessions = _get_permanent_scan_sessions()
        
        sess_id = sess_dict.get("session_id")
        updated = False
        for idx, s in enumerate(sessions):
            if s.get("session_id") == sess_id:
                sessions[idx] = sess_dict
                updated = True
                break
        
        if not updated:
            sessions.insert(0, sess_dict)

        sessions = sessions[:100]
        r.delete("ftp_scan:permanent_sessions_list")
        for s in reversed(sessions):
            r.lpush("ftp_scan:permanent_sessions_list", json.dumps(s))
    except Exception as e:
        print(f"[ftp_scan] Error updating Redis permanent sessions list: {e}")


@router.post("/ftp-logs/trigger-snapshot-scan")
def trigger_snapshot_scan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger a full FTP scan creating a new immutable manual session."""
    if current_user.role not in ("admin", "eng"):
        raise HTTPException(status_code=403, detail="Permission denied")

    from app.models.osat_config import OsatConfig
    from zoneinfo import ZoneInfo
    from datetime import datetime
    import threading, time

    osats = db.query(OsatConfig).filter(OsatConfig.enabled == True).all()
    if not osats:
        raise HTTPException(status_code=400, detail="No enabled OSAT configurations found")

    shanghai_tz = ZoneInfo("Asia/Shanghai")
    start_time_str = datetime.now(shanghai_tz).strftime("%Y-%m-%d %H:%M:%S")

    session_id = f"manual_{int(time.time() * 1000)}"
    sess_info = {
        "session_id": session_id,
        "mode": "Manual",
        "status": "running",
        "progress_pct": 10,
        "start_time": start_time_str,
        "end_time": "Running",
        "duration_minutes": 0,
        "total_new_files": 0,
        "osats": [o.name for o in osats],
        "formatted_text": f"Manual {start_time_str} ---- Running (progress: 10%)",
    }
    _add_or_update_permanent_session(sess_info)

    def run_async_scan(sess_id, osat_ids):
        from app.core.database import SessionLocal
        from app.services.ftp_service import run_osat_fetch
        from app.models.ftp_upload_log import FtpUploadLog
        from sqlalchemy import func
        from datetime import datetime

        sess_db = SessionLocal()
        start_ts = datetime.now(shanghai_tz)
        max_id_before = sess_db.query(func.max(FtpUploadLog.id)).scalar() or 0

        try:
            total_osats = len(osat_ids)
            for idx, o_id in enumerate(osat_ids):
                pct = 10 + int(((idx + 1) / max(1, total_osats)) * 75)
                
                perm_list = _get_permanent_scan_sessions()
                for s in perm_list:
                    if s.get("session_id") == sess_id:
                        s["progress_pct"] = min(90, pct)
                        s["formatted_text"] = f"Manual {start_time_str} ---- Running (progress: {min(90, pct)}%)"
                        _add_or_update_permanent_session(s)
                        break

                run_osat_fetch(o_id, True)

            end_ts = datetime.now(shanghai_tz)
            end_time_str = end_ts.strftime("%Y-%m-%d %H:%M:%S")
            diff_sec = (end_ts - start_ts).total_seconds()
            duration_mins = max(1, round(diff_sec / 60.0))

            osat_configs = sess_db.query(OsatConfig).order_by(OsatConfig.id.asc()).all()
            
            osat_counts_list = []
            tot_new = 0
            for o in osat_configs:
                cnt = sess_db.query(FtpUploadLog).filter(
                    FtpUploadLog.osat_id == o.id,
                    FtpUploadLog.id > max_id_before
                ).count()
                osat_counts_list.append(f"{o.name}:{cnt}")
                tot_new += cnt

            osat_text = ", ".join(osat_counts_list)
            formatted_text = f"Manual {start_time_str} ---- {end_time_str} duration {duration_mins} min, added {tot_new} files. {osat_text}"

            final_sess = {
                "session_id": sess_id,
                "mode": "Manual",
                "status": "completed",
                "progress_pct": 100,
                "start_time": start_time_str,
                "end_time": end_time_str,
                "duration_minutes": duration_mins,
                "total_new_files": tot_new,
                "osat_text": osat_text,
                "formatted_text": formatted_text,
            }
            _add_or_update_permanent_session(final_sess)
        except Exception as e:
            print(f"[ftp_scan] Error running async manual scan: {e}")
            perm_list = _get_permanent_scan_sessions()
            for s in perm_list:
                if s.get("session_id") == sess_id:
                    s["status"] = "error"
                    s["progress_pct"] = 100
                    _add_or_update_permanent_session(s)
                    break
        finally:
            sess_db.close()

    t = threading.Thread(target=run_async_scan, args=(session_id, [o.id for o in osats]))
    t.daemon = True
    t.start()

    return {
        "message": f"Successfully triggered manual FTP scan for {len(osats)} OSATs",
        "session_id": session_id,
        "osats": [o.name for o in osats],
    }


@router.get("/ftp-logs/snapshot-summary-48h")
def get_snapshot_summary_48h(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_eng),
):
    """Get FTP scan snapshot sessions summary for recent 48 hours returning permanent immutable sessions."""
    from app.models.ftp_scan_snapshot import FtpScanSnapshot
    from app.models.ftp_upload_log import FtpUploadLog
    from app.models.osat_config import OsatConfig
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo

    def to_sh_dt(dt):
        if not dt:
            return None
        sh_tz = timezone(timedelta(hours=8))
        if dt.tzinfo is not None:
            return dt.astimezone(sh_tz).replace(tzinfo=None)
        return dt + timedelta(hours=8)

    osat_list = db.query(OsatConfig).order_by(OsatConfig.id.asc()).all()

    shanghai_tz = ZoneInfo("Asia/Shanghai")
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    threshold_48h_utc = now_utc - timedelta(hours=48)

    # 1. Retrieve all existing permanent sessions from Redis
    sessions = _get_permanent_scan_sessions()

    # 2. If no permanent sessions exist in Redis yet, populate initial clusters from DB and save permanently
    if not sessions:
        recent_logs = (
            db.query(FtpUploadLog)
            .filter(FtpUploadLog.uploaded_at >= threshold_48h_utc)
            .order_by(FtpUploadLog.uploaded_at.desc())
            .all()
        )

        if recent_logs:
            clusters = []
            curr_cluster = []
            for log in recent_logs:
                if not curr_cluster:
                    curr_cluster.append(log)
                else:
                    prev_log = curr_cluster[-1]
                    gap = (prev_log.uploaded_at - log.uploaded_at).total_seconds()
                    if gap <= 1800:
                        curr_cluster.append(log)
                    else:
                        clusters.append(curr_cluster)
                        curr_cluster = [log]
            if curr_cluster:
                clusters.append(curr_cluster)

            for cl in clusters:
                start_dt = to_sh_dt(cl[-1].uploaded_at)
                end_dt = to_sh_dt(cl[0].uploaded_at)
                
                start_str = start_dt.strftime("%Y-%m-%d %H:%M:%S") if start_dt else "-"
                end_str = end_dt.strftime("%Y-%m-%d %H:%M:%S") if end_dt else "-"
                
                diff_sec = (end_dt - start_dt).total_seconds() if (start_dt and end_dt) else 0
                dur_mins = max(1, round(diff_sec / 60.0))

                counts_per_osat = {}
                for l in cl:
                    counts_per_osat[l.osat_id] = counts_per_osat.get(l.osat_id, 0) + 1

                osat_text_parts = []
                for o in osat_list:
                    cnt = counts_per_osat.get(o.id, 0)
                    osat_text_parts.append(f"{o.name}:{cnt}")
                
                osat_text = ", ".join(osat_text_parts)
                tot_cnt = len(cl)

                sess_item = {
                    "session_id": f"auto_{start_str}",
                    "mode": "Auto",
                    "status": "completed",
                    "progress_pct": 100,
                    "start_time": start_str,
                    "end_time": end_str,
                    "duration_minutes": dur_mins,
                    "total_new_files": tot_cnt,
                    "osat_text": osat_text,
                    "formatted_text": f"Auto {start_str} ---- {end_str} duration {dur_mins} min, added {tot_cnt} files. {osat_text}",
                }
                _add_or_update_permanent_session(sess_item)
            
            sessions = _get_permanent_scan_sessions()

    # Sort all sessions by start_time DESC
    sessions.sort(key=lambda x: x.get("start_time") or "", reverse=True)

    latest = dict(sessions[0]) if sessions else {
        "mode": "Auto",
        "status": "completed",
        "progress_pct": 100,
        "start_time": "-",
        "end_time": "-",
        "duration_minutes": 0,
        "total_new_files": 0,
        "osat_text": "",
        "formatted_text": "近48小时内暂无扫描记录",
    }

    # Fetch system restart metadata from Redis
    last_restart_time = None
    restart_history = []
    try:
        from app.core.redis_client import get_redis
        import json
        r = get_redis()
        raw_last = r.get("system:last_restart_time")
        if raw_last:
            last_restart_time = raw_last.decode("utf-8") if isinstance(raw_last, bytes) else str(raw_last)
        raw_hist = r.lrange("system:restart_history", 0, 50)
        for item in raw_hist:
            try:
                if isinstance(item, bytes):
                    item = item.decode("utf-8")
                hist_obj = json.loads(item)
                if isinstance(hist_obj, dict):
                    restart_history.append(hist_obj)
            except Exception:
                pass
    except Exception as e:
        print(f"[get_snapshot_summary_48h] Error getting restart metadata: {e}")

    latest["last_restart_time"] = last_restart_time
    latest["restart_history"] = restart_history
    latest["sessions"] = sessions

    return latest
