"""
CRUD Layer (Database Access)

Architectural Rule & Convention:
CRUD modules must strictly handle database state operations only (queries, inserts, updates, deletes).
No filesystem I/O operations (e.g. shutil.rmtree, file unlinking, thumbnail generation) or non-DB business logic
are permitted within the CRUD layer. Physical file management and complex workflow orchestration belong in the
service layer (app.services).
"""
