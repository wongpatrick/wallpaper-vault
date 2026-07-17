"""
CRUD operations for wallpaper rotation rules.
"""
from typing import List, Optional
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.rotation_rule import RotationRule as RotationRuleModel
from app.schemas.rotation_rule import RotationRuleCreate, RotationRuleUpdate

async def get_rotation_rules(db: AsyncSession) -> List[RotationRuleModel]:
    """Retrieves all rotation rules ordered by priority descending, then id ascending."""
    result = await db.execute(
        select(RotationRuleModel).order_by(
            RotationRuleModel.priority.desc(),
            RotationRuleModel.id.asc()
        )
    )
    return result.scalars().all()

async def get_active_rotation_rules(db: AsyncSession) -> List[RotationRuleModel]:
    """Retrieves only enabled rotation rules ordered by priority descending."""
    result = await db.execute(
        select(RotationRuleModel)
        .where(RotationRuleModel.enabled == 1)
        .order_by(
            RotationRuleModel.priority.desc(),
            RotationRuleModel.id.asc()
        )
    )
    return result.scalars().all()

async def get_rotation_rule(db: AsyncSession, rule_id: int) -> Optional[RotationRuleModel]:
    """Retrieves a single rotation rule by ID."""
    result = await db.execute(
        select(RotationRuleModel).where(RotationRuleModel.id == rule_id)
    )
    return result.scalars().first()

async def create_rotation_rule(db: AsyncSession, rule: RotationRuleCreate) -> RotationRuleModel:
    """Creates a new rotation rule."""
    db_rule = RotationRuleModel(
        name=rule.name,
        priority=rule.priority,
        enabled=rule.enabled,
        start_date=rule.start_date,
        end_date=rule.end_date,
        days_of_week=rule.days_of_week,
        start_time=rule.start_time,
        end_time=rule.end_time,
        source=rule.source,
        playlist_id=rule.playlist_id,
        style=rule.style
    )
    db.add(db_rule)
    await db.commit()
    await db.refresh(db_rule)
    return db_rule

async def update_rotation_rule(
    db: AsyncSession, rule_id: int, rule_update: RotationRuleUpdate
) -> Optional[RotationRuleModel]:
    """Updates an existing rotation rule."""
    db_rule = await get_rotation_rule(db, rule_id)
    if not db_rule:
        return None
    
    update_data = rule_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_rule, field, value)
        
    await db.commit()
    await db.refresh(db_rule)
    return db_rule

async def delete_rotation_rule(db: AsyncSession, rule_id: int) -> bool:
    """Deletes a rotation rule."""
    db_rule = await get_rotation_rule(db, rule_id)
    if not db_rule:
        return False
    await db.delete(db_rule)
    await db.commit()
    return True
