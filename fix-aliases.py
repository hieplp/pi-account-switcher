#!/usr/bin/env python3
"""Replace @/ path aliases with relative imports in all source files."""
import re
from pathlib import Path

src_dir = Path("/tmp/pi-as/src")

def relative_to_src(file_path: Path) -> str:
    """Compute relative path from file to src/ root."""
    rel = file_path.relative_to(src_dir)
    depth = len(rel.parts) - 1  # 0 for src/index.ts, 1 for src/commands/base.ts, etc.
    if depth == 0:
        return "./"
    return "../" * depth

def replace_imports(content: str, rel_prefix: str) -> str:
    """Replace @/X with the correct relative path."""
    # Static imports: from "@/..." or from '@/...'
    content = re.sub(
        r'(from\s+["\'])@/',
        lambda m: f'{m.group(1)}{rel_prefix}',
        content
    )
    # Dynamic imports: import("@/...")
    content = re.sub(
        r'(import\(["\'])@/',
        lambda m: f'{m.group(1)}{rel_prefix}',
        content
    )
    return content

# Process all .ts files
ts_files = list(src_dir.rglob("*.ts"))
ts_files = [f for f in ts_files if "node_modules" not in str(f)]

changed = 0
for f in sorted(ts_files):
    content = f.read_text()
    if '"@/' not in content and "'@/" not in content:
        continue
    rel_prefix = relative_to_src(f)
    new_content = replace_imports(content, rel_prefix)
    if new_content != content:
        f.write_text(new_content)
        changed += 1
        print(f"  ✓ {f.relative_to(src_dir)}  ({len(rel_prefix[:-1].split('/'))} levels up)")

print(f"\nChanged {changed} files")
