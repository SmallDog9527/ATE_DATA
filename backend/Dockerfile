FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
# 换 Debian 源加速 apt-get
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    unar \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# 换 PyPI 源加速 pip install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads /app/uploads/parquet

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 8000

# Run entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
