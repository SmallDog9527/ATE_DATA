import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
from io import StringIO
import psycopg2
import zipfile

# 1. 初始化环境与数据库引擎
load_dotenv()

def get_db_url():
    return f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"

engine = create_engine(get_db_url(), pool_pre_ping=True, isolation_level="AUTOCOMMIT")

st.set_page_config(layout="wide", page_title="Chip AI ATE 平台", page_icon="🛡️")

# --- 2. 数据库结构初始化 ---
def init_db():
    ddl = """
    CREATE TABLE IF NOT EXISTS lot_summary (
        id SERIAL PRIMARY KEY,
        lot_id VARCHAR(100),
        product_name VARCHAR(100),
        total_qty INT,
        pass_qty INT,
        yield_rate NUMERIC,
        test_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS test_results (
        id BIGSERIAL PRIMARY KEY,
        lot_internal_id INT REFERENCES lot_summary(id) ON DELETE CASCADE,
        site_id INT,
        hard_bin INT,
        soft_bin INT,
        die_x INT,
        die_y INT,
        test_name VARCHAR(255),
        result_value NUMERIC,
        is_pass BOOLEAN
    );
    CREATE INDEX IF NOT EXISTS idx_res_lot_id ON test_results (lot_internal_id);
    """
    with engine.connect() as conn:
        conn.execute(text(ddl))

init_db()

