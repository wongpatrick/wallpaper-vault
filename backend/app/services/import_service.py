"""
Backward-compatibility facade for import_service.
Re-exports functionality decomposed into import_parser and import_processor.
"""

from app.services.import_parser import (
    compile_parsing_regex,
    gather_candidates,
    parse_and_validate_candidates,
)
from app.services.import_processor import (
    _import_images_background_task_impl,
    batch_import_sets,
    cleanup_source_directories,
    delete_dir_if_empty,
    delete_dir_if_empty_async,
    execute_import_item,
    import_images_background_task,
    load_image,
    retry_delete,
    retry_delete_sync,
    run_batch_import_background,
    validate_local_paths,
)
from app.db.session import SessionLocal

__all__ = [
    "SessionLocal",
    "gather_candidates",
    "compile_parsing_regex",
    "parse_and_validate_candidates",
    "execute_import_item",
    "validate_local_paths",
    "import_images_background_task",
    "_import_images_background_task_impl",
    "batch_import_sets",
    "run_batch_import_background",
    "retry_delete_sync",
    "retry_delete",
    "delete_dir_if_empty",
    "delete_dir_if_empty_async",
    "cleanup_source_directories",
    "load_image",
]
