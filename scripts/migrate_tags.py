import argparse
import os
import sqlite3
from pathlib import Path

def get_db_path(custom_path: str | Path | None = None) -> Path:
    if custom_path:
        return Path(custom_path)
    env_db = os.environ.get("DATABASE_URL")
    if env_db:
        clean_url = env_db.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
        return Path(clean_url)
    return Path(__file__).resolve().parent.parent / "db" / "wallpapers.db"


MAPPING = {
    "christmas winter ganyu genshin": ("Ganyu", "Genshin Impact", ["Christmas", "Winter"]),
    "ganyu genshin": ("Ganyu", "Genshin Impact", []),
    "genshin mavuika": ("Mavuika", "Genshin Impact", []),
    "yoimiya genshin": ("Yoimiya", "Genshin Impact", []),
    "navia genshin": ("Navia", "Genshin Impact", []),
    "tifa finalfantasyvii": ("Tifa", "Final Fantasy VII", []),
    "tifa": ("Tifa", "Final Fantasy VII", []),
    "zzz nicoledemara": ("Nicole Demara", "Zenless Zone Zero", []),
    "nicoledemara": ("Nicole Demara", "Zenless Zone Zero", []),
    "zani wutheringwaves": ("Zani", "Wuthering Waves", []),
    "cantarella wutheringwaves": ("Cantarella", "Wuthering Waves", []),
    "christmas 2b winter": ("2B", "NieR: Automata", ["Christmas", "Winter"]),
    "christmas 2b": ("2B", "NieR: Automata", ["Christmas"]),
    "nikke ol": (None, "NIKKE", ["Ol"]),
    "yor": ("Yor Forger", "Spy x Family", [])
}

def normalize_tag(tag: str) -> str:
    tag = tag.lower().strip()
    if not tag: return None
    
    special = {
        "cny": "Cny",
        "ol": "Ol",
        "kpop": "Kpop",
        "cherryblossom": "Cherry Blossom",
        "guitargirl": "Guitar Girl",
        "swimmingpool": "Swimming Pool",
        "sfw": None
    }
    
    if tag in special:
        return special[tag]
        
    return tag.title()

def main():
    parser = argparse.ArgumentParser(description="Migrate tags in database.")
    parser.add_argument("--db-path", help="Path to SQLite database file")
    args = parser.parse_args()

    db_path = get_db_path(args.db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("Starting Tag Migration...")
    
    cursor.execute("SELECT id, tags FROM sets WHERE tags IS NOT NULL AND tags != ''")
    sets = cursor.fetchall()
    
    print(f"Found {len(sets)} sets with tags to process.")
    
    def get_or_create_franchise(name: str) -> int:
        cursor.execute("SELECT id FROM franchises WHERE name = ?", (name,))
        row = cursor.fetchone()
        if row: return row['id']
        cursor.execute("INSERT INTO franchises (name) VALUES (?)", (name,))
        return cursor.lastrowid
        
    def get_or_create_character(name: str, franchise_id: int) -> int:
        cursor.execute("SELECT id, franchise_id FROM characters WHERE name = ?", (name,))
        row = cursor.fetchone()
        if row:
            if franchise_id and not row['franchise_id']:
                cursor.execute("UPDATE characters SET franchise_id = ? WHERE id = ?", (franchise_id, row['id']))
            return row['id']
        cursor.execute("INSERT INTO characters (name, franchise_id) VALUES (?, ?)", (name, franchise_id))
        return cursor.lastrowid
        
    def get_or_create_tag(name: str) -> int:
        cursor.execute("SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (name,))
        row = cursor.fetchone()
        if row: return row['id']
        cursor.execute("INSERT INTO tags (name) VALUES (?)", (name,))
        return cursor.lastrowid

    migrated_sets = 0
    
    for row in sets:
        set_id = row['id']
        raw_tags = row['tags'].strip()
        
        extracted_chars = []
        extracted_tags = []
        
        matched = False
        for raw_match, (char, franch, extra_tags) in MAPPING.items():
            if raw_tags.lower() == raw_match.lower():
                if franch:
                    fid = get_or_create_franchise(franch)
                    if char:
                        cid = get_or_create_character(char, fid)
                        extracted_chars.append(cid)
                elif char:
                    cid = get_or_create_character(char, None)
                    extracted_chars.append(cid)
                    
                extracted_tags.extend(extra_tags)
                raw_tags = ""
                matched = True
                break
                
        if not matched and raw_tags:
            tokens = raw_tags.split()
            for token in tokens:
                token_lower = token.lower()
                token_matched = False
                for raw_match, (char, franch, extra_tags) in MAPPING.items():
                    if token_lower == raw_match.lower():
                        if franch:
                            fid = get_or_create_franchise(franch)
                            if char:
                                cid = get_or_create_character(char, fid)
                                extracted_chars.append(cid)
                        elif char:
                            cid = get_or_create_character(char, None)
                            extracted_chars.append(cid)
                            
                        extracted_tags.extend(extra_tags)
                        token_matched = True
                        break
                
                if not token_matched:
                    norm = normalize_tag(token)
                    if norm:
                        extracted_tags.append(norm)
                        
        for cid in extracted_chars:
            try:
                cursor.execute("INSERT INTO set_characters (set_id, character_id) VALUES (?, ?)", (set_id, cid))
            except sqlite3.IntegrityError:
                pass
                
        for tname in extracted_tags:
            tid = get_or_create_tag(tname)
            try:
                cursor.execute("INSERT INTO set_tags (set_id, tag_id) VALUES (?, ?)", (set_id, tid))
            except sqlite3.IntegrityError:
                pass
                
        migrated_sets += 1
        
    print(f"Migrated data for {migrated_sets} sets.")
    
    print("Cleaning up 'sfw' tag...")
    cursor.execute("SELECT id FROM tags WHERE name = 'sfw'")
    sfw_row = cursor.fetchone()
    if sfw_row:
        sfw_id = sfw_row['id']
        cursor.execute("DELETE FROM set_tags WHERE tag_id = ?", (sfw_id,))
        cursor.execute("DELETE FROM tags WHERE id = ?", (sfw_id,))
        print("Removed 'sfw' tag.")
        
    cursor.execute("SELECT id, name FROM tags")
    for row in cursor.fetchall():
        norm = normalize_tag(row['name'])
        if norm and norm != row['name']:
            try:
                cursor.execute("UPDATE tags SET name = ? WHERE id = ?", (norm, row['id']))
                print(f"Normalized existing tag '{row['name']}' to '{norm}'")
            except sqlite3.IntegrityError:
                print(f"Skipping normalization for tag '{row['name']}' -> '{norm}' (tag with target name already exists)")
            
    # Set images.tags to empty where not null just to clean up before migration
    cursor.execute("UPDATE images SET tags = NULL WHERE tags IS NOT NULL")
            
    conn.commit()
    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    main()
