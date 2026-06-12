"""
ftp_scheduler.py
APScheduler 定时任务：每5分钟检查所有启用的 OSAT，
判断当前时间是否在抓取窗口内，若是则在线程池中异步执行抓取。
"""
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from apscheduler.schedulers.background import BackgroundScheduler

# 线程池：最多同时抓取 4 个 OSAT（避免资源耗尽）
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ftp_worker")
_scheduler = BackgroundScheduler(timezone="Asia/Shanghai")


# ──────────────────────────────────────────
# 时间窗口判断（支持跨午夜）
# ──────────────────────────────────────────

def is_in_window(start_str: str, end_str: str) -> bool:
    """
    判断当前时间是否在 [start_str, end_str] 窗口内。
    支持跨午夜：22:00~08:00 → now>=22:00 OR now<08:00
    """
    now = datetime.now()
    now_min = now.hour * 60 + now.minute

    sh, sm = start_str.split(':')
    eh, em = end_str.split(':')
    start_min = int(sh) * 60 + int(sm)
    end_min = int(eh) * 60 + int(em)

    if start_min <= end_min:
        # 同一天：08:00~22:00
        return start_min <= now_min < end_min
    else:
        # 跨午夜：22:00~08:00
        return now_min >= start_min or now_min < end_min


# ──────────────────────────────────────────
# 主调度任务（每5分钟触发）
# ──────────────────────────────────────────

def ftp_check_job():
    """
    每5分钟检查所有启用的 OSAT，
    对处于抓取窗口内的 OSAT 提交后台线程执行抓取。
    """
    from app.core.database import SessionLocal
    from app.models.osat_config import OsatConfig
    from app.services.ftp_service import run_osat_fetch

    db = SessionLocal()
    try:
        osats = db.query(OsatConfig).filter(OsatConfig.enabled == True).all()
        for osat in osats:
            if is_in_window(osat.schedule_start, osat.schedule_end):
                print(f"[scheduler] 触发 OSAT={osat.name} 抓取任务")
                _executor.submit(run_osat_fetch, osat.id)
            else:
                pass  # 不在时间窗口，静默跳过
    except Exception as e:
        print(f"[scheduler] ftp_check_job 异常: {e}")
    finally:
        db.close()


# ──────────────────────────────────────────
# 启动 / 停止 调度器
# ──────────────────────────────────────────

def start_scheduler():
    """在应用启动时调用，注册5分钟定时任务"""
    if not _scheduler.running:
        _scheduler.add_job(
            ftp_check_job,
            trigger='interval',
            minutes=5,
            id='ftp_check',
            replace_existing=True,
            misfire_grace_time=60,
        )
        _scheduler.start()
        print("[scheduler] FTP 定时调度器已启动（每5分钟检查一次）")


def stop_scheduler():
    """在应用关闭时调用"""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        _executor.shutdown(wait=False)
        print("[scheduler] FTP 定时调度器已停止")


def trigger_osat_now(osat_id: int):
    """手动立即触发一个 OSAT 的抓取任务（在后台线程中执行）"""
    from app.services.ftp_service import run_osat_fetch
    _executor.submit(run_osat_fetch, osat_id)
    print(f"[scheduler] 手动触发 OSAT id={osat_id} 抓取任务")
