"""Centralized enums for domain constants used across the application."""
from enum import StrEnum

class TaskStatus(StrEnum):
    ACCEPTED = "accepted"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"

class AuditIssueType(StrEnum):
    GHOST = "ghost"
    ORPHAN = "orphan"
    DUPLICATE_ENTRY = "duplicate_entry"

class AuditIssueStatus(StrEnum):
    PENDING = "pending"
    RESOLVED = "resolved"
    IGNORED = "ignored"

class ImageRating(StrEnum):
    SAFE = "safe"
    QUESTIONABLE = "questionable"
    EXPLICIT = "explicit"

class BulkOperationMode(StrEnum):
    REPLACE = "replace"
    APPEND = "append"
    REMOVE = "remove"
