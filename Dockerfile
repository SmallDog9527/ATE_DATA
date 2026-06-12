# 使用 Python 3.12 瘦身版作为基础镜像
FROM python:3.12-slim

# 设置工作目录
WORKDIR /app

# 1. 替换 Debian 软件源为阿里云 (针对 Trixie/Debian 13)
# 2. 安装必要的系统依赖
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件并使用清华源安装 Python 包
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制项目所有源码
COPY . .

# 启动命令（根据实际入口文件修改，通常是 main.py 或 app.py）
CMD ["python", "main.py"]
