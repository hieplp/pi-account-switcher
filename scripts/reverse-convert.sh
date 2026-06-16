#!/bin/bash
# Reverse conversion: relative paths → @/ imports
# This undoes what convert-at-imports.sh does.
# For each .ts file under src/, computes its depth from src/
# and replaces the corresponding relative import depth with @/

set -e

cd "$(git rev-parse --show-toplevel)"

find src/ -name '*.ts' ! -name '*.d.ts' | while read -r file; do
  # Compute depth: e.g. src/foo.ts → 0, src/runtime/foo.ts → 1, src/commands/accounts/foo.ts → 2
  rel="${file#src/}"
  depth=$(echo "$rel" | tr -cd '/' | wc -c)

  # Build the relative prefix we're looking for
  case "$depth" in
  0) prefix='\./' ;;
  1) prefix='\.\./' ;;
  2) prefix='\.\.\/\.\./' ;;
  3) prefix='\.\.\/\.\.\/\.\./' ;;
  4) prefix='\.\.\/\.\.\/\.\.\/\.\./' ;;
  *)
    echo "WARNING: unexpected depth $depth for $file"
    continue
    ;;
  esac

  # Replace from "./..." → from "@/..." (depth 0)
  # Replace from "../..." → from "@/..." (depth 1)
  # Replace from "../../..." → from "@/..." (depth 2)
  # etc.
  sed -i "s|from \"${prefix}\\(.*\\)\"|from \"@/\\1\"|g" "$file"
done

echo "Done converting relative imports to @/ for $(find src/ -name '*.ts' ! -name '*.d.ts' | wc -l) files"
