import os
import pandas as pd
import numpy as np
import psycopg2
from io import StringIO
from sqlalchemy import create_engine
from dotenv import load_dotenv

# 加载 .env 环境变量
load_dotenv()

def get_db_engine():
    url = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
    return create_engine(url)

def clean_and_upload_sts8200(file_path):
    print(f"🚀 正在解析文件: {file_path}")
    
    # 1. 预读文件提取 Lot 和产品信息 (前几行)
    with open(file_path, 'r') as f:
        lines = [f.readline() for _ in range(10)]
    
    # 简单示例：从文件名或文件头提取 (需根据实际 STS8200 规范微调)
    lot_id_from_file = "KE25768-19" 
    
    # 2. 读取数据区
    # 第 59 行是 Header (index 58), 60-62 是 Limits/Unit
    df_all = pd.read_csv(file_path, skiprows=58)
    
    # 提取关键信息
    limits_df = df_all.iloc[0:3].copy() # 0:LSL, 1:USL, 2:Unit
    test_data = df_all.iloc[3:].copy()  # 真正的数据行
    
    # 确定参数列 (从第 11 列开始是测试项)
    param_cols = test_data.columns[10:].tolist()
    fixed_cols = ['Site', 'HardBin', 'SoftBin', 'X', 'Y'] # 假设这些是固定列名
    
    # 3. 写入 lot_summary
    engine = get_db_engine()
    lot_summary_df = pd.DataFrame([{
        "lot_id": lot_id_from_file,
        "product_name": "KE25768",
        "total_qty": len(test_data),
        "pass_qty": len(test_data[test_data['HardBin'] == 1]),
        "yield_rate": (len(test_data[test_data['HardBin'] == 1]) / len(test_data)) * 100,
        "test_date": pd.Timestamp.now() # 实际可解析文件头 Date 字段
    }])
    lot_summary_df.to_sql('lot_summary', engine, if_exists='append', index=False)
    
    # 获取生成的 ID
    with engine.connect() as conn:
        lot_internal_id = conn.execute("SELECT id FROM lot_summary ORDER BY id DESC LIMIT 1").fetchone()[0]

    # 4. 宽表转长表 (Melt)
    # 转换 2000+ 个参数列为行
    df_long = test_data.melt(id_vars=fixed_cols, value_vars=param_cols, 
                             var_name='test_name', value_name='result_value')
    df_long['lot_internal_id'] = lot_internal_id
    
    # 强制转换 result_value 为数值，非法值转为 NaN
    df_long['result_value'] = pd.to_numeric(df_long['result_value'], errors='coerce')

    # 5. 使用 COPY 极速上传到 test_results
    output = StringIO()
    # 这里的列顺序必须与数据库 test_results 表一致
    df_long.to_csv(output, sep='\t', header=False, index=False)
    output.seek(0)
    
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST'),
        port=os.getenv('DB_PORT'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        database=os.getenv('DB_NAME')
    )
    cursor = conn.cursor()
    try:
        cursor.copy_from(output, 'test_results', sep='\t', 
                         columns=('site_id', 'hard_bin', 'soft_bin', 'die_x', 'die_y', 
                                  'test_name', 'result_value', 'lot_internal_id'))
        conn.commit()
        print(f"✅ 成功导入 {len(df_long)} 条数据点")
    except Exception as e:
        conn.rollback()
        print(f"❌ 导入失败: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    target_file = "scripts/8200-2-KE25768-19_20251108141014 - 2.csv"
    clean_and_upload_sts8200(target_file)