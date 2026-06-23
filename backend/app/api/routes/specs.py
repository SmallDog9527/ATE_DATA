import os
import json
import shutil
import tempfile
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.datasheet_spec import Datasheet, DatasheetParameter, ParameterMapping
from app.models.pgs_upload import PgsUpload
from app.services.spec_service import import_checklist_specs, import_docx_datasheet

router = APIRouter(prefix="/spec", tags=["Specification Comparison"])


def scale_val(val, mult):
    if val is None or mult is None:
        return None
    try:
        return float(val) * float(mult)
    except (ValueError, TypeError):
        return None


def parse_unit_to_multiplier(unit_str: str) -> (float, str):
    """
    Parses a unit string (e.g. 'mA', 'uA', 'V', 'mV') into (base_scale, base_unit).
    """
    if not unit_str:
        return 1.0, ""
    
    unit = unit_str.strip().strip("()[]{}").strip()
    if not unit:
        return 1.0, ""
        
    unit = unit.replace("μ", "u")
    
    base_units = ["ohm", "Ohm", "Ω", "Hz", "hz", "V", "v", "A", "a", "s", "S", "F", "f"]
    matched_base = None
    for bu in base_units:
        if unit.endswith(bu):
            matched_base = bu
            break
            
    if not matched_base:
        if len(unit) > 1 and unit[0] in ('m', 'u', 'n', 'p', 'k', 'K', 'M', 'G'):
            prefix = unit[0]
            base = unit[1:]
        else:
            return 1.0, unit.lower()
    else:
        base = matched_base
        prefix = unit[:-len(matched_base)]
        
    base_lower = base.lower()
    if base_lower in ("ohm", "Ω"):
        base_standard = "ohm"
    elif base_lower == "hz":
        base_standard = "hz"
    elif base_lower == "a":
        base_standard = "a"
    elif base_lower == "v":
        base_standard = "v"
    elif base_lower == "s":
        base_standard = "s"
    elif base_lower == "f":
        base_standard = "f"
    else:
        base_standard = base_lower
        
    prefix_multipliers = {
        "m": 1e-3,
        "u": 1e-6,
        "n": 1e-9,
        "p": 1e-12,
        "k": 1e3,
        "K": 1e3,
        "M": 1e6,
        "G": 1e9,
    }
    
    scale = prefix_multipliers.get(prefix, 1.0)
    return scale, base_standard


def calculate_dynamic_multiplier(ds_unit: str, ate_unit: str) -> Optional[float]:
    """
    Computes the multiplier to convert ATE value to DS value unit.
    """
    if not ds_unit or not ate_unit:
        return None
        
    try:
        ds_scale, ds_base = parse_unit_to_multiplier(ds_unit)
        ate_scale, ate_base = parse_unit_to_multiplier(ate_unit)
        
        if ds_base and ate_base and ds_base == ate_base:
            return float(ate_scale) / float(ds_scale)
    except Exception:
        pass
        
    return None


def compare_limits_status(
    ds_min: Optional[float],
    ds_max: Optional[float],
    ft_min: Optional[float],
    ft_max: Optional[float],
    qa_min: Optional[float],
    qa_max: Optional[float],
    multiplier: float
) -> (str, str):
    """
    Compare ATE limits with Datasheet limits under guard-banding.
    Returns: (status, message)
    - "out_of_spec": ATE limits are wider than Datasheet limits.
    - "warning": QA limits are wider than FT limits.
    - "normal": All limits satisfy: DS_min <= FT_min <= QA_min and QA_max <= FT_max <= DS_max.
    """
    scaled_ft_min = scale_val(ft_min, multiplier)
    scaled_ft_max = scale_val(ft_max, multiplier)
    scaled_qa_min = scale_val(qa_min, multiplier)
    scaled_qa_max = scale_val(qa_max, multiplier)

    oos_reasons = []
    warn_reasons = []

    # Check Out of Spec (OOS): ATE limits are wider than Datasheet specs (QA must be tighter than DS, FT must be tighter than DS)
    if ds_min is not None:
        if scaled_ft_min is not None and scaled_ft_min < ds_min:
            oos_reasons.append(f"FT Min ({scaled_ft_min:.6g}) < DS Min ({ds_min:.6g})")
        if scaled_qa_min is not None and scaled_qa_min < ds_min:
            oos_reasons.append(f"QA Min ({scaled_qa_min:.6g}) < DS Min ({ds_min:.6g})")

    if ds_max is not None:
        if scaled_ft_max is not None and scaled_ft_max > ds_max:
            oos_reasons.append(f"FT Max ({scaled_ft_max:.6g}) > DS Max ({ds_max:.6g})")
        if scaled_qa_max is not None and scaled_qa_max > ds_max:
            oos_reasons.append(f"QA Max ({scaled_qa_max:.6g}) > DS Max ({ds_max:.6g})")

    # Check Warning: FT limits must be tighter than QA limits (FT Min >= QA Min, FT Max <= QA Max)
    if scaled_ft_min is not None and scaled_qa_min is not None and scaled_ft_min < scaled_qa_min:
        warn_reasons.append(f"FT Min ({scaled_ft_min:.6g}) < QA Min ({scaled_qa_min:.6g})")
    if scaled_ft_max is not None and scaled_qa_max is not None and scaled_ft_max > scaled_qa_max:
        warn_reasons.append(f"FT Max ({scaled_ft_max:.6g}) > QA Max ({scaled_qa_max:.6g})")

    if oos_reasons:
        return "out_of_spec", "; ".join(oos_reasons)
    elif warn_reasons:
        return "warning", "; ".join(warn_reasons)
    return "normal", "Pass"


