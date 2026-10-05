# Original generated base-color materials

Nine surface imagegen originals plus an overcast sky and their exact prompts are preserved here. Delivery
files live in `public/modern/roster/materials/`: 1024px WebP, quality88, sRGB,
anisotropic filtering. These are illustrative generated base colors, not
measured material scans or physically reconstructed normals. Existing saved
Blender normal maps provide restrained micro-surface relief where appropriate.

`manifest.json` records source and runtime checksums. To rebuild each delivery:

```bash
cwebp -q 88 -resize 1024 1024 SOURCE.png -o DELIVERY.webp
```

Weapon metal, glove leather and sleeve fabric use separate files. The organic
armor (`carapace`) original is kept, but its delivery was retired on 2026-10-05:
no runtime material ever bound it (see `retired` in `manifest.json`).
Basalt, organic tissue, ceramic, limestone and alloy form the campaign palette.
The separate 2048×1024 sky is an LDR equirectangular background (quality90),
not an HDR lighting probe. Its original and exact prompt are retained.

No paid asset download, third-party artwork or runtime image synthesis.
