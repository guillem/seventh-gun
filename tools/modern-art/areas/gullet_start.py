"""The Gullet start room, "the throat": a low oesophageal vault ringed with
cartilage, mucous folds and glands, closing on a sphincter in the far gable.

    node tools/modern-art/export_area_layout.mjs 2 gullet-start 5,7,12,13
    blender --background --factory-startup --python tools/modern-art/areas/gullet_start.py -- --size 1024 --samples 128
"""
import importlib.util
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = _load('area_lib', HERE.parent / 'area_lib.py')
common = _load('common', HERE / 'common.py')

area = lib.Area('gullet-start', world=(.3, .12, .1), world_strength=.004)
X0, X1, Z0, Z1 = area.bounds()
rng = random.Random(7)
WALL = 5.0

floor = area.mat('floor', (.17, .12, .11), 0, .8)
wall = area.mat('organic.wall', (.3, .18, .16), 0, .6)
skin = area.mat('organic.membrane', (.38, .2, .17), 0, .45)
cartilage = area.mat('bone', (.5, .44, .35), 0, .6)
sinew = area.mat('organic.sinew', (.34, .12, .1), 0, .4)
fluid = area.mat('organic.fluid', (.12, .035, .03), .1, .1)
gland = area.mat('lamp.gland', (1, .48, .28), 0, .4, 3)
deep = area.mat('lamp.deep', (1, .18, .1), 0, .4, 4)

area.floor(floor)
area.walls(lambda x, z: WALL, wall, curb=sinew)
vault = common.Vault(area, 'x', WALL, 4.0)
vault.skin('Throat lining', skin, ripple_fn=lambda a, t: .18 * math.sin(a * 2.2) * math.sin(t * 5) + .1 * math.sin(t * 11 + a))
vault.gables('Throat end', wall)

# Cartilage rings every 1.4 m: the throat's defining rhythm.
a = X0 + .7
while a < X1 - .5:
    vault.rib('Cartilage ring', a, cartilage, r=.16 + .04 * math.sin(a), inset=.03)
    a += 1.4

# The far (east) gable closes on a sphincter: concentric folds round a glow.
cx, cy, cz = X1 - .15, 6.6, (Z0 + Z1) / 2
for k, r in enumerate([1.9, 1.45, 1.0, .6]):
    area.tube('Sphincter fold', common.ring((cx - k * .12, cy, cz), r, axis='x', samples=28, phase=k * .3), .14 - k * .02, sinew)
common.disc(area, 'Sphincter glow', (cx - .5, cy, cz), .45, deep, axis='x')
area.light('Sphincter glow', (cx - 1.0, cy, cz), (X0, 1, cz), (1, .25, .15), 260, 1.2)

# Lower walls: vertical mucous folds and paired glands, clear of openings.
for side in 'nswe':
    a0, a1 = area.side_range(side)
    t = a0 + .5
    while t < a1 - .4:
        if area.solid(side, t, .5):
            top = rng.uniform(3.0, 4.6)
            area.wall_tube('Mucous fold', side, [(t, .3, .05), (t + rng.uniform(-.15, .15), top * .5, .08), (t, top, .05)], .05, sinew)
        t += rng.uniform(.7, 1.1)
    for t in area.bays(side, 4.2, margin=1.4):
        area.wall_tube('Gland collar', side, [(t + .4 * math.cos(k * math.pi / 6), 2.6 + .55 * math.sin(k * math.pi / 6), .06) for k in range(13)], .045, cartilage)
        x, y, z = area.wall_point(side, t, 2.6, .1)
        nx, nz = area.SIDES[side]
        area.ellipsoid('Wall gland', (x, y, z), (.06 if nx else .28, .42, .28 if nx else .06), gland, segments=12, rings=6)
        lx, _, lz = area.wall_point(side, t, 2.6, .4)
        tx, _, tz = area.wall_point(side, t, .4, 3)
        area.light('Gland pool', (lx, 2.6, lz), (tx, .4, tz), (1, .5, .3), 30, .45)

# A wet trail down the middle of the floor (flat inlay, 1 cm).
verts = []
for i in range(29):
    x = X0 + .6 + i * (X1 - X0 - 1.2) / 28
    w = .7 + .35 * math.sin(i * .9)
    zc = (Z0 + Z1) / 2 + .6 * math.sin(i * .35)
    verts += [(x, .01, zc - w), (x, .01, zc + w)]
area.mesh('Fluid trail', verts, [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(28)], fluid)

# Hanging strands from the crown, ending in small glands, above 6 m.
for i in range(9):
    along = X0 + 1.5 + i * (X1 - X0 - 3) / 8
    t = math.pi / 2 + rng.uniform(-.6, .6)
    p = vault.point(along, t, .03)
    end = max(6.2, p[1] - rng.uniform(1.0, 2.2))
    area.tube('Hanging strand', [p, (p[0] + .1, (p[1] + end) / 2, p[2]), (p[0], end, p[2])], .035, sinew)
    area.ellipsoid('Strand bead', (p[0], end - .08, p[2]), (.08, .12, .08), gland, segments=8, rings=4)

# Start rooms hold no enemies: the bake lights them, no runtime light.
practicals = []
area.finish(practicals=practicals, bake_albedo=.4)
