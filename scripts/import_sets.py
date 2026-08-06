"""
Bulk import wallpapers into SQLite database from structured folder hierarchy.
Uses RuleEngine to parse filenames into creator and set metadata.
"""

from collections import defaultdict
from pathlib import Path
import sys
import sqlite3

from rule_engine import RuleEngine

SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}

# Global RuleEngine instance
rule_engine = RuleEngine()


def parse_filename(filename: str) -> tuple[list[str], str, bool]:
    """
    Delegates filename parsing to the declarative RuleEngine.
    Returns: (creators_list, set_title, auto_insert_boolean)
    """
    return rule_engine.parse(filename)


# ── Directory scanner ──────────────────────────────────────────────────────────

def scan_directory(root: Path):
    """
    Scans root for a two-level structure:
      root/
        <aspect_ratio>/          e.g. 16x10
          <tag>/                 e.g. Christmas  ← subfolder = tag
            image.jpg
          image.jpg              ← images directly in aspect ratio folder (no tag)

    Returns: { aspect_ratio: (grouped, auto_flags, creator_map, tag_map) }
    """
    results = {}

    for aspect_dir in sorted(root.iterdir()):
        if not aspect_dir.is_dir():
            continue

        grouped = defaultdict(lambda: defaultdict(list))
        auto_flags = {}
        creator_map = {}
        tag_map = defaultdict(list)

        for item in sorted(aspect_dir.rglob('*')):
            if not item.is_file() or item.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue

            creators, set_title, auto_insert = parse_filename(item.name)
            creator_key = creators[0] if creators else "UNKNOWN"

            grouped[creator_key][set_title].append(item)
            auto_flags[(creator_key, set_title)] = auto_insert
            creator_map[(creator_key, set_title)] = creators

            rel = item.relative_to(aspect_dir)
            if len(rel.parts) > 1:
                folder_tag = rel.parts[0]
                if folder_tag not in tag_map[(creator_key, set_title)]:
                    tag_map[(creator_key, set_title)].append(folder_tag)

        if grouped:
            results[aspect_dir.name] = (grouped, auto_flags, creator_map, dict(tag_map))

    return results


# ── Database Operations ───────────────────────────────────────────────────────

def get_or_create_creator(conn, name: str, creator_type: str) -> tuple[int, bool]:
    cur = conn.cursor()
    cur.execute("SELECT id FROM creators WHERE name = ?", (name,))
    row = cur.fetchone()
    if row:
        return row[0], False
    cur.execute(
        "INSERT INTO creators (name, type) VALUES (?, ?)",
        (name, creator_type)
    )
    return cur.lastrowid, True


def set_exists(conn, title: str, creator_id: int) -> bool:
    cur = conn.cursor()
    cur.execute("""
        SELECT 1 FROM sets s
        JOIN set_creators sc ON sc.set_id = s.id
        WHERE s.title = ? AND sc.creator_id = ?
    """, (title, creator_id))
    return cur.fetchone() is not None


def insert_set(conn, title: str, creator_ids: list[int], creator_type: str,
               tags: list[str], notes: str, image_paths: list[Path], aspect_ratio_label: str) -> tuple[int, int]:
    cur = conn.cursor()
    primary_creator_id = creator_ids[0]

    cur.execute("""
        INSERT INTO sets (title, creator_id, date_added, notes)
        VALUES (?, ?, datetime('now'), ?)
    """, (title, primary_creator_id, notes or None))
    set_id = cur.lastrowid

    for cid in creator_ids:
        cur.execute("""
            INSERT OR IGNORE INTO set_creators (set_id, creator_id)
            VALUES (?, ?)
        """, (set_id, cid))

    for tag_name in tags:
        cur.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
        row = cur.fetchone()
        if row:
            tag_id = row[0]
        else:
            cur.execute("INSERT INTO tags (name) VALUES (?)", (tag_name,))
            tag_id = cur.lastrowid
        cur.execute("""
            INSERT OR IGNORE INTO set_tags (set_id, tag_id)
            VALUES (?, ?)
        """, (set_id, tag_id))

    inserted_images = 0
    for path in image_paths:
        try:
            filename = path.name
            file_path_str = str(path.resolve())

            cur.execute("SELECT id FROM images WHERE file_path = ?", (file_path_str,))
            if cur.fetchone():
                continue

            width, height, aspect_ratio = 0, 0, 0.0
            try:
                from PIL import Image as PILImage
                with PILImage.open(path) as img:
                    width, height = img.size
                    aspect_ratio = round(width / height, 4) if height else 0.0
            except Exception:
                pass

            cur.execute("""
                INSERT INTO images (
                    set_id, filename, file_path, width, height, aspect_ratio, date_added
                ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            """, (set_id, filename, file_path_str, width, height, aspect_ratio))
            inserted_images += 1
        except Exception as e:
            print(f"    Error inserting image {path.name}: {e}")

    conn.commit()
    return set_id, inserted_images


