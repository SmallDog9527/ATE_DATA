import os
import zipfile
import shutil
from app.core.database import SessionLocal
from app.models.lot import Lot

def migrate():
    db = SessionLocal()
    try:
        lots = db.query(Lot).all()
        print(f"[*] Found {len(lots)} lots in database.")
        
        compressed_count = 0
        deleted_temp_count = 0
        failed_count = 0
        
        for lot in lots:
            if not lot.storage_path:
                continue
                
            # 情况 1: 数据库记录是指向 .csv 的，需要物理压缩并更新数据库
            if lot.storage_path.lower().endswith('.csv') and os.path.exists(lot.storage_path):
                zip_path = lot.storage_path[:-4] + '.zip'
                try:
                    print(f"[+] Compressing CSV to ZIP: {lot.storage_path} -> {zip_path}")
                    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                        zf.write(lot.storage_path, os.path.basename(lot.storage_path))
                    
                    # 验证 zip 写入成功且大小正常
                    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
                        os.remove(lot.storage_path)
                        lot.storage_path = zip_path
                        compressed_count += 1
                        print(f"    [OK] Compressed and updated.")
                    else:
                        failed_count += 1
                        print(f"    [ERROR] Zip creation failed or empty.")
                except Exception as e:
                    failed_count += 1
                    print(f"    [ERROR] Error compressing {lot.storage_path}: {e}")
                    
            # 情况 2: 数据库记录已经是指向 .zip 的（说明是 ZIP 上传的），但可能在同级目录下留有解压后的原始 .csv 文件
            elif lot.storage_path.lower().endswith('.zip') and os.path.exists(lot.storage_path):
                # 检查同级目录下是否有同名的 .csv 文件
                parent_dir = os.path.dirname(lot.storage_path)
                csv_base_name = os.path.splitext(os.path.basename(lot.storage_path))[0] + '.csv'
                potential_csv = os.path.join(parent_dir, csv_base_name)
                if os.path.exists(potential_csv):
                    try:
                        os.remove(potential_csv)
                        deleted_temp_count += 1
                        print(f"[-] Removed leftover CSV file: {potential_csv}")
                    except Exception as e:
                        print(f"    [ERROR] Failed to remove leftover CSV {potential_csv}: {e}")
                        
        db.commit()
        
        # 情况 3: 孤立文件/目录清理（与数据库任何记录都无关联的文件）
        upload_dir = '/app/uploads'
        active_paths = set()
        for lot in lots:
            if lot.storage_path:
                p = os.path.abspath(lot.storage_path)
                active_paths.add(p)
                active_paths.add(os.path.dirname(p))

        deleted_orphan_count = 0
        deleted_orphan_size = 0
        if os.path.exists(upload_dir):
            for item in os.listdir(upload_dir):
                if item == 'parquet':
                    continue
                item_path = os.path.abspath(os.path.join(upload_dir, item))
                if item_path not in active_paths:
                    try:
                        if os.path.isdir(item_path):
                            size = sum(os.path.getsize(os.path.join(dirpath, filename)) for dirpath, _, filenames in os.walk(item_path) for filename in filenames)
                            shutil.rmtree(item_path)
                        else:
                            size = os.path.getsize(item_path)
                            os.remove(item_path)
                        deleted_orphan_count += 1
                        deleted_orphan_size += size
                        print(f"[-] Removed orphan item: {item_path} ({size/1024/1024:.2f} MB)")
                    except Exception as e:
                        print(f"    [ERROR] Failed to remove orphan {item_path}: {e}")

        print(f"\n[*] Migration summary:")
        print(f"    - Successfully compressed: {compressed_count} CSV(s)")
        print(f"    - Cleaned up leftover CSVs: {deleted_temp_count} file(s)")
        print(f"    - Cleaned up orphan item(s): {deleted_orphan_count} ({deleted_orphan_size/1024/1024:.2f} MB)")
        print(f"    - Failed compressions: {failed_count} file(s)")
    finally:
        db.close()

if __name__ == "__main__":
    print("[*] Starting historical ATE CSV compression and orphan cleanup migration...")
    migrate()
    print("[*] Migration completed!")
