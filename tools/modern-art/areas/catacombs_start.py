"""The Catacombs start room, "ossuary chapel": a pointed barrel vault over
walls inset with ranks of skulls, candle sconces and a retable in the gable.

    node tools/modern-art/export_area_layout.mjs 3 catacombs-start 2,41,9,47
    blender --background --factory-startup --python tools/modern-art/areas/catacombs_start.py -- --size 1024 --samples 128
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

area = lib.Area('catacombs-start', world=(.2, .24, .3), world_strength=.004)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
rng = random.Random(13)
WALL = 5.5

floor = area.mat('floor', (.14, .14, .14), 0, .9)
stone = area.mat('limestone', (.3, .31, .31), 0, .9)
ashlar = area.mat('limestone.ashlar', (.38, .38, .37), 0, .88)
bone = area.mat('bone', (.6, .55, .44), 0, .7)
bone_pale = area.mat('bone.pale', (.7, .65, .53), 0, .7)
bone_old = area.mat('bone.old', (.44, .39, .3), 0, .75)
backing = area.mat('basalt.shadow', (.07, .065, .055), 0, .95)
dark = area.mat('dark', (.03, .03, .035), .2, .8)
iron = area.mat('alloy', (.1, .1, .1), .6, .5)
slab = area.mat('basalt', (.16, .16, .17), 0, .85)
flame = area.mat('lamp.flame', (1, .72, .35), 0, .4, 7)

area.floor(floor)
area.walls(lambda x, z: WALL, stone, curb=ashlar)
vault = common.Vault(area, 'x', WALL, 4.2, pointed=.18)
vault.skin('Chapel vault', stone)
vault.gables('Chapel gable', stone)
a = X0 + 1.2
while a < X1 - 1:
    vault.rib('Transverse rib', a, ashlar, r=.2, inset=.025)
    a += 2.4
for side in 'ns':
    area.wall_strip('Impost cornice', side, WALL - .1, .3, .35, ashlar, .02)

# Ossuary walls in the manner of real charnel houses: courses of stacked
# long-bone ends banded with rows of skulls, crosses and rings of skulls set
# into the upper course. Every skull differs (Ossuary in areas/common.py);
# all of it stays within the 0.18 m wall relief below 4.3 m.
oss = common.Ossuary(area, [bone, bone_pale, bone_old], dark, backing, seed=31)
for side in 'nswe':
    oss.wall(side, [('bones', .36, .86), ('skulls', .99), ('bones', 1.12, 1.56), ('skulls', 1.69),
                    ('bones', 1.82, 2.32), ('skulls', 2.45)], motif_band=(2.58, 3.94))
    area.wall_strip('Ossuary cornice', side, 4.08, .26, .16, ashlar, .01, margin=.15)
    for t in area.bays(side, 2.4, margin=1.0, door_margin=.4):
        area.wall_box('Upper niche', side, t, 4.9, 1.2, .8, .05, dark, 0)
        area.wall_box('Niche sill', side, t, 4.42, 1.4, .1, .28, ashlar, .01)
        for k in range(3):
            oss.skull(side, t - .33 + k * .33, 4.66, .95, plain=True)
oss.build()

# Candles stand on the niche sills of the long walls and light the chapel.
for side in 'ns':
    for t in area.bays(side, 4.8, margin=1.6):
        for dt in (-.52, .52):
            x, y, z = area.wall_point(side, t + dt, 4.47, .18)
            area.pipe('Candle', (x, y, z), (x, y + .22, z), .025, bone, sides=8)
            area.ellipsoid('Flame', (x, y + .27, z), (.025, .05, .025), flame, segments=6, rings=4)
        lx, ly, lz = area.wall_point(side, t, 4.6, .45)
        tx, _, tz = area.wall_point(side, t, .2, 3)
        area.light('Niche candle glow', (lx, ly, lz), (tx, .2, tz), (1, .66, .34), 60, .35)

# The retable: a stone altarpiece with a candle rack in the east gable.
area.wall_box('Retable', 'e', CZ, 6.8, 4.2, 2.6, .25, ashlar, .02)
area.wall_box('Retable panel', 'e', CZ, 6.9, 3.2, 1.8, .1, dark, .01, off=.25)
for k in range(9):
    t = CZ - 1.6 + k * .4
    x, y, z = area.wall_point('e', t, 5.55, .45)
    area.pipe('Altar candle', (x, y, z), (x, y + .35 - .1 * (k % 2), z), .035, bone, sides=8)
    area.ellipsoid('Altar flame', (x, y + .42 - .1 * (k % 2), z), (.03, .06, .03), flame, segments=6, rings=4)
area.light('Retable candles', area.wall_point('e', CZ, 6.1, .9), area.wall_point('e', CZ, 0, 6), (1, .66, .34), 220, 1.2)

# Grave slabs in the floor (flat inlays).
for k in range(4):
    x = X0 + 2.5 + k * 3.2
    area.box('Grave slab', (x, .006, CZ), (1.1, .012, 2.2), slab, 0)
    area.box('Slab border', (x, .003, CZ), (1.25, .006, 2.35), ashlar, 0)

# Start rooms hold no enemies: the bake lights them, no runtime light.
practicals = []
area.finish(practicals=practicals, bake_albedo=.45)
