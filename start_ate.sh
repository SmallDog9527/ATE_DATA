#!/bin/bash
# ===================================================
#   Chip ATE Analysis System - Linux Startup
# ===================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}  Chip ATE Analysis System - Linux Startup${NC}"
echo -e "${GREEN}===================================================${NC}"

# 解析参数
DEV_MODE=false
BUILD=false
BIZ=false

for arg in "$@"; do
    case $arg in
        --dev)
            DEV_MODE=true
            shift
            ;;
        --build)
            BUILD=true
            shift
            ;;
        --biz)
            BIZ=true
            shift
            ;;
        -h|--help)
            echo "用法: ./start_ate.sh [选项]"
            echo ""
            echo "选项:"
            echo "  --dev     开发模式：只启动 DB + Redis，Backend/Frontend 在本地运行"
            echo "  --build   强制重新构建镜像后再启动"
            echo "  --biz     同时启动业务数据库 (docker compose-biz.yml)"
            echo "  -h, --help 显示此帮助信息"
            exit 0
            ;;
    esac
done

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}[ERROR] Docker 未运行，请先启动 Docker 服务${NC}"
    echo "  sudo systemctl start docker"
    exit 1
fi

# 构建参数
COMPOSE_UP_ARGS="-d"
if [ "$BUILD" = true ]; then
    COMPOSE_UP_ARGS="-d --build"
fi

# 1. 启动基础设施 (DB + Redis)
echo ""
echo -e "${YELLOW}[1/3] 启动 Docker 基础设施 (DB + Redis)...${NC}"
docker compose up $COMPOSE_UP_ARGS db redis

# 2. 启动 Backend 和 Frontend
if [ "$DEV_MODE" = true ]; then
    echo -e "${YELLOW}[2/3] 开发模式：Backend / Frontend 将在本地进程启动${NC}"
    echo "  Backend:  cd backend && venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
    echo "  Frontend: cd frontend && npx vite --host 0.0.0.0 --port 5173"
    echo ""
    echo -e "${RED}提示：请手动在另一个终端启动 Backend 和 Frontend${NC}"
else
    # 写入最新的 git tag 到版本文件（仅在发生变化时写入，避免触发生命周期重构）
    NEW_VER=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    OLD_VER=$(cat backend/app/version.txt 2>/dev/null || echo "")
    if [ "$NEW_VER" != "$OLD_VER" ]; then
        echo "$NEW_VER" > backend/app/version.txt 2>/dev/null || true
    fi
    echo -e "${YELLOW}[2/3] 启动 Backend (FastAPI) + Frontend (Vue/Vite) 容器...${NC}"
    docker compose up $COMPOSE_UP_ARGS backend frontend
fi

# 3. 启动业务服务（可选）
if [ "$BIZ" = true ]; then
    echo -e "${YELLOW}[3/3] 启动业务数据库 (chip-db + grafana)...${NC}"
    docker compose -f docker compose-biz.yml up $COMPOSE_UP_ARGS
else
    echo -e "${YELLOW}[3/3] 业务数据库未启动（如需启动请加 --biz 参数）${NC}"
fi

# 4. 显示状态
echo ""
echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}  服务启动完成！${NC}"
echo -e "${GREEN}===================================================${NC}"
echo ""
echo "  基础设施:"
echo "    PostgreSQL (DB):  localhost:5432"
echo "    Redis:            localhost:6379"
if [ "$DEV_MODE" = false ]; then
    echo ""
    echo "  应用服务:"
    echo "    Backend API:      http://localhost:8000"
    echo "    Frontend Web:     http://localhost:5173"
fi
if [ "$BIZ" = true ]; then
    echo ""
    echo "  业务服务:"
    echo "    Grafana:          http://localhost:3000"
fi
echo ""
echo -e "${GREEN}===================================================${NC}"
echo ""

# 显示运行中的容器
echo "当前运行中的容器:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(chip_|NAMES)" || true
