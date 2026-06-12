import psycopg2

# 数据库连接配置 (根据你的 docker-compose.yml 修改)
DB_CONFIG = {
    "host": "localhost",  # 如果在 VPS 宿主机跑，用 localhost 并确保映射了 5432 端口
    "database": "postgres", 
    "user": "postgres",
    "password": "3344520Qq", # 你的数据库密码
    "port": "5432"
}

SQL_SCRIPT = """
-- 这里粘贴之前的 SQL 建表脚本
-- 进入项目目录并连接数据库执行
-- ATE 核心批次表
CREATE TABLE IF NOT EXISTS lot_summary (
    id SERIAL PRIMARY KEY,
    lot_id VARCHAR(50) NOT NULL,
    product_name VARCHAR(100),
    wafer_id VARCHAR(50),
    tester_model VARCHAR(50), -- 如 STS8200
    test_stage VARCHAR(20),   -- 如 CP
    total_qty INT,            -- 总测试数
    pass_qty INT,             -- 良品数
    yield_rate NUMERIC(7,4),  -- 最终良率
    test_date TIMESTAMP,      -- 测试日期
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    program_name TEXT,        -- 测试程序名
    UNIQUE(lot_id, test_date)
);

-- 测试参数配置表（存储上下限）
CREATE TABLE IF NOT EXISTS test_config (
    id SERIAL PRIMARY KEY,
    product_name VARCHAR(100),
    test_name VARCHAR(255),
    unit VARCHAR(20),
    lo_limit NUMERIC,
    hi_limit NUMERIC,
    UNIQUE(product_name, test_name)
);

-- 测试结果长表（存储 3 万个 Die 的 2000 个参数点）
CREATE TABLE IF NOT EXISTS test_results (
    id BIGSERIAL PRIMARY KEY,
    lot_internal_id INT REFERENCES lot_summary(id) ON DELETE CASCADE,
    die_x INT,
    die_y INT,
    site_id INT,             -- 用于 Site 差异分析和 BoxPlot
    hard_bin INT,
    soft_bin INT,
    test_name VARCHAR(255),
    result_value NUMERIC,    -- 原始测试值
    is_pass BOOLEAN          -- 该参数是否通过
);

-- 必须建立索引，否则 6000 万行数据查询弹窗直方图会卡死
CREATE INDEX IF NOT EXISTS idx_res_lot_item ON test_results (lot_internal_id, test_name);
CREATE INDEX IF NOT EXISTS idx_res_site ON test_results (site_id);
...
"""

def init_db():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        cur.execute(SQL_SCRIPT)
        conn.commit()
        print("✅ 数据库表结构初始化成功！")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ 初始化失败: {e}")

if __name__ == "__main__":
    init_db()