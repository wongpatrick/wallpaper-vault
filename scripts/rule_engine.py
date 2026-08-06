"""
Rule Engine for wallpaper set filename parsing.
Loads declarative YAML rules and dispatches regex and custom handlers.
"""

from pathlib import Path
import re
from typing import Any
import yaml


# ── Custom Handlers Registry ──────────────────────────────────────────────────

def parse_saint_slug(filename: str) -> tuple[list[str], str] | None:
    match = re.match(r"^SAINT-Photolife-(.+?)-\s+-\s+SAINT-", filename)
    if match:
        parts = match.group(1).split("-")
        creator = parts[0].strip()
        set_name = " ".join(p for p in parts[1:] if p).strip()
        return [creator], f"SAINT Photolife - {set_name}"
    return None


def parse_kpop_lesserafim_slug(filename: str) -> tuple[list[str], str] | None:
    match = re.match(r"^kpop\s+-\s+\d{6}-(.+?)-documents-", filename)
    if match:
        set_title = match.group(1).replace("-", " ").strip()
        return ["LE SSERAFIM"], set_title
    return None


def parse_sinder(filename: str) -> tuple[list[str], str] | None:
    match = re.match(r"^Sinder_(.+?)_V\d+", filename)
    if match:
        return ["Sinder"], match.group(1).replace("_", " ").strip()
    return None


def parse_creator_dash_title_ely(filename: str) -> tuple[list[str], str] | None:
    match = re.match(r"^(?:Ely|ElyEE子|Ely_eee)\s+-\s+(.+?)\s+-\s+.+", filename)
    if match:
        return ["Ely"], match.group(1).strip()
    return None


def parse_creator_dash_title_bambi(filename: str) -> tuple[list[str], str] | None:
    match = re.match(r"^Bambi \(밤비\)\s+-\s+(.+?)\s+-\s+.+", filename)
    if match:
        return ["Bambi (밤비)"], match.group(1).strip()
    return None


def parse_creator_dash_title(filename: str) -> tuple[list[str], str] | None:
    match = re.match(r"^(.+?)\s+-\s+(.+?)\s+-\s+.+", filename)
    if match:
        creator = match.group(1).strip()
        set_title = match.group(2).strip()
        if set_title.startswith(creator):
            set_title = set_title[len(creator):].strip()
        return [creator], set_title
    return None


def parse_coser_at(filename: str) -> tuple[list[str], str] | None:
    prefix_match = re.match(r"^(?:Coser|Cosplay)@", filename)
    if not prefix_match:
        return None

    stripped = filename[prefix_match.end():]
    match = re.match(r"(.+?)\s+-\s*(.+?)\s+-\s+\S+", stripped)
    if not match:
        match = re.match(r"(.+?)\s+-\s*(.+?)\s+\S+-\S*\d", stripped)
    if not match:
        match = re.match(r"(.+?)\s+([^\-].+?)\s+-\s+\S+-\S*\d", stripped)
    if match:
        creators_raw = match.group(1).strip()
        set_title = match.group(2).strip().lstrip("-").strip()
        creators = [c.strip() for c in re.split(r"\s*[&、]\s*", creators_raw) if c.strip()]
        return creators, set_title
    return None


def parse_studio_bracket(filename: str) -> tuple[list[str], str] | None:
    match = re.match(r"^\[(.+?)\]\s+(.+?)\s+-\s+(.+?)\s+-\s+.+", filename)
    if match:
        studio = match.group(1).strip()
        creator = match.group(2).strip()
        set_name = match.group(3).strip()
        set_title = f"{studio} - {set_name}"
        return [creator], set_title
    return None


def parse_djawa_bracket(filename: str) -> tuple[list[str], str] | None:
    match = re.match(r"\[DJAWA\]\s+(.+?)\s+-\s+\d+_.+", filename)
    if match:
        title_part = match.group(1).strip()
        if "：" in title_part:
            set_title, creator = title_part.split("：", 1)
            return [creator.strip()], set_title.strip()
        return ["DJAWA"], title_part
    return None


CUSTOM_HANDLERS = {
    "parse_saint_slug": parse_saint_slug,
    "parse_kpop_lesserafim_slug": parse_kpop_lesserafim_slug,
    "parse_sinder": parse_sinder,
    "parse_creator_dash_title_ely": parse_creator_dash_title_ely,
    "parse_creator_dash_title_bambi": parse_creator_dash_title_bambi,
    "parse_creator_dash_title": parse_creator_dash_title,
    "parse_coser_at": parse_coser_at,
    "parse_studio_bracket": parse_studio_bracket,
    "parse_djawa_bracket": parse_djawa_bracket,
}


# ── RuleEngine Class ──────────────────────────────────────────────────────────

class RuleEngine:
    """Engine that compiles and executes declarative filename parsing rules."""

    def __init__(self, rules_path: str | Path | None = None):
        if rules_path is None:
            rules_path = Path(__file__).parent / "import_rules.yaml"
        self.rules_path = Path(rules_path)
        self.rules: list[dict[str, Any]] = []
        self._load_rules()

    def _load_rules(self) -> None:
        if not self.rules_path.exists():
            raise FileNotFoundError(f"Rules file not found at: {self.rules_path}")

        with open(self.rules_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        raw_rules = data.get("rules", [])
        self.rules = []
        for r in raw_rules:
            flags = 0
            if "IGNORECASE" in r.get("flags", []):
                flags |= re.IGNORECASE

            compiled_regex = re.compile(r["pattern"], flags) if "pattern" in r else None
            self.rules.append({
                "name": r.get("name", "unnamed_rule"),
                "compiled_regex": compiled_regex,
                "creator": r.get("creator"),
                "creator_template": r.get("creator_template"),
                "title_template": r.get("title_template"),
                "custom_handler": r.get("custom_handler"),
                "auto_insert": r.get("auto_insert", False),
            })

    def parse(self, filename: str) -> tuple[list[str], str, bool]:
        """
        Evaluates rules sequentially.
        Returns: (creators_list, set_title, auto_insert_boolean)
        """
        for rule in self.rules:
            handler_name = rule["custom_handler"]
            if handler_name:
                handler_func = CUSTOM_HANDLERS.get(handler_name)
                if handler_func:
                    res = handler_func(filename)
                    if res:
                        creators, title = res
                        return creators, title, rule["auto_insert"]
                continue

            regex = rule["compiled_regex"]
            if regex:
                match = regex.search(filename)
                if match:
                    groups = match.groups()
                    pos_args = [""] + [g if g is not None else "" for g in groups]
                    kwargs = {k: (v if v is not None else "") for k, v in match.groupdict().items()}

                    # Format creator
                    if rule["creator"]:
                        creators = [rule["creator"]]
                    elif rule["creator_template"]:
                        cr_str = rule["creator_template"].format(*pos_args, **kwargs).strip()
                        creators = [c.strip() for c in re.split(r"\s*[&、]\s*", cr_str) if c.strip()]
                    else:
                        creators = ["UNKNOWN"]

                    # Format title
                    if rule["title_template"]:
                        set_title = rule["title_template"].format(*pos_args, **kwargs).strip()
                    else:
                        set_title = filename

                    return creators, set_title, rule["auto_insert"]

        return ["UNKNOWN"], filename, False
