# Chip ATE Analysis System

面向芯片 ATE 测试数据的分析平台，支持测试文件上传、自动解析、统计分析、程序版本对比、FTP 定时抓取、报表管理和基础权限控制。

当前仓库是一个前后端分离项目：

- 前端：`Vue 3 + TypeScript + Vite`
- 后端：`FastAPI + SQLAlchemy + Alembic`
- 数据库：`PostgreSQL`
- 缓存与辅助服务：`Redis`、可选 `MailHog`
- 部署方式：`Docker Compose`

## 项目定位

这个系统主要用于管理和分析半导体测试数据，覆盖以下典型场景：

- 上传 CSV、ZIP、GZ、STDF 等测试文件并自动解析
- 管理人工上传数据和 OSAT FTP 自动抓取数据
- 对单个或多个 LOT 做参数分析、BIN 分析和对比分析
- 追踪程序版本变更，解析 `.pgs` 文件并比对参数差异
- 对 LOT 做共享、报表沉淀和基础权限隔离
- 通过定时任务持续扫描 OSAT FTP 目录并入库

## 已实现能力概览

### 1. 数据接入

- 支持手动上传 `CSV`、`ZIP`、`GZ`、`STDF/.std/.stdf.gz/.std.gz`
- ZIP 包内可自动递归提取 `csv/txt/stdf/gz`
- 上传后异步解析，LOT 状态包含 `pending / processing / processed / failed`
- 原始文件存储在上传目录，结构化分析数据落为 `Parquet`
- 支持区分数据来源：
  - `manual`：人工上传
  - `ftp`：OSAT FTP 自动抓取

### 2. 分析与可视化

- 单 LOT 分析
  - 参数统计
  - Top Fail
  - Wafer 维度查看
  - 单参数明细分析
- BIN 分析
  - BIN 汇总
  - 良率相关视图
  - 多维 BIN 对比
- 多 LOT 分析
  - Multi Analysis
  - Multi Param
  - Multi BIN
- 支持前端图表和表格联动展示

### 3. 程序版本与 PGS 分析

- 提供程序版本变更分析页
- 可按产品查看不同程序版本记录
- 自动查找前一版本并比较参数差异、BIN 差异
- 支持上传 `.pgs` 文件并解析：
  - 参数表
  - Summary 表
  - 程序版本号
  - PGS 版本号
- 支持维护程序附加信息：
  - engineer
  - package
  - hardware_info
  - data_type_override
  - FT touch down time

### 4. FTP 自动抓取

- OSAT FTP 配置持久化保存在数据库
- 支持配置：
  - FTP 地址、端口、账号、密码
  - 远端目录
  - 数据类型 `CP / FT`
  - 抓取时间窗口
  - 启停状态
- 启动后通过 `APScheduler` 每 5 分钟扫描一次
- 在时间窗口内异步触发抓取任务
- 提供：
  - FTP 连接测试
  - 立即执行一次抓取
  - FTP 上传日志查看
  - 失败日志汇总与重置

### 5. 用户、权限与协作

- JWT 登录认证
- 角色体系：
  - `user`
  - `eng`
  - `admin`
- 支持 LOT 分享给其他用户
- 分享默认带 7 天过期时间
- 报表中心支持保存、查询、更新和删除报表配置

### 6. 邮件与系统设置

- 支持 SMTP 配置存库
- SMTP 密码加密保存
- 支持发送测试邮件
- Docker 环境下可选启用 `MailHog` 做本地邮件调试

## 技术栈

### 前端

- Vue `3.5`
- TypeScript `5.9`
- Vite `7`
- Pinia
- Vue Router
- AG Grid Community
- ECharts
- Axios

### 后端

- FastAPI `0.135`
- SQLAlchemy `2.0`
- Alembic
- Pydantic `2`
- Uvicorn
- APScheduler

### 数据处理

- pandas `3.0`
- numpy `2.4`
- scipy
- pyarrow
- openpyxl
- xlsxwriter
- pystdf

## 项目结构

```text
ATE_DATA/
├─ backend/                    # FastAPI 后端
│  ├─ app/
│  │  ├─ api/routes/           # 路由层：auth/lots/analysis/settings/reports/shares/programs
│  │  ├─ core/                 # 配置、数据库、鉴权基础设施
│  │  ├─ models/               # SQLAlchemy 数据模型
│  │  ├─ schemas/              # Pydantic schema
│  │  ├─ services/             # 解析、统计、SMTP、PGS、FTP 等服务
│  │  └─ tasks/                # 定时任务，如 FTP scheduler
│  ├─ migrations/              # Alembic 迁移
│  ├─ uploads/                 # 本地上传目录
│  ├─ requirements.txt
│  ├─ entrypoint.sh
│  └─ Dockerfile
├─ frontend/                   # Vue 前端
│  ├─ src/
│  │  ├─ api/                  # 接口封装
│  │  ├─ layouts/              # 页面布局
│  │  ├─ router/               # 路由
│  │  ├─ stores/               # Pinia 状态管理
│  │  └─ views/                # 业务页面
│  ├─ package.json
│  ├─ vite.config.ts
│  ├─ nginx.conf
│  └─ Dockerfile
├─ scripts/                    # 辅助脚本
├─ docker-compose.yml          # 主部署编排
├─ docker-compose-biz.yml      # 业务相关补充编排
├─ restart.bat
├─ stop_ate.bat
├─ stop_ate.sh
└─ README.md
```

