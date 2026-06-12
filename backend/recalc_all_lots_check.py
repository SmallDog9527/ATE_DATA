import os
import sys
import logging

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.lot import Lot
from app.services.stats import run_lot_auto_check

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def recalc_all():
    db = SessionLocal()
    try:
        from sqlalchemy import or_
        logger.info("Recalculating check_status for all existing processed lots (skipping green lots)...")
        lots = db.query(Lot).filter(
            Lot.status == 'processed',
            or_(Lot.check_status != 'green', Lot.check_status.is_(None))
        ).all()
        updated_count = 0
        for lot in lots:
            status = run_lot_auto_check(lot, db)
            if status:
                lot.check_status = status
                updated_count += 1
                logger.info(f"Lot id={lot.id} ({lot.filename}) set to {status}")
        db.commit()
        logger.info(f"Done. Recalculated {len(lots)} lots. Updated {updated_count} lots with active configurations.")
    except Exception as e:
        db.rollback()
        logger.error(f"Error recalculating: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    recalc_all()
