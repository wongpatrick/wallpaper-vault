from pydantic import BaseModel
from typing import List, Dict, Optional

class LibraryStats(BaseModel):
    total_images: int
    total_sets: int
    total_creators: int
    total_size_bytes: int
    aspect_ratio_distribution: Dict[str, int]

class HealthAlert(BaseModel):
    id: str
    severity: str  # critical, warning, optimization
    message: str
    count: int
    link: str  # Navigation link to resolve the issue

class DashboardData(BaseModel):
    stats: LibraryStats
    health_alerts: List[HealthAlert]
