from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from app.models.base import Base

class AuditIssue(Base):
    __tablename__ = "audit_issues"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String, index=True)
    issue_type = Column(String)  # "ghost" or "orphan"
    path = Column(Text)
    directory = Column(Text, index=True) # Parent folder for grouping
    
    # Context
    image_id = Column(Integer, ForeignKey("images.id"), nullable=True)
    set_id = Column(Integer, ForeignKey("sets.id"), nullable=True)
    
    # Relationships
    image = relationship("Image")
    set = relationship("Set")
    
    # pHash values for visual matching
    expected_phash = Column(String, nullable=True) # For ghosts
    found_phash = Column(String, nullable=True)    # For orphans
    
    # Match tracking
    match_issue_id = Column(Integer, nullable=True) # Points to another AuditIssue
    
    status = Column(String, default="pending") # "pending", "resolved", "ignored"
    created_at = Column(DateTime, server_default=func.now())
