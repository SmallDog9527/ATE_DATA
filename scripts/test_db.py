import os
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv('.env')

user = os.getenv("DB_USER")
pw = os.getenv("DB_PASSWORD").strip("'") # 去除可能存在的引号
host = os.getenv("DB_HOST")
port = os.getenv("DB_PORT")
db = os.getenv("DB_NAME")

url = f'postgresql://{user}:{pw}@{host}:{port}/{db}'
print(f"尝试连接: postgresql://{user}:******@{host}:{port}/{db}")

try:
    engine = create_engine(url)
    with engine.connect() as conn:
        print("✅ 数据库连接成功！密码验证通过。")
except Exception as e:
    print(f"❌ 连接失败：{e}")