# Foundry texture and concept sources

Created 2026-10-03 using the built-in ImageGen tool for this experiment.
Original PNGs are preserved beside this file. Runtime WebP files live in
`public/modern/textures`. WebP encoding/downsampling uses local `cwebp`; no
texture painting happens at runtime. No external asset library was used.

## Concrete

Source: `concrete-source.png`. Runtime: `concrete.webp`, 1024 square, quality 88.

Prompt: Use case: photorealistic-natural. Asset type: game-ready tileable
base-color texture, square 1024 by 1024. Produce a seamless physically plausible
material photograph of pale warm grey industrial cast concrete wall, fine
aggregate pores and restrained vertical water staining, subtle formwork seams,
tiny pits, natural wear. Orthographic straight-on flat surface, uniform diffuse
shadowless illumination, no directional light baked in, no perspective, no
vignette, no objects, no text, no border. Surface covers entire image edge to
edge and tiles seamlessly on all four sides. Modern abandoned research foundry
architectural material, believable human scale, quiet low-contrast large forms
with crisp microdetail. Avoid orange rust, graffiti and dramatic cracks.

## Steel

Source: `steel-source.png`. Runtime: `steel.webp`, 1024 square, quality 88.

Prompt: Use case: photorealistic-natural. Asset type: game-ready square 1024 by
1024 seamless base-color texture. A straight-on orthographic material scan of
dark charcoal grey industrial steel floor panels, fine narrow parallel
anti-slip grooves, subtle pale abrasions and scuff marks, worn edges and
recessed seams between broad squared plates. Premium realistic abandoned
industrial science fiction facility. Uniform flat diffuse shadowless lighting,
no shadows or reflections baked in, no perspective, no large symbols, no text,
no borders. Tiles seamlessly on all sides. Restrained realistic detail, broad
plates occupy most area, avoid repeated little checker diamonds, avoid bronze tint.

## Environment concept / menu background

Source: `foundry-concept-source.png`. Runtime: `foundry-concept.webp`, quality 85.
This is concept artwork, not a screenshot or a promise of current game geometry.

Prompt: Use case: stylized-concept. Asset type: wide cinematic main-menu
environment artwork for original browser FPS SEVENTH GUN, 1536 by 1024.
Photorealistic architectural visualization of an abandoned underground
industrial research foundry, enormous pale grey cast concrete columns and
elevated ceiling ribs, brushed dark steel blast doors, ribbed steel walkway in
foreground, bundled overhead pipes, a few amber hazard lamps and cool white
recessed strip lights, distant hazy teal utility light. Eye-level 24mm wide
composition, long chamber recedes from right foreground toward center. Left
third is quiet shaded concrete and atmospheric negative space suitable for
overlay typography. Refined restrained realism, detailed material wear,
believable functional machinery, cold morning light shaft through high slit,
subtle floating dust, dramatic but visible shadow detail, premium contemporary
science-fiction survival atmosphere. No people, no weapons, no writing, no
logos, no watermark. Original architecture, not from an existing game.

## Synthetic dermal surface

Source: `dermal-source.png`. Runtime: `dermal.webp`, 1024 square, quality 88.
Applied to the husk's tissue and the pistol's gloves/sleeves with material tinting.

Prompt: Use case: photorealistic-natural. Asset type: square 1024x1024 tileable
base-color material texture for an original biomechanical science-fiction game
character. Extreme close-up of a seamless weathered dark slate-grey synthetic
dermal material, fine irregular leather pores, tiny shallow wrinkles, subtle
fibrous grain and muted grey-green mottling, dry matte finish. Neutral diffuse
uniform illumination, flat orthographic material scan with no directional
shading, no body parts, no anatomy, no wounds, no fluids, no objects, no text, no
border. Entire image is one continuous surface. Fine photorealistic detail, low
contrast larger forms, edges seamlessly repeat.

## Titanium

Source: `titanium-source.png`. Runtime: `titanium.webp`, 1024 square, quality 88.
Applied to selected authored model materials.

Prompt: Use case: photorealistic-natural. Asset type: square 1024x1024 seamless
base-color texture for machined metal on a realistic sci-fi weapon and machinery.
One continuous surface of bead-blasted titanium, medium neutral grey, very fine
machining grain, sparse hairline scratches and subtle worn patches, small-scale
realistic metal microtexture, no panels, no seams, no rivets, no objects or
markings. Flat orthographic material scan, uniform shadowless diffuse lighting,
no specular highlights baked in, no perspective, no gradients, no vignette, no
text or border. All four edges tile seamlessly. Restrained detailed physical
material for a modern game, never cartoon.

## Limits

These are generated base-color images, not measured material scans. The first
slice uses authored roughness/metalness constants rather than claiming a
physically calibrated PBR map set. Tile repetition needs review in the game.
