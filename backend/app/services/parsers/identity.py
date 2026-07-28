import os
import re
from dataclasses import dataclass
from typing import Optional


# Support both letter-starting (e.g. KA07426) and digit-starting (e.g. 1A7T55) Lot IDs
LOT_RE = re.compile(r'(?<![A-Z0-9])([A-Z0-9]{5,6}\d)(?![A-Z0-9])', re.IGNORECASE)
WAFER_WITH_LETTER_RE = re.compile(r'^(0?[1-9]|1\d|2[0-5])[A-Z]\d*$', re.IGNORECASE)
WAFER_RE = re.compile(r'^(?:0?[1-9]|1\d|2[0-5])$')
WAFER_TAG_RE = re.compile(
    r'(?:^|[^A-Z0-9])(?:W|WF|WAFER)[-_ ]?(0?[1-9]|1\d|2[0-5])(?:[^A-Z0-9]|$)',
    re.IGNORECASE,
)
LOT_WAFER_SUFFIX_RE = re.compile(
    r'(?:^|[^A-Z0-9])([A-Z0-9]{5,6}\d)[-_](0?[1-9]|1\d|2[0-5])(?:[A-Z]\d+)?(?:[^A-Z0-9]|$)',
    re.IGNORECASE,
)


@dataclass
class IdentityResolution:
    lot_id: Optional[str]
    wafer_id: Optional[str]
    lot_id_source: Optional[str]
    wafer_id_source: Optional[str]
    lot_conflict: bool = False
    wafer_conflict: bool = False

    def as_dict(self) -> dict:
        return {
            "lot_id": self.lot_id,
            "wafer_id": self.wafer_id,
            "lot_id_source": self.lot_id_source,
            "wafer_id_source": self.wafer_id_source,
            "lot_conflict": self.lot_conflict,
            "wafer_conflict": self.wafer_conflict,
        }


def normalize_lot_id(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    val_str = str(value).strip().upper()
    match = LOT_RE.search(val_str)
    if match:
        matched_str = match.group(1)
        # Ensure Lot ID contains both letters and digits
        if any(c.isalpha() for c in matched_str) and any(c.isdigit() for c in matched_str):
            return matched_str
    return None


def normalize_wafer_id(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip().upper()
    tagged = WAFER_TAG_RE.search(text)
    if tagged:
        return f"{int(tagged.group(1)):02d}"

    lot_suffix = LOT_WAFER_SUFFIX_RE.search(text)
    if lot_suffix:
        return f"{int(lot_suffix.group(2)):02d}"

    if WAFER_RE.fullmatch(text):
        return f"{int(text):02d}"

    tokens = [tok for tok in re.split(r'[^A-Z0-9]+', text) if tok]
    for token in tokens:
        if WAFER_RE.fullmatch(token):
            return f"{int(token):02d}"
        wl_match = WAFER_WITH_LETTER_RE.fullmatch(token)
        if wl_match:
            return f"{int(wl_match.group(1)):02d}"
    return None


def _filename_tokens(filename: str) -> list[str]:
    name = os.path.splitext(os.path.basename(filename))[0].upper()
    return [tok for tok in re.split(r'[_\-\s.]+', name) if tok]


def extract_lot_from_filename(filename: str) -> Optional[str]:
    name = os.path.splitext(os.path.basename(filename))[0].upper()
    match = LOT_RE.search(name)
    return match.group(1) if match else None


def extract_wafer_from_filename(filename: str, lot_id: Optional[str] = None) -> Optional[str]:
    name = os.path.splitext(os.path.basename(filename))[0].upper()
    tagged = WAFER_TAG_RE.search(name)
    if tagged:
        return f"{int(tagged.group(1)):02d}"

    lot_suffix = LOT_WAFER_SUFFIX_RE.search(name)
    if lot_suffix:
        return f"{int(lot_suffix.group(2)):02d}"

    tokens = _filename_tokens(filename)
    normalized_lot = normalize_lot_id(lot_id)
    for idx, token in enumerate(tokens):
        if normalized_lot and normalized_lot in token:
            neighbors = tokens[max(0, idx - 1):idx] + tokens[idx + 1:idx + 2]
            for neighbor in neighbors:
                wafer = normalize_wafer_id(neighbor)
                if wafer:
                    return wafer

    for token in tokens:
        wafer = normalize_wafer_id(token)
        if wafer:
            return wafer
    return None


def resolve_lot_wafer(
    filename: str,
    lot_header: Optional[str],
    wafer_header: Optional[str],
    strict_lot_id: bool = True,
) -> dict:
    header_lot = normalize_lot_id(lot_header) if strict_lot_id else (str(lot_header).strip().upper() if lot_header else None)
    file_lot = extract_lot_from_filename(filename)

    lot_conflict = bool(strict_lot_id and header_lot and file_lot and header_lot != file_lot)
    if header_lot and file_lot and header_lot == file_lot:
        final_lot, lot_source = header_lot, "both"
    elif header_lot:
        final_lot, lot_source = header_lot, "header"
    elif file_lot:
        final_lot, lot_source = file_lot, "filename"
    else:
        final_lot, lot_source = None, None

    header_wafer = normalize_wafer_id(wafer_header)
    file_wafer = extract_wafer_from_filename(filename, final_lot)

    wafer_conflict = bool(header_wafer and file_wafer and header_wafer != file_wafer)
    if header_wafer and file_wafer and header_wafer == file_wafer:
        final_wafer, wafer_source = header_wafer, "both"
    elif header_wafer:
        final_wafer, wafer_source = header_wafer, "header"
    elif file_wafer:
        final_wafer, wafer_source = file_wafer, "filename"
    else:
        final_wafer, wafer_source = None, None

    return IdentityResolution(
        lot_id=final_lot,
        wafer_id=final_wafer,
        lot_id_source=lot_source,
        wafer_id_source=wafer_source,
        lot_conflict=lot_conflict,
        wafer_conflict=wafer_conflict,
    ).as_dict()
