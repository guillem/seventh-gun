# Creature surface data maps

The four colour images are generated art; their original files and prompts are
preserved separately in this directory. They were not used to derive normal or
roughness values.

`creature-material-specimens.blend` contains four editable half-metre geometric
specimens and corresponding flat UV bake planes. Each high surface is a 256 ×
256 quad grid: dermal folds and a raised scar, longitudinal muscle fibres,
keratin ridges and a fissure, and pitted dentine. Their fixed geometric features
are authored in `tools/modern-art/bake_enemy_materials.py`. These are modeled
surface studies, not scans or measurements of physical tissue.

Cycles selected-to-active baking produces 512 × 512 tangent-space normal PNGs.
The normal maps represent those geometric specimens, not a high-to-low bake of
each complete creature. Low-frequency anatomy and silhouette detail remain in
the individual saved meshes. Explicit scalar roughness regions on each high
surface are baked through emission as linear data. Typical ranges are about
0.71–0.82 for dermis, 0.48–0.59 for muscle, 0.65–0.83 for keratin, and 0.73–0.81
for dentine. The source images are packed into the specimen blend file.

The eight runtime files are lossless WebP copies in
`public/modern/refinement/materials/{skin,raw,chitin,bone}-{normal,roughness}.webp`.
Normals and roughness must use linear/Non-Color interpretation. Surface tiling
uses the meshes' physical half-metre UVs; a normal strength around 0.45 keeps the
small folds from overpowering the actual anatomical forms. Generated colour
variation and modeled microstructure are independent, so a painted colour mark
does not imply a matching geometric groove.

Rebuild locally with four CPU threads:

```bash
/opt/homebrew/bin/blender --background --factory-startup --threads 4 \
  --python tools/modern-art/bake_enemy_materials.py
```

This performs no image-generation or paid service calls. The script retains the
source specimen geometry, PNGs and editable blend; the runtime only loads the
saved textures.
