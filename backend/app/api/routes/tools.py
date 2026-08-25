import os
import io
import shutil
import zipfile
import tarfile
import tempfile
import subprocess
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, Response
from app.tools.add_function_time import process_directory

router = APIRouter(prefix="/tools", tags=["tools"])

def extract_archive(archive_path: str, extract_dir: str):
    """
    Extract various archive formats into extract_dir.
    Supports .zip, .tar, .tar.gz, .tgz, and unar for .7z / .rar.
    """
    lower_name = archive_path.lower()
    if lower_name.endswith(".zip"):
        with zipfile.ZipFile(archive_path, 'r') as zf:
            zf.extractall(extract_dir)
    elif lower_name.endswith((".tar", ".tar.gz", ".tgz", ".tar.bz2")):
        with tarfile.open(archive_path, 'r:*') as tf:
            tf.extractall(extract_dir)
    else:
        # Fallback to shutil or unar if available
        try:
            shutil.unpack_archive(archive_path, extract_dir)
        except Exception:
            # Try unar CLI if installed
            try:
                subprocess.run(["unar", "-o", extract_dir, "-f", archive_path], check=True, capture_output=True)
            except Exception as e:
                raise ValueError(f"Unsupported or corrupted archive file: {e}")

def create_zip_from_dir(source_dir: str, output_zip_path: str):
    """
    Compress the entire contents of source_dir into output_zip_path.
    """
    with zipfile.ZipFile(output_zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, source_dir)
                zf.write(file_path, arcname=rel_path)

@router.post("/add-function-time/process")
async def process_add_function_time(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Accepts an uploaded compressed program file, unpacks it, executes add_function_time.py
    to inject test timing code, repacks the modified files into a zip archive, and returns it.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing upload filename")

    # Create temporary directory for processing
    temp_work_dir = tempfile.mkdtemp(prefix="tool1_")
    
    def cleanup_temp_dir():
        if os.path.exists(temp_work_dir):
            shutil.rmtree(temp_work_dir, ignore_errors=True)

    try:
        archive_path = os.path.join(temp_work_dir, file.filename)
        with open(archive_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        extract_dir = os.path.join(temp_work_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)

        # Unpack archive
        extract_archive(archive_path, extract_dir)

        # Run add_function_time tool
        result = process_directory(extract_dir)
        if not result.get("success"):
            cleanup_temp_dir()
            raise HTTPException(status_code=400, detail=result.get("message", "Processing failed"))

        # Repack into a target zip
        base_name, _ = os.path.splitext(file.filename)
        out_filename = f"{base_name}_with_time.zip"
        output_zip_path = os.path.join(temp_work_dir, out_filename)

        create_zip_from_dir(extract_dir, output_zip_path)

        if not os.path.exists(output_zip_path):
            cleanup_temp_dir()
            raise HTTPException(status_code=500, detail="Failed to create output archive")

        # Register cleanup after response is sent
        background_tasks.add_task(cleanup_temp_dir)

        return FileResponse(
            path=output_zip_path,
            filename=out_filename,
            media_type="application/zip",
            headers={
                "Access-Control-Expose-Headers": "Content-Disposition, Content-Length"
            }
        )

    except HTTPException:
        cleanup_temp_dir()
        raise
    except Exception as e:
        cleanup_temp_dir()
        raise HTTPException(status_code=500, detail=f"Failed to process archive: {str(e)}")
