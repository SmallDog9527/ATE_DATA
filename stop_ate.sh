#!/bin/bash
# ===================================================
#   Chip ATE Analysis System - Linux Shutdown
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
echo -e "${GREEN}  Chip ATE Analysis System - Linux Shutdown${NC}"
echo -e "${GREEN}===================================================${NC}"

# 解析参数
REMOVE_VOLUMES=false
REMOVE_IMAGES=false
BIZ=false

for arg in "$@"; do
    case $arg in
        -v|--volumes)
            REMOVE_VOLUMES=true
            shift
            ;;
        -i|--images)
            REMOVE_IMAGES=true
            shift
            ;;
        --biz)
            BIZ=true
            shift
            ;;
        -h|--help)
            echo "用法: ./stop_ate.sh [选项]"
            echo ""
            echo "选项:"
            echo "  -v, --volumes  同时删除数据卷（会清空数据库数据，慎用！）"
            echo "  -i, --images   同时删除镜像"
            echo "  --biz          同时停止业务数据库服务"
            echo "  -h, --help     显示此帮助信息"
            exit 0
            ;;
    esac
done

# 1. 停止本地开发进程（如果存在）
echo ""
echo -e "${YELLOW}[1/3] 检查并停止本地 Backend / Frontend 进程...${NC}"

# 查找并停止本地 uvicorn (backend)
UVICORN_PIDS=$(pgrep -f "uvicorn app.main:app" || true)
if [ -n "$UVICORN_PIDS" ]; then
    echo "  发现本地 Backend 进程 (uvicorn)，正在停止..."
    echo "$UVICORN_PIDS" | xargs kill -TERM 2>/dev/null || true
    sleep 1
    # 强制结束残留的
    UVICORN_PIDS=$(pgrep -f "uvicorn app.main:app" || true)
    if [ -n "$UVICORN_PIDS" ]; then
        echo "$UVICORN_PIDS" | xargs kill -KILL 2>/dev/null || true
    fi
else
    echo "  未找到本地 Backend 进程"
fi

# 查找并停止本地 vite (frontend)
VITE_PIDS=$(pgrep -f "vite" || true)
if [ -n "$VITE_PIDS" ]; then
    echo "  发现本地 Frontend 进程 (vite)，正在停止..."
    echo "$VITE_PIDS" | xargs kill -TERM 2>/dev/null || true
    sleep 1
    VITE_PIDS=$(pgrep -f "vite" || true)
    if [ -n "$VITE_PIDS" ]; then
        echo "$VITE_PIDS" | xargs kill -KILL 2>/dev/null || true
    fi
else
    echo "  未找到本地 Frontend 进程"
fi

# 2. 停止 Docker 容器
echo ""
echo -e "${YELLOW}[2/3] 停止 Docker 容器...${NC}"

# 构建 docker compose down 参数
DOWN_ARGS=""
if [ "$REMOVE_VOLUMES" = true ]; then
    DOWN_ARGS="$DOWN_ARGS -v"
    echo -e "${RED}  ⚠️  警告：将同时删除数据卷！${NC}"
fi
if [ "$REMOVE_IMAGES" = true ]; then
    DOWN_ARGS="$DOWN_ARGS --rmi all"
    echo -e "${RED}  ⚠️  警告：将同时删除镜像！${NC}"
fi

# 停止主服务
echo "  停止核心服务 (db, redis, backend, frontend)..."
docker compose down $DOWN_ARGS

# 停止业务服务（可选）
if [ "$BIZ" = true ]; then
    echo "  停止业务服务 (chip-db, grafana)..."
    docker compose -f docker compose-biz.yml down $DOWN_ARGS
fi

# 3. 清理
echo ""
echo -e "${YELLOW}[3/3] 清理完成${NC}"

echo ""
echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}  系统已停止${NC}"
echo -e "${GREEN}===================================================${NC}"
echo ""

# 显示剩余容器（如果有）
RUNNING=$(docker ps --format "{{.Names}}" | grep -E "chip_" || true)
if [ -n "$RUNNING" ]; then
    echo "以下容器仍在运行:"
    echo "$RUNNING"
else
    echo "所有相关容器已停止。"
fi
