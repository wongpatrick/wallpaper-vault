"""
Pydantic schemas for the dashboard.
Defines models for library statistics and health alerts displayed on the frontend.
"""
from pydantic import BaseModel, Field
from typing import List, Dict

class LibraryStats(BaseModel):
    total_images: int = Field(..., description="Total number of images in the vault.")
    total_sets: int = Field(..., description="Total number of sets in the vault.")
    total_creators: int = Field(..., description="Total number of unique creators.")
    total_size_bytes: int = Field(..., description="Total disk space used by all images in bytes.")
    aspect_ratio_distribution: Dict[str, int] = Field(..., description="Histogram mapping aspect ratio labels to the count of images.")

class HealthAlert(BaseModel):
    id: str = Field(..., description="Unique identifier for this type of alert.")
    severity: str = Field(..., description="Severity level of the alert: 'critical', 'warning', or 'optimization'.")
    message: str = Field(..., description="Human-readable description of the issue.")
    count: int = Field(..., description="Number of items affected by this issue.")
    link: str = Field(..., description="Navigation path to the tool or view where the issue can be resolved.")

class DashboardData(BaseModel):
    stats: LibraryStats = Field(..., description="Aggregated statistics for the entire library.")
    health_alerts: List[HealthAlert] = Field(..., description="Active health and maintenance alerts requiring user attention.")
