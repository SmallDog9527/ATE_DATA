import os
import pandas as pd
import docx
from sqlalchemy.orm import Session
from app.models.datasheet_spec import Datasheet, DatasheetParameter, ParameterMapping

def parse_numerical_value(val_str, typ_val=None):
    """
    Parse a numerical spec limit from string to float.
    Handles percentage limits (e.g. '+3%', '-3%') relative to typ_val.
    """
    if val_str is None:
        return None, ""
    val_str = str(val_str).strip()
    if not val_str or val_str.lower() in ('nan', 'none', '-'):
        return None, ""
        
    if "%" in val_str:
        try:
            # Clean string and parse percentage fraction
            clean_pct = val_str.replace("%", "").replace("+", "").strip()
            pct_fraction = float(clean_pct) / 100.0
            if typ_val is not None:
                # If value starts with '-', it will be negative, e.g. -0.03
                return typ_val * (1 + pct_fraction), val_str
            return None, val_str
        except ValueError:
            return None, val_str
            
    try:
        clean_val = val_str.replace("+", "").strip()
        return float(clean_val), val_str
    except ValueError:
        return None, val_str

def parse_docx_datasheet(filepath: str) -> list:
    """
    Parse DOCX file and extract Electrical Characteristics parameters.
    Returns list of dicts.
    """
    doc = docx.Document(filepath)
    parameters = []
    
    for table in doc.tables:
        if len(table.rows) < 2:
            continue
            
        header_cells = [c.text.strip() for c in table.rows[0].cells]
        # Check if table has standard EC headers
        if not ("Symbol" in header_cells and "Parameter" in header_cells and "Unit" in header_cells):
            continue
            
        symbol_idx = header_cells.index("Symbol")
        param_idx = header_cells.index("Parameter")
        cond_idx = header_cells.index("Condition") if "Condition" in header_cells else -1
        min_idx = header_cells.index("Min") if "Min" in header_cells else -1
        typ_idx = header_cells.index("Typ") if "Typ" in header_cells else -1
        max_idx = header_cells.index("Max") if "Max" in header_cells else -1
        unit_idx = header_cells.index("Unit")
        
        for row in table.rows[1:]:
            cells = [c.text.strip() for c in row.cells]
            if len(cells) < len(header_cells):
                continue
                
            symbol = cells[symbol_idx]
            parameter = cells[param_idx]
            
            if not symbol:
                continue
                
            # If symbol equals parameter or all cells are identical, it is a category/description row
            is_cat = (symbol == parameter) or (len(set(cells)) == 1)
            if is_cat:
                parameters.append({
                    "symbol": symbol,
                    "parameter_name": "",
                    "condition": "",
                    "min_str": "",
                    "typ_str": "",
                    "max_str": "",
                    "min_val": None,
                    "typ_val": None,
                    "max_val": None,
                    "unit": ""
                })
                continue
                
            condition = cells[cond_idx] if cond_idx != -1 else ""
            min_str = cells[min_idx] if min_idx != -1 else ""
            typ_str = cells[typ_idx] if typ_idx != -1 else ""
            max_str = cells[max_idx] if max_idx != -1 else ""
            unit = cells[unit_idx]
            
            # Extract floats
            typ_val, _ = parse_numerical_value(typ_str)
            min_val, _ = parse_numerical_value(min_str, typ_val)
            max_val, _ = parse_numerical_value(max_str, typ_val)
            
            parameters.append({
                "symbol": symbol,
                "parameter_name": parameter,
                "condition": condition,
                "min_str": min_str,
                "typ_str": typ_str,
                "max_str": max_str,
                "min_val": min_val,
                "typ_val": typ_val,
                "max_val": max_val,
                "unit": unit
            })
            
    return parameters

