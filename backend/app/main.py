from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import auth, lots, products, analysis, users, shares, reports, programs, specs
from app.api.routes import settings as settings_router

app = FastAPI(
    title="Chip ATE Analysis System",
    version="0.3.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,             prefix="/api")
app.include_router(lots.router,             prefix="/api")
app.include_router(products.router,         prefix="/api")
app.include_router(analysis.router,         prefix="/api")
app.include_router(users.router,            prefix="/api")
app.include_router(shares.router,           prefix="/api")
app.include_router(reports.router,          prefix="/api")
app.include_router(settings_router.router,  prefix="/api")
app.include_router(programs.router,         prefix="/api")
app.include_router(specs.router,            prefix="/api")



@app.on_event("startup")
def on_startup():
    """应用启动时初始化数据库表 & 启动 FTP 定时调度器"""
    from app.core.database import engine, Base
    import app.models  # noqa: 确保所有 model 已注册
    Base.metadata.create_all(bind=engine)

    # 动态检测并增加版本更新内容字段
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS version_update_content VARCHAR"))
            conn.execute(text("ALTER TABLE pgs_uploads ADD COLUMN IF NOT EXISTS datasheet_filename VARCHAR"))
            conn.execute(text("ALTER TABLE pgs_uploads ADD COLUMN IF NOT EXISTS datasheet_path VARCHAR"))
            conn.execute(text("ALTER TABLE datasheet_parameters ADD COLUMN IF NOT EXISTS remark VARCHAR"))
            # Update existing ksht/KSHT records to HTKS
            conn.execute(text("UPDATE lots SET osat_name = 'HTKS' WHERE osat_name IN ('ksht', 'KSHT')"))
            conn.execute(text("UPDATE osat_configs SET name = 'HTKS' WHERE name IN ('ksht', 'KSHT')"))
            conn.execute(text("UPDATE lots SET osat_name = 'Chipmore' WHERE osat_name = 'chipmore'"))
            conn.execute(text("UPDATE osat_configs SET name = 'Chipmore' WHERE name = 'chipmore'"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_alerts BOOLEAN DEFAULT FALSE"))
            # Force mark any stuck processing logs as failed on service startup
            conn.execute(text("UPDATE ftp_upload_logs SET status = 'failed', error_msg = 'Service restarted unexpectedly, marked as failed' WHERE status IN ('processing', 'downing')"))
            conn.execute(text("UPDATE lots SET status = 'failed' WHERE status IN ('processing', 'pending')"))
            conn.commit()
        except Exception:
            conn.rollback()

    from app.tasks.ftp_scheduler import start_scheduler
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    """应用关闭时停止调度器"""
    from app.tasks.ftp_scheduler import stop_scheduler
    stop_scheduler()


@app.get("/")
def root():
    return {"status": "ok", "message": "Chip ATE System Running"}

@app.get("/health")
def health():
    return {"status": "healthy"}