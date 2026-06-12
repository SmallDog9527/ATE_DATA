from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.product_mapping import ProductMapping
from app.models.lot import Lot

router = APIRouter(prefix="/products", tags=["products"])


def extract_program_prefix(program: str) -> str:
    """提取程序名前两个下划线之间的字符串作为匹配key"""
    if not program:
        return ""
    # 去掉 .pgs 后缀
    name = program.replace('.pgs', '').replace('.PGS', '')
    parts = name.split('_')
    if len(parts) >= 2:
        return f"{parts[0]}_{parts[1]}"
    return parts[0] if parts else ""


@router.get("/suggest")
def suggest_product(program: str, db: Session = Depends(get_db)):
    """根据程序名前缀查找已有产品名"""
    prefix = extract_program_prefix(program)
    if not prefix:
        return {"product_name": None, "prefix": ""}

    mapping = db.query(ProductMapping).filter(
        ProductMapping.program_prefix == prefix
    ).first()

    return {
        "product_name": mapping.product_name if mapping else None,
        "prefix": prefix
    }


@router.post("/mapping")
def save_mapping(data: dict, db: Session = Depends(get_db)):
    """保存或更新产品名映射"""
    prefix = data.get("prefix")
    product_name = data.get("product_name")

    if not prefix or not product_name:
        raise HTTPException(status_code=400, detail="prefix和product_name不能为空")

    mapping = db.query(ProductMapping).filter(
        ProductMapping.program_prefix == prefix
    ).first()

    if mapping:
        mapping.product_name = product_name
    else:
        mapping = ProductMapping(
            program_prefix=prefix,
            product_name=product_name
        )
        db.add(mapping)

    # 同时更新所有相同前缀的LOT的product_name
    lots = db.query(Lot).filter(
        Lot.program.like(f"{prefix}%")
    ).all()
    for lot in lots:
        lot.product_name = product_name

    db.commit()
    return {"status": "ok", "updated_lots": len(lots)}


@router.get("/list")
def list_mappings(db: Session = Depends(get_db)):
    """列出所有产品映射"""
    mappings = db.query(ProductMapping).all()
    return [
        {"prefix": m.program_prefix, "product_name": m.product_name}
        for m in mappings
    ]