## 关键页面

前端当前主要页面包括：

- `HomeView.vue`：LOT 列表主页
- `AnalysisView.vue`：单 LOT 统计分析
- `ParamView.vue`：单参数分析
- `BinView.vue`：BIN 分析
- `MultiAnalysisView.vue`：多 LOT 汇总分析
- `MultiParamView.vue`：多 LOT 参数对比
- `MultiBinView.vue`：多 LOT BIN 对比
- `IdleCheckView.vue`：空转检查配置与结果
- `ProgramChangeView.vue`：程序变更总览
- `ProductProgramsView.vue`：按产品看程序版本
- `PgsParamView.vue`：PGS 解析结果查看
- `ProfileView.vue`：个人设置、SMTP、OSAT 等配置
- `ReportCenterView.vue`：报表中心

## 主要后端路由

后端在 `backend/app/main.py` 中注册了以下模块：

- `/api/auth`
- `/api/lots`
- `/api/products`
- `/api/analysis`
- `/api/users`
- `/api/shares`
- `/api/reports`
- `/api/settings`
- `/api/programs`

服务启动后可访问：

- API 根地址：`http://localhost:8000`
- Swagger 文档：`http://localhost:8000/docs`
- 健康检查：`http://localhost:8000/health`

## Docker 启动方式

### 前置条件

- 已安装 Docker
- 已安装 Docker Compose

### 启动

```bash
docker-compose up -d
```

默认会启动：

- `db`：PostgreSQL（镜像为 `ankane/pgvector`）
- `redis`：Redis 7
- `backend`：FastAPI 服务
- `frontend`：Vite 开发服务

可选邮件调试服务：

```bash
docker-compose --profile mail up -d
```

### 访问地址

- 前端：`http://localhost:5174`
- 后端：`http://localhost:8000`
- Swagger：`http://localhost:8000/docs`
- PostgreSQL：`localhost:5432`
- Redis：`localhost:6379`
- MailHog Web：`http://localhost:8025`（启用 mail profile 后）

### 停止

```bash
docker-compose down
```

如果需要同时删除卷数据：

```bash
docker-compose down -v
```

## 环境变量

可以参考根目录 [`.env.example`](D:/ATE_DATA/ATE_DATA/.env.example)。

当前项目实际使用到的核心环境变量包括：

| 变量名 | 说明 |
| --- | --- |
| `POSTGRES_DB` | PostgreSQL 数据库名 |
| `POSTGRES_USER` | PostgreSQL 用户名 |
| `POSTGRES_PASSWORD` | PostgreSQL 密码 |
| `DATABASE_URL` | 后端数据库连接串 |
| `REDIS_URL` | Redis 连接串 |
| `SECRET_KEY` | JWT 签名密钥 |
| `APP_ENV` | 运行环境 |
| `DEBUG` | 是否调试模式 |
| `UPLOAD_DIR` | 上传文件保存目录 |
| `MAX_USER_STORAGE_GB` | 单用户存储额度 |
| `SMTP_HOST` | SMTP 主机 |
| `SMTP_PORT` | SMTP 端口 |
| `SMTP_USER` | SMTP 用户名 |
| `SMTP_PASS` | SMTP 密码 |
| `SMTP_FROM` | 发件人地址 |
| `APP_URL` | 前端访问地址 |

## 本地开发

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

如果是首次初始化数据库，还需要执行 Alembic 迁移。

### 前端

```bash
cd frontend
npm install
npm run dev
```

## 数据流说明

典型处理链路如下：

1. 用户上传文件或 FTP 定时抓取文件
2. 文件保存到 `UPLOAD_DIR`
3. 按文件类型解压、转换或解析
4. 提取 LOT 元信息、参数统计、BIN 汇总
5. 结构化结果写入 PostgreSQL
6. 明细分析数据写入 Parquet
7. 前端通过分析接口读取并展示

其中：

- 数据元信息集中保存在 `lots`、`test_items`、`bin_summary` 等表
- 原始或中间明细文件主要保存在上传目录
- 大数据量分析倾向通过 Parquet 做持久化和回读

## 仓库现状说明

从当前代码看，这个项目已经不是简单的上传分析 Demo，而是一个比较完整的内部业务系统，已经具备：

- 前后端完整闭环
- 角色权限控制
- 自动抓取与异步处理
- PGS/程序版本管理
- 报表与共享能力
- 邮件与系统配置

同时也能看到一些工程化特征：

- 存在 Alembic 迁移历史
- 存在 Windows 与 Linux 启停脚本
- 前端已有 `dist/` 与 `node_modules/`
- 后端已有测试脚本和运维修复脚本

## 注意事项

- 当前仓库里已有运行数据目录：`postgres_data/`、`redis_data/`、`temp_data/`
- Docker Compose 默认把前端跑成 Vite dev server，而不是生产静态部署
- `frontend` 与 `backend` 目录下都有各自的 `Dockerfile`，但根目录 `docker-compose.yml` 当前优先使用：
  - 后端自定义镜像构建
  - 前端 `node:20-alpine` 直接挂载源码运行
- 现有 README 曾存在编码乱码问题，本次已按当前代码结构重新整理

## License

仓库内目前未看到明确的许可证文件；如果后续需要开源或对外分发，建议补充 `LICENSE`。
