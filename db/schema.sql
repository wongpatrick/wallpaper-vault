PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS creators (
    id             INTEGER PRIMARY KEY,
    canonical_name TEXT    NOT NULL UNIQUE,
    type           TEXT,
    notes          TEXT
);

CREATE TABLE IF NOT EXISTS creator_aliases (
    id         INTEGER PRIMARY KEY,
    creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    alias      TEXT    NOT NULL,
    alias_type TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sets (
    id         INTEGER PRIMARY KEY,
    title      TEXT,
    source_url TEXT UNIQUE,
    local_path TEXT,
    phash      TEXT,
    notes      TEXT,
    date_added TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS set_creators (
    set_id     INTEGER NOT NULL REFERENCES sets(id)     ON DELETE CASCADE,
    creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    role       TEXT,
    PRIMARY KEY (set_id, creator_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS set_tags (
    set_id INTEGER NOT NULL REFERENCES sets(id)  ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (set_id, tag_id)
);

CREATE TABLE IF NOT EXISTS franchises (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS characters (
    id           INTEGER PRIMARY KEY,
    name         TEXT    NOT NULL,
    franchise_id INTEGER REFERENCES franchises(id) ON DELETE SET NULL,
    notes        TEXT
);

CREATE TABLE IF NOT EXISTS character_aliases (
    id           INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    alias        TEXT    NOT NULL,
    alias_type   TEXT
);

CREATE TABLE IF NOT EXISTS set_characters (
    set_id       INTEGER NOT NULL REFERENCES sets(id)       ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    PRIMARY KEY (set_id, character_id)
);

CREATE TABLE IF NOT EXISTS images (
    id                 INTEGER PRIMARY KEY,
    set_id             INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
    filename           TEXT    NOT NULL,
    local_path         TEXT    NOT NULL,
    phash              TEXT,
    width              INTEGER,
    height             INTEGER,
    file_size          INTEGER,
    aspect_ratio       REAL,
    aspect_ratio_label TEXT,
    sort_order         INTEGER,
    notes              TEXT,
    date_added         TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    status        TEXT DEFAULT 'accepted',
    progress      INTEGER DEFAULT 0,
    total         INTEGER DEFAULT 0,
    updated_at    TEXT DEFAULT (datetime('now')),
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS audit_issues (
    id             INTEGER PRIMARY KEY,
    task_id        TEXT    NOT NULL,
    issue_type     TEXT    NOT NULL, -- "ghost" or "orphan"
    path           TEXT    NOT NULL,
    image_id       INTEGER REFERENCES images(id) ON DELETE SET NULL,
    set_id         INTEGER REFERENCES sets(id) ON DELETE SET NULL,
    expected_phash TEXT,
    found_phash    TEXT,
    match_issue_id INTEGER REFERENCES audit_issues(id) ON DELETE SET NULL,
    status         TEXT    NOT NULL DEFAULT 'pending', -- "pending", "resolved", "ignored"
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_issues_task_id  ON audit_issues(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_issues_status   ON audit_issues(status);

CREATE INDEX IF NOT EXISTS idx_creator_aliases_creator_id  ON creator_aliases(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_aliases_alias       ON creator_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_set_creators_set_id         ON set_creators(set_id);
CREATE INDEX IF NOT EXISTS idx_set_creators_creator_id     ON set_creators(creator_id);
CREATE INDEX IF NOT EXISTS idx_set_tags_set_id             ON set_tags(set_id);
CREATE INDEX IF NOT EXISTS idx_set_tags_tag_id             ON set_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_sets_phash                  ON sets(phash);
CREATE INDEX IF NOT EXISTS idx_images_set_id               ON images(set_id);
CREATE INDEX IF NOT EXISTS idx_images_phash                ON images(phash);
CREATE INDEX IF NOT EXISTS idx_images_aspect_ratio_label   ON images(aspect_ratio_label);
CREATE INDEX IF NOT EXISTS idx_characters_franchise_id         ON characters(franchise_id);
CREATE INDEX IF NOT EXISTS idx_character_aliases_character_id  ON character_aliases(character_id);
CREATE INDEX IF NOT EXISTS idx_character_aliases_alias         ON character_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_set_characters_set_id           ON set_characters(set_id);
CREATE INDEX IF NOT EXISTS idx_set_characters_character_id     ON set_characters(character_id);