# ── Interactive / Auto Import ─────────────────────────────────────────────────

def auto_import(conn, creators: list[str], set_title: str, image_paths: list[Path],
                aspect_ratio_label: str, folder_tags: list[str]) -> bool:
    creator_type = "cosplayer"
    creator_ids = []
    new_flags = []
    for name in creators:
        cid, is_new = get_or_create_creator(conn, name, creator_type)
        creator_ids.append(cid)
        new_flags.append(is_new)

    if set_exists(conn, set_title, creator_ids[0]):
        print(f"  [AUTO-SKIP] '{set_title}' by '{' & '.join(creators)}' already in DB.")
        return False

    set_id, inserted_images = insert_set(
        conn, set_title, creator_ids, creator_type,
        folder_tags, "", image_paths, aspect_ratio_label
    )
    status = "new" if any(new_flags) else "existing"
    tags_str = f" | Tags: {', '.join(folder_tags)}" if folder_tags else ""
    print(f"  [AUTO-INSERT] set_id={set_id} | '{set_title}' by {' & '.join(creators)} ({status}) | {inserted_images} images{tags_str}")
    return True


def prompt(text: str, default: str = "") -> str:
    val = input(f"  {text} [{default}]: ").strip()
    return val if val else default


def review_and_import(conn, creators: list[str], set_title: str, image_paths: list[Path],
                      aspect_ratio_label: str, folder_tags: list[str]) -> bool:
    print(f"\n  Proposed Creator(s) : {' & '.join(creators)}")
    print(f"  Proposed Set Title  : {set_title}")
    print(f"  Folder Tags         : {', '.join(folder_tags) if folder_tags else 'none'}")
    print(f"  Image Count         : {len(image_paths)}")
    print(f"  Sample Image        : {image_paths[0].name if image_paths else 'N/A'}")

    while True:
        action = input("  Action — [a]ccept / [e]dit / [s]kip / [q]uit: ").strip().lower()

        if action == "q":
            print("\n  Quitting. Progress has been saved.")
            sys.exit(0)

        if action == "s":
            print("  Skipped.\n")
            return False

        if action in ("a", "e"):
            if action == "e":
                print()
                edited = prompt("Creator(s) — separate collabs with &", " & ".join(creators))
                creators = [c.strip() for c in edited.split("&") if c.strip()]
                set_title = prompt("Set title", set_title)

            creator_type = prompt("Creator type (cosplayer/artist/photographer)", "cosplayer")
            default_tags = ", ".join(folder_tags) if folder_tags else ""
            tags_input = prompt("Tags (comma-separated, or leave blank)", default_tags)
            notes_input = prompt("Notes", "")

            tags = [t.strip() for t in tags_input.split(",") if t.strip()] if tags_input else []

            creator_ids = []
            new_flags = []
            for name in creators:
                cid, is_new = get_or_create_creator(conn, name, creator_type)
                creator_ids.append(cid)
                new_flags.append(is_new)

            if set_exists(conn, set_title, creator_ids[0]):
                print(f"\n  DUPLICATE: '{set_title}' by '{' & '.join(creators)}' already in DB. Skipping.\n")
                return False

            set_id, inserted_images = insert_set(
                conn, set_title, creator_ids, creator_type,
                tags, notes_input, image_paths, aspect_ratio_label
            )

            status = "new" if any(new_flags) else "existing"
            print(f"\n  Inserted : set_id={set_id}, creator(s)={creator_ids} ({status})")
            print(f"  Images   : {inserted_images} inserted")
            if tags:
                print(f"  Tags     : {', '.join(tags)}")
            print()
            return True

        print("  Invalid input — enter a, e, s, or q.")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    args = [arg for arg in sys.argv[1:] if arg != "--dry-run"]
    dry_run = "--dry-run" in sys.argv

    if len(args) < 1:
        print("Usage: python import_sets.py [--dry-run] <wallpaper_directory> [path/to/wallpapers.db]")
        print("Example: python import_sets.py --dry-run \"C:\\Users\\you\\Pictures\" ..\\wallpapers.db")
        sys.exit(1)

    root = Path(args[0])
    db_path = Path(args[1]) if len(args) > 1 else Path("wallpapers.db")

    if not root.exists() or not root.is_dir():
        print(f"Directory not found: {root}")
        sys.exit(1)

    if not dry_run and not db_path.exists():
        print(f"Database not found: {db_path}")
        print("Run: sqlite3 wallpapers.db < db/schema.sql")
        sys.exit(1)

    print(f"\n  Scanning: {root} {'[DRY RUN]' if dry_run else ''}")
    all_folders = scan_directory(root)

    if not all_folders:
        print("  No images found.")
        sys.exit(0)

    total_sets = sum(
        len(sets)
        for grouped, _, _cm, _tm in all_folders.values()
        for sets in grouped.values()
    )
    total_creators = len(set(
        creator
        for grouped, _, _cm, _tm in all_folders.values()
        for creator in grouped.keys()
    ))

    print(f"  Found {total_sets} sets across {total_creators} creators in {len(all_folders)} folder(s).")
    if dry_run:
        print("  [DRY RUN MODE] Parsed output overview:\n")
        for folder_name in sorted(all_folders.keys()):
            grouped, auto_flags, creator_map, tag_map = all_folders[folder_name]
            print(f"  == Folder: {folder_name} ==")
            for creator_key, sets in sorted(grouped.items()):
                for set_title, image_paths in sets.items():
                    auto = auto_flags.get((creator_key, set_title), False)
                    creators = creator_map.get((creator_key, set_title), [creator_key])
                    mode = "AUTO" if auto else "MANUAL"
                    print(f"    - [{mode}] Creator(s): {' & '.join(creators)} | Title: {set_title} ({len(image_paths)} images)")
        print("\n  Dry run complete. No database changes made.")
        sys.exit(0)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")

    print(f"  DB: {db_path}\n")
    input("  Press Enter to begin review...")

    inserted = 0
    skipped = 0
    unknowns = []

    for folder_name in sorted(all_folders.keys()):
        grouped, auto_flags, creator_map, tag_map = all_folders[folder_name]
        print(f"\n\n  == Folder: {folder_name} ==")

        sorted_creators = sorted(
            grouped.items(),
            key=lambda x: (x[0] == "UNKNOWN", x[0].lower())
        )

        for creator_name, sets in sorted_creators:
            for set_title, image_paths in sorted(sets.items()):
                auto = auto_flags.get((creator_name, set_title), False)
                creators = creator_map.get((creator_name, set_title), [creator_name])
                folder_tags = tag_map.get((creator_name, set_title), [])

                if creators == ["UNKNOWN"]:
                    unknowns.append((folder_name, set_title, image_paths))
                    continue

                if auto:
                    result = auto_import(
                        conn, creators, set_title,
                        image_paths, aspect_ratio_label=folder_name,
                        folder_tags=folder_tags
                    )
                else:
                    result = review_and_import(
                        conn, creators, set_title,
                        image_paths, aspect_ratio_label=folder_name,
                        folder_tags=folder_tags
                    )
                if result:
                    inserted += 1
                else:
                    skipped += 1

    conn.close()

    MAX_PREVIEW_IMAGES = 2
    print(f"\n{'=' * 60}")
    print("  Done.")
    print(f"  Inserted : {inserted} set(s)")
    print(f"  Skipped  : {skipped} set(s)")
    if unknowns:
        print(f"  Unknown  : {len(unknowns)} file(s) — could not parse")
        print(f"{'=' * 60}")
        print("\n  UNKNOWN FILES — review manually and add parser rules:\n")
        for folder_name, filename, image_paths in unknowns:
            print(f"  [{folder_name}] {filename}")
            for p in image_paths[:MAX_PREVIEW_IMAGES]:
                print(f"    {p.name}")
            if len(image_paths) > MAX_PREVIEW_IMAGES:
                print(f"    ... and {len(image_paths) - MAX_PREVIEW_IMAGES} more")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
