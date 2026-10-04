"""The Foundry arena, "pour hall 03": a crucible hall under clerestory trusses,
a gantry crane carrying a glowing ladle, a molten trough high on the north
wall and a cast floor scattered with cooling ingots. Room 8 (30 x 26 m).

    node tools/modern-art/export_area_layout.mjs 1 foundry-arena 54,10,69,23
    blender --background --factory-startup --python tools/modern-art/areas/foundry_arena.py -- --size 2048 --samples 128
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

area = lib.Area('foundry-arena', world=(.32, .43, .55), world_strength=.006)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
rng = random.Random(3)
WALL, ROOF = 10.0, 17.0

floor = area.mat('floor', (.17, .17, .16), 0, .85)
concrete = area.mat('concrete', (.3, .3, .28), 0, .9)
steel = area.mat('steel', (.1, .12, .13), .7, .42)
edge = area.mat('edge', (.3, .33, .34), .8, .36)
ochre = area.mat('hazard', (.5, .3, .07), .3, .6)
paint = area.mat('concrete.paint', (.7, .66, .52), 0, .9)
dark = area.mat('dark', (.03, .035, .04), .5, .6)
molten = area.mat('lamp.molten', (1, .42, .1), 0, .4, 9)
ingot = area.mat('lamp.ingot', (1, .3, .06), 0, .4, 2.5)
sky = area.mat('lamp.sky', (.8, .88, 1), 0, .4, 1.2)
amber = area.mat('lamp.amber', (1, .58, .27), 0, .5, 3)

area.floor(floor)
area.walls(lambda x, z: WALL, concrete, curb=dark)
common.upper_walls(area, ROOF, concrete, base=WALL)

# Roof: concrete slabs with three clerestory slots of daylight.
slots = [X0 + 6, CX, X1 - 6]
x = X0
for sx in slots + [X1 + 2]:
    a, b = x, min(X1, sx - 1.2)
    if b > a:
        area.box('Roof slab', ((a + b) / 2, ROOF + .15, CZ), (b - a, .3, Z1 - Z0), concrete, 0)
    if sx <= X1:
        area.box('Clerestory glazing', (sx, ROOF + .2, CZ), (2.4, .05, Z1 - Z0), sky, 0)
        area.light('Clerestory daylight', (sx, ROOF - .2, CZ), (sx + 2, 0, CZ + 3), (.8, .88, 1), 900, 2.2)
    x = sx + 1.2

# Trusses span the hall's short (z) axis between steel columns.
for x in [X0 + 3, X0 + 9, CX + 3, X1 - 9, X1 - 3]:
    common.truss(area, (x, ROOF - .2, Z0 + .3), (x, ROOF - .2, Z1 - .3), 1.6, steel, edge, panels=10)
    for z, s in [(Z0, 1), (Z1, -1)]:
        if not area.solid('n' if s > 0 else 's', x, .6):
            continue
        # Columns: flat flanges below 4.3 m, full I-section above.
        side = 'n' if s > 0 else 's'
        area.wall_box('Column web', side, x, 2.15, .32, 4.3, .12, steel)
        area.wall_box('Column upper', side, x, (4.4 + ROOF) / 2, .5, ROOF - 4.4, .45, steel)
        for y in [.8, 2.4, 3.8]:
            area.wall_box('Column splice', side, x, y, .5, .16, .17, edge, .005)

# Crane rails on corbels along both long walls at 12 m, and the gantry.
for side in 'ns':
    area.wall_box('Crane rail girder', side, CX, 12, X1 - X0, .8, .9, steel, .02, off=.0)
    area.wall_box('Rail head', side, CX, 12.45, X1 - X0, .12, .2, edge, .005, off=.6)
    for t in area.bays(side, 5.0, margin=1.5, door_margin=-10):
        area.wall_box('Rail corbel', side, t, 11.1, .5, 1.0, .8, concrete, .03)
GX = CX - 4
area.box('Gantry girder', (GX, 12.9, CZ), (1.1, 1.1, Z1 - Z0 - 1.6), ochre, .02)
for z in [Z0 + 1.2, Z1 - 1.2]:
    area.box('Gantry end truck', (GX, 12.7, z), (2.6, .8, .9), steel, .02)
area.box('Crane trolley', (GX, 13.7, CZ + 2), (1.6, .7, 2.2), steel, .02)
for dx in [-.25, .25]:
    area.pipe('Hoist rope', (GX + dx, 13.4, CZ + 2), (GX + dx, 11.4, CZ + 2), .03, dark, sides=6)
# The ladle: a steel crucible whose open lip glows, lowest point 9 m.
LY = 9.0
area.pipe('Ladle shell', (GX, LY, CZ + 2), (GX, LY + 2.2, CZ + 2), 1.25, steel, sides=24, r2=1.55)
area.pipe('Ladle rim', (GX, LY + 2.15, CZ + 2), (GX, LY + 2.35, CZ + 2), 1.62, edge, sides=24)
common.disc(area, 'Molten surface', (GX, LY + 2.3, CZ + 2), 1.45, molten)
area.box('Ladle bail', (GX, LY + 2.6, CZ + 2), (.18, .9, 3.6), steel, .02)
area.pipe('Pour lip', (GX + 1.3, LY + 2.1, CZ + 2), (GX + 1.9, LY + 1.7, CZ + 2), .28, steel, sides=12, r2=.18)
area.light('Ladle glow', (GX, LY + 3.2, CZ + 2), (GX, ROOF, CZ + 2), (1, .45, .14), 900, 1.4)
area.light('Ladle underglow', (GX + 1.6, LY + 1.2, CZ + 2), (GX + 2, 0, CZ + 2), (1, .42, .12), 650, .8)

# The north wall carries a molten trough above the combat volume.
area.wall_box('Trough', 'n', CX + 2, 7.0, 16, .9, 1.2, steel, .02)
area.wall_box('Molten channel', 'n', CX + 2, 7.48, 15.2, .06, .9, molten, 0, off=.15)
for t in [CX - 4, CX + 2, CX + 8]:
    x, y, z = area.wall_point('n', t, 8.0, .7)
    area.light('Trough glow', (x, y, z), (x, 0, z + 4), (1, .45, .14), 420, 1.6)
for t in [CX - 5.5, CX + 9.5]:
    area.wall_box('Trough hanger', 'n', t, 8.6, .2, 2.4, .3, steel)

# Eye level: casting moulds, ladders, control boxes, cast lettering.
for side in 'nswe':
    for i, t in enumerate(area.bays(side, 6.0, margin=2.5)):
        if i % 2 == 0:
            area.wall_box('Mould pattern', side, t, 1.6, 2.2, 2.4, .08, dark, .02)
            for y in [.7, 1.6, 2.5]:
                area.wall_box('Mould rib', side, t, y, 2.0, .1, .14, edge, .005)
        else:
            area.wall_box('Control box', side, t, 1.7, .9, 1.2, .14, steel, .02)
            area.wall_box('Control lamp', side, t + .25, 2.05, .12, .12, .16, amber, 0)
            area.wall_box('Gauge face', side, t - .2, 1.85, .3, .3, .16, paint, 0)
    # A ladder to the crane rail at each wall's first bay.
    bays = area.bays(side, 6.0, margin=2.5)
    if bays:
        t = bays[0] - 1.6
        if area.solid(side, t, .6):
            for dt in (-.3, .3):
                area.wall_tube('Ladder rail', side, [(t + dt, 0, .12), (t + dt, 6, .12), (t + dt, 11.6, .12)], .035, ochre)
            for y in [.4 + .35 * i for i in range(32)]:
                area.wall_tube('Ladder rung', side, [(t - .3, y, .12), (t, y, .12), (t + .3, y, .12)], .022, ochre)
area.wall_text('POUR  /  03', 'w', CZ, 7.6, 1.1, paint)
area.wall_text('POUR  /  03', 'e', CZ, 7.6, 1.1, paint)
area.wall_text('CASTING FLOOR  -  KEEP CLEAR OF LADLE PATH', 's', CX, 5.4, .32, paint)
for side in 'nswe':
    area.wall_strip('Hazard dado', side, .55, .12, .03, ochre)

# Floor: cast plates, a ladle path and cooling ingots (flat inlays).
area.box('Ladle path', (GX, .006, CZ), (3.2, .012, Z1 - Z0 - 2), dark, 0)
for z in [Z0 + 1.6, Z1 - 1.6]:
    area.box('Path stripe', (GX - 1.7, .009, z), (.2, .018, .2), ochre, 0)
for k in range(10):
    ix, iz = rng.uniform(X0 + 3, X1 - 3), rng.uniform(Z0 + 3, Z1 - 3)
    if abs(ix - GX) < 2.5:
        continue
    area.box('Cooling ingot', (ix, .008, iz), (1.4, .016, .55), ingot, 0)

# Amber wall lamps light actors near the walls.
for side in 'sw':
    for t in area.bays(side, 9.0, margin=3):
        area.wall_box('Wall lamp', side, t, 3.3, .7, .25, .14, dark, .01)
        area.wall_box('Lamp lens', side, t, 3.3, .55, .12, .16, amber, 0)
        lx, _, lz = area.wall_point(side, t, 3.3, .4)
        tx, _, tz = area.wall_point(side, t, .4, 3)
        area.light('Wall lamp pool', (lx, 3.3, lz), (tx, .4, tz), (1, .58, .28), 90, .5)

practicals = [
    {'x': GX + 1.6, 'y': LY + 1.2, 'z': CZ + 2, 'color': [1, .5, .22], 'intensity': 34, 'distance': 26},
    {'x': CX, 'y': ROOF - 2, 'z': CZ + 3, 'color': [.8, .88, 1], 'intensity': 18, 'distance': 26},
]
area.finish(practicals=practicals, bake_albedo=.45)
