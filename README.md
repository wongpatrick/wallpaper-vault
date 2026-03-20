# wallpaper-vault

A personal tool for tracking and organizing wallpaper image sets from cosplayers, artists, and photographers. Prevents duplicate sets, supports multi-creator collabs, and stores per-image metadata for filtering by resolution and aspect ratio.

## Features

- Track image sets with full metadata
- Multi-creator and collab support
- Creator alias management (English, Japanese, Chinese, online handles)
- Tag-based organization
- Duplicate detection via source URL and perceptual hashing
- Per-image resolution and aspect ratio filtering

## Project Structure

```
wallpaper-vault/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── database.py
│   ├── models/
│   └── routers/
├── db/
│   ├── schema.sql
│   └── migrations/
├── scripts/
│   └── import_set.py
├── tests/
├── .gitignore
├── requirements.txt
└── README.md
```

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/wallpaper-vault.git
cd wallpaper-vault
```

### 2. Create the database

```bash
sqlite3 wallpapers.db < db/schema.sql
```

### 3. Install dependencies

```bash
# fill in once stack is decided
```

### 4. Run the app

```bash
# fill in once stack is decided
```

## Database Schema

Five core tables:

- `creators` — artists, cosplayers, photographers
- `creator_aliases` — alternate names per creator (English, Japanese, Chinese, online handles)
- `sets` — image sets with source URL, local path, and perceptual hash
- `set_creators` — join table linking sets to one or more creators (supports collabs)
- `tags` / `set_tags` — tag system for organizing sets
- `images` — individual images within a set, with resolution, aspect ratio, and perceptual hash

See `db/schema.sql` for the full schema.

## Duplicate Detection

Sets are deduplicated primarily by:

1. `source_url` — exact match, catches obvious duplicates immediately
2. `title + creator` pairing — enforced at the application level before insert
3. `phash` — perceptual hash used as a soft hint for visually similar images across sources

## Aspect Ratio Labels

Images are stored with both a decimal `aspect_ratio` (e.g. `1.78`) and a human-readable `aspect_ratio_label` (e.g. `16:9`) computed at import time from width and height. Use `aspect_ratio_label` for filtering.

## Migrations

Schema changes are tracked as numbered SQL files in `db/migrations/`. Run them in order when updating an existing database.

## License

Personal use.
