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

# 1. 基础配置与环境加载
load_dotenv()

def get_connection_url():
    return f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"

engine = create_engine(get_connection_url())

st.set_page_config(layout="wide", page_title="Chip AI ATE System", page_icon="🛡️")

# --- 2. 数据库表结构自动初始化 ---
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
    CREATE INDEX IF NOT EXISTS idx_res_lot_name ON test_results (lot_internal_id, test_name);
    """
    try:
        with engine.connect() as conn:
            conn.execute(text(ddl))
            conn.commit()
    except Exception as e:
        st.error(f"数据库初始化失败，请检查权限: {e}")

init_db()

# --- 3. 核心处理逻辑：解析 STS8200 CSV ---
def process_sts8200_content(content, filename):
    try:
        # STS8200 格式：跳过前 58 行元数据
        df_raw = pd.read_csv(StringIO(content), skiprows=58)
        
        # 提取数据区 (第 4 行开始是 Die 数据)
        test_data = df_raw.iloc[3:].copy()
        param_cols = test_data.columns[10:].tolist()
        fixed_cols = ['Site', 'HardBin', 'SoftBin', 'X', 'Y']
        
        # 写入批次信息
        lot_id = filename.split('_')[0]
        summary_df = pd.DataFrame([{
            "lot_id": lot_id,
            "product_name": "KE25768-19",
            "total_qty": len(test_data),
            "pass_qty": len(test_data[test_data['HardBin'] == 1]),
            "yield_rate": (len(test_data[test_data['HardBin'] == 1]) / len(test_data)) * 100
        }])
        summary_df.to_sql('lot_summary', engine, if_exists='append', index=False)
        
        with engine.connect() as conn:
            lot_internal_id = conn.execute(text("SELECT id FROM lot_summary ORDER BY id DESC LIMIT 1")).fetchone()[0]

        # 宽表转长表 (千万级数据 Melt)
        df_long = test_data.melt(id_vars=fixed_cols, value_vars=param_cols, 
                                 var_name='test_name', value_name='result_value')
        df_long['lot_internal_id'] = lot_internal_id
        df_long['result_value'] = pd.to_numeric(df_long['result_value'], errors='coerce')

        # 使用 COPY 极速写入
        output = StringIO()
        df_long.to_csv(output, sep='\t', header=False, index=False)
        output.seek(0)
        
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST'), port=os.getenv('DB_PORT'),
            user=os.getenv('DB_USER'), password=os.getenv('DB_PASSWORD'), database=os.getenv('DB_NAME')
        )
        cursor = conn.cursor()
        cursor.copy_from(output, 'test_results', sep='\t', 
                         columns=('site_id', 'hard_bin', 'soft_bin', 'die_x', 'die_y', 
                                  'test_name', 'result_value', 'lot_internal_id'))
        conn.commit()
        cursor.close()
        conn.close()
        return True, f"✅ {filename} 导入成功"
    except Exception as e:
        return False, f"❌ {filename} 解析出错: {str(e)}"

# --- 4. 弹窗组件：显示特定 Bin 的 Map ---
@st.dialog("特定 Bin 物理分布图")
def show_bin_map_dialog(lot_id, bin_no):
    st.write(f"正在查看 Bin {bin_no} 的空间分布")
    # 只查该 Bin 的坐标（取一个参数做过滤即可）
    query = f"""
        SELECT DISTINCT die_x, die_y FROM test_results 
        WHERE lot_internal_id = {lot_id} AND hard_bin = {bin_no}
    """
    df_bin = pd.read_sql(query, engine)
    if not df_bin.empty:
        fig = px.scatter(df_bin, x="die_x", y="die_y", title=f"Bin {bin_no} 坐标点")
        fig.update_yaxes(autorange="reversed")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("该 Bin 没有失效坐标点")

# --- 5. Streamlit UI 布局 ---

st.title("🛡️ Chip AI ATE 数据中心")

# 侧边栏上传
with st.sidebar:
    st.header("📤 数据上传 (CSV/ZIP)")
    files = st.file_uploader("支持多选 CSV 或单个 ZIP", type=["csv", "zip"], accept_multiple_files=True)
    if st.button("开始上传解析"):
        for f in files:
            if f.name.endswith('.zip'):
                with zipfile.ZipFile(f) as z:
                    for name in z.namelist():
                        if name.endswith('.csv') and not name.startswith('__'):
                            with z.open(name) as csv_f:
                                content = csv_f.read().decode('utf-8', errors='ignore')
                                success, msg = process_sts8200_content(content, name)
                                st.write(msg)
            else:
                content = f.read().decode('utf-8', errors='ignore')
                success, msg = process_sts8200_content(content, f.name)
                st.write(msg)
        st.rerun()

# 数据读取与展示
try:
    df_lots = pd.read_sql("SELECT * FROM lot_summary ORDER BY id DESC", engine)
except:
    df_lots = pd.DataFrame()

if df_lots.empty:
    st.info("💡 请先上传 ATE 数据文件以开始分析。")
else:
    # 选择分析批次
    selected_lot_id = st.sidebar.selectbox(
        "选择当前批次", 
        df_lots['id'], 
        format_func=lambda x: f"{df_lots[df_lots['id']==x]['lot_id'].values[0]} ({df_lots[df_lots['id']==x]['test_date'].values[0]})"
    )

    tab_sum, tab_param = st.tabs(["📊 Summary 统计", "🔍 Operate 深度分析"])

    with tab_sum:
        # Site 良率汇总表 (复刻参考截图)
        st.subheader("按 Site 生成良率 Summary")
        
        # 预查询该批次的所有 Die 基础信息 (去重)
        df_bins = pd.read_sql(f"SELECT DISTINCT die_x, die_y, site_id, hard_bin FROM test_results WHERE lot_internal_id = {selected_lot_id}", engine)
        
        # 统计 Site vs Bin
        summary_pivot = pd.crosstab(df_bins['hard_bin'], df_bins['site_id'], margins=True, margins_name='Total')
        
        # 交互按钮区
        st.write("点击 Bin 号查看单项 Map:")
        btn_cols = st.columns(min(len(summary_pivot.index), 10))
        for i, b_val in enumerate(summary_pivot.index):
            if b_val != 'Total' and i < 10:
                if btn_cols[i].button(f"Bin {b_val}"):
                    show_bin_map_dialog(selected_lot_id, b_val)
        
        st.dataframe(summary_pivot, use_container_width=True)

        # 整体 Map (复刻参考截图)
        
        st.subheader("整体 Wafer Map 图")
        fig_map = px.scatter(df_bins, x="die_x", y="die_y", color="hard_bin", 
                             color_continuous_scale="RdYlGn_r", title="晶圆 Bin 分布图")
        fig_map.update_yaxes(autorange="reversed")
        st.plotly_chart(fig_map, use_container_width=True)

    with tab_param:
        st.subheader("参数项统计汇总")
        # 实时聚合 2000 个参数的统计量
        stats_sql = f"SELECT test_name, AVG(result_value) as mean, STDDEV(result_value) as std, MIN(result_value) as min, MAX(result_value) as max FROM test_results WHERE lot_internal_id = {selected_lot_id} GROUP BY test_name"
        df_stats = pd.read_sql(stats_sql, engine)
        st.dataframe(df_stats, use_container_width=True)
        
        # 单参数 Operate 分析
        target = st.selectbox("选择参数进行深度分析 (Operate)", df_stats['test_name'])
        if target:
            p_data = pd.read_sql(f"SELECT result_value, site_id, die_x, die_y FROM test_results WHERE lot_internal_id={selected_lot_id} AND test_name='{target}'", engine)
            
            c_hist, c_heat = st.columns(2)
            with c_hist:
                # 复刻分 Site 直方图
                
                fig_h = px.histogram(p_data, x="result_value", color="site_id", barmode='overlay', title=f"{target} 分布直方图")
                st.plotly_chart(fig_h, use_container_width=True)
            with c_heat:
                # 参数热图
                fig_p_map = px.scatter(p_data, x="die_x", y="die_y", color="result_value", color_continuous_scale="Viridis", title=f"{target} 热图分布")
                fig_p_map.update_yaxes(autorange="reversed")
                st.plotly_chart(fig_p_map, use_container_width=True)