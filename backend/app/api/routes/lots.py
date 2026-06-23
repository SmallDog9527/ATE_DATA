import os
import shutil
import subprocess
import zipfile
import io
import tempfile
from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException, BackgroundTasks, Body
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, func
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel
from app.core.database import get_db
from app.core.config import settings
from app.models.lot import Lot
from app.models.lot_share import LotShare
from app.models.user import User
from app.schemas.lot import LotResponse, LotListResponse
from datetime import datetime, timedelta, timezone
from app.services.parsers import parse_file
from app.models.bin_summary import BinSummary
from app.models.test_item import TestItem
from app.api.deps import get_current_user

router = APIRouter(prefix="/lots", tags=["lots"])

# STDF 文件扩展名（含 gzip 压缩格式）
STDF_EXTENSIONS = {'.stdf', '.std', '.stdf.gz', '.std.gz'}


def _is_stdf(filename: str) -> bool:
    """判断文件名是否为 STDF 格式"""
    name = filename.lower()
    for ext in STDF_EXTENSIONS:
        if name.endswith(ext):
            return True
    return False


def _stdf_base_name(filename: str) -> str:
    """获取 STDF 文件的基础名（去掉 .stdf/.std/.stdf.gz/.std.gz 后缀）"""
    name = filename
    for ext in ['.stdf.gz', '.std.gz', '.stdf', '.std']:
        if name.lower().endswith(ext):
            return name[:-len(ext)]
    return os.path.splitext(name)[0]


def _extract_rar_archive(archive_path: str, extract_dir: str) -> None:
    try:
        import rarfile

        with rarfile.RarFile(archive_path, "r") as rf:
            rf.extractall(extract_dir)
        return
    except Exception as rar_exc:
        result = subprocess.run(
            ["unar", "-quiet", "-force-overwrite", "-output-directory", extract_dir, archive_path],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return

        msg = (result.stderr or result.stdout or str(rar_exc)).strip()
        raise HTTPException(
            status_code=400,
            detail=f"RAR 解压失败，请确认服务器可用 rarfile/unar: {msg or 'unknown error'}",
        )


def _collect_archive_data_files(extract_dir: str) -> list[str]:
    data_files = []
    for root, _, files in os.walk(extract_dir):
        for f in files:
            flower = f.lower()
            if flower.endswith('.csv') or flower.endswith('.txt') or flower.endswith('.xls') or flower.endswith('.xlsx'):
                data_files.append(os.path.join(root, f))
            elif _is_stdf(f):
                from app.services.parsers.stdf_converter import convert_stdf_to_csv
                stdf_inner = os.path.join(root, f)
                csv_inner = os.path.join(root, _stdf_base_name(f) + '.csv')
                info = convert_stdf_to_csv(stdf_inner, csv_inner)
                if not info.get('error'):
                    data_files.append(csv_inner)
                    os.remove(stdf_inner)
            elif flower.endswith('.gz') and not _is_stdf(f):
                gz_inner = os.path.join(root, f)
                decompressed_inner_name = f[:-3]
                if not decompressed_inner_name.lower().endswith('.csv'):
                    decompressed_inner_name += '.csv'
                csv_inner = os.path.join(root, decompressed_inner_name)

                import gzip
                try:
                    with gzip.open(gz_inner, 'rb') as f_in:
                        with open(csv_inner, 'wb') as f_out:
                            shutil.copyfileobj(f_in, f_out)
                    data_files.append(csv_inner)
                    os.remove(gz_inner)
                except Exception as e:
                    print(f"[upload] Archive GZ extract failed {gz_inner}: {e}")
    return sorted(data_files, key=lambda p: (1 if p.lower().endswith(('.txt', '.xls', '.xlsx')) else 0, p))


def _extract_data_archive(archive_path: str, filename: str) -> tuple[list[str], str]:
    ext = os.path.splitext(filename)[-1].lower()
    extract_dir = os.path.join(UPLOAD_DIR, os.path.splitext(filename)[0])
    os.makedirs(extract_dir, exist_ok=True)

    if ext == '.zip':
        with zipfile.ZipFile(archive_path, 'r') as z:
            z.extractall(extract_dir)
    elif ext == '.rar':
        _extract_rar_archive(archive_path, extract_dir)
    else:
        raise HTTPException(status_code=400, detail=f"不支持的压缩包格式: {ext}")

    data_files = _collect_archive_data_files(extract_dir)
    if not data_files:
        raise HTTPException(status_code=400, detail="压缩包中未找到 CSV、STDF、GZ 或 TXT 文件")
    return data_files, extract_dir

UPLOAD_DIR = os.path.expanduser(settings.UPLOAD_DIR)
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = []
    for file in files:
        try:
            batch = await _process_upload(file, db, background_tasks, current_user.id)
            results.extend(batch)
        except Exception as e:
            results.append({"filename": file.filename, "status": "failed", "error": str(e)})
    return {"results": results}


async def _process_upload(file: UploadFile, db: Session, background_tasks: BackgroundTasks, user_id: int):
    filename = file.filename
    ext = os.path.splitext(filename)[-1].lower()
    base_name = os.path.splitext(filename)[0]

    # 重复文件名处理：自动追加数字
    save_path = os.path.join(UPLOAD_DIR, filename)
    counter = 1
    while os.path.exists(save_path):
        new_filename = f"{base_name}_{counter}{ext}"
        save_path = os.path.join(UPLOAD_DIR, new_filename)
        counter += 1
    filename = os.path.basename(save_path)

    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # ── GZ 文件：先解压为 CSV ──────────────────────────────────────────
    is_gz = (ext == '.gz') and not _is_stdf(filename)
    if is_gz:
        decompressed_filename = filename[:-3]
        if not decompressed_filename.lower().endswith('.csv'):
            decompressed_filename += '.csv'
        
        decompressed_save_path = os.path.join(UPLOAD_DIR, decompressed_filename)
        dec_base = os.path.splitext(decompressed_filename)[0]
        dec_ext = os.path.splitext(decompressed_filename)[1]
        dec_counter = 1
        while os.path.exists(decompressed_save_path):
            decompressed_save_path = os.path.join(UPLOAD_DIR, f"{dec_base}_{dec_counter}{dec_ext}")
            dec_counter += 1
            
        import gzip
        try:
            with gzip.open(save_path, 'rb') as f_in:
                with open(decompressed_save_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
        except Exception as e:
            if os.path.exists(save_path):
                os.remove(save_path)
            if os.path.exists(decompressed_save_path):
                os.remove(decompressed_save_path)
            raise HTTPException(status_code=400, detail=f"GZ 解压失败: {e}")
            
        if os.path.exists(save_path):
            os.remove(save_path)
            
        save_path = decompressed_save_path
        filename = os.path.basename(decompressed_save_path)
        ext = '.csv'

    # ── STDF 文件：先转换为 CSV ──────────────────────────────────────────
    if _is_stdf(filename):
        from app.services.parsers.stdf_converter import convert_stdf_to_csv
        csv_filename = _stdf_base_name(filename) + '.csv'
        # 避免 CSV 文件名冲突
        csv_save_path = os.path.join(UPLOAD_DIR, csv_filename)
        csv_counter = 1
        while os.path.exists(csv_save_path):
            csv_base = _stdf_base_name(filename)
            csv_save_path = os.path.join(UPLOAD_DIR, f"{csv_base}_{csv_counter}.csv")
            csv_counter += 1

        print(f"[upload] STDF 文件检测到，开始转换: {filename} → {os.path.basename(csv_save_path)}")
        stdf_info = convert_stdf_to_csv(save_path, csv_save_path)

        if stdf_info.get('error'):
            # 转换失败，删除已上传的 STDF 文件
            if os.path.exists(save_path):
                os.remove(save_path)
            raise HTTPException(status_code=400, detail=f"STDF 转换失败: {stdf_info['error']}")

        # 转换成功：删除原始 STDF 文件，只保留 CSV
        if os.path.exists(save_path):
            os.remove(save_path)

        # 将 CSV 路径纳入后续处理流程（无原始 ZIP，extract_dir=None）
        return await _process_csv_paths(
            [csv_save_path], os.path.basename(csv_save_path),
            None, None, db, background_tasks, user_id
        )

    # 如果是zip，解压找csv
    is_zip = ext == '.zip'
    csv_paths = [save_path]
    extract_dir = None
    if ext == '.rar':
        csv_paths, extract_dir = _extract_data_archive(save_path, filename)
        return await _process_csv_paths(
            csv_paths, filename, save_path,
            extract_dir, db, background_tasks, user_id,
            original_content=None
        )
    if is_zip:
        extract_dir = os.path.join(UPLOAD_DIR, os.path.splitext(filename)[0])
        os.makedirs(extract_dir, exist_ok=True)
        with zipfile.ZipFile(save_path, 'r') as z:
            z.extractall(extract_dir)
        # 找所有csv/stdf/txt文件（包括子目录）
        csv_files = []
        for root, _, files in os.walk(extract_dir):
            for f in files:
                flower = f.lower()
                if flower.endswith('.csv') or flower.endswith('.txt') or flower.endswith('.xls') or flower.endswith('.xlsx'):
                    csv_files.append(os.path.join(root, f))
                elif _is_stdf(f):
                    # ZIP 内的 STDF 文件先转换为 CSV
                    from app.services.parsers.stdf_converter import convert_stdf_to_csv
                    stdf_inner = os.path.join(root, f)
                    csv_inner  = os.path.join(root, _stdf_base_name(f) + '.csv')
                    info = convert_stdf_to_csv(stdf_inner, csv_inner)
                    if not info.get('error'):
                        csv_files.append(csv_inner)
                        os.remove(stdf_inner)
                elif flower.endswith('.gz') and not _is_stdf(f):
                    # ZIP 内的 GZ 文件解压
                    gz_inner = os.path.join(root, f)
                    decompressed_inner_name = f[:-3]
                    if not decompressed_inner_name.lower().endswith('.csv'):
                        decompressed_inner_name += '.csv'
                    csv_inner = os.path.join(root, decompressed_inner_name)
                    
                    import gzip
                    try:
                        with gzip.open(gz_inner, 'rb') as f_in:
                            with open(csv_inner, 'wb') as f_out:
                                shutil.copyfileobj(f_in, f_out)
                        csv_files.append(csv_inner)
                        os.remove(gz_inner)
                    except Exception as e:
                        print(f"[upload] ZIP 内 GZ 解压失败 {gz_inner}: {e}")
        if not csv_files:
            raise HTTPException(status_code=400, detail="ZIP中未找到CSV、STDF、TXT或XLS/XLSX文件")
        # 确保 txt/xls 文件排在 csv 文件后面
        csv_paths = sorted(csv_files, key=lambda p: (1 if p.lower().endswith(('.txt', '.xls', '.xlsx')) else 0, p))

    return await _process_csv_paths(
        csv_paths, filename, save_path if is_zip else None,
        extract_dir, db, background_tasks, user_id,
        original_content=content if not is_zip else None
    )


async def _process_csv_paths(
    csv_paths: list,
    original_filename: str,
    zip_save_path,          # 原始 ZIP 文件路径（非 ZIP 时为 None）
    extract_dir,            # ZIP 解压目录（非 ZIP 时为 None）
    db: Session,
    background_tasks: BackgroundTasks,
    user_id: int,
    original_content: bytes = None,   # 非 ZIP 直传时的原始字节内容
) -> list:
    """将 csv_paths 列表逐一创建 Lot 记录并触发后台解析任务"""
    is_zip = zip_save_path is not None
    results = []

    for csv_path in csv_paths:
        csv_name = os.path.basename(csv_path)

        if csv_name.lower().endswith(('.xls', '.xlsx')):
            try:
                from app.services.parsers.xls_summary_parser import parse_and_save_xls_summary
                created_lots = parse_and_save_xls_summary(csv_path, db, user_id, osat_name="chipmore")
                for lot in created_lots:
                    results.append({
                        "filename": csv_name,
                        "status": "processed",
                        "lot_id": lot.id
                    })
            except Exception as ex:
                import traceback
                traceback.print_exc()
                results.append({
                    "filename": csv_name,
                    "status": "failed",
                    "error": str(ex)
                })
            continue

        if csv_name.lower().endswith('.txt'):
            # Summary txt file
            lot_storage_path = csv_path
            lot_file_size = os.path.getsize(csv_path)
            lot_filename = csv_name

            lot = Lot(
                filename=lot_filename,
                storage_path=lot_storage_path,
                file_size=lot_file_size,
                status='processed',
                data_source='manual',
                storage_type='local',
                local_expires_at=datetime.now(timezone.utc) + timedelta(days=7),
                upload_date=datetime.now(timezone.utc),
                test_machine='ETS364',
                user_id=user_id,
                data_type='Summary',
            )

            from app.services.parsers.summary_parser import parse_summary_txt, apply_summary_to_csv, find_corresponding_csv_filename, save_program_bin_names_from_summary
            summary_data = parse_summary_txt(csv_path)
            if summary_data.get('beginning_time'):
                lot.beginning_time = summary_data['beginning_time']
                lot.test_date = summary_data['beginning_time']
            if summary_data.get('ending_time'):
                lot.ending_time = summary_data['ending_time']

            db.add(lot)
            db.commit()
            db.refresh(lot)

            csv_mapped_name = find_corresponding_csv_filename(csv_name)
            csv_base = os.path.splitext(csv_mapped_name)[0]
            csv_lots = db.query(Lot).filter(
                Lot.filename.like(f"%{csv_base}%"),
                Lot.data_source == lot.data_source
            ).all()

            for csv_lot in csv_lots:
                apply_summary_to_csv(db, csv_lot.id, summary_data)

            # ── 将 Bin Name 信息保存到 ProgramBinName 缓存表 ──────────────────
            # 优先使用已匹配 CSV lot 的 program 名，其次使用 Summary 文件自身解析到的程序名
            program_for_bin = None
            for csv_lot in csv_lots:
                if csv_lot.program:
                    program_for_bin = csv_lot.program
                    break
            if not program_for_bin:
                program_for_bin = summary_data.get('program')
            if program_for_bin and summary_data.get('bins'):
                save_program_bin_names_from_summary(db, program_for_bin, summary_data['bins'])
                print(f"[upload] Summary bin names saved for program={program_for_bin!r}, "
                      f"bins={len(summary_data['bins'])}")


            results.append({
                "filename": lot_filename,
                "status": lot.status,
                "lot_id": lot.id
            })
            continue

        if is_zip:
            # 把该 CSV 单独压缩成一个 ZIP，storage_path 指向这个单独 ZIP
            csv_base = os.path.splitext(csv_name)[0]
            single_zip_path = os.path.join(extract_dir, f"{csv_base}.zip")
            with zipfile.ZipFile(single_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.write(csv_path, csv_name)
            lot_storage_path = single_zip_path
            lot_file_size = os.path.getsize(single_zip_path)
            lot_filename = csv_name
            # CSV 原文件保留，供后台异步解析使用
        else:
            lot_storage_path = csv_path
            lot_file_size = os.path.getsize(csv_path)
            lot_filename = csv_name

        # 快速识别tester类型，提取基本元数据
        from app.services.parsers.detector import detect_tester
        tester = detect_tester(csv_path)
        # LBS 格式内部路由为 'LBS'，但在首页显示为 'STS8200'
        display_tester = 'STS8200' if tester == 'LBS' else tester

        # 创建LOT记录（先存pending状态）
        lot = Lot(
            filename=lot_filename,
            storage_path=lot_storage_path,
            file_size=lot_file_size,
            status='pending',
            data_source='manual',
            storage_type='local',
            local_expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            upload_date=datetime.now(timezone.utc),
            test_machine=display_tester,
            user_id=user_id,
        )

        # 快速解析表头获取基本信息
        try:
            meta = _quick_parse_meta(csv_path, tester)
            lot.program = meta.get('program')
            lot.lot_id = meta.get('lot_id')
            lot.wafer_id = meta.get('wafer_id')
            lot.handler = meta.get('handler')
            lot.data_type = meta.get('test_stage')
            # test_date 已由 parser 统一处理为标准字符串（YYYY-MM-DD HH:MM:SS 或 YYYY-MM-DD）
            td_str = meta.get('test_date')
            if td_str:
                try:
                    if len(td_str) == 19:
                        lot.test_date = datetime.strptime(td_str, '%Y-%m-%d %H:%M:%S')
                    elif len(td_str) == 10:
                        lot.test_date = datetime.strptime(td_str, '%Y-%m-%d')
                except Exception:
                    pass

            # 提取并解析开始/结束时间
            for field in ['beginning_time', 'ending_time']:
                val = meta.get(field)
                if val:
                    from app.services.parsers.acco_parser import parse_datetime_str
                    std_val = parse_datetime_str(val)
                    if std_val:
                        try:
                            if len(std_val) == 19:
                                setattr(lot, field, datetime.strptime(std_val, '%Y-%m-%d %H:%M:%S'))
                            elif len(std_val) == 10:
                                setattr(lot, field, datetime.strptime(std_val, '%Y-%m-%d'))
                        except Exception:
                            pass
        except Exception:
            pass

        db.add(lot)
        db.commit()
        db.refresh(lot)

        # 触发异步解析任务
        background_tasks.add_task(_parse_and_save_bg, lot.id, csv_path)

        results.append({
            "filename": lot_filename,
            "status": lot.status,
            "lot_id": lot.id
        })

    # 所有 CSV 处理完后删除原始 ZIP
    if is_zip and zip_save_path and os.path.exists(zip_save_path):
        os.remove(zip_save_path)

    return results


def _parse_and_save_bg(lot_id: int, csv_path: str):
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        _parse_and_save(lot_id, csv_path, db)
    except Exception as e:
        print(f"[_parse_and_save_bg] error: {e}")
    finally:
        db.close()

def _quick_parse_meta(csv_path: str, tester: str) -> dict:
    """快速读取表头元数据，按 tester 类型路由到对应 parser"""
    from app.services.parsers import parse_file

    result = parse_file(csv_path)

    if result.error:
        return {}

    return {
        'program': result.program,
        'lot_id': result.lot_id,
        'wafer_id': result.wafer_id,
        'handler': result.handler,
        'test_stage': result.test_stage,
        'beginning_time': result.beginning_time,
        'ending_time': result.ending_time,
        'test_date': result.test_date,   # 已标准化的测试日期字符串
    }

def _parse_and_save(lot_id: int, csv_path: str, db: Session):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        return

    lot.status = 'processing'
    db.commit()

    try:
        result = parse_file(csv_path)
        print(f"[parse] 解析完成 error={result.error}")

        if result.error:
            raise Exception(result.error)

        # 更新开始/结束时间（以全量解析的结果为准）
        lot.program = result.program or lot.program
        lot.lot_id = result.lot_id
        lot.wafer_id = result.wafer_id
        lot.handler = result.handler or lot.handler
        lot.data_type = result.test_stage or lot.data_type
        lot.test_machine = result.tester or lot.test_machine

        from app.services.parsers.acco_parser import parse_datetime_str
        for field in ['test_date', 'beginning_time', 'ending_time']:
            val = getattr(result, field, None)
            if val:
                std_val = parse_datetime_str(val)
                if std_val:
                    try:
                        if len(std_val) == 19:
                            setattr(lot, field, datetime.strptime(std_val, '%Y-%m-%d %H:%M:%S'))
                        elif len(std_val) == 10:
                            setattr(lot, field, datetime.strptime(std_val, '%Y-%m-%d'))
                    except Exception:
                        pass
        db.commit()

        # 保存Parquet
        parquet_dir = os.path.join(UPLOAD_DIR, 'parquet')
        os.makedirs(parquet_dir, exist_ok=True)
        parquet_path = os.path.join(parquet_dir, f"lot_{lot_id}.parquet")
        result.data.to_parquet(parquet_path, index=False)
        print(f"[parse] Parquet保存完成 {parquet_path}")

        lot.parquet_path = parquet_path

        # BIN 1/2 为 PASS，其他为 FAIL（业务规则，不依赖表头）
        PASS_BINS = [1, 2]

        lot.station_count = int(result.data['SITE_NUM'].nunique())

        if lot.program:
            from app.models.product_mapping import ProductMapping
            from app.api.routes.products import extract_program_prefix
            prefix = extract_program_prefix(lot.program)
            if prefix:
                mapping = db.query(ProductMapping).filter(
                    ProductMapping.program_prefix == prefix
                ).first()
                if mapping:
                    lot.product_name = mapping.product_name

        from app.services.stats import save_stats_to_db, run_lot_auto_check
        save_stats_to_db(lot, result, db, PASS_BINS)
        print(f"[parse] 统计计算完成")

        # 检查是否有已上传的 Summary txt 记录
        try:
            from app.services.parsers.summary_parser import get_summary_filename, parse_summary_txt, apply_summary_to_csv, save_program_bin_names_from_summary
            summary_filename = get_summary_filename(lot.filename)
            summary_base = os.path.splitext(summary_filename)[0]
            summary_lot = db.query(Lot).filter(
                Lot.data_type == 'Summary',
                Lot.filename.like(f"%{summary_base}%"),
                Lot.data_source == lot.data_source
            ).first()
            if summary_lot:
                print(f"[parse] Found existing Summary file: {summary_lot.filename}, applying to lot_id={lot.id}")
                summary_data = parse_summary_txt(summary_lot.storage_path)
                apply_summary_to_csv(db, lot.id, summary_data)
                # 同步 Bin Name 到 ProgramBinName 缓存（以 lot.program 为准）
                if lot.program and summary_data.get('bins'):
                    save_program_bin_names_from_summary(db, lot.program, summary_data['bins'])
        except Exception as e:
            print(f"[parse] Error applying existing Summary to Lot: {e}")


        # 默认执行自动 Check 功能，如果有配置指纹参数
        try:
            status = run_lot_auto_check(lot, db)
            if status:
                lot.check_status = status
                print(f"[parse] 自动 Check 计算完成: status={status}")
        except Exception as ex:
            print(f"[parse] 自动 Check 计算失败: {ex}")

        lot.status = 'processed'
        lot.finish_date = datetime.now(timezone.utc)

        # --- 自动数据压缩与临时文件清理 ---
        if lot.storage_path and os.path.exists(lot.storage_path):
            if lot.storage_path.lower().endswith('.csv'):
                zip_path = lot.storage_path[:-4] + '.zip'
                try:
                    import zipfile
                    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                        zf.write(lot.storage_path, os.path.basename(lot.storage_path))
                    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
                        os.remove(lot.storage_path)
                        lot.storage_path = zip_path
                        print(f"[cleanup] Compressed CSV to ZIP: {zip_path}")
                    else:
                        print(f"[cleanup] Warning: Zip creation failed or empty for {zip_path}")
                except Exception as e:
                    print(f"[cleanup] Failed to compress CSV to ZIP: {e}")

        # 如果是 ZIP 上传，解包出的临时 CSV 文件 csv_path 也应当被清理
        if csv_path and csv_path != lot.storage_path and os.path.exists(csv_path):
            if csv_path.lower().endswith('.csv'):
                try:
                    os.remove(csv_path)
                    print(f"[cleanup] Removed temporary CSV: {csv_path}")
                except Exception as e:
                    print(f"[cleanup] Failed to remove temporary CSV {csv_path}: {e}")

        db.commit()
        print(f"[parse] 全部完成 lot_id={lot_id}")

    except Exception as e:
        import traceback
        print(f"[parse] 错误: {e}")
        traceback.print_exc()
        lot.status = 'failed'
        db.commit()



class ReparseRequest(BaseModel):
    ids: List[int]


def _prepare_reparse_csv(lot: Lot) -> tuple[str, Optional[str]]:
    if not lot.storage_path or not os.path.exists(lot.storage_path):
        raise FileNotFoundError(f"Source file not found for LOT {lot.id}")

    lower_path = lot.storage_path.lower()
    if lower_path.endswith('.csv'):
        return lot.storage_path, None

    if lower_path.endswith('.zip'):
        tmp_dir = tempfile.mkdtemp(prefix=f"reparse_lot_{lot.id}_")
        with zipfile.ZipFile(lot.storage_path, 'r') as zf:
            members = [
                info for info in zf.infolist()
                if not info.is_dir() and info.filename.lower().endswith('.csv')
            ]
            if not members:
                raise FileNotFoundError(f"ZIP source for LOT {lot.id} does not contain a CSV file")
            members.sort(key=lambda info: len(info.filename.replace("\\", "/").split("/")))
            picked = members[0]
            csv_path = os.path.join(tmp_dir, os.path.basename(picked.filename))
            with zf.open(picked) as src, open(csv_path, "wb") as dst:
                shutil.copyfileobj(src, dst)
        return csv_path, tmp_dir

    raise ValueError(f"Unsupported source file type for LOT {lot.id}: {lot.storage_path}")


def _reparse_lot_bg(lot_id: int):
    from app.core.database import SessionLocal
    from app.services.parsers.xls_summary_parser import parse_and_save_xls_summary

    db = SessionLocal()
    tmp_dir = None
    try:
        lot = db.query(Lot).filter(Lot.id == lot_id).first()
        if not lot:
            return
            
        lower_path = lot.storage_path.lower()
        if lower_path.endswith('.xls') or lower_path.endswith('.xlsx'):
            parse_and_save_xls_summary(lot.storage_path, db, user_id=lot.user_id, osat_name=lot.osat_name)
        else:
            csv_path, tmp_dir = _prepare_reparse_csv(lot)
            _parse_and_save(lot.id, csv_path, db)
    except Exception as e:
        print(f"[_reparse_lot_bg] error lot_id={lot_id}: {e}")
        lot = db.query(Lot).filter(Lot.id == lot_id).first()
        if lot:
            lot.status = 'failed'
            db.commit()
    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        db.close()


@router.post("/reparse")
def reparse_lots(
    data: ReparseRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.ids:
        raise HTTPException(status_code=400, detail="No lot records selected")

    lots = db.query(Lot).filter(Lot.id.in_(data.ids)).all()
    if len(lots) != len(data.ids):
        raise HTTPException(status_code=404, detail="Some lot records do not exist")

    from app.models.lot import DataSource

    queued = []
    skipped = []
    for lot in lots:
        if lot.data_type == 'Summary':
            skipped.append({"id": lot.id, "reason": "summary"})
            continue
        if lot.data_source == DataSource.ftp:
            if current_user.role not in ['admin', 'eng']:
                skipped.append({"id": lot.id, "reason": "no permission"})
                continue
        elif current_user.role != 'admin' and lot.user_id != current_user.id:
            skipped.append({"id": lot.id, "reason": "no permission"})
            continue

        if not lot.storage_path or not os.path.exists(lot.storage_path):
            skipped.append({"id": lot.id, "reason": "source data file missing"})
            continue

        lower_path = lot.storage_path.lower()
        if not (lower_path.endswith('.csv') or lower_path.endswith('.zip') or lower_path.endswith('.xls') or lower_path.endswith('.xlsx')):
            skipped.append({"id": lot.id, "reason": "unsupported source file type"})
            continue

        if not lower_path.endswith('.xls') and not lower_path.endswith('.xlsx'):
            lot.status = 'pending'
        queued.append(lot.id)
        background_tasks.add_task(_reparse_lot_bg, lot.id)

    if not queued:
        return {
            "message": "No lot records can be reparsed",
            "ids": [],
            "skipped": skipped,
        }

    db.commit()
    return {
        "message": f"Submitted {len(queued)} lot record(s) for reparsing",
        "ids": queued,
        "skipped": skipped,
    }


@router.get("/mp-yield/overview")
def get_mp_yield_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    range_type: str = Query("month"),
    range_value: Optional[int] = Query(3),
    months: Optional[int] = Query(None),
    product_name: Optional[str] = None,
):
    """
    Get per-product overview statistics for the MP Yield overview tab.
    Only counts FTP-sourced data. Returns:
    - Per-product: wafer count, bin1_k (PASS/1000 integer), avg yield,
                   avg_wafer_time_h, top5 fail bins (pct = bin_cnt/total_die)
    - Weekly trend: output (wafers/week) and avg yield per week
    """
    try:
        from app.models.lot import DataSource
        from collections import defaultdict

        if months is not None:
            range_type = "month"
            range_value = months

        filters = [
            Lot.data_source == DataSource.ftp,
            Lot.data_type == "MP_Yield",
            Lot.status != "deleted",
        ]

        if range_type == "month":
            val = range_value if range_value is not None else 3
            cutoff = datetime.now(timezone.utc) - timedelta(days=val * 30)
            filters.append(Lot.test_date >= cutoff)
        elif range_type == "year":
            val = range_value if range_value is not None else 1
            cutoff = datetime.now(timezone.utc) - timedelta(days=val * 365)
            filters.append(Lot.test_date >= cutoff)
        elif range_type == "lot":
            val = range_value if range_value is not None else 20
            # Get recent N distinct lot IDs for MP_Yield
            recent_lots_q = (
                db.query(Lot.lot_id)
                .filter(
                    Lot.data_source == DataSource.ftp,
                    Lot.data_type == "MP_Yield",
                    Lot.status != "deleted",
                )
            )
            if product_name:
                recent_lots_q = recent_lots_q.filter(Lot.product_name.ilike(f"%{product_name}%"))
            recent_lots_results = (
                recent_lots_q.group_by(Lot.lot_id)
                .order_by(func.max(Lot.test_date).desc())
                .limit(val)
                .all()
            )
            recent_lot_ids = [r[0] for r in recent_lots_results] if recent_lots_results else []
            if not recent_lot_ids:
                return {"products": [], "weekly_output": [], "weekly_yield": []}
            filters.append(Lot.lot_id.in_(recent_lot_ids))
        elif range_type == "all":
            # No date/lot filter
            pass

        # ── Build dedup filter subquery ──────────────────────────────────────
        def _latest_ids_filter(extra_filter=None):
            q = db.query(func.max(Lot.id)).filter(*filters)
            if extra_filter is not None:
                q = q.filter(extra_filter)
            return q.group_by(Lot.lot_id, Lot.wafer_id).subquery()

        pname_filter = Lot.product_name.ilike(f"%{product_name}%") if product_name else None

        base_q = db.query(Lot).filter(*filters)
        if pname_filter is not None:
            base_q = base_q.filter(pname_filter)

        latest_ids_sq = _latest_ids_filter(pname_filter)
        lots = base_q.filter(Lot.id.in_(latest_ids_sq)).all()

        if not lots:
            return {"products": [], "weekly_output": [], "weekly_yield": [], "osats": []}

        lot_ids = [lot.id for lot in lots]

        # Fetch bin summaries (site=0 = all-site)
        bins = (
            db.query(BinSummary)
            .filter(BinSummary.lot_id.in_(lot_ids), BinSummary.site == 0)
            .all()
        )
        bin_map: dict = {}
        for b in bins:
            bin_map.setdefault(b.lot_id, {})[b.bin_number] = b.count

        # ── Grouping by (product_name, osat_name) ─────────────────────────────
        group_lots: dict = defaultdict(list)
        for lot in lots:
            pname = lot.product_name or "(unknown)"
            osat = lot.osat_name or "chipmore"
            group_lots[(pname, osat)].append(lot)

        products = []
        for (pname, osat), plots in group_lots.items():
            wafer_count = len(plots)
            total_pass = sum((lot.pass_count or 0) for lot in plots)
            total_die  = sum((lot.die_count  or 0) for lot in plots)
            avg_yield  = (total_pass / total_die * 100.0) if total_die > 0 else 0.0

            # Fail bin aggregation
            fail_bin_totals: dict = defaultdict(int)
            for lot in plots:
                for bin_num, cnt in bin_map.get(lot.id, {}).items():
                    if bin_num != 1:   # bin1 = PASS
                        fail_bin_totals[bin_num] += cnt

            top5_bins = sorted(fail_bin_totals.items(), key=lambda x: -x[1])[:5]
            # pct = bin_count / total_die
            top5 = [
                {
                    "bin": f"Sbin{b}",
                    "count": cnt,
                    "pct": round(cnt / total_die * 100, 2) if total_die > 0 else 0.0,
                }
                for b, cnt in top5_bins
            ]

            durations_h = []
            for lot in plots:
                if lot.beginning_time and lot.ending_time:
                    diff_s = (lot.ending_time - lot.beginning_time).total_seconds()
                    if diff_s > 0:
                        durations_h.append(diff_s / 3600.0)
            
            avg_wafer_time_h = None
            if durations_h:
                durations_h.sort(reverse=True)
                n = len(durations_h)
                drop_count = int(n * 0.3)
                if drop_count > 0 and n - 2 * drop_count > 0:
                    middle = durations_h[drop_count : n - drop_count]
                else:
                    middle = durations_h
                if middle:
                    avg_wafer_time_h = round(sum(middle) / len(middle), 2)

            products.append({
                "product_name": pname,
                "osat": osat.upper() if osat.lower() == "ksht" else osat,
                "wafers": wafer_count,
                "bin1_k": int(total_pass // 1000),       # integer K
                "avg_yield": round(avg_yield, 2),
                "avg_wafer_time_h": avg_wafer_time_h,
                "top5_fail_bins": top5,
            })

        # Sort by wafer count descending
        products.sort(key=lambda x: -x["wafers"])

        # ── Weekly trend ─────────────────────────────────────────────────────
        week_data: dict = defaultdict(lambda: {"pass": 0, "die": 0, "wafers": 0})
        for lot in lots:
            if lot.test_date:
                td = lot.test_date
                if td.tzinfo is None:
                    td = td.replace(tzinfo=timezone.utc)
                year, week, _ = td.isocalendar()
                wkey = f"{year}-W{week:02d}"
                week_data[wkey]["pass"]   += lot.pass_count or 0
                week_data[wkey]["die"]    += lot.die_count  or 0
                week_data[wkey]["wafers"] += 1

        sorted_weeks = sorted(week_data.keys())

        weekly_output = [{"week": w, "wafers": week_data[w]["wafers"]} for w in sorted_weeks]
        weekly_yield  = [
            {
                "week": w,
                "yield": round(week_data[w]["pass"] / week_data[w]["die"] * 100.0, 2)
                if week_data[w]["die"] > 0 else 0.0,
            }
            for w in sorted_weeks
        ]

        # ── OSAT aggregation ─────────────────────────────────────────────────
        osat_bin1_totals = defaultdict(int)
        for lot in lots:
            osat = lot.osat_name or "chipmore"
            osat_bin1_totals[osat] += lot.pass_count or 0

        osats = [
            {
                "osat_name": name,
                "bin1_k": int(total_pass // 1000)
            }
            for name, total_pass in osat_bin1_totals.items()
        ]

        return {
            "products": products,
            "weekly_output": weekly_output,
            "weekly_yield": weekly_yield,
            "osats": osats,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/mp-yield/list")
def get_mp_yield_list(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    lot_id: Optional[str] = None,
    wafer_id: Optional[str] = None,
    product_name: Optional[str] = None,
    mp_tester: Optional[str] = None,
    osat_name: Optional[str] = None,
    program: Optional[str] = None,
    test_date_from: Optional[str] = None,
    test_date_to: Optional[str] = None,
    range_type: Optional[str] = None,
    range_value: Optional[int] = None,
):
    """
    Get a list of MP Yield records with horizontally pivoted sbin1-sbin130 values.
    """
    try:
        now = datetime.now(timezone.utc)
        if current_user.role in ['admin', 'eng']:
            query = db.query(Lot)
        else:
            shared_lot_ids = (
                db.query(LotShare.lot_id)
                .filter(
                    LotShare.shared_to == current_user.id,
                    LotShare.expires_at > now,
                )
                .subquery()
            )
            from app.models.lot import DataSource
            query = db.query(Lot).filter(
                or_(
                    Lot.user_id == current_user.id,
                    Lot.id.in_(shared_lot_ids),
                    Lot.data_source == DataSource.ftp
                )
            )
            
        query = query.filter(Lot.data_type == 'MP_Yield', Lot.status != 'deleted')
        
        # Deduplicate wafer runs: only show the latest wafer run (highest ID) for each unique (lot_id, wafer_id) combination
        latest_wafer_run_ids = (
            db.query(func.max(Lot.id))
            .filter(Lot.data_type == 'MP_Yield', Lot.status != 'deleted')
            .group_by(Lot.lot_id, Lot.wafer_id)
            .subquery()
        )
        query = query.filter(Lot.id.in_(latest_wafer_run_ids))
        
        if lot_id:
            query = query.filter(Lot.lot_id.ilike(f"%{lot_id}%"))
        if wafer_id:
            query = query.filter(Lot.wafer_id.ilike(f"%{wafer_id}%"))
        if product_name:
            query = query.filter(Lot.product_name.ilike(f"%{product_name}%"))
        if osat_name:
            if osat_name.lower() == "chipmore":
                query = query.filter(or_(Lot.osat_name.ilike(f"%{osat_name}%"), Lot.osat_name.is_(None)))
            else:
                query = query.filter(Lot.osat_name.ilike(f"%{osat_name}%"))
        if program:
            query = query.filter(Lot.program.ilike(f"%{program}%"))
        if mp_tester:
            if mp_tester == "(unknown)":
                query = query.filter(or_(Lot.mp_tester == "(unknown)", Lot.mp_tester.is_(None)))
            else:
                query = query.filter(Lot.mp_tester.ilike(f"%{mp_tester}%"))
            
        if range_type:
            from app.models.lot import DataSource
            if range_type == "month":
                val = range_value if range_value is not None else 3
                cutoff = datetime.now(timezone.utc) - timedelta(days=val * 30)
                query = query.filter(Lot.test_date >= cutoff)
            elif range_type == "year":
                val = range_value if range_value is not None else 1
                cutoff = datetime.now(timezone.utc) - timedelta(days=val * 365)
                query = query.filter(Lot.test_date >= cutoff)
            elif range_type == "lot":
                val = range_value if range_value is not None else 20
                recent_lots_q = (
                    db.query(Lot.lot_id)
                    .filter(
                        Lot.data_source == DataSource.ftp,
                        Lot.data_type == "MP_Yield",
                        Lot.status != "deleted",
                    )
                )
                if product_name:
                    recent_lots_q = recent_lots_q.filter(Lot.product_name.ilike(f"%{product_name}%"))
                recent_lots_results = (
                    recent_lots_q.group_by(Lot.lot_id)
                    .order_by(func.max(Lot.test_date).desc())
                    .limit(val)
                    .all()
                )
                recent_lot_ids = [r[0] for r in recent_lots_results] if recent_lots_results else []
                query = query.filter(Lot.lot_id.in_(recent_lot_ids))
            elif range_type == "all":
                pass
        else:
            if test_date_from:
                query = query.filter(Lot.test_date >= datetime.strptime(test_date_from, "%Y-%m-%d"))
            if test_date_to:
                query = query.filter(Lot.test_date < datetime.strptime(test_date_to, "%Y-%m-%d") + timedelta(days=1))
            
        total = query.count()
        lots = query.order_by(desc(Lot.test_date), desc(Lot.id)).offset(
            (page - 1) * page_size
        ).limit(page_size).all()
        
        lot_ids = [lot.id for lot in lots]
        bin_summaries_map = {}
        if lot_ids:
            bins = db.query(BinSummary).filter(BinSummary.lot_id.in_(lot_ids)).all()
            for b in bins:
                if b.lot_id not in bin_summaries_map:
                    bin_summaries_map[b.lot_id] = {}
                bin_summaries_map[b.lot_id][b.bin_number] = b.count
                
        items = []
        for lot in lots:
            lot_bins = bin_summaries_map.get(lot.id, {})
            test_date_str = ""
            if lot.test_date:
                test_date_str = lot.test_date.strftime("%Y-%m-%d %H:%M:%S")
                
            test_start_str = ""
            if lot.beginning_time:
                test_start_str = lot.beginning_time.strftime("%Y-%m-%d %H:%M:%S")
                
            duration_h = None
            if lot.beginning_time and lot.ending_time:
                diff_s = (lot.ending_time - lot.beginning_time).total_seconds()
                if diff_s > 0:
                    duration_h = round(diff_s / 3600.0, 2)
                    
            item = {
                "id": lot.id,
                "osat_name": lot.osat_name or "chipmore",
                "test_start": test_start_str,
                "test_date": test_date_str,
                "duration_h": duration_h,
                "product_name": lot.product_name or "",
                "lot_id": lot.lot_id or "",
                "wafer_id": lot.wafer_id or "",
                "total": lot.die_count or 0,
                "pass": lot.pass_count or 0,
                "yield_rate": round((lot.yield_rate or 0.0) * 100.0, 2),
                "program": lot.program or "",
                "mp_tester": lot.mp_tester or "",
                "probecard": lot.probecard or "",
            }
            
            for sbin_idx in range(1, 131):
                item[f"sbin{sbin_idx}"] = lot_bins.get(sbin_idx, 0)
                
            items.append(item)
            
        return {
            "total": total,
            "items": items,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=LotListResponse)
def get_lots(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    filename: Optional[str] = None,
    product_name: Optional[str] = None,
    lot_id: Optional[str] = None,
    wafer_id: Optional[str] = None,
    program: Optional[str] = None,
    status: Optional[str] = None,
    data_type: Optional[str] = None,
    data_source: Optional[str] = None,
    test_machine: Optional[str] = None,
    osat_name: Optional[str] = None,
    osat_type: Optional[str] = None,   # OSAT Tab 专用：按 osat_config.data_type 过滤（CP/FT）
    test_date_from: Optional[str] = None,
    test_date_to: Optional[str] = None,
    upload_date_from: Optional[str] = None,
    upload_date_to: Optional[str] = None,
):
    try:
        now = datetime.now(timezone.utc)
        if current_user.role in ['admin', 'eng']:
            query = db.query(Lot)
        else:
            # 自己的 + 别人分享给我且未过期的
            shared_lot_ids = (
                db.query(LotShare.lot_id)
                .filter(
                    LotShare.shared_to == current_user.id,
                    LotShare.expires_at > now,
                )
                .subquery()
            )
            from app.models.lot import DataSource
            query = db.query(Lot).filter(
                or_(
                    Lot.user_id == current_user.id,
                    Lot.id.in_(shared_lot_ids),
                    Lot.data_source == DataSource.ftp  # 所有人均可访问 OSAT (FTP) 数据
                )
            )
        
        query = query.filter(Lot.status != 'deleted')

        # Deduplicate summary files: only show the first wafer (minimum ID) for each unique summary filename
        representative_mp_yield_ids = (
            db.query(func.min(Lot.id))
            .filter(Lot.data_type == 'MP_Yield', Lot.status != 'deleted')
            .group_by(Lot.filename)
            .subquery()
        )
        query = query.filter(
            or_(
                Lot.data_type != 'MP_Yield',
                Lot.id.in_(representative_mp_yield_ids)
            )
        )

        if filename:
            query = query.filter(Lot.filename.ilike(f"%{filename}%"))
        if product_name:
            query = query.filter(Lot.product_name.ilike(f"%{product_name}%"))
        if lot_id:
            query = query.filter(Lot.lot_id.ilike(f"%{lot_id}%"))
        if wafer_id:
            query = query.filter(Lot.wafer_id.ilike(f"%{wafer_id}%"))
        if program:
            query = query.filter(Lot.program.ilike(f"%{program}%"))
        if status:
            query = query.filter(Lot.status == status)
        if data_type:
            query = query.filter(Lot.data_type == data_type)
        if data_source:
            query = query.filter(Lot.data_source == data_source)
        if test_machine:
            query = query.filter(Lot.test_machine == test_machine)
        if osat_name:
            if osat_name.lower() == "chipmore":
                query = query.filter(or_(Lot.osat_name.ilike(f"%{osat_name}%"), Lot.osat_name.is_(None)))
            else:
                query = query.filter(Lot.osat_name.ilike(f"%{osat_name}%"))
        # OSAT Tab 专用过滤：按 osat_config.data_type 过滤，而非 lot.data_type
        # 这样 QA 文件（data_type='QA'）也会出现在对应的 OSAT_CP/OSAT_FT Tab 中
        if osat_type:
            from app.models.osat_config import OsatConfig
            osat_names_for_type = [
                r[0] for r in db.query(OsatConfig.name).filter(OsatConfig.data_type == osat_type).all()
            ]
            query = query.filter(Lot.osat_name.in_(osat_names_for_type))
        if test_date_from:
            query = query.filter(Lot.test_date >= datetime.strptime(test_date_from, "%Y-%m-%d"))
        if test_date_to:
            query = query.filter(Lot.test_date < datetime.strptime(test_date_to, "%Y-%m-%d") + timedelta(days=1))
        if upload_date_from:
            query = query.filter(Lot.upload_date >= datetime.strptime(upload_date_from, "%Y-%m-%d"))
        if upload_date_to:
            query = query.filter(Lot.upload_date < datetime.strptime(upload_date_to, "%Y-%m-%d") + timedelta(days=1))

        total = query.count()
        items = query.order_by(desc(Lot.upload_date)).offset(
            (page-1)*page_size
        ).limit(page_size).all()

        # 填充 osat_type：从 osat_config 读取每个 lot 所属 OSAT 的 CP/FT 分类
        # 这样前端可以按 osat_type 过滤 Tab，而不是按 lot.data_type
        from app.models.osat_config import OsatConfig
        osat_type_map = {
            r[0]: r[1] for r in db.query(OsatConfig.name, OsatConfig.data_type).all()
        }
        for item in items:
            if item.osat_name and item.data_source == 'ftp':
                item.osat_type = osat_type_map.get(item.osat_name)
            else:
                item.osat_type = None

        return {
            "total": total,
            "items": items,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("")
def delete_lots(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import shutil
    ids = data.get("ids", [])
    deleted_count = 0
    for lot_id in ids:
        lot = db.query(Lot).filter(Lot.id == lot_id).first()
        if lot:
            # 权限检查：只有 admin/eng 可以删除 OSAT_FT/OSAT_CP (ftp) 数据；对于手动上传数据，只有 owner 或 admin 可以删除
            from app.models.lot import DataSource
            if lot.data_source == DataSource.ftp:
                if current_user.role not in ['admin', 'eng']:
                    continue
            else:
                if current_user.role != 'admin' and lot.user_id != current_user.id:
                    continue
            # 1. 删除关联的统计数据（外键约束）
            db.query(BinSummary).filter(BinSummary.lot_id == lot_id).delete()
            db.query(TestItem).filter(TestItem.lot_id == lot_id).delete()

            # 2. 删除物理文件
            if lot.storage_path and os.path.exists(lot.storage_path):
                try:
                    if os.path.isdir(lot.storage_path):
                        shutil.rmtree(lot.storage_path)
                    else:
                        os.remove(lot.storage_path)
                except Exception as e:
                    print(f"Error deleting storage_path {lot.storage_path}: {e}")
            
            if lot.parquet_path and os.path.exists(lot.parquet_path):
                try:
                    os.remove(lot.parquet_path)
                except Exception as e:
                    print(f"Error deleting parquet_path {lot.parquet_path}: {e}")

            # 3. 如果是 FTP 数据，同步删除 FTP 上传日志
            #    这样下次 FTP 扫描时会将该文件视为新文件，重新抓取并解析
            if lot.data_source == DataSource.ftp and lot.ftp_path:
                from app.models.ftp_upload_log import FtpUploadLog
                deleted_logs = db.query(FtpUploadLog).filter(
                    FtpUploadLog.remote_path == lot.ftp_path
                ).delete()
                if deleted_logs:
                    print(f"[delete_lots] 已清除 FTP 上传日志 ftp_path={lot.ftp_path!r}，"
                          f"下次扫描将重新抓取该文件")

            # 4. 删除主记录或软删除
            if lot.data_source == DataSource.manual:
                lot.status = 'deleted'
            else:
                db.delete(lot)
            deleted_count += 1
    
    db.commit()
    return {"deleted": deleted_count}


class LotDisplayUpdate(BaseModel):
    filename: Optional[str] = None
    lot_id: Optional[str] = None
    wafer_id: Optional[str] = None
    data_type: Optional[str] = None
    test_machine: Optional[str] = None



@router.patch("/{lot_id}/display")
def update_lot_display(
    lot_id: int,
    data: LotDisplayUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="LOT not found")

    from app.models.lot import DataSource
    if lot.data_source == DataSource.ftp:
        if current_user.role not in ['admin', 'eng']:
            raise HTTPException(status_code=403, detail="Permission denied")
    elif current_user.role != 'admin' and lot.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")

    updated_fields = {}
    for field in ("filename", "lot_id", "wafer_id", "data_type", "test_machine"):
        value = getattr(data, field)
        if value is None:
            continue
        normalized = value.strip()
        if field == "filename" and not normalized:
            raise HTTPException(status_code=400, detail="Display name cannot be empty")
        if field == "data_type" and normalized.upper() not in {"CP", "FT", "QA", "MP_YIELD"}:
            raise HTTPException(status_code=400, detail="Data Type 只能是 CP / FT / QA / MP_YIELD")
        if field == "data_type":
            normalized = normalized.upper()
        setattr(lot, field, normalized)
        updated_fields[field] = normalized

    if not updated_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    db.commit()
    db.refresh(lot)
    return {
        "id": lot.id,
        "filename": lot.filename,
        "lot_id": lot.lot_id,
        "wafer_id": lot.wafer_id,
        "data_type": lot.data_type,
        "test_machine": lot.test_machine,
    }


class MergeRequest(BaseModel):
    ids: List[int]
    new_name: str
    new_lot_id: str = ""
    new_wafer_id: str = ""


class MergeManyRequest(BaseModel):
    ids: List[int]
    new_name: str
    new_lot_id: str = ""
    new_wafer_id: str = ""

@router.post("/merge")
def merge_lots(data: MergeRequest, db: Session = Depends(get_db)):
    """
    合并多个LOT：
    1. 校验产品名一致
    2. 校验参数名完全一致
    3. 按 test_date 时序合并 parquet，坐标相同保留最后一次
    4. 重新计算统计，生成新 Lot 记录
    """
    import pandas as pd
    from datetime import timezone

    if len(data.ids) < 2:
        raise HTTPException(status_code=400, detail="至少选择2条记录")

    lots = db.query(Lot).filter(Lot.id.in_(data.ids)).all()
    if len(lots) != len(data.ids):
        raise HTTPException(status_code=404, detail="部分LOT不存在")

    # 按 test_date 排序，测试时间早的数据在前；缺失时用 beginning_time/upload_date 兜底。
    lots.sort(key=lambda l: l.test_date or l.beginning_time or l.upload_date or datetime.min)
    print(f"[merge] 合并顺序: {[l.filename for l in lots]}")

    # 1. 校验产品名一致
    def _lot_start_time(lot: Lot):
        return lot.beginning_time or lot.test_date or lot.upload_date or datetime.min

    def _lot_end_time(lot: Lot):
        return lot.ending_time or lot.test_date or lot.beginning_time or lot.upload_date

    lots.sort(key=_lot_start_time)
    merged_beginning_time = min(
        (t for t in (_lot_start_time(lot) for lot in lots) if t),
        default=None,
    )
    last_lot = lots[-1]
    merged_ending_time = _lot_end_time(last_lot)
    print(f"[merge] order: {[l.filename for l in lots]}")

    product_names = set(l.product_name for l in lots if l.product_name)
    if len(product_names) > 1:
        raise HTTPException(status_code=400, detail=f"产品名不一致，无法合并: {product_names}")

    # 2. 读取所有 parquet，校验参数名
    dfs = []
    param_names_list = []
    for lot in lots:
        if not lot.parquet_path or not os.path.exists(lot.parquet_path):
            raise HTTPException(status_code=400, detail=f"LOT {lot.id} 数据文件不存在，无法合并")
        df = pd.read_parquet(lot.parquet_path)
        # 非测试参数列
        meta_cols = {'SITE_NUM', 'SOFT_BIN', 'HARD_BIN', 'X_COORD', 'Y_COORD', 'DIE_ID', 'PART_ID', 'SERIES'}
        param_cols = [c for c in df.columns if c not in meta_cols]
        param_names_list.append(set(param_cols))
        dfs.append(df)

    # 校验参数名一一对应
    ref_params = param_names_list[0]
    for i, pset in enumerate(param_names_list[1:], 1):
        if pset != ref_params:
            diff = ref_params.symmetric_difference(pset)
            raise HTTPException(status_code=400, detail=f"参数名不一致，差异项: {diff}")

    # 3. 按时序拼接，坐标去重保留最后一次
    merged_df = pd.concat(dfs, ignore_index=True)

    has_coords = (
        'X_COORD' in merged_df.columns and
        'Y_COORD' in merged_df.columns and
        merged_df['X_COORD'].notna().any() and
        ((merged_df['X_COORD'] != 0) | (merged_df['Y_COORD'] != 0)).any()
    )

    # if has_coords:
    #     # 注意：此处不应进行去重，应保留所有重复坐标的数据行。
    #     # 因为后续调用 save_stats_to_db 时，它会根据 DataFrame 的顺序自动处理 Original（first）和 Final（last + ever pass）。
    #     # 如果在这里提前去重，会丢失 Original 数据，导致合并后的 Original 和 Final 数据完全一致。
    #     pass

    # 4. 保存新 parquet
    parquet_dir = os.path.join(UPLOAD_DIR, 'parquet')
    os.makedirs(parquet_dir, exist_ok=True)

    # 先建 Lot 记录拿到 id
    ref_lot = lots[0]
    new_lot = Lot(
        filename=data.new_name,
        product_name=ref_lot.product_name,
        lot_id=data.new_lot_id or ref_lot.lot_id,
        wafer_id=data.new_wafer_id or ref_lot.wafer_id,
        program=ref_lot.program,
        test_machine=ref_lot.test_machine,
        handler=ref_lot.handler,
        data_type='FT',
        test_date=merged_beginning_time or ref_lot.test_date,
        beginning_time=merged_beginning_time,
        ending_time=merged_ending_time,
        status='processing',
        data_source='manual',
        storage_type='local',
        upload_date=datetime.now(timezone.utc),
    )
    db.add(new_lot)
    db.commit()
    db.refresh(new_lot)

    parquet_path = os.path.join(parquet_dir, f"lot_{new_lot.id}.parquet")
    merged_df.to_parquet(parquet_path, index=False)
    new_lot.parquet_path = parquet_path
    db.commit()

    # 5. 重新计算统计
    try:
        from app.services.parsers.base import ParsedData
        from app.services.stats import save_stats_to_db

        # 从第一个 lot 的 TestItem 重建 param 元数据
        ref_items = db.query(TestItem).filter(
            TestItem.lot_id == ref_lot.id,
            TestItem.site == 0
        ).order_by(TestItem.item_number).all()

        meta_cols_set = {'SITE_NUM', 'SOFT_BIN', 'HARD_BIN', 'X_COORD', 'Y_COORD', 'DIE_ID', 'PART_ID', 'SERIES'}
        param_names = [it.item_name for it in ref_items]
        param_ll = {it.item_name: it.lower_limit for it in ref_items}
        param_ul = {it.item_name: it.upper_limit for it in ref_items}
        param_units = {it.item_name: it.unit for it in ref_items}

        # Merge real bin names from all source LOTs for the combined LOT.
        def is_default_bin_name(bin_number: int, bin_name: str | None) -> bool:
            if int(bin_number) == 4:
                return False
            name = (bin_name or '').strip()
            return not name or name.lower() == f'bin{int(bin_number)}'.lower()

        bin_name_votes = {}
        bin_name_order = {}
        for order_idx, src_lot in enumerate(lots):
            bin_rows = db.query(BinSummary).filter(
                BinSummary.lot_id == src_lot.id,
                BinSummary.site == 0,
                BinSummary.data_range == 'final'
            ).all()
            for b in bin_rows:
                if is_default_bin_name(b.bin_number, b.bin_name):
                    continue
                key = int(b.bin_number)
                name = str(b.bin_name).strip()
                bin_name_votes.setdefault(key, {})
                bin_name_votes[key][name] = bin_name_votes[key].get(name, 0) + 1
                bin_name_order[(key, name)] = order_idx

        bin_definitions = {}
        bin_definitions[4] = {'name': 'QA'}
        for bin_number, votes in bin_name_votes.items():
            if int(bin_number) == 4:
                continue
            best_name = max(
                votes.keys(),
                key=lambda name: (votes[name], bin_name_order.get((bin_number, name), -1))
            )
            bin_definitions[bin_number] = {'name': best_name}

        for bin_number in sorted(pd.to_numeric(merged_df['SOFT_BIN'], errors='coerce').dropna().astype(int).unique()):
            bin_definitions.setdefault(int(bin_number), {'name': f'Bin{int(bin_number)}'})

        parsed = ParsedData(
            data=merged_df,
            param_names=param_names,
            param_ll=param_ll,
            param_ul=param_ul,
            param_units=param_units,
            bin_definitions=bin_definitions,
        )

        PASS_BINS = [1, 2]
        save_stats_to_db(new_lot, parsed, db, PASS_BINS)

        new_lot.status = 'processed'
        new_lot.finish_date = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        import traceback
        traceback.print_exc()
        new_lot.status = 'failed'
        db.commit()
        raise HTTPException(status_code=500, detail=f"合并统计失败: {e}")

    return {"id": new_lot.id, "filename": new_lot.filename, "status": new_lot.status}


@router.post("/merge_many")
def merge_many_lots(data: MergeManyRequest, db: Session = Depends(get_db)):
    import pandas as pd
    from datetime import timezone

    if len(data.ids) < 2:
        raise HTTPException(status_code=400, detail="至少选择2条记录")

    lots = db.query(Lot).filter(Lot.id.in_(data.ids)).all()
    if len(lots) != len(data.ids):
        raise HTTPException(status_code=404, detail="部分LOT不存在")

    lots.sort(key=lambda l: l.test_date or l.beginning_time or l.upload_date or datetime.min)

    product_names = set(l.product_name for l in lots if l.product_name)
    if len(product_names) > 1:
        raise HTTPException(status_code=400, detail=f"产品名不一致，无法合并: {product_names}")

    dfs = []
    param_meta_by_name: dict[str, dict] = {}
    ref_param_order: list[str] = []
    for idx, lot in enumerate(lots):
        if not lot.parquet_path or not os.path.exists(lot.parquet_path):
            raise HTTPException(status_code=400, detail=f"LOT {lot.id} 数据文件不存在，无法合并")
        df = pd.read_parquet(lot.parquet_path)
        meta_cols = {'SITE_NUM', 'SOFT_BIN', 'HARD_BIN', 'X_COORD', 'Y_COORD', 'DIE_ID', 'PART_ID', 'SERIES'}
        param_cols = [c for c in df.columns if c not in meta_cols]
        if not param_cols:
            raise HTTPException(status_code=400, detail=f"LOT {lot.id} 没有可合并的测试项")

        ref_items = db.query(TestItem).filter(
            TestItem.lot_id == lot.id,
            TestItem.site == 0
        ).order_by(TestItem.item_number).all()
        if not ref_items:
            raise HTTPException(status_code=400, detail=f"LOT {lot.id} 没有测试项定义")
        current_param_names = [it.item_name for it in ref_items]
        if idx == 0:
            ref_param_order = current_param_names
        for it in ref_items:
            param_meta_by_name.setdefault(it.item_name, {
                'lower_limit': it.lower_limit,
                'upper_limit': it.upper_limit,
                'unit': it.unit,
            })

        # 允许 1000 项和 1200 项合并：按 Param Name 对齐，缺失项补空
        aligned_df = pd.DataFrame(index=df.index)
        for pname in ref_param_order:
            if pname in df.columns:
                aligned_df[pname] = df[pname]
            else:
                aligned_df[pname] = None
        for pname in current_param_names:
            if pname not in aligned_df.columns:
                aligned_df[pname] = df[pname] if pname in df.columns else None
                if pname not in ref_param_order:
                    ref_param_order.append(pname)

        merged_cols = [c for c in ref_param_order if c in aligned_df.columns]
        aligned_df = aligned_df[merged_cols]

        # 保留坐标与 bin 等信息在原始 parquet 中；这里仅做测试项拼接统计
        for col in meta_cols:
            if col in df.columns:
                aligned_df[col] = df[col]
        dfs.append(aligned_df)

    merged_df = pd.concat(dfs, ignore_index=True, sort=False)
    for col in ['X_COORD', 'Y_COORD', 'DIE_ID', 'PART_ID', 'SERIES']:
        if col in merged_df.columns:
            merged_df[col] = None

    ref_lot = lots[0]
    merged_beginning_time = min(
        (t for t in (l.beginning_time or l.test_date or l.upload_date for l in lots) if t),
        default=None,
    )
    merged_ending_time = max(
        (t for t in (l.ending_time or l.test_date or l.upload_date for l in lots) if t),
        default=None,
    )

    new_lot = Lot(
        filename=data.new_name,
        product_name=ref_lot.product_name,
        lot_id=data.new_lot_id or ref_lot.lot_id,
        wafer_id=data.new_wafer_id or ref_lot.wafer_id,
        program=ref_lot.program,
        test_machine=ref_lot.test_machine,
        handler=ref_lot.handler,
        data_type=ref_lot.data_type,
        test_date=merged_beginning_time or ref_lot.test_date,
        beginning_time=merged_beginning_time,
        ending_time=merged_ending_time,
        status='processing',
        data_source='manual',
        storage_type='local',
        upload_date=datetime.now(timezone.utc),
    )
    db.add(new_lot)
    db.commit()
    db.refresh(new_lot)

    parquet_dir = os.path.join(UPLOAD_DIR, 'parquet')
    os.makedirs(parquet_dir, exist_ok=True)
    parquet_path = os.path.join(parquet_dir, f"lot_{new_lot.id}.parquet")
    merged_df.to_parquet(parquet_path, index=False)
    new_lot.parquet_path = parquet_path
    db.commit()

    try:
        from app.services.parsers.base import ParsedData
        from app.services.stats import save_stats_to_db

        param_names = [p for p in ref_param_order if p in param_meta_by_name]
        param_ll = {k: v['lower_limit'] for k, v in param_meta_by_name.items() if k in param_names}
        param_ul = {k: v['upper_limit'] for k, v in param_meta_by_name.items() if k in param_names}
        param_units = {k: v['unit'] for k, v in param_meta_by_name.items() if k in param_names}
        parsed = ParsedData(
            data=merged_df,
            param_names=param_names,
            param_ll=param_ll,
            param_ul=param_ul,
            param_units=param_units,
            bin_definitions={},
        )
        PASS_BINS = [1, 2]
        save_stats_to_db(new_lot, parsed, db, PASS_BINS)
        new_lot.status = 'processed'
        new_lot.finish_date = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        import traceback
        traceback.print_exc()
        new_lot.status = 'failed'
        db.commit()
        raise HTTPException(status_code=500, detail=f"合多统计失败: {e}")

    return {"id": new_lot.id, "filename": new_lot.filename, "status": new_lot.status}


class DownloadRequest(BaseModel):
    ids: List[int]


@router.post("/download")
def download_lots(data: DownloadRequest, db: Session = Depends(get_db)):
    """
    下载选中LOT的原始数据文件。
    - 单条且原始文件为ZIP时，直接返回原ZIP不再套包。
    - 其他情况（单条CSV或多条）打包为ZIP返回。
    """
    ids = data.ids
    if not ids:
        raise HTTPException(status_code=400, detail="未选择任何记录")

    lots = db.query(Lot).filter(Lot.id.in_(ids)).all()
    if not lots:
        raise HTTPException(status_code=404, detail="选中的记录不存在")

    # 单条且原始文件是ZIP，直接返回原文件
    if len(lots) == 1:
        lot = lots[0]
        file_path = lot.storage_path
        if file_path and os.path.exists(file_path):
            ext = os.path.splitext(file_path)[-1].lower()
            if ext == '.zip':
                # 确保下载的文件名以 .zip 结尾
                download_name = os.path.basename(file_path)
                if not download_name.lower().endswith('.zip'):
                    download_name = os.path.splitext(download_name)[0] + '.zip'
                return FileResponse(
                    file_path,
                    media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{download_name}"'}
                )

    # 准备ZIP文件（内存流）
    zip_buffer = io.BytesIO()
    added_files = []
    missing_files = []

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for lot in lots:
            file_path = lot.storage_path
            if not file_path or not os.path.exists(file_path):
                missing_files.append(lot.filename)
                continue

            # 使用原始文件名，若重名则加lot_id前缀区分
            arcname = os.path.basename(file_path)
            # 如果存储的文件是 ZIP，但数据库中的文件名不是以 .zip 结尾，将其后缀改为 .zip
            if file_path.lower().endswith('.zip') and not arcname.lower().endswith('.zip'):
                arcname = os.path.splitext(arcname)[0] + '.zip'

            # 检查ZIP中是否已存在同名文件
            existing_names = [info.filename for info in zf.infolist()]
            if arcname in existing_names:
                arcname = f"lot_{lot.id}_{arcname}"

            zf.write(file_path, arcname)
            added_files.append(arcname)

    if not added_files:
        raise HTTPException(status_code=404, detail="所有选中记录的文件均不存在或已丢失")

    zip_buffer.seek(0)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    zip_filename = f"ATE_OriginalData_{timestamp}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'}
    )
