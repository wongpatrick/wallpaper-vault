"""
Pydantic schemas for cross-vault transfer (export, preflight, ingest, finalize, and local move).
"""
from typing import Literal, Optional
from pydantic import BaseModel, Field


class CreatorTransferMeta(BaseModel):
    canonical_name: str = Field(..., description="Canonical name of the creator.")
    type: Optional[str] = Field(None, description="Creator type (e.g., Artist, Studio, AI).")
    notes: Optional[str] = Field(None, description="Creator biography or notes.")
    socials: Optional[list[dict]] = Field(None, description="Creator social links.")


class CharacterTransferMeta(BaseModel):
    name: str = Field(..., description="Character name.")
    franchise_name: Optional[str] = Field(None, description="Associated franchise name, if any.")

    def to_lookup_string(self) -> str:
        """Convert to 'Name (Franchise)' or 'Name' string expected by get_or_create_character."""
        if self.franchise_name:
            return f"{self.name} ({self.franchise_name})"
        return self.name


class ImageTransferMeta(BaseModel):
    id: int = Field(..., description="Source image ID.")
    filename: str = Field(..., description="Image filename.")
    phash: Optional[str] = Field(None, description="64-bit perceptual hash hex string.")
    width: Optional[int] = Field(None, description="Image width in pixels.")
    height: Optional[int] = Field(None, description="Image height in pixels.")
    file_size: Optional[int] = Field(None, description="Image file size in bytes.")
    aspect_ratio: Optional[float] = Field(None, description="Aspect ratio (width / height).")
    aspect_ratio_label: Optional[str] = Field(None, description="Aspect ratio label (e.g., 16:9).")
    sort_order: Optional[int] = Field(None, description="Sort order within the set.")
    notes: Optional[str] = Field(None, description="Image notes.")
    rating: Optional[str] = Field("safe", description="Content rating.")
    dominant_color: Optional[str] = Field(None, description="Dominant hex color.")
    dominant_color_bucket: Optional[str] = Field(None, description="Dominant color bucket.")
    focal_point_x: Optional[int] = Field(50, description="Horizontal focal point percentage (0-100).")
    focal_point_y: Optional[int] = Field(50, description="Vertical focal point percentage (0-100).")
    is_favorite: bool = Field(False, description="Whether the image is marked as favorite.")
    is_blacklisted: bool = Field(False, description="Whether the image is blacklisted.")
    tags: list[str] = Field(default_factory=list, description="Image-level tag names.")
    characters: list[CharacterTransferMeta] = Field(
        default_factory=list, description="Image-level characters with optional franchises."
    )


class SetTransferPackage(BaseModel):
    source_set_id: Optional[int] = Field(None, description="Source vault set ID.")
    title: Optional[str] = Field(None, description="Set title.")
    source_url: Optional[str] = Field(None, description="Original source URL of the set.")
    phash: Optional[str] = Field(None, description="Representative perceptual hash of the set.")
    notes: Optional[str] = Field(None, description="Set notes.")
    creators: list[CreatorTransferMeta] = Field(
        default_factory=list, description="Creators associated with the set."
    )
    tags: list[str] = Field(default_factory=list, description="Set-level tag names.")
    characters: list[CharacterTransferMeta] = Field(
        default_factory=list, description="Set-level characters with optional franchises."
    )
    images: list[ImageTransferMeta] = Field(
        default_factory=list, description="Images included in this transfer package."
    )


class ImagesTransferExportResponse(BaseModel):
    packages: list[SetTransferPackage] = Field(
        default_factory=list,
        description="SetTransferPackage entries grouped by source set for cherry-picked images.",
    )


class TransferPreflightRequest(BaseModel):
    """
    Accepts either a list of SetTransferPackages (`packages`) or single-set fields directly
    so callers can pass a `SetTransferPackage` directly or multiple packages.
    """
    packages: Optional[list[SetTransferPackage]] = Field(None, description="List of set packages to check.")
    source_set_id: Optional[int] = None
    title: Optional[str] = None
    source_url: Optional[str] = None
    phash: Optional[str] = None
    notes: Optional[str] = None
    creators: list[CreatorTransferMeta] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    characters: list[CharacterTransferMeta] = Field(default_factory=list)
    images: list[ImageTransferMeta] = Field(default_factory=list)

    def get_packages(self) -> list[SetTransferPackage]:
        if self.packages is not None:
            return self.packages
        return [
            SetTransferPackage(
                source_set_id=self.source_set_id,
                title=self.title,
                source_url=self.source_url,
                phash=self.phash,
                notes=self.notes,
                creators=self.creators,
                tags=self.tags,
                characters=self.characters,
                images=self.images,
            )
        ]


