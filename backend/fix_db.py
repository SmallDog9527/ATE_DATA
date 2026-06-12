import sqlite3
import os

db_path = 'ate.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

columns_to_add = [
    ('lots', 'item_count', 'INTEGER DEFAULT 0'),
    ('lots', 'local_expires_at', 'DATETIME'),
    ('lots', 'parquet_path', 'STRING'),
    ('lots', 'is_transferred', 'INTEGER DEFAULT 0'),
    ('lots', 'wafer_id', 'STRING'),
    ('lots', 'handler', 'STRING'),
    ('lots', 'test_stage', 'STRING'),
    ('lots', 'original_die_count', 'INTEGER'),
    ('lots', 'original_pass_count', 'INTEGER'),
    ('lots', 'original_fail_count', 'INTEGER'),
    ('lots', 'original_yield_rate', 'FLOAT'),
]

for table, col, col_type in columns_to_add:
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
        print(f"Added {col} to {table}")
    except sqlite3.OperationalError as e:
        if 'duplicate column name' in str(e).lower():
            print(f"Column {col} already exists in {table}")
        else:
            print(f"Error adding {col} to {table}: {e}")

conn.commit()
conn.close()
print("Done.")
