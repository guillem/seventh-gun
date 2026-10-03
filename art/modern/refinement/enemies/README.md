# Creature refinement review

These six `*-sculpt.png` files are local Blender studio renders of the saved
editable assets, not gameplay screenshots. The game-review images elsewhere
under `art/modern/refinement/` show the actual Three.js lighting and framing.

The refinement replaces disconnected primitive anatomy with remeshed muscle and
dermal volumes, carved cavities, localized exposed muscle, keratin plates and
dentine details. Species retain their original simulation volumes, muzzle
coordinates and five animation clips. Husk, wisp, hierophant and fiend have
different head constructions rather than a shared exposed-skull face.

The husk was also checked from actual side and frontal game views. Its face was
drawn 8.5 cm toward the torso, neck and shoulder transitions broadened, and thin
lower-leg connectors replaced with continuous ankle tissue. Its detailed face
retains separate local sculpt topology but overlaps the body neck throughout
idle, walk and attack poses. Authored local tissue discoloration survives glTF
export in `COLOR_0` and is tested through Three's actual loader.

The final model totals are recorded in `../../roster/enemies/manifest.json`:
20,228–30,190 triangles, six skinned material draws per species, and 13–21 bones.
Generated albedos and independent geometry-derived surface maps remain shared
runtime resources. Model geometry and surface studies are authored offline;
the runtime does not synthesize or remesh creature anatomy.

Sources and regeneration commands are documented in
`../../roster/enemies/README.md` and `../materials/geometry-bakes.md`.
