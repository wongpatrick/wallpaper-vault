"""
API endpoints for managing wallpaper rotation rules.
Provides listing, creation, updating, deletion, and active rule evaluation.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.db.session import get_db
from app.schemas import rotation_rule as schema
from app.crud import rotation_rule as crud
from app.core.rotation import rotation_broadcaster

logger = structlog.get_logger(__name__)

router = APIRouter()

def evaluate_rule(rule, dt: datetime) -> bool:
    """Helper to check if a single rule matches the given datetime."""
    # 1. Day of week check
    if rule.days_of_week:
        day_str = str(dt.isoweekday())
        allowed_days = [d.strip() for d in rule.days_of_week.split(",") if d.strip()]
        if day_str not in allowed_days:
            return False

    # 2. Date range (MM-DD) check (handles cross-year)
    if rule.start_date and rule.end_date:
        curr_md = dt.strftime("%m-%d")
        start_md = rule.start_date
        end_md = rule.end_date
        if start_md <= end_md:
            if not (start_md <= curr_md <= end_md):
                return False
        else:  # Cross-year range (e.g. 12-15 to 01-15)
            if not (curr_md >= start_md or curr_md <= end_md):
                return False

    # 3. Time range (HH:MM) check (handles cross-midnight)
    if rule.start_time and rule.end_time:
        curr_hm = dt.strftime("%H:%M")
        start_hm = rule.start_time
        end_hm = rule.end_time
        if start_hm <= end_hm:
            if not (start_hm <= curr_hm <= end_hm):
                return False
        else:  # Cross-midnight range (e.g. 22:00 to 06:00)
            if not (curr_hm >= start_hm or curr_hm <= end_hm):
                return False

    return True

@router.get("/", response_model=List[schema.RotationRule])
async def list_rules(db: AsyncSession = Depends(get_db)) -> List[schema.RotationRule]:
    """Retrieve all rotation rules ordered by priority descending."""
    return await crud.get_rotation_rules(db)

@router.get("/active", response_model=Optional[schema.RotationRule])
async def get_active_rule(db: AsyncSession = Depends(get_db)) -> Optional[schema.RotationRule]:
    """
    Evaluate all enabled rules against current system local time and return the
    highest priority matching rule. Returns None if no rules match.
    """
    enabled_rules = await crud.get_active_rotation_rules(db)
    now = datetime.now()
    for rule in enabled_rules:
        if evaluate_rule(rule, now):
            return rule
    return None

@router.get("/{id}", response_model=schema.RotationRule)
async def get_rule(id: int, db: AsyncSession = Depends(get_db)) -> schema.RotationRule:
    """Retrieve a single rule by ID."""
    db_rule = await crud.get_rotation_rule(db, id)
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rotation rule not found")
    return db_rule

@router.post("/", response_model=schema.RotationRule, status_code=status.HTTP_201_CREATED)
async def create_rule(
    rule: schema.RotationRuleCreate,
    db: AsyncSession = Depends(get_db)
) -> schema.RotationRule:
    """Create a new rotation rule and trigger coordinator sync."""
    db_rule = await crud.create_rotation_rule(db, rule)
    await db.commit()
    await rotation_broadcaster.broadcast({"event": "ping"})
    logger.info("Created rotation rule", id=db_rule.id, name=db_rule.name)
    return db_rule

@router.put("/{id}", response_model=schema.RotationRule)
async def update_rule(
    id: int,
    rule_update: schema.RotationRuleUpdate,
    db: AsyncSession = Depends(get_db)
) -> schema.RotationRule:
    """Update a rotation rule and trigger coordinator sync."""
    db_rule = await crud.update_rotation_rule(db, id, rule_update)
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rotation rule not found")
    await db.commit()
    await rotation_broadcaster.broadcast({"event": "ping"})
    logger.info("Updated rotation rule", id=id, name=db_rule.name)
    return db_rule

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(id: int, db: AsyncSession = Depends(get_db)) -> None:
    """Delete a rotation rule and trigger coordinator sync."""
    success = await crud.delete_rotation_rule(db, id)
    if not success:
        raise HTTPException(status_code=404, detail="Rotation rule not found")
    await db.commit()
    await rotation_broadcaster.broadcast({"event": "ping"})
    logger.info("Deleted rotation rule", id=id)
