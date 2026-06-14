"""
Custom domain exceptions for the application.

These exceptions should be raised by the Service layer to indicate business
logic or file system failures, and caught by the API layer to return
appropriate HTTP status codes.
"""

class AppError(Exception):
    """Base class for all application-specific exceptions."""
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

class ResourceNotFoundError(AppError):
    """Raised when a requested resource (database record or file) is not found."""
    pass

class DuplicateResourceError(AppError):
    """Raised when attempting to create a resource that already exists."""
    pass

class FileSystemError(AppError):
    """Raised when a file system operation (read/write/move/delete) fails."""
    pass
