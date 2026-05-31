"""
Pydantic schemas for library tools.
Defines models for audit issues, fix actions, and other maintenance tools.
"""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime

class AuditIssueBase(BaseModel):
    task_id: str = Field(..., description="ID of the audit task that discovered this issue.")
    issue_type: str = Field(..., description="Type of issue: 'ghost' (DB record with no file) or 'orphan' (file with no DB record).")
    path: str = Field(..., description="The file path associated with the issue.")
    directory: Optional[str] = Field(None, description="The parent directory of the file, useful for grouping.")
    image_id: Optional[int] = Field(None, description="The DB image ID if applicable (e.g., for ghost records).")
    set_id: Optional[int] = Field(None, description="The DB set ID if applicable.")
    expected_phash: Optional[str] = Field(None, description="The expected perceptual hash if known.")
    found_phash: Optional[str] = Field(None, description="The actual perceptual hash calculated during the scan.")
    match_issue_id: Optional[int] = Field(None, description="ID of a related issue if they are paired (e.g., a moved file).")
    status: str = Field("pending", description="Resolution status: 'pending', 'resolved', 'ignored'.")

class AuditIssue(AuditIssueBase):
    id: int = Field(..., description="Unique identifier for the audit issue.")
    created_at: datetime = Field(..., description="When the issue was discovered.")
    
    # Context for UI
    set_title: Optional[str] = Field(None, description="Title of the associated set for UI display.")
    creator_name: Optional[str] = Field(None, description="Name of the associated creator for UI display.")

    model_config = ConfigDict(from_attributes=True)

class AuditIssuePage(BaseModel):
    items: List[AuditIssue] = Field(..., description="Paginated list of audit issues.")
    total: int = Field(..., description="Total number of issues matching the query.")
    skip: int = Field(..., description="Number of items skipped.")
    limit: int = Field(..., description="Maximum number of items returned.")

class AuditStartRequest(BaseModel):
    deep_scan: bool = Field(False, description="If true, recalculates file hashes to verify integrity rather than just checking existence.")

class AuditFixAction(BaseModel):
    issue_ids: List[int] = Field(..., description="List of issue IDs to apply the fix to.")
    action: str = Field(..., description="The resolution action: 'purge', 'import', 'repair', 'delete_file', 'ignore'.")
