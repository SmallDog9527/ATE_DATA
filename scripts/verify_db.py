import os
import psycopg2
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

def verify():
    print("--- 开始数据库权限验证 ---")
    try:
        # 1. 尝试连接
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST'),
            port=os.getenv('DB_PORT'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD'),
            database=os.getenv('DB_NAME')
        )
        cur = conn.cursor()
        print("✅ 连接成功")

        # 2. 尝试创建一张极简的测试表
        print("正在尝试创建测试表...")
        cur.execute("CREATE TABLE IF NOT EXISTS _test_permission (id int);")
        
        # 3. 尝试插入一条数据
        cur.execute("INSERT INTO _test_permission VALUES (1);")
        
        # 4. 尝试清理测试表
        cur.execute("DROP TABLE _test_permission;")
        
        conn.commit()
        print("✅ 权限验证通过！你现在可以创建表和索引了。")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ 验证失败: {e}")

if __name__ == "__main__":
    verify()