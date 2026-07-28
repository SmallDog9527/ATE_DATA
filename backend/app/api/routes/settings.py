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

    # Synchronize admin user default email with SMTP sender address
    admin_user = db.query(User).filter(User.username == "admin").first()
    if admin_user:
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
    osat.schedule_start = body.schedule_start
    osat.schedule_end = body.schedule_end
    osat.enabled = body.enabled
    osat.data_type = body.data_type
    osat.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(osat)
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
    
    # 若有搜索词或显式勾选包含快照文件，则搜索包含 'scanned' 的全部记录
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
        log.status = 'scanned'
        log.error_msg = None
        db.commit()
        
        _executor.submit(run_osat_fetch, log.osat_id, False)
        return {"message": "Files not found in cache. Reset to scanned and triggered re-download."}
        
    log.status = 'pending'
    log.error_msg = None
    db.commit()
    
    admin_user_id = current_user.id if current_user else 1
    _executor.submit(_do_parse, log.id, log.osat_id, log.remote_path, None, files, admin_user_id)
    return {"message": "Re-parsing task submitted in background"}


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
    
    # 1. Calculate overall historical totals from ftp_upload_logs
    total_stats = {}
    db_totals = db.query(
        FtpUploadLog.osat_id,
        FtpUploadLog.status,
        func.count(FtpUploadLog.id)
    ).filter(
        FtpUploadLog.uploaded_at.isnot(None)
    ).group_by(FtpUploadLog.osat_id, FtpUploadLog.status).all()
    
    for osat_id, status, count in db_totals:
        if osat_id not in total_stats:
            total_stats[osat_id] = {"success": 0, "failed": 0}
        if status == "success":
            total_stats[osat_id]["success"] += count
        elif status == "failed":
            total_stats[osat_id]["failed"] += count

    # 2. Get snapshots from FtpScanSnapshot
    snapshots = db.query(FtpScanSnapshot).order_by(
        FtpScanSnapshot.scan_date.desc(),
        FtpScanSnapshot.osat_id
    ).all()
    
    # Group snapshots by scan_date
    date_groups = {}
    for snap in snapshots:
        from datetime import timezone, timedelta
        tz_sh = timezone(timedelta(hours=8))
        local_time = snap.last_scan_time.astimezone(tz_sh)
        date_key = snap.scan_date
        
        if date_key not in date_groups:
            date_groups[date_key] = {
                "latest_time": local_time,
                "stats": {}
            }
        else:
            if local_time > date_groups[date_key]["latest_time"]:
                date_groups[date_key]["latest_time"] = local_time
                
        date_groups[date_key]["stats"][snap.osat_id] = {
            "success": snap.success_count,
            "failed": snap.failed_count,
            "total": snap.scanned_count
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
    _: User = Depends(get_current_user),
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

    return {
        "version": current_version,
        "content": current_content,  # 当前版本的更新说明
        "history": history           # 历次版本更新记录
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
    # Synchronize admin user default email with SMTP sender address
    admin_user = db.query(User).filter(User.username == "admin").first()
    if admin_user:
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
