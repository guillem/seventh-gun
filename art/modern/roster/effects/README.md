# Saved effects sprites

Two original imagegen sprites: compact combustion flash and diffuse smoke.
Exact prompts and untouched PNG outputs are preserved; transparent 512px WebP
runtime copies use quality90/alpha95. Manifest includes SHA-256 checksums.

Modern explosions layer these transparent textures with a brief point light;
the original wireframe shock sphere is only in the legacy fallback. Muzzle
flashes are smaller and shorter. Smoke/blood use alpha blending so they do not
emit light. Energy shots keep luminous cores and color cues for readability.

Motion, lifetime and blending remain render code; the displayed imagery is
loaded from saved files. Desktop half-resolution contact shading skips these
transparent layers, labels and light shafts so they cannot create square shadows.
