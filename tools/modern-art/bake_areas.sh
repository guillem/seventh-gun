#!/usr/bin/env bash
# Final-quality bake of authored areas, then regenerate the registry.
#   tools/modern-art/bake_areas.sh [area-script-name-regex]
# Rooms of 100+ cells get a 2048 lightmap, smaller rooms 1024.
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER=${BLENDER:-/opt/homebrew/bin/blender}
pattern=${1:-.}
for script in tools/modern-art/areas/*.py; do
  name=$(basename "$script" .py)
  [[ $name == common ]] && continue
  [[ $name =~ $pattern ]] || continue
  id=${name//_/-}
  cells=$(node -e "console.log(require('./art/modern/areas/$id/layout.json').cells.length)")
  size=1024; [[ $cells -ge 100 ]] && size=2048
  echo "baking $id ($cells cells, ${size}px)"
  "$BLENDER" --background --factory-startup --threads 4 --python "$script" -- --size "$size" --samples 128 2>&1 | grep -E "AREA .*export complete|Error|Traceback" | cut -c1-160
done
node tools/modern-art/register_areas.mjs
