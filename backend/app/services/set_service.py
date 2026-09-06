"""
Backward-compatibility facade for set_service.
Re-exports functionality decomposed into set_crud_service, set_filesystem_service, and set_tagging_service.
"""

from app.services.set_crud_service import (
    bulk_delete_sets,
    bulk_update_sets,
    create_set,
    delete_set,
    import_set,
    merge_sets,
    update_set,
)
from app.services.set_filesystem_service import (
    check_and_clear_stale_thumbnails,
    rename_set_folder_if_needed,
    resync_set,
)
from app.services.set_tagging_service import (
    auto_tag_set,
    run_auto_tag_set_background,
)

__all__ = [
    "rename_set_folder_if_needed",
    "create_set",
    "update_set",
    "merge_sets",
    "import_set",
    "bulk_update_sets",
    "check_and_clear_stale_thumbnails",
    "resync_set",
    "auto_tag_set",
    "run_auto_tag_set_background",
    "delete_set",
    "bulk_delete_sets",
]
