PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS creators (
    id             INTEGER PRIMARY KEY,
    canonical_name TEXT    NOT NULL UNIQUE,
    type           TEXT,
    notes          TEXT,
    socials        TEXT
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
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS set_tags (
    set_id INTEGER NOT NULL REFERENCES sets(id)  ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (set_id, tag_id)
);

CREATE TABLE IF NOT EXISTS image_tags (
    image_id INTEGER NOT NULL REFERENCES images(id)  ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    PRIMARY KEY (image_id, tag_id)
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
    rating             TEXT    DEFAULT 'safe',
    dominant_color     TEXT,
    is_favorite        INTEGER NOT NULL DEFAULT 0,
    is_blacklisted     INTEGER NOT NULL DEFAULT 0,
    date_added         TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS playlists (
    id           INTEGER PRIMARY KEY,
    name         TEXT    NOT NULL UNIQUE,
    description  TEXT,
    is_smart     INTEGER NOT NULL DEFAULT 0,
    rules        TEXT, -- Stores the JSON filter rules for smart playlists
    date_created TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS playlist_images (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    image_id    INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, image_id)
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
CREATE INDEX IF NOT EXISTS idx_image_tags_image_id             ON image_tags(image_id);
CREATE INDEX IF NOT EXISTS idx_image_tags_tag_id               ON image_tags(tag_id);

INSERT OR IGNORE INTO settings (key, value, description) VALUES ('ai_auto_tag_enabled', 'false', 'Enable AI auto tagging on import');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('ai_model_source', 'predefined', 'Source of the AI model: predefined, huggingface, or local');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('ai_model_type', 'wd14_onnx', 'Model type for AI auto tagging');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('ai_model_custom_repo', '', 'Custom Hugging Face model repository ID');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('ai_model_custom_path', '', 'Custom local filesystem folder path containing the model files');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('ai_confidence_threshold', '0.35', 'Confidence threshold (0.0 to 1.0) for tagger to apply tags to images');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('ai_rollup_threshold', '0.3', 'Rollup threshold (0.0 to 1.0) to promote tags to sets');

CREATE TABLE IF NOT EXISTS rotation_history (
    id           INTEGER PRIMARY KEY,
    timestamp    TEXT    NOT NULL DEFAULT (datetime('now')),
    image_id     INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    aspect_ratio TEXT
);

INSERT OR IGNORE INTO settings (key, value, description) VALUES ('wallpaper_rotation_mode', 'displayfusion', 'Wallpaper rotation mode: displayfusion or native');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('wallpaper_rotation_interval', '15', 'Wallpaper rotation interval in minutes (for native mode)');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('favorite_rotation_probability', '0.4', 'Probability rate (0.0 to 1.0) to select favorite wallpapers in random rotations');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('wallpaper_rotation_source', 'entire_library', 'Wallpaper rotation source: entire_library or playlist');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('wallpaper_rotation_playlist_id', '', 'Target playlist ID to rotate (for playlist source)');
INSERT OR IGNORE INTO settings (key, value, description) VALUES ('wallpaper_rotation_target_monitor', 'all', 'Target monitor: all, or 0, 1, 2, etc.');
