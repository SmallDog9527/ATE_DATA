from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import auth, lots, products, analysis, users, shares, reports, programs
from app.api.routes import settings as settings_router

app = FastAPI(
    title="Chip ATE Analysis System",
    version="0.2.0"
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


@app.on_event("startup")
def on_startup():
    """应用启动时初始化数据库表 & 启动 FTP 定时调度器"""
    from app.core.database import engine, Base
    import app.models  # noqa: 确保所有 model 已注册
    Base.metadata.create_all(bind=engine)

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