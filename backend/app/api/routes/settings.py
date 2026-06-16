"""
settings.py  —  系统设置 API（仅管理员）
包含：SMTP邮箱配置、OSAT/FTP管理、上传日志查询
"""
from fastapi import APIRouter, Depends, HTTPException, Query
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
    ManualLogItem, ManualLogPage,
)
from app.services.smtp_dynamic import encrypt_password, decrypt_password, send_test_email
from sqlalchemy import literal, desc

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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """查询 FTP 上传日志（支持按 OSAT / 状态筛选，分页）"""
    query = db.query(FtpUploadLog)
    if osat_id:
        query = query.filter(FtpUploadLog.osat_id == osat_id)
    if status:
        query = query.filter(FtpUploadLog.status == status)

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


@router.get("/manual-logs", response_model=ManualLogPage)
def get_manual_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
        Lot.status.label("status"),
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

    total = db.query(subq).count()
    rows = (
        db.query(subq)
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