def import_checklist_specs(db: Session, excel_path: str, product_name: str) -> dict:
    """
    Import specifications and mappings from the ATE checklist file.
    """
    filename = os.path.basename(excel_path)
    
    # Read sheet using header=3 (the 4th row)
    df = pd.read_excel(excel_path, sheet_name='Datasheet vs Test Item', header=3)
    
    # Clean column names (strip trailing spaces)
    df.columns = [c.strip() for c in df.columns]
    
    # Check if necessary columns are present
    required_cols = ['Symbol', 'Parameter', 'Condition', 'Min', 'Typ', 'Max', 'Unit', 'Symbol.1']
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Required column '{col}' is missing from the sheet")
            
    # Delete old records
    old_datasheets = db.query(Datasheet).filter(Datasheet.product_name == product_name).all()
    for ds in old_datasheets:
        db.delete(ds)
    db.query(ParameterMapping).filter(ParameterMapping.product_name == product_name).delete()
    db.commit()
    
    # Create new datasheet entry
    datasheet = Datasheet(
        product_name=product_name,
        filename=filename,
        revision="Checklist Baseline"
    )
    db.add(datasheet)
    db.commit()
    db.refresh(datasheet)
    
    count_params = 0
    count_mappings = 0
    
    for _, row in df.iterrows():
        symbol = str(row['Symbol']).strip() if pd.notna(row['Symbol']) else ""
        ate_symbol = str(row['Symbol.1']).strip() if pd.notna(row['Symbol.1']) else ""
        
        if not symbol or symbol.lower() == 'nan':
            continue
            
        parameter_name = str(row['Parameter']).strip() if pd.notna(row['Parameter']) else ""
        condition = str(row['Condition']).strip() if pd.notna(row['Condition']) else ""
        min_str = str(row['Min']).strip() if pd.notna(row['Min']) else ""
        typ_str = str(row['Typ']).strip() if pd.notna(row['Typ']) else ""
        max_str = str(row['Max']).strip() if pd.notna(row['Max']) else ""
        unit = str(row['Unit']).strip() if pd.notna(row['Unit']) else ""
        
        # Parse numerical values
        typ_val, _ = parse_numerical_value(typ_str)
        min_val, _ = parse_numerical_value(min_str, typ_val)
        max_val, _ = parse_numerical_value(max_str, typ_val)
        
        # Create parameter record
        param = DatasheetParameter(
            datasheet_id=datasheet.id,
            symbol=symbol,
            parameter_name=parameter_name,
            condition=condition,
            min_str=min_str,
            typ_str=typ_str,
            max_str=max_str,
            min_val=min_val,
            typ_val=typ_val,
            max_val=max_val,
            unit=unit
        )
        db.add(param)
        count_params += 1
        
        # Create mapping if ATE symbol exists
        if ate_symbol and ate_symbol.lower() != 'nan':
            mapping = ParameterMapping(
                product_name=product_name,
                datasheet_symbol=symbol,
                ate_symbol=ate_symbol,
                multiplier=1.0,
                is_active=True
            )
            db.add(mapping)
            count_mappings += 1
            
    db.commit()
    return {"parameters_imported": count_params, "mappings_created": count_mappings}


def import_docx_datasheet(db: Session, filepath: str, product_name: str) -> dict:
    """
    Import specifications from the DOCX datasheet file.
    Does NOT delete the mappings since mappings are uploaded via the Excel checklist.
    """
    filename = os.path.basename(filepath)
    
    # Parse parameters from docx
    parsed_params = parse_docx_datasheet(filepath)
    if not parsed_params:
        raise ValueError("No electrical characteristics parameters found in the DOCX datasheet")
        
    # Delete old datasheet metadata and parameters for this product
    old_datasheets = db.query(Datasheet).filter(Datasheet.product_name == product_name).all()
    for ds in old_datasheets:
        db.delete(ds)
    db.commit()
    
    # Create new datasheet entry
    datasheet = Datasheet(
        product_name=product_name,
        filename=filename,
        revision="DOCX Import"
    )
    db.add(datasheet)
    db.commit()
    db.refresh(datasheet)
    
    count_params = 0
    for p in parsed_params:
        param = DatasheetParameter(
            datasheet_id=datasheet.id,
            symbol=p["symbol"],
            parameter_name=p["parameter_name"],
            condition=p["condition"],
            min_str=p["min_str"],
            typ_str=p["typ_str"],
            max_str=p["max_str"],
            min_val=p["min_val"],
            typ_val=p["typ_val"],
            max_val=p["max_val"],
            unit=p["unit"]
        )
        db.add(param)
        count_params += 1
        
    db.commit()
    return {"parameters_imported": count_params}

