import os
import pandas as pd
import io
from app.core.database import SessionLocal
from app.models.lot import Lot
from app.api.routes.analysis import run_idle_check_export_task, export_tasks

def test_export():
    print("[*] Starting Idle Check Excel Alarm-Filtering Export verification...")
    db = SessionLocal()
    try:
        # 1. 查找测试 Lot 160
        lot = db.query(Lot).filter(Lot.id == 160).first()
        if not lot or not lot.parquet_path or not os.path.exists(lot.parquet_path):
            print("[!] Lot 160 not found or missing parquet. Finding another processed lot...")
            lot = db.query(Lot).filter(Lot.status == 'processed', Lot.parquet_path.is_not(None)).first()
            
        if not lot:
            print("[!] No processed lots found in database to test. Skipping test.")
            return

        print(f"[+] Found test lot ID: {lot.id}, filename: {lot.filename}")
        
        # 2. 运行导出任务
        task_id = "test-export-task-id"
        export_tasks[task_id] = {"status": "processing", "progress": 0}
        
        run_idle_check_export_task(
            lot_id=lot.id,
            threshold=2,
            data_filter="all",
            task_id=task_id,
            db=db,
            weights=None
        )
        
        # 3. 验证结果
        task = export_tasks.get(task_id)
        assert task is not None, "Task not found in export_tasks."
        assert task["status"] == "completed", f"Task failed with status: {task['status']}, error: {task.get('error')}"
        
        result_bytes = task["result"]
        result_bytes.seek(0)
        
        # 使用 pandas 读取导出的 Excel
        df_exported = pd.read_excel(result_bytes, sheet_name="IdleCheck_Alarms")
        print(f"[+] Exported Excel columns: {df_exported.columns.tolist()[:10]}...")
        print(f"[+] Exported Excel rows count: {len(df_exported)}")
        
        # 4. 断言验证
        # 4.1. 验证表头（字段）完整保留：原数据的关键列应依然存在
        assert "SITE_NUM" in df_exported.columns, "Table headers (SITE_NUM) should be preserved."
        assert "is_alarm" in df_exported.columns, "is_alarm column must be present."
        
        # 4.2. 验证仅下载报警行：导出的数据行中，is_alarm 必须全部为 True
        if len(df_exported) > 0:
            all_alarms = df_exported["is_alarm"].all()
            assert all_alarms == True, "Exported data should only contain alarm rows (is_alarm must be True)."
            print("[OK] Verified: All exported rows are indeed alarm rows!")
        else:
            print("[*] No alarms triggered for this lot, empty data sheet is correct.")
            
        print(f"[OK] Export filename: {task['filename']}")
        print("[OK] Idle Check Excel Export verification PASSED successfully!")
        
    finally:
        db.close()

if __name__ == "__main__":
    test_export()
