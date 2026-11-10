#!/usr/bin/env python3
"""
Color token migration script.
Replaces hardcoded Tailwind palette colors (amber/emerald/rose/sky/violet/teal)
with semantic tokens (warning/success/danger/info/time/subsidy) in tab files.

Run:
    python3 scripts/migrate-color-tokens.py <file1> [<file2> ...]
"""
import sys
from pathlib import Path

# Mapping table: (source_literal, target_literal)
# Order does not matter — we sort by descending source length so that
# longer/more-specific patterns (with slash-opacity, dark:hover: prefixes,
# etc.) are applied before their shorter prefixes.
MAPPING_RAW = [
    # ============ Amber -> Warning ============
    # dark:hover: with opacity
    ("dark:hover:bg-amber-950/40", "dark:hover:bg-warning-soft"),
    ("dark:hover:bg-amber-950/20", "dark:hover:bg-warning-soft/60"),
    # dark: with /opacity
    ("dark:bg-amber-950/40", "dark:bg-warning-soft"),
    ("dark:bg-amber-950/30", "dark:bg-warning-soft/70"),
    ("dark:bg-amber-950/20", "dark:bg-warning-soft/40"),
    ("dark:bg-amber-950/10", "dark:bg-warning-soft/40"),
    ("dark:bg-amber-900/40", "dark:bg-warning-soft"),
    ("dark:bg-amber-50/30",  "dark:bg-warning-soft/30"),
    # dark:border with /opacity
    ("dark:border-amber-900/60", "dark:border-warning-strong/60"),
    ("dark:border-amber-900/50", "dark:border-warning-strong/50"),
    ("dark:border-amber-900/40", "dark:border-warning-strong/40"),
    ("dark:border-amber-800", "dark:border-warning-strong"),
    ("dark:border-amber-900", "dark:border-warning-strong"),
    # dark: text / from
    ("dark:text-amber-300", "dark:text-warning-strong"),
    ("dark:from-amber-950/30", "dark:from-warning-soft"),
    # dark: bg/base (no opacity) — apply LAST among darks
    ("dark:bg-amber-950", "dark:bg-warning-soft"),
    ("dark:bg-amber-900", "dark:bg-warning-soft"),
    # hover:
    ("hover:bg-amber-50", "hover:bg-warning-soft/50"),
    ("hover:border-amber-300", "hover:border-warning/50"),
    # plain with /opacity
    ("bg-amber-50/30", "bg-warning-soft/30"),
    ("bg-amber-50/50", "bg-warning-soft/50"),
    ("bg-amber-50/60", "bg-warning-soft/60"),
    ("bg-amber-400/70", "bg-warning/70"),
    ("border-amber-200/60", "border-warning/40"),
    # plain colors
    ("bg-amber-500", "bg-warning"),
    ("bg-amber-400", "bg-warning"),
    ("bg-amber-300", "bg-warning/60"),
    ("bg-amber-100", "bg-warning-soft"),
    ("bg-amber-50",  "bg-warning-soft/50"),
    ("text-amber-700", "text-warning-strong"),
    ("text-amber-600", "text-warning"),
    ("text-amber-500", "text-warning"),
    ("text-amber-300", "text-warning-strong"),
    ("border-amber-500", "border-warning"),
    ("border-amber-400", "border-warning"),
    ("border-amber-300", "border-warning/50"),
    ("border-amber-200", "border-warning/30"),
    ("from-amber-50", "from-warning-soft"),
    ("fill-amber-500", "fill-warning"),
    ("ring-amber-500", "ring-warning"),

    # ============ Emerald -> Success ============
    ("dark:hover:bg-emerald-950/40", "dark:hover:bg-success-soft"),
    ("dark:hover:bg-emerald-950/20", "dark:hover:bg-success-soft/60"),
    ("dark:bg-emerald-950/40", "dark:bg-success-soft"),
    ("dark:bg-emerald-950/30", "dark:bg-success-soft/70"),
    ("dark:bg-emerald-950/20", "dark:bg-success-soft/40"),
    ("dark:bg-emerald-950/10", "dark:bg-success-soft/40"),
    ("dark:bg-emerald-900/40", "dark:bg-success-soft"),
    ("dark:border-emerald-900/60", "dark:border-success-strong/60"),
    ("dark:border-emerald-900/50", "dark:border-success-strong/50"),
    ("dark:border-emerald-900/40", "dark:border-success-strong/40"),
    ("dark:border-emerald-900", "dark:border-success-strong"),
    ("dark:border-emerald-800/40", "dark:border-success-strong/40"),
    ("dark:border-emerald-800", "dark:border-success-strong"),
    ("dark:text-emerald-300", "dark:text-success-strong"),
    ("dark:from-emerald-950/30", "dark:from-success-soft"),
    ("dark:bg-emerald-950", "dark:bg-success-soft"),
    ("dark:bg-emerald-900", "dark:bg-success-soft"),
    ("hover:bg-emerald-50", "hover:bg-success-soft/50"),
    ("hover:border-emerald-300", "hover:border-success/50"),
    ("bg-emerald-50/30", "bg-success-soft/30"),
    ("bg-emerald-50/50", "bg-success-soft/50"),
    ("bg-emerald-50/60", "bg-success-soft/60"),
    ("bg-emerald-400/70", "bg-success/70"),
    ("border-emerald-200/60", "border-success/40"),
    ("bg-emerald-500", "bg-success"),
    ("bg-emerald-400", "bg-success"),
    ("bg-emerald-300", "bg-success/60"),
    ("bg-emerald-100", "bg-success-soft"),
    ("bg-emerald-50",  "bg-success-soft/50"),
    ("text-emerald-700", "text-success-strong"),
    ("text-emerald-600", "text-success"),
    ("text-emerald-500", "text-success"),
    ("text-emerald-300", "text-success-strong"),
    ("border-emerald-500", "border-success"),
    ("border-emerald-600", "border-success"),
    ("border-emerald-400", "border-success"),
    ("border-emerald-300", "border-success/50"),
    ("border-emerald-200", "border-success/30"),
    ("from-emerald-50", "from-success-soft"),
    ("fill-emerald-500", "fill-success"),
    ("ring-emerald-500", "ring-success"),

    # ============ Rose -> Danger ============
    ("dark:hover:bg-rose-950/40", "dark:hover:bg-danger-soft"),
    ("dark:hover:bg-rose-950/20", "dark:hover:bg-danger-soft/60"),
    ("dark:bg-rose-950/40", "dark:bg-danger-soft"),
    ("dark:bg-rose-950/30", "dark:bg-danger-soft/70"),
    ("dark:bg-rose-950/20", "dark:bg-danger-soft/40"),
    ("dark:bg-rose-950/10", "dark:bg-danger-soft/40"),
    ("dark:bg-rose-900", "dark:bg-danger-soft"),
    ("dark:border-rose-900/60", "dark:border-danger-strong/60"),
    ("dark:border-rose-900/50", "dark:border-danger-strong/50"),
    ("dark:border-rose-900/40", "dark:border-danger-strong/40"),
    ("dark:border-rose-900", "dark:border-danger-strong"),
    ("dark:border-rose-800", "dark:border-danger-strong"),
    ("dark:text-rose-300", "dark:text-danger-strong"),
    ("dark:from-rose-950/30", "dark:from-danger-soft"),
    ("dark:bg-rose-950", "dark:bg-danger-soft"),
    ("hover:bg-rose-50", "hover:bg-danger-soft/50"),
    ("hover:border-rose-300", "hover:border-danger/50"),
    ("bg-rose-50/40", "bg-danger-soft/40"),
    ("bg-rose-50/30", "bg-danger-soft/30"),
    ("bg-rose-50/50", "bg-danger-soft/50"),
    ("bg-rose-400/70", "bg-danger/70"),
    ("border-rose-200/60", "border-danger/40"),
    ("bg-rose-500", "bg-danger"),
    ("bg-rose-400", "bg-danger"),
    ("bg-rose-300", "bg-danger/60"),
    ("bg-rose-100", "bg-danger-soft"),
    ("bg-rose-50",  "bg-danger-soft/50"),
    ("text-rose-700", "text-danger-strong"),
    ("text-rose-600", "text-danger"),
    ("text-rose-500", "text-danger"),
    ("text-rose-300", "text-danger-strong"),
    ("border-rose-500", "border-danger"),
    ("border-rose-600", "border-danger"),
    ("border-rose-400", "border-danger"),
    ("border-rose-300", "border-danger/50"),
    ("border-rose-200", "border-danger/30"),
    ("from-rose-50", "from-danger-soft"),
    ("fill-rose-500", "fill-danger"),
    ("ring-rose-500", "ring-danger"),
    ("decoration-rose-500/70", "decoration-danger/70"),

    # ============ Sky -> Info ============
    ("dark:hover:bg-sky-950/40", "dark:hover:bg-info-soft"),
    ("dark:hover:bg-sky-900/40", "dark:hover:bg-info-soft"),
    ("dark:bg-sky-950/40", "dark:bg-info-soft"),
    ("dark:bg-sky-950/30", "dark:bg-info-soft/70"),
    ("dark:bg-sky-950/20", "dark:bg-info-soft/40"),
    ("dark:bg-sky-950/10", "dark:bg-info-soft/40"),
    ("dark:bg-sky-900/40", "dark:bg-info-soft"),
    ("dark:hover:border-sky-800", "dark:hover:border-info-strong"),
    ("dark:border-sky-900", "dark:border-info-strong"),
    ("dark:border-sky-800", "dark:border-info-strong"),
    ("dark:hover:text-sky-300", "dark:hover:text-info-strong"),
    ("dark:text-sky-300", "dark:text-info-strong"),
    ("dark:text-sky-200", "dark:text-info-strong"),
    ("dark:from-sky-950/30", "dark:from-info-soft"),
    ("dark:bg-sky-950", "dark:bg-info-soft"),
    ("dark:bg-sky-900", "dark:bg-info-soft"),
    ("hover:bg-sky-50", "hover:bg-info-soft/50"),
    ("hover:border-sky-300", "hover:border-info/50"),
    ("bg-sky-100", "bg-info-soft"),
    ("bg-sky-50/30", "bg-info-soft/30"),
    ("bg-sky-50/50", "bg-info-soft/50"),
    ("bg-sky-50",  "bg-info-soft/50"),
    ("bg-sky-400", "bg-info"),
    ("bg-sky-300", "bg-info/60"),
    ("bg-sky-500", "bg-info"),
    ("text-sky-700", "text-info-strong"),
    ("text-sky-600", "text-info"),
    ("text-sky-500", "text-info"),
    ("text-sky-300", "text-info-strong"),
    ("text-sky-200", "text-info-strong"),
    ("border-sky-500", "border-info"),
    ("border-sky-400", "border-info"),
    ("border-sky-300", "border-info/50"),
    ("border-sky-200/60", "border-info/40"),
    ("border-sky-200", "border-info/30"),
    ("from-sky-50", "from-info-soft"),
    ("fill-sky-500", "fill-info"),
    ("ring-sky-500", "ring-info"),

    # ============ Violet -> Time ============
    ("dark:hover:bg-violet-950/40", "dark:hover:bg-time-soft"),
    ("dark:hover:bg-violet-950/20", "dark:hover:bg-time-soft/60"),
    ("dark:bg-violet-950/40", "dark:bg-time-soft"),
    ("dark:bg-violet-950/30", "dark:bg-time-soft/70"),
    ("dark:bg-violet-950/20", "dark:bg-time-soft/40"),
    ("dark:bg-violet-950/10", "dark:bg-time-soft/40"),
    ("dark:bg-violet-900/40", "dark:bg-time-soft"),
    ("dark:border-violet-900/60", "dark:border-time-strong/60"),
    ("dark:border-violet-900/50", "dark:border-time-strong/50"),
    ("dark:border-violet-900/40", "dark:border-time-strong/40"),
    ("dark:border-violet-900", "dark:border-time-strong"),
    ("dark:border-violet-800", "dark:border-time-strong"),
    ("dark:text-violet-300", "dark:text-time-strong"),
    ("dark:from-violet-950/30", "dark:from-time-soft"),
    ("dark:bg-violet-950", "dark:bg-time-soft"),
    ("dark:bg-violet-900", "dark:bg-time-soft"),
    ("hover:bg-violet-50", "hover:bg-time-soft/50"),
    ("hover:border-violet-300", "hover:border-time/50"),
    ("bg-violet-100", "bg-time-soft"),
    ("bg-violet-50/30", "bg-time-soft/30"),
    ("bg-violet-50/50", "bg-time-soft/50"),
    ("bg-violet-50",  "bg-time-soft/50"),
    ("bg-violet-400", "bg-time"),
    ("bg-violet-300", "bg-time/60"),
    ("bg-violet-500", "bg-time"),
    ("text-violet-700", "text-time-strong"),
    ("text-violet-600", "text-time"),
    ("text-violet-500", "text-time"),
    ("text-violet-300", "text-time-strong"),
    ("border-violet-500", "border-time"),
    ("border-violet-400", "border-time"),
    ("border-violet-300", "border-time/50"),
    ("border-violet-200/60", "border-time/40"),
    ("border-violet-200", "border-time/30"),
    ("from-violet-50", "from-time-soft"),
    ("fill-violet-500", "fill-time"),
    ("ring-violet-500", "ring-time"),

    # ============ Teal -> Subsidy ============
    ("dark:hover:bg-teal-950/40", "dark:hover:bg-subsidy-soft"),
    ("dark:hover:bg-teal-950/20", "dark:hover:bg-subsidy-soft/60"),
    ("dark:bg-teal-950/40", "dark:bg-subsidy-soft"),
    ("dark:bg-teal-950/30", "dark:bg-subsidy-soft/70"),
    ("dark:bg-teal-950/20", "dark:bg-subsidy-soft/40"),
    ("dark:bg-teal-950/10", "dark:bg-subsidy-soft/40"),
    ("dark:bg-teal-900", "dark:bg-subsidy-soft"),
    ("dark:border-teal-900", "dark:border-subsidy-strong"),
    ("dark:border-teal-800", "dark:border-subsidy-strong"),
    ("dark:text-teal-300", "dark:text-subsidy-strong"),
    ("dark:from-teal-950/30", "dark:from-subsidy-soft"),
    ("dark:bg-teal-950", "dark:bg-subsidy-soft"),
    ("hover:bg-teal-50", "hover:bg-subsidy-soft/50"),
    ("hover:border-teal-300", "hover:border-subsidy/50"),
    ("bg-teal-100", "bg-subsidy-soft"),
    ("bg-teal-50/30", "bg-subsidy-soft/30"),
    ("bg-teal-50/50", "bg-subsidy-soft/50"),
    ("bg-teal-50",  "bg-subsidy-soft/50"),
    ("bg-teal-400", "bg-subsidy"),
    ("bg-teal-300", "bg-subsidy/60"),
    ("bg-teal-500", "bg-subsidy"),
    ("text-teal-700", "text-subsidy-strong"),
    ("text-teal-600", "text-subsidy"),
    ("text-teal-500", "text-subsidy"),
    ("text-teal-300", "text-subsidy-strong"),
    ("border-teal-500", "border-subsidy"),
    ("border-teal-400", "border-subsidy"),
    ("border-teal-300", "border-subsidy/50"),
    ("border-teal-200/60", "border-subsidy/40"),
    ("border-teal-200", "border-subsidy/30"),
    ("from-teal-50", "from-subsidy-soft"),
    ("fill-teal-500", "fill-subsidy"),
    ("ring-teal-500", "ring-subsidy"),

    # ============ Decoration variants ============
    ("decoration-emerald-500/50", "decoration-success/50"),
]

# Sort by descending source length so longer/more-specific patterns are
# applied before shorter prefixes (e.g. "bg-amber-50/30" before "bg-amber-50").
MAPPING = sorted(MAPPING_RAW, key=lambda kv: -len(kv[0]))


def migrate(text: str) -> tuple[str, int]:
    """Return (migrated_text, total_replacements_count)."""
    total = 0
    for src, dst in MAPPING:
        if src in text:
            count = text.count(src)
            text = text.replace(src, dst)
            total += count
    return text, total


def main(argv: list[str]) -> int:
    if not argv[1:]:
        print("usage: migrate-color-tokens.py <file.tsx> [<file2.tsx> ...]",
              file=sys.stderr)
        return 2
    for path_str in argv[1:]:
        path = Path(path_str)
        if not path.is_file():
            print(f"!! not a file: {path}", file=sys.stderr)
            return 1
        original = path.read_text(encoding="utf-8")
        migrated, count = migrate(original)
        if migrated != original:
            path.write_text(migrated, encoding="utf-8")
            print(f"OK  {path}  ({count} replacement(s))")
        else:
            print(f"--  {path}  (no changes)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
