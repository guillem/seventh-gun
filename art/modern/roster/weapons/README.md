# Authored weapon roster

Created locally in Blender 5.2.2 on 2026-10-03 for the experimental art branch.
The seven editable `.blend` files retain their object hierarchy, UVs, material
assignments and three NLA actions. `tools/modern-art/build_weapons.py` is the
reproducible offline authoring source; nothing in it runs in the browser.

The original `art/modern/pistol.blend` and `public/modern/models/pistol.glb` are
preserved as first-milestone comparison assets. This roster replaces that pistol
with a more compact tapered slide, redesigned grip and new hand anatomy, and
replaces the other six runtime-built weapon meshes with saved Blender models.

| ID | Model | Defining authored geometry | Fire mechanism |
| --- | --- | --- | --- |
| 1 | Viper Pistol | Tapered service slide, milled reliefs, chamber hood, sights and accessory rail | Reciprocating slide |
| 2 | Ripjaw Shotgun | Dual barrel/magazine tubes, ribbed pump, shell carrier, skeleton stock | Pump return stroke |
| 3 | Hornet Chaingun | Six barrel rotor, feed cassette, exposed belt, motor housing | Sixfold rotor advance |
| 4 | Spiker | Ceramic linear guides, exposed coil saddles, curved nail magazine | Bolt and charging lever |
| 5 | Bile Launcher | Sealed six-cartridge pressure chamber, return hose and gauge | Indexed chamber rotation |
| 6 | Sunlance | Three exposed coils, ceramic discharge jaws, capacitor and optic | Reset carriage |
| 7 | The Seventh | Containment gimbal, ceramic shields, insulated cables, flared aperture | Containment gimbal deflection |

Hands are saved meshes under a removable `hands` node. Each has tapered palms,
three curled gripping fingers plus a separate trigger index, opposed thumbs,
knuckle pads, topstitching and continuous tailored sleeves. Heavy weapons use a
supporting palm cradle at their forend; the pistol uses a paired grip.

## Runtime contract

- Units: metres; X right, Y up, barrel along -Z.
- `muzzle`: the visual barrel tip, fixed to the weapon frame.
- `weapon_motion`: slow authored idle drift.
- `equip_motion`: 450 ms authored raise and settle.
- `recoil_motion` and `mechanism`: the shared `fire` clip.
- `hands`: excluded from pickup visibility and pickup recentering bounds.
- Material prefixes: `weapon.metal`, `weapon.edge`, `weapon.dark`, `weapon.grip`,
  `weapon.ceramic`, `weapon.brass`, `weapon.engraving`, `weapon.accent`,
  `hand.glove`, `hand.fabric`, `hand.pad`, `hand.stitch`.

The exported default pose is neutral even though the equip animation starts
lowered. Source NLA tracks are stored muted so the editable file opens at rest;
unmute a track in Blender to inspect it. `fire` durations match the existing
weapon cooldowns, sampled at 200 fps during export so the 95 ms Hornet cycle is
preserved exactly. The runtime samples clip phase from simulation cooldown;
animations do not change aim, hit detection, ammunition or firing cadence.

The loader attaches separately generated saved material images to the named
materials. The files here do not embed or regenerate texture images. Blender
`*-preview.png` files are neutral studio model inspections, not gameplay captures
and not claims of final browser lighting. Generated texture prompts/provenance
are maintained with the shared roster texture sources.

## Rebuild and checks

```sh
/opt/homebrew/bin/blender --background --factory-startup --threads 4 \
  --python tools/modern-art/build_weapons.py -- --preview
node node_modules/vitest/vitest.mjs run tests/unit/weaponRoster.test.ts
```

Use `--id 1` through `--id 7` for a focused re-export. `manifest.json` records
triangle counts, bytes and neutral muzzle coordinates. The unit checks load the
real GLBs with Three.js, validate timing/bounds/anchors/UVs, sample the pistol
mechanism using its exact cooldown, verify cached source isolation, and confirm
all pickups hide their hands without including them in recentering bounds.
