# Creature surface resources

Four new albedo images were generated with the built-in imagegen tool: pallid
dermis, desaturated exposed tissue, layered chitin and weathered dentine. Exact
prompts are in `prompts.json`; untouched 1254×1254 PNG outputs are retained here.
The prompt requested 2048px, but the delivered image dimensions are recorded
honestly in `albedo-manifest.json`. Runtime copies are 1024×1024 WebPs, encoded
with `cwebp -q 90 -resize 1024 1024`; no repainting or colour-derived normal-map
conversion was used. They are generated material illustrations, not scans.

Eight separate 512×512 normal/roughness maps come from editable Blender surface
specimens with geometric folds, fibres, keratin ridges and dentine pores. These
are independent authored details, not physically measured maps registered to
the generated colour image. See `geometry-bakes.md` for method and rebuild
commands. Runtime data maps use lossless WebP, linear colour space, shared
texture ownership and restrained normal strength.

All twelve runtime maps are in `public/modern/refinement/materials/`. Creature
UVs use a consistent half-metre repeat scale; shape, cavities, lips, teeth and
claws come from the saved meshes. The normal maps add small surface relief and
do not substitute for silhouette modelling.
