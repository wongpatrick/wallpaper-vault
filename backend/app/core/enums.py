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
    EMPTY_SET = "empty_set"
    GHOST_SET = "ghost_set"
    CORRUPTED_IMAGE = "corrupted_image"
    PATH_MISMATCH = "path_mismatch"
    ORPHAN_TAG = "orphan_tag"
    ORPHAN_CREATOR = "orphan_creator"
    ORPHAN_CHARACTER = "orphan_character"


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
