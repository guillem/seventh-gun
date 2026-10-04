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

# Ossuary walls: shallow ranks of skulls and long bones below 4.3 m (within
# 0.16 m), deeper niches above.
for side in 'nswe':
    a0, a1 = area.side_range(side)
    for row, y in enumerate([.75, 1.45, 2.15, 2.85, 3.55]):
        if row % 2 == 0:
            t = a0 + .3 + (row % 4) * .1
            while t < a1 - .3:
                if area.solid(side, t, .4):
                    x, yy, z = area.wall_point(side, t, y, .07)
                    nx, nz = area.SIDES[side]
                    area.ellipsoid('Skull', (x, yy, z), (.06 if nx else .12, .14, .12 if nx else .06), bone, segments=8, rings=5)
                    for e in (-.045, .045):
                        ex, ey, ez = area.wall_point(side, t + e, y + .02, .12)
                        area.ellipsoid('Eye socket', (ex, ey, ez), (.02 if nx else .03, .03, .03 if nx else .02), dark, segments=5, rings=3)
                t += .3
        else:
            t = a0 + .3
            while t < a1 - .3:
                end = min(a1 - .3, t + 1.6)
                if area.solid(side, t, .4) and area.solid(side, end, .4):
                    area.wall_tube('Long bone', side, [(t, y, .06), ((t + end) / 2, y + .02, .07), (end, y, .06)], .045, bone)
                t = end + .2
    for t in area.bays(side, 2.4, margin=1.0, door_margin=.4):
        area.wall_box('Upper niche', side, t, 4.9, 1.2, .8, .05, dark, 0)
        area.wall_box('Niche sill', side, t, 4.45, 1.4, .1, .28, ashlar, .01)
        for k in range(3):
            x, y, z = area.wall_point(side, t - .35 + k * .35, 4.7, .14)
            nx, nz = area.SIDES[side]
            area.ellipsoid('Niche skull', (x, y, z), (.1 if nx else .12, .13, .12 if nx else .1), bone, segments=10, rings=6)

# Candle sconces between bays light the chapel.
for side in 'ns':
    for t in area.bays(side, 4.2, margin=1.6):
        area.wall_box('Sconce plate', side, t, 3.2, .3, .5, .06, iron, .01)
        for dt in (-.08, .08):
            x, y, z = area.wall_point(side, t + dt, 3.3, .14)
            area.pipe('Candle', (x, y - .2, z), (x, y, z), .025, bone, sides=8)
            area.ellipsoid('Flame', (x, y + .05, z), (.025, .05, .025), flame, segments=6, rings=4)
        lx, ly, lz = area.wall_point(side, t, 3.4, .35)
        tx, _, tz = area.wall_point(side, t, .2, 3)
        area.light('Sconce glow', (lx, ly, lz), (tx, .2, tz), (1, .66, .34), 45, .3)

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
    area.box('Slab border', (x, .009, CZ), (1.25, .006, 2.35), ashlar, 0)

practicals = [
    {'x': X1 - .9, 'y': 6.1, 'z': CZ, 'color': [1, .66, .36], 'intensity': 16, 'distance': 18},
]
area.finish(practicals=practicals, bake_albedo=.45)