class SetCollisionItem(BaseModel):
    source_set_id: Optional[int] = Field(None, description="Source set ID that collided.")
    source_title: Optional[str] = Field(None, description="Title of the incoming set.")
    existing_set_id: int = Field(..., description="Matching set ID on the destination vault.")
    existing_title: Optional[str] = Field(None, description="Matching set title on the destination vault.")
    match_reason: Literal["source_url", "title_and_creators"] = Field(
        ..., description="Why the set matched on the destination vault."
    )


class ImageCollisionItem(BaseModel):
    source_image_id: int = Field(..., description="Source image ID that collided.")
    filename: str = Field(..., description="Filename of the incoming image.")
    source_phash: str = Field(..., description="Perceptual hash of the incoming image.")
    existing_image_id: int = Field(..., description="Matching image ID on the destination vault.")
    existing_set_id: int = Field(..., description="Set ID of the matching image on the destination vault.")
    existing_set_title: Optional[str] = Field(
        None, description="Set title of the matching image on the destination vault."
    )
    hamming_distance: int = Field(..., description="pHash Hamming distance (0 = exact match, 1-5 = near duplicate).")


class TaxonomyResolutionSummary(BaseModel):
    existing_creators: list[str] = Field(default_factory=list)
    missing_creators: list[str] = Field(default_factory=list)
    existing_franchises: list[str] = Field(default_factory=list)
    missing_franchises: list[str] = Field(default_factory=list)
    existing_characters: list[str] = Field(default_factory=list)
    missing_characters: list[str] = Field(default_factory=list)
    existing_tags: list[str] = Field(default_factory=list)
    missing_tags: list[str] = Field(default_factory=list)


class TransferPreflightResult(BaseModel):
    transfer_session_id: str = Field(..., description="Unique session ID for staging image uploads.")
    set_collisions: list[SetCollisionItem] = Field(default_factory=list)
    image_collisions: list[ImageCollisionItem] = Field(default_factory=list)
    taxonomy: TaxonomyResolutionSummary = Field(default_factory=TaxonomyResolutionSummary)


class IngestImageResponse(BaseModel):
    transfer_session_id: str = Field(..., description="Staging session ID.")
    source_image_id: int = Field(..., description="Source image ID staged.")
    staged_filename: str = Field(..., description="Filename written in staging folder.")
    status: str = Field("staged", description="Staging status.")


class TransferFinalizeRequest(BaseModel):
    transfer_session_id: str = Field(..., description="Staging session ID from preflight.")
    packages: Optional[list[SetTransferPackage]] = Field(
        None, description="SetTransferPackages to commit."
    )
    package: Optional[SetTransferPackage] = Field(
        None, description="Single SetTransferPackage alternative."
    )
    set_collision_strategy: Literal["merge", "create_new"] = Field(
        "merge", description="How to handle colliding sets on the destination vault."
    )
    skip_duplicate_images: bool = Field(
        True, description="Whether to skip images that collided by pHash during preflight."
    )
    excluded_source_image_ids: list[int] = Field(
        default_factory=list,
        description="Explicit list of source image IDs skipped due to duplicate detection.",
    )
    target_set_id: Optional[int] = Field(
        None, description="Optional destination set ID override for cherry-picked image transfers."
    )
    target_set_title: Optional[str] = Field(
        None, description="Optional new destination set title override for cherry-picked image transfers."
    )

    def get_packages(self) -> list[SetTransferPackage]:
        if self.packages:
            return self.packages
        if self.package:
            return [self.package]
        return []


class TransferFinalizeResponse(BaseModel):
    created_set_ids: list[int] = Field(
        default_factory=list, description="Destination set IDs created or updated."
    )
    transferred_image_count: int = Field(0, description="Number of images committed to the destination vault.")
    skipped_image_count: int = Field(0, description="Number of images skipped due to collision settings.")


class LocalTransferRequest(BaseModel):
    set_id: Optional[int] = Field(None, description="Source set ID to move to another local library path.")
    image_ids: Optional[list[int]] = Field(
        None, description="Selected image IDs to move to another local library path."
    )
    destination_library_path_id: int = Field(
        ..., description="Target LibraryPath ID on the same vault."
    )
    target_set_id: Optional[int] = Field(
        None, description="Optional existing target set ID when moving individual images."
    )
    target_set_title: Optional[str] = Field(
        None, description="Optional new target set title when moving individual images."
    )


class LocalTransferResponse(BaseModel):
    set_ids: list[int] = Field(
        default_factory=list, description="Set IDs updated or created in the destination library path."
    )
    moved_image_count: int = Field(0, description="Number of images physically moved.")
    new_local_paths: list[str] = Field(
        default_factory=list, description="New filesystem directory paths for the affected sets."
    )