@router.post("/upload-checklist")
def upload_checklist(
    product_name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload and import parameter mapping and specifications from Excel checklist.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type must be Excel (.xlsx, .xls)"
        )

    # Save to a temporary file
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        res = import_checklist_specs(db, tmp_path, product_name)
        return {
            "status": "success",
            "message": f"Successfully imported checklist for product {product_name}",
            "details": res
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse and import checklist: {str(exc)}"
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.post("/upload-datasheet")
def upload_datasheet(
    product_name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload and import specifications from Word DOCX datasheet.
    """
    if not file.filename.endswith(".docx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type must be Word (.docx)"
        )

    # Save to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        res = import_docx_datasheet(db, tmp_path, product_name)
        return {
            "status": "success",
            "message": f"Successfully imported datasheet for product {product_name}",
            "details": res
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse and import datasheet DOCX: {str(exc)}"
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get("/comparison-report")
def get_comparison_report(
    product_name: str,
    upload_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve specification comparison report between datasheet and ATE program.
    """
    # 1. Fetch program upload record
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Program upload record not found")

    # 2. Parse ATE parameters JSON
    if rec.parse_status != "ok" or not rec.parsed_params:
        raise HTTPException(
            status_code=422,
            detail=f"Program parse status is {rec.parse_status}. Cannot perform comparison."
        )

    try:
        ate_params = json.loads(rec.parsed_params)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse ATE program parameters JSON")

    # 3. Find active Datasheet
    datasheet = db.query(Datasheet).filter(Datasheet.product_name == product_name).first()
    if not datasheet:
        return {
            "datasheet": None,
            "comparison_rows": []
        }

    # 4. Fetch parameters and mappings
    ds_params = db.query(DatasheetParameter).filter(
        DatasheetParameter.datasheet_id == datasheet.id
    ).order_by(DatasheetParameter.id.asc()).all()
    mappings = db.query(ParameterMapping).filter(
        ParameterMapping.product_name == product_name,
        ParameterMapping.is_active == True
    ).all()

    # 5. Create lookups
    ds_param_map = {p.symbol: p for p in ds_params}

    mappings_by_ds_symbol = {}
    for m in mappings:
        mappings_by_ds_symbol.setdefault(m.datasheet_symbol, []).append(m)

    ate_param_map = {}
    for p in ate_params:
        sym = p.get("symbol")
        if sym and not p.get("is_qa"):
            ate_param_map[sym] = p

    # 6. Generate report rows
    report_rows = []
    mapped_ds_symbols = set()

    # Process all datasheet parameters
    for dp in ds_params:
        dp_mappings = mappings_by_ds_symbol.get(dp.symbol, [])
        mapped_ds_symbols.add(dp.symbol)

        # Check if it is a category/description row: all spec values (both float values and string text) are null/empty
        def is_empty_spec(val, val_str):
            if val is not None:
                return False
            if val_str is None:
                return True
            s = str(val_str).strip()
            return s == "" or s.lower() in ("nan", "none", "-")

        is_category = (
            is_empty_spec(dp.min_val, dp.min_str) and
            is_empty_spec(dp.typ_val, dp.typ_str) and
            is_empty_spec(dp.max_val, dp.max_str)
        )
        if is_category:
            report_rows.append({
                "datasheet_symbol": dp.symbol,
                "ate_symbol": None,
                "parameter_name": dp.parameter_name,
                "condition": dp.condition,
                "unit": dp.unit,
                "ds_min": None,
                "ds_min_str": dp.min_str,
                "ds_typ": None,
                "ds_typ_str": dp.typ_str,
                "ds_max": None,
                "ds_max_str": dp.max_str,
                "ft_min": None,
                "ft_max": None,
                "qa_min": None,
                "qa_max": None,
                "scaled_ft_min": None,
                "scaled_ft_max": None,
                "scaled_qa_min": None,
                "scaled_qa_max": None,
                "multiplier": 1.0,
                "status": "category",
                "message": "Category Header",
                "remark": dp.remark or ""
            })
            continue

        if not dp_mappings:
            # Unmapped datasheet parameter
            report_rows.append({
                "datasheet_symbol": dp.symbol,
                "ate_symbol": None,
                "parameter_name": dp.parameter_name,
                "condition": dp.condition,
                "unit": dp.unit,
                "ds_min": dp.min_val,
                "ds_min_str": dp.min_str,
                "ds_typ": dp.typ_val,
                "ds_typ_str": dp.typ_str,
                "ds_max": dp.max_val,
                "ds_max_str": dp.max_str,
                "ft_min": None,
                "ft_max": None,
                "qa_min": None,
                "qa_max": None,
                "scaled_ft_min": None,
                "scaled_ft_max": None,
                "scaled_qa_min": None,
                "scaled_qa_max": None,
                "multiplier": 1.0,
                "status": "unmapped",
                "message": "Datasheet parameter has no ATE mapping",
                "remark": dp.remark or "",
                "ate_unit": ""
            })
        else:
            for m in dp_mappings:
                ate_sym = m.ate_symbol
                ate_p = ate_param_map.get(ate_sym)

                if not ate_p:
                     # Mapped but ATE parameter is missing in program
                     report_rows.append({
                         "datasheet_symbol": dp.symbol,
                         "ate_symbol": ate_sym,
                         "parameter_name": dp.parameter_name,
                         "condition": dp.condition,
                         "unit": dp.unit,
                         "ds_min": dp.min_val,
                         "ds_min_str": dp.min_str,
                         "ds_typ": dp.typ_val,
                         "ds_typ_str": dp.typ_str,
                         "ds_max": dp.max_val,
                         "ds_max_str": dp.max_str,
                         "ft_min": None,
                         "ft_max": None,
                         "qa_min": None,
                         "qa_max": None,
                         "scaled_ft_min": None,
                         "scaled_ft_max": None,
                         "scaled_qa_min": None,
                         "scaled_qa_max": None,
                         "multiplier": m.multiplier,
                         "status": "missing_ate",
                         "message": f"Mapped ATE symbol '{ate_sym}' not found in current program",
                         "remark": dp.remark or ""
                     })
                else:
                     # Compare
                     ft_min = ate_p.get("min")
                     ft_max = ate_p.get("max")
                     qa_min = ate_p.get("qa_min")
                     qa_max = ate_p.get("qa_max")

                     multiplier = m.multiplier or 1.0
                     if multiplier == 1.0:
                         dynamic_mult = calculate_dynamic_multiplier(dp.unit, ate_p.get("unit"))
                         if dynamic_mult is not None:
                             multiplier = dynamic_mult

                     scaled_ft_min = scale_val(ft_min, multiplier)
                     scaled_ft_max = scale_val(ft_max, multiplier)
                     scaled_qa_min = scale_val(qa_min, multiplier)
                     scaled_qa_max = scale_val(qa_max, multiplier)

                     status_code, msg = compare_limits_status(
                         dp.min_val, dp.max_val,
                         ft_min, ft_max,
                         qa_min, qa_max,
                         multiplier
                     )

                     report_rows.append({
                          "datasheet_symbol": dp.symbol,
                          "ate_symbol": ate_sym,
                          "parameter_name": dp.parameter_name,
                          "condition": dp.condition,
                          "unit": dp.unit,
                          "ds_min": dp.min_val,
                          "ds_min_str": dp.min_str,
                          "ds_typ": dp.typ_val,
                          "ds_typ_str": dp.typ_str,
                          "ds_max": dp.max_val,
                          "ds_max_str": dp.max_str,
                          "ft_min": ft_min,
                          "ft_max": ft_max,
                          "qa_min": qa_min,
                          "qa_max": qa_max,
                          "scaled_ft_min": scaled_ft_min,
                          "scaled_ft_max": scaled_ft_max,
                          "scaled_qa_min": scaled_qa_min,
                          "scaled_qa_max": scaled_qa_max,
                          "multiplier": multiplier,
                          "status": status_code,
                          "message": msg,
                          "remark": dp.remark or "",
                          "ate_unit": ate_p.get("unit")
                      })

    # Add unmapped active mappings where datasheet symbol doesn't exist in datasheet
    for m in mappings:
        if m.datasheet_symbol not in mapped_ds_symbols:
            ate_sym = m.ate_symbol
            ate_p = ate_param_map.get(ate_sym)

            ft_min = ate_p.get("min") if ate_p else None
            ft_max = ate_p.get("max") if ate_p else None
            qa_min = ate_p.get("qa_min") if ate_p else None
            qa_max = ate_p.get("qa_max") if ate_p else None

            multiplier = m.multiplier or 1.0
            scaled_ft_min = scale_val(ft_min, multiplier)
            scaled_ft_max = scale_val(ft_max, multiplier)
            scaled_qa_min = scale_val(qa_min, multiplier)
            scaled_qa_max = scale_val(qa_max, multiplier)

            report_rows.append({
                "datasheet_symbol": m.datasheet_symbol,
                "ate_symbol": ate_sym,
                "parameter_name": "Unknown (Not in Datasheet)",
                "condition": "",
                "unit": "",
                "ds_min": None,
                "ds_min_str": "",
                "ds_typ": None,
                "ds_typ_str": "",
                "ds_max": None,
                "ds_max_str": "",
                "ft_min": ft_min,
                "ft_max": ft_max,
                "qa_min": qa_min,
                "qa_max": qa_max,
                "scaled_ft_min": scaled_ft_min,
                "scaled_ft_max": scaled_ft_max,
                "scaled_qa_min": scaled_qa_min,
                "scaled_qa_max": scaled_qa_max,
                "multiplier": multiplier,
                "status": "missing_ds",
                "message": f"Datasheet symbol '{m.datasheet_symbol}' in mapping not found in datasheet parameters",
                "remark": "",
                "ate_unit": ate_p.get("unit") if ate_p else ""
            })

    return {
        "datasheet": {
            "product_name": datasheet.product_name,
            "filename": datasheet.filename,
            "revision": datasheet.revision,
            "created_at": datasheet.created_at.isoformat() if datasheet.created_at else None
        },
        "comparison_rows": report_rows
    }


from fastapi.responses import FileResponse

@router.post("/upload-datasheet-to-pgs")
async def upload_datasheet_to_pgs(
    upload_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload and link datasheet to a specific PGS program version.
    """
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Program upload record not found")
        
    if not file.filename.endswith((".docx", ".doc")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type must be Word (.docx, .doc)"
        )
        
    # Standard uploads directory
    from app.core.config import settings
    # We can check UPLOAD_DIR from environment or default to /app/uploads
    upload_dir = os.environ.get("UPLOAD_DIR", "/app/uploads")
    ds_dir = os.path.join(upload_dir, "datasheets")
    os.makedirs(ds_dir, exist_ok=True)
    
    # Generate unique filename to avoid collision
    base_name = os.path.basename(file.filename)
    save_path = os.path.join(ds_dir, f"ds_{rec.id}_{base_name}")
    
    # Overwrite if exists or remove old file
    if rec.datasheet_path and os.path.exists(rec.datasheet_path):
        try:
            os.remove(rec.datasheet_path)
        except Exception:
            pass
            
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
        
    rec.datasheet_filename = base_name
    rec.datasheet_path = save_path
    db.commit()
    
    # Also trigger import if it's docx
    if base_name.endswith(".docx"):
        try:
            import_docx_datasheet(db, save_path, rec.product_name)
        except Exception as exc:
            return {
                "status": "warning",
                "message": f"File uploaded and linked, but parsing specifications failed: {str(exc)}",
                "datasheet_filename": base_name
            }
            
    return {
        "status": "success",
        "message": f"Successfully uploaded and linked datasheet to program version {rec.program_version or rec.filename}",
        "datasheet_filename": base_name
    }


@router.get("/download-datasheet/{upload_id}")
def download_datasheet(
    upload_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Download datasheet file associated with a program version.
    """
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec or not rec.datasheet_path:
        raise HTTPException(status_code=404, detail="Datasheet not found or not uploaded for this version")
        
    if not os.path.exists(rec.datasheet_path):
        raise HTTPException(status_code=404, detail="Datasheet file does not exist on server storage")
        
    return FileResponse(
        path=rec.datasheet_path,
        filename=rec.datasheet_filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


@router.delete("/delete-datasheet/{upload_id}")
def delete_datasheet(
    upload_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete datasheet link and physical file associated with a program version.
    """
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Program version not found")
        
    if rec.datasheet_path:
        if os.path.exists(rec.datasheet_path):
            try:
                os.remove(rec.datasheet_path)
            except Exception:
                pass
        rec.datasheet_path = None
        rec.datasheet_filename = None
        db.commit()
        
    return {"status": "success", "message": "Datasheet file successfully deleted"}


from pydantic import BaseModel

class ParameterMappingUpdate(BaseModel):
    product_name: str
    datasheet_symbol: str
    ate_symbol: str

@router.post("/update-mapping")
def update_parameter_mapping(
    payload: ParameterMappingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update or create a parameter mapping between datasheet symbol and ATE parameter symbol.
    """
    # Find existing active mapping
    m = db.query(ParameterMapping).filter(
        ParameterMapping.product_name == payload.product_name,
        ParameterMapping.datasheet_symbol == payload.datasheet_symbol
    ).first()
    
    if not payload.ate_symbol or payload.ate_symbol.strip() in ('-', ''):
        if m:
            db.delete(m)
            db.commit()
        return {"status": "success", "message": "Parameter mapping removed"}
        
    if m:
        m.ate_symbol = payload.ate_symbol.strip()
        m.is_active = True
    else:
        m = ParameterMapping(
            product_name=payload.product_name,
            datasheet_symbol=payload.datasheet_symbol,
            ate_symbol=payload.ate_symbol.strip(),
            multiplier=1.0,
            is_active=True
        )
        db.add(m)
        
    db.commit()
    return {"status": "success", "message": "Parameter mapping updated successfully"}


class ParameterRemarkUpdate(BaseModel):
    product_name: str
    datasheet_symbol: str
    remark: str

@router.post("/update-remark")
def update_parameter_remark(
    payload: ParameterRemarkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update the remark for a datasheet parameter.
    """
    datasheet = db.query(Datasheet).filter(Datasheet.product_name == payload.product_name).first()
    if not datasheet:
        raise HTTPException(status_code=404, detail="Datasheet not found")
        
    dp = db.query(DatasheetParameter).filter(
        DatasheetParameter.datasheet_id == datasheet.id,
        DatasheetParameter.symbol == payload.datasheet_symbol
    ).first()
    
    if not dp:
        raise HTTPException(status_code=404, detail="Datasheet parameter not found")
        
    dp.remark = payload.remark.strip()
    db.commit()
    return {"status": "success", "message": "Remark updated successfully"}


class ParameterSpecsUpdate(BaseModel):
    product_name: str
    datasheet_symbol: str
    min_str: str
    typ_str: str
    max_str: str

@router.post("/update-specs")
def update_parameter_specs(
    payload: ParameterSpecsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update the min/typ/max specifications for a datasheet parameter.
    """
    datasheet = db.query(Datasheet).filter(Datasheet.product_name == payload.product_name).first()
    if not datasheet:
        raise HTTPException(status_code=404, detail="Datasheet not found")
        
    dp = db.query(DatasheetParameter).filter(
        DatasheetParameter.datasheet_id == datasheet.id,
        DatasheetParameter.symbol == payload.datasheet_symbol
    ).first()
    
    if not dp:
        raise HTTPException(status_code=404, detail="Datasheet parameter not found")
        
    dp.min_str = payload.min_str.strip()
    dp.typ_str = payload.typ_str.strip()
    dp.max_str = payload.max_str.strip()
    
    # Recalculate parsed values
    from app.services.spec_service import parse_numerical_value
    typ_val, _ = parse_numerical_value(dp.typ_str)
    min_val, _ = parse_numerical_value(dp.min_str, typ_val)
    max_val, _ = parse_numerical_value(dp.max_str, typ_val)
    
    dp.typ_val = typ_val
    dp.min_val = min_val
    dp.max_val = max_val
    
    db.commit()
    return {"status": "success", "message": "Specs updated successfully"}