# --- 3. 核心解析逻辑 (基于你提供的 parse_csv_file 逻辑优化) ---
def process_sts8200_file(content, filename):
    try:
        lines = content.splitlines()
        data_info = {
            'lot_id': filename.split('_')[0],
            'header_row': -1,
            'data_start_row': -1
        }

        # 逐行解析元数据寻找表头
        for i, line in enumerate(lines):
            line_s = line.strip()
            # 解析 LOT_ID
            if 'LOT_ID:' in line_s:
                data_info['lot_id'] = line_s.split('LOT_ID:')[1].split(',')[0].strip()
            
            # 寻找表头关键字 (SITE_NUM)
            if 'SITE_NUM' in line_s:
                data_info['header_row'] = i
                # 根据你的代码：表头行 + 5 才是数据起始行
                data_info['data_start_row'] = i + 5
                break

        if data_info['header_row'] == -1:
            st.error(f"文件 {filename} 未找到 'SITE_NUM' 表头")
            return False

        # 读取表头行以确定列索引
        header_line = lines[data_info['header_row']].strip().split(',')
        
        col_idx = {'site': -1, 'soft_bin': -1, 'hard_bin': -1, 'x': -1, 'y': -1, 'test_start': -1}
        for idx, col in enumerate(header_line):
            c = col.upper()
            if 'SITE_NUM' in c: col_idx['site'] = idx
            if 'SOFT_BIN' in c: col_idx['soft_bin'] = idx
            if 'HARD_BIN' in c: col_idx['hard_bin'] = idx
            if 'X_COORD' in c: col_idx['x'] = idx
            if 'Y_COORD' in c: col_idx['y'] = idx
            if 'TEST_NUM' in c: col_idx['test_start'] = idx

        # 使用 pandas 读取数据区
        data_content = "\n".join(lines[data_info['data_start_row']:])
        df = pd.read_csv(StringIO(data_content), names=header_line, low_memory=False)
        
        # 清洗数据：转为数值
        for k in ['site', 'soft_bin', 'hard_bin', 'x', 'y']:
            df[header_line[col_idx[k]]] = pd.to_numeric(df[header_line[col_idx[k]]], errors='coerce')
        
        df = df.dropna(subset=[header_line[col_idx['hard_bin']]]) # 过滤空行

        # 1. 写入 lot_summary
        total_qty = len(df)
        pass_qty = (df[header_line[col_idx['soft_bin']]] == 1).sum()
        yield_r = (pass_qty / total_qty * 100) if total_qty > 0 else 0

        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO lot_summary (lot_id, product_name, total_qty, pass_qty, yield_rate)
                VALUES (:l, :p, :t, :pq, :y)
            """), {"l": data_info['lot_id'], "p": "STS8200_PROD", "t": total_qty, "pq": int(pass_qty), "y": yield_r})
            res = conn.execute(text("SELECT id FROM lot_summary ORDER BY id DESC LIMIT 1"))
            lot_internal_id = res.fetchone()[0]

        # 2. 转换长表用于存储所有测试参数
        param_cols = header_line[col_idx['test_start']:]
        fixed_cols = [header_line[col_idx[k]] for k in ['site', 'hard_bin', 'soft_bin', 'x', 'y']]
        
        df_long = df.melt(id_vars=fixed_cols, value_vars=param_cols, var_name='test_name', value_name='result_value')
        df_long['lot_internal_id'] = lot_internal_id
        df_long['result_value'] = pd.to_numeric(df_long['result_value'], errors='coerce')

        # 3. Psycopg2 Copy 快速入库
        output = StringIO()
        df_long.to_csv(output, sep='\t', header=False, index=False)
        output.seek(0)
        
        with psycopg2.connect(host=os.getenv('DB_HOST'), user=os.getenv('DB_USER'), 
                                password=os.getenv('DB_PASSWORD'), database=os.getenv('DB_NAME')) as pg_conn:
            with pg_conn.cursor() as cur:
                cur.copy_from(output, 'test_results', sep='\t', 
                             columns=('site_id', 'hard_bin', 'soft_bin', 'die_x', 'die_y', 'test_name', 'result_value', 'lot_internal_id'))
                pg_conn.commit()
        return True
    except Exception as e:
        st.error(f"处理失败 {filename}: {e}")
        return False

# --- 4. Streamlit UI 布局 ---
st.title("🔬 Chip AI - STS8200 数据分析系统")

with st.sidebar:
    st.header("📥 数据上传")
    uploaded_files = st.file_uploader("选择 STS8200 CSV/ZIP 文件", type=["csv", "zip"], accept_multiple_files=True)
    if st.button("开始解析入库"):
        if uploaded_files:
            for f in uploaded_files:
                if f.name.endswith('.zip'):
                    with zipfile.ZipFile(f) as z:
                        for name in z.namelist():
                            if name.endswith('.csv'):
                                process_sts8200_file(z.read(name).decode('utf-8', errors='ignore'), name)
                else:
                    process_sts8200_file(f.read().decode('utf-8', errors='ignore'), f.name)
            st.success("全部文件导入成功！")
            st.rerun()

# 获取批次列表
with engine.connect() as conn:
    df_lots = pd.read_sql(text("SELECT * FROM lot_summary ORDER BY id DESC"), conn)

if df_lots.empty:
    st.info("💡 数据库为空，请先上传数据。")
else:
    selected_lot_id = st.sidebar.selectbox("当前批次:", df_lots['id'], 
                                          format_func=lambda x: f"{df_lots[df_lots['id']==x]['lot_id'].values[0]} (ID:{x})")
    
    # 显示统计卡片
    lot_info = df_lots[df_lots['id'] == selected_lot_id].iloc[0]
    c1, c2, c3 = st.columns(3)
    c1.metric("总数", int(lot_info['total_qty']))
    c2.metric("良品", int(lot_info['pass_qty']))
    c3.metric("良率", f"{lot_info['yield_rate']:.2f}%")

    tab1, tab2 = st.tabs(["📊 Bin Summary", "🔍 参数分布 (Operate)"])

    with tab1:
        # 获取 Bin 映射数据
        with engine.connect() as conn:
            df_bins = pd.read_sql(text(f"SELECT site_id, hard_bin, die_x, die_y FROM test_results WHERE lot_internal_id = {selected_lot_id} AND test_name = (SELECT test_name FROM test_results WHERE lot_internal_id = {selected_lot_id} LIMIT 1)"), conn)
        
        col_l, col_r = st.columns([1, 2])
        with col_l:
            st.subheader("Site-Bin 统计")
            pivot = pd.crosstab(df_bins['hard_bin'], df_bins['site_id'], margins=True)
            st.dataframe(pivot, use_container_width=True)
        
        with col_r:
            st.subheader("Wafer Bin Map")
            
            fig = px.scatter(df_bins, x="die_x", y="die_y", color="hard_bin", color_continuous_scale="RdYlGn_r")
            fig.update_yaxes(autorange="reversed")
            st.plotly_chart(fig, use_container_width=True)

    with tab2:
        # 获取测试项列表
        with engine.connect() as conn:
            params = pd.read_sql(text(f"SELECT DISTINCT test_name FROM test_results WHERE lot_internal_id = {selected_lot_id}"), conn)
        
        target = st.selectbox("选择测试参数:", params['test_name'])
        if target:
            with engine.connect() as conn:
                p_data = pd.read_sql(text(f"SELECT result_value, site_id, die_x, die_y FROM test_results WHERE lot_internal_id = {selected_lot_id} AND test_name = :t"), conn, params={"t": target})
            
            cl, cr = st.columns(2)
            with cl:
                
                st.plotly_chart(px.histogram(p_data, x="result_value", color="site_id", barmode='overlay', title="参数分布直方图"), use_container_width=True)
            with cr:
                
                fig_h = px.scatter(p_data, x="die_x", y="die_y", color="result_value", color_continuous_scale="Viridis", title="参数 Wafer 热图")
                fig_h.update_yaxes(autorange="reversed")
                st.plotly_chart(fig_h, use_container_width=True)