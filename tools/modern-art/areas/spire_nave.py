"""The Spire nave: a coffered barrel vault over an arcade of pilasters, gold
light through a row of clerestory windows, a glowing apse in the east gable
and bronze lamps on long chains. Room 3 (28 x 18 m).

    node tools/modern-art/export_area_layout.mjs 5 spire-nave 48,48,62,57
    blender --background --factory-startup --python tools/modern-art/areas/spire_nave.py -- --size 2048 --samples 128
"""
import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = _load('area_lib', HERE.parent / 'area_lib.py')
common = _load('common', HERE / 'common.py')

area = lib.Area('spire-nave', world=(.6, .56, .48), world_strength=.006)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
WALL = 11.0

floor = area.mat('floor', (.3, .29, .27), 0, .6)
stone = area.mat('limestone', (.58, .55, .48), 0, .85)
cream = area.mat('limestone.cream', (.68, .65, .57), 0, .8)
bronze = area.mat('limestone.bronze', (.5, .36, .17), 0, .55)
gold = area.mat('lamp.gold', (1, .8, .42), 0, .4, 3.5)
gilt = area.mat('lamp.gilt', (1, .78, .4), 0, .4, .8)
marble = area.mat('basalt', (.16, .15, .14), 0, .4)

area.floor(floor)
area.walls(lambda x, z: WALL, stone, curb=cream)
vault = common.Vault(area, 'x', WALL, 6.5)
vault.skin('Nave vault', stone)
vault.gables('Nave gable', stone)
# Coffers: transverse ribs and longitudinal rings across the vault.
ribs = [X0 + .7 + i * (X1 - X0 - 1.4) / 9 for i in range(10)]
for a in ribs:
    vault.rib('Vault band', a, cream, r=.22, inset=.02)
for k in range(1, 6):
    t = math.pi * k / 6
    area.tube('Coffer ring', [vault.point(X0 + .3, t, .02), vault.point(X1 - .3, t, .02)], .14, cream)
for a, b in zip(ribs, ribs[1:]):
    for k in range(6):
        p = vault.point((a + b) / 2, math.pi * (k + .5) / 6, .04)
        area.ellipsoid('Coffer rosette', p, (.25, .25, .25), gilt, segments=10, rings=5)

# Long walls: arcade pilasters, entablature, clerestory windows above.
for side in 'ns':
    area.wall_strip('Entablature', side, 9.2, 1.0, .5, cream, .02)
    area.wall_strip('Cornice', side, WALL - .1, .3, .7, cream, .02)
    for i, a in enumerate(ribs):
        if area.solid(side, a, .4):
            area.wall_box('Pilaster', side, a, 4.1, .9, 8.2, .16, cream, .01)
        area.wall_box('Pilaster upper', side, a, 6.6, 1.0, 3.2, .45, cream, .02)
        area.wall_box('Capital', side, a, 8.45, 1.3, .5, .55, cream, .02)
for a, b in zip(ribs, ribs[1:]):
    mid = (a + b) / 2
    for t in (.32, math.pi - .32):
        p = vault.point(mid, t, -.005)
        area.box('Clerestory window', p, (1.2, 1.8, .2), gold, 0)
        q = vault.point(mid, t, .12)
        area.light('Clerestory light', q, (mid, 0, CZ), (1, .82, .5), 260, .9)

# The apse: a half-dome niche in the east gable, glowing gold.
ax, ay, az = X1 - .05, 9.5, CZ
common.dome(area, 'Apse half dome', (ax, ay, az), 3.5, gilt, rings=8, segments=24)
area.tube('Apse arch', [(ax - .3, ay + math.sin(math.pi * k / 16) * 3.6, az + math.cos(math.pi * k / 16) * 3.6) for k in range(17)], .3, cream)
area.light('Apse glow', (ax - 2.5, ay + 1.5, az), (X0, 2, az), (1, .82, .5), 900, 2.5)
area.wall_box('Apse dais face', 'e', CZ, 8.4, 7.2, .6, .5, cream, .02)

# Bronze lamps hang on long chains along the nave, lowest 6.5 m.
for i, x in enumerate([X0 + 5, CX - 2.5, CX + 2.5, X1 - 5]):
    top = vault.point(x, math.pi / 2, .03)[1]
    area.pipe('Lamp chain', (x, top, CZ), (x, 7.3, CZ), .03, bronze, sides=6)
    area.pipe('Lamp bowl', (x, 6.5, CZ), (x, 7.3, CZ), .55, bronze, sides=16, r2=.25)
    common.disc(area, 'Lamp flame', (x, 7.28, CZ), .45, gold)
    area.light('Lamp glow', (x, 6.4, CZ), (x, 0, CZ), (1, .78, .45), 380, .5)

# Gables: low relief panels; floor: a nave runner and marble discs (flat).
for side in 'we':
    for t in area.bays(side, 4.5, margin=2.0, door_margin=1.6):
        area.wall_box('Gable relief', side, t, 3.4, 1.8, 3.0, .12, bronze, .02)
area.box('Nave runner', (CX, .006, CZ), (X1 - X0 - 3, .012, 3.0), marble, 0)
for x in ribs[1:-1]:
    common.disc(area, 'Marble roundel', (x, .011, CZ), .9, cream, samples=20)

practicals = [
    {'x': X0 + 5, 'y': 6.4, 'z': CZ, 'color': [1, .8, .5], 'intensity': 22, 'distance': 22},
    {'x': X1 - 5, 'y': 6.4, 'z': CZ, 'color': [1, .8, .5], 'intensity': 22, 'distance': 22},
]
area.finish(practicals=practicals, bake_albedo=.5)
