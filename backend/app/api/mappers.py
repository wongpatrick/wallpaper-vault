"""
Model-to-schema serialization mappers for API responses.
"""

from typing import Optional
from app.models.image import Image as ImageModel
from app.schemas.image import ImageDetail, ImageWithContext


def map_image_to_schema(img: "ImageModel") -> ImageDetail:
    """Helper to ensure image model is correctly mapped to schema with string dates."""
    return ImageDetail(
        id=img.id,
        set_id=img.set_id,
        filename=img.filename,
        local_path=img.local_path,
        phash=img.phash,
        width=img.width,
        height=img.height,
        file_size=img.file_size,
        aspect_ratio=img.aspect_ratio,
        aspect_ratio_label=img.aspect_ratio_label,
        sort_order=img.sort_order,
        notes=img.notes,
        rating=img.rating,
        dominant_color=img.dominant_color,
        is_favorite=getattr(img, "is_favorite", False),
        is_blacklisted=getattr(img, "is_blacklisted", False),
        created_at=str(img.created_at),
        tags=[t.name for t in img.tags]
        if "tags" in img.__dict__ and img.tags
        else [],
        characters=[
            f"{c.name} ({c.franchise.name})" if c.franchise else c.name
            for c in img.characters
        ]
        if "characters" in img.__dict__ and img.characters
        else [],
    )


def map_image_to_context_schema(
    img: "ImageModel",
    display_index: Optional[int] = None,
    total_in_set: Optional[int] = None,
) -> ImageWithContext:
    """Helper to map image with set/creator context."""
    base = map_image_to_schema(img)
    has_set = "set" in img.__dict__ and img.set is not None
    set_title = img.set.title if has_set else ""
    creator_names = (
        [c.canonical_name for c in img.set.creators]
        if (has_set and "creators" in img.set.__dict__ and img.set.creators)
        else []
    )
    return ImageWithContext(
        **base.model_dump(),
        set_title=set_title,
        creator_names=creator_names,
        display_index=display_index,
        total_in_set=total_in_set,
    )
