from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class AuditIssueBase(BaseModel):
    task_id: str
    issue_type: str  # "ghost" or "orphan"
    path: str
    directory: Optional[str] = None
    image_id: Optional[int] = None
    set_id: Optional[int] = None
    expected_phash: Optional[str] = None
    found_phash: Optional[str] = None
    match_issue_id: Optional[int] = None
    status: str = "pending"

class AuditIssue(AuditIssueBase):
    id: int
    created_at: datetime
    
    # Context for UI
    set_title: Optional[str] = None
    creator_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class AuditIssuePage(BaseModel):
    items: List[AuditIssue]
    total: int
    skip: int
    limit: int

class AuditStartRequest(BaseModel):
    # Optional filters or flags for the scan
    deep_scan: bool = False

class AuditFixAction(BaseModel):
    issue_ids: List[int]
    action: str  # "purge", "import", "repair", "delete_file", "ignore"
