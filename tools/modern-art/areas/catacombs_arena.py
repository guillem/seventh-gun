"""The Catacombs arena, "the necropolis": a gothic rib vault over walls of
burial loculi, cold light through tall lancets, robed statues on corbels and
gibbet cages hung from the vault. Room 11 (26 x 26 m).

    node tools/modern-art/export_area_layout.mjs 3 catacombs-arena 75,22,88,35
    blender --background --factory-startup --python tools/modern-art/areas/catacombs_arena.py -- --size 2048 --samples 128
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

area = lib.Area('catacombs-arena', world=(.2, .24, .32), world_strength=.004)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
rng = random.Random(17)
WALL = 9.0

floor = area.mat('floor', (.13, .13, .14), 0, .9)
stone = area.mat('limestone', (.28, .29, .3), 0, .9)
ashlar = area.mat('limestone.ashlar', (.36, .36, .36), 0, .88)
dark = area.mat('dark', (.025, .025, .03), .2, .8)
bone = area.mat('bone', (.58, .53, .43), 0, .7)
iron = area.mat('alloy', (.09, .09, .09), .6, .5)
moon = area.mat('lamp.moon', (.62, .74, .95), 0, .4, 2.2)
flame = area.mat('lamp.flame', (1, .72, .35), 0, .4, 7)

area.floor(floor)
area.walls(lambda x, z: WALL, stone, curb=ashlar)
vault = common.Vault(area, 'x', WALL, 8.0, pointed=.28)
vault.skin('Necropolis vault', stone)
vault.gables('Necropolis gable', stone)
# Quadripartite feel: transverse ribs plus diagonal ribs in each bay.
bays = [X0 + 1.3 + i * (X1 - X0 - 2.6) / 5 for i in range(6)]
for a in bays:
    vault.rib('Transverse rib', a, ashlar, r=.26, inset=.02)
for a, b in zip(bays, bays[1:]):
    for flip in (0, 1):
        pts = []
        for k in range(13):
            f = k / 12
            t = math.pi * (f if flip else 1 - f)
            pts.append(vault.point(a + (b - a) * f, t, .02))
        area.tube('Diagonal rib', pts, .17, ashlar)
crown = vault.point(CX, math.pi / 2, .02)
area.tube('Ridge rib', [vault.point(X0 + .3, math.pi / 2, .02), vault.point(X1 - .3, math.pi / 2, .02)], .2, ashlar)
for a in bays:
    area.ellipsoid('Boss', vault.point(a, math.pi / 2, .04), (.45, .35, .45), ashlar, segments=12, rings=6)

# Long walls: loculi in five tiers above the combat volume, statues between.
for side in 'ns':
    for i, (a, b) in enumerate(zip(bays, bays[1:])):
        mid = (a + b) / 2
        for tier in range(4):
            y = 4.9 + tier * .95
            for k in range(3):
                t = mid - 1.3 + k * 1.3
                area.wall_box('Loculus', side, t, y, 1.0, .62, .05, dark, 0)
                area.wall_box('Loculus slab', side, t + .25, y, .45, .58, .1, ashlar, .01)
        area.wall_box('Bay lancet', side, mid, 8.2, .8, 1.4, .04, moon, 0) if i % 2 else None
    for a in bays[1:-1]:
        if not area.solid(side, a, .6):
            continue
        area.wall_box('Pier', side, a, 2.15, .9, 4.3, .16, ashlar, .02)
        area.wall_box('Statue corbel', side, a, 4.65, 1.1, .5, .8, ashlar, .03)
        x, _, z = area.wall_point(side, a, 0, .45)
        sections = [(x, 4.8, z, .38, .3), (x, 5.8, z, .42, .32), (x, 6.9, z, .34, .27), (x, 7.4, z, .24, .2), (x, 7.75, z, .2, .18), (x, 8.0, z, .05, .05)]
        if side in 'ns':
            sections = [(sx, sy, sz, rx, rz) for sx, sy, sz, rx, rz in sections]
        area.shell('Robed statue', sections, stone)
        area.ellipsoid('Statue hood', (x, 7.75, z), (.24, .3, .22), stone, segments=12, rings=6)

# Gables: three tall lancets of cold light each.
for side in 'we':
    for k, dz in enumerate((-4.5, 0, 4.5)):
        h = 7 if k == 1 else 5.5
        area.wall_box('Lancet', side, CZ + dz, 11 + (1 if k == 1 else 0), 1.3, h, .05, moon, 0)
        area.wall_box('Lancet frame', side, CZ + dz, 11 + (1 if k == 1 else 0), 1.7, h + .4, .04, ashlar, 0, off=-.01)
        x, y, z = area.wall_point(side, CZ + dz, 11, .6)
        area.light('Lancet light', (x, y, z), area.wall_point(side, CZ + dz * .5, 0, 12), (.62, .74, .95), 380, 1.2)
    area.wall_box('Rose band', side, CZ, 15.6, 6, .5, .4, ashlar, .02)

# Gibbet cages from the vault, lowest 7.8 m.
for cx, cz in [(CX - 6, CZ - 4), (CX + 5, CZ + 5), (CX + 1, CZ - 6), (CX - 4, CZ + 6)]:
    top = 16.0
    area.pipe('Cage chain', (cx, top, cz), (cx, 10.4, cz), .04, iron, sides=6)
    for j in range(8):
        th = 2 * math.pi * j / 8
        area.pipe('Cage bar', (cx + math.cos(th) * .5, 10.3, cz + math.sin(th) * .5), (cx + math.cos(th) * .55, 8.0, cz + math.sin(th) * .55), .025, iron, sides=5)
    area.tube('Cage hoop', common.ring((cx, 10.3, cz), .5, samples=16), .04, iron)
    area.tube('Cage hoop', common.ring((cx, 8.0, cz), .55, samples=16), .04, iron)
    area.ellipsoid('Remains', (cx, 8.3, cz), (.25, .2, .25), bone, segments=10, rings=5)

# Candle racks at eye level (relief) light the floor warmly.
for side in 'nswe':
    for t in area.bays(side, 6.5, margin=3.5):
        area.wall_box('Candle rack', side, t, 1.3, 1.6, .1, .16, iron, .005)
        for k in range(7):
            x, y, z = area.wall_point(side, t - .7 + k * .233, 1.4, .1)
            hgt = .18 + .1 * (k % 3)
            area.pipe('Rack candle', (x, y, z), (x, y + hgt, z), .03, bone, sides=6)
            area.ellipsoid('Rack flame', (x, y + hgt + .05, z), (.025, .05, .025), flame, segments=6, rings=4)
        lx, ly, lz = area.wall_point(side, t, 1.8, .45)
        tx, _, tz = area.wall_point(side, t, .1, 3.5)
        area.light('Rack glow', (lx, ly, lz), (tx, .1, tz), (1, .66, .34), 70, .6)

# Floor: a nave of ledger stones (flat).
for i in range(5):
    for j in (-1, 1):
        area.box('Ledger stone', (X0 + 4 + i * 4.5, .006, CZ + j * 2.2), (1.2, .012, 2.4), dark, 0)

# One runtime light per area (actors only; the bake lights surfaces),
# so ordinary rooms keep theirs within the map's 12-light budget.
practicals = [
    {'x': X0 + .8, 'y': 11, 'z': CZ, 'color': [.62, .74, .95], 'intensity': 18, 'distance': 26},
]
area.finish(practicals=practicals, bake_albedo=.45)
