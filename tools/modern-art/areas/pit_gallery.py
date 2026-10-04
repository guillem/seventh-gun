"""The Pit gallery, "ore mill": a steel-framed processing hall cut into rock;
an ore conveyor runs overhead past hoppers and chutes, catwalks cross the
roof and floodlights rake the walls. Room 1 (28 x 18 m).

    node tools/modern-art/export_area_layout.mjs 4 pit-gallery 18,4,32,13
    blender --background --factory-startup --python tools/modern-art/areas/pit_gallery.py -- --size 2048 --samples 128
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

area = lib.Area('pit-gallery', world=(.3, .27, .22), world_strength=.004)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
rng = random.Random(23)
WALL, ROOF = 11.0, 13.5

floor = area.mat('floor', (.16, .14, .12), 0, .9)
rock = area.mat('basalt', (.36, .31, .26), 0, .92)
steel = area.mat('steel', (.12, .11, .1), .65, .45)
edge = area.mat('edge', (.3, .29, .27), .8, .38)
rust = area.mat('steel.rust', (.3, .15, .07), .3, .7)
ore = area.mat('basalt.ore', (.22, .16, .12), 0, .95)
ochre = area.mat('hazard', (.55, .35, .06), .2, .6)
belt = area.mat('dark', (.03, .03, .03), .1, .8)
flood = area.mat('lamp.flood', (1, .8, .55), 0, .4, 6)

area.floor(floor)
area.walls(lambda x, z: WALL, rock)
for side in 'nswe':
    common.rock_skin(area, side, 0, WALL, rock, seed=3.1 + 'nswe'.index(side))
common.upper_walls(area, ROOF, rock, base=WALL)
common.flat_roof(area, ROOF, rock, thickness=.6)

# Steel portal frames every 4.7 m: wall columns and roof girders.
frames = [X0 + 2.3 + i * (X1 - X0 - 4.6) / 5 for i in range(6)]
for x in frames:
    for side in 'ns':
        if area.solid(side, x, .4):
            area.wall_box('Frame column', side, x, 2.2, .4, 4.4, .16, steel, .01)
        area.wall_box('Frame column upper', side, x, (4.4 + ROOF) / 2, .5, ROOF - 4.4, .5, steel, .01)
    area.box('Roof girder', (x, ROOF - .5, CZ), (.45, 1.0, Z1 - Z0), steel, .01)

# Conveyor: a belt on trestle girders down the hall at 8 m, carrying ore.
BZ = CZ - 2.5
area.box('Conveyor stringer', (CX, 7.8, BZ), (X1 - X0, .35, 1.4), steel, .01)
area.box('Belt', (CX, 8.0, BZ), (X1 - X0, .06, 1.1), belt, 0)
for x in frames:
    area.pipe('Conveyor hanger', (x, 7.9, BZ - .6), (x, ROOF - 1, BZ - .6), .05, steel, sides=6)
    area.pipe('Conveyor hanger', (x, 7.9, BZ + .6), (x, ROOF - 1, BZ + .6), .05, steel, sides=6)
for k in range(46):
    x = X0 + .6 + k * (X1 - X0 - 1.2) / 45
    r = rng.uniform(.12, .26)
    area.ellipsoid('Ore lump', (x, 8.05 + r * .6, BZ + rng.uniform(-.35, .35)), (r, r * .7, r * .9), ore, segments=7, rings=4)
# Hoppers over the conveyor, chutes descending to the north wall.
for x in [X0 + 6, CX, X1 - 6]:
    area.pipe('Hopper', (x, 11.8, BZ + 3.2), (x, 9.6, BZ + 3.2), 1.5, rust, sides=4, r2=.4)
    area.box('Hopper frame', (x, 11.9, BZ + 3.2), (3.0, .3, 3.0), steel, .01)
    area.pipe('Hopper spout', (x, 9.6, BZ + 3.2), (x, 8.5, BZ + 1.6), .3, rust, sides=8)
for t in [X0 + 4, CX + 4, X1 - 4]:
    area.wall_tube('Ore chute', 'n', [(t, 10.5, .5), (t + .5, 8.5, 1.1), (t + .8, 6.4, .5)], .35, rust)
    area.wall_box('Chute gate', 'n', t + .8, 6.1, .9, .5, .5, steel, .01)

# A catwalk on the south side at 9.5 m (scenery: no stairs).
area.wall_box('Catwalk deck', 's', CX, 9.5, X1 - X0, .12, 1.4, edge, .005)
for t in range(int(X0) + 1, int(X1), 2):
    area.wall_tube('Catwalk post', 's', [(t, 9.55, 1.35), (t, 10.6, 1.35)], .035, ochre)
    area.wall_tube('Catwalk bracket', 's', [(t, 9.45, 1.3), (t, 8.7, .05)], .05, steel)
area.wall_tube('Catwalk rail', 's', [(X0 + .3, 10.6, 1.35), (X1 - .3, 10.6, 1.35)], .035, ochre)
area.wall_tube('Catwalk rail', 's', [(X0 + .3, 10.05, 1.35), (X1 - .3, 10.05, 1.35)], .03, ochre)

# Floodlights on the frames rake the walls and floor.
for i, x in enumerate(frames[1:-1]):
    side = 'ns'[i % 2]
    px, py, pz = area.wall_point(side, x, 7.2, .7)
    area.box('Floodlight housing', (px, py, pz), (.7, .5, .5), steel, .02)
    lx, ly, lz = area.wall_point(side, x, 6.95, .95)
    area.box('Floodlight lens', (lx, ly, lz), (.55, .36, .05) if side in 'ns' else (.05, .36, .55), flood, 0)
    tx, _, tz = area.wall_point(side, x + 3, 0, 9)
    area.light('Floodlight', (lx, ly - .2, lz), (tx, 0, tz), (1, .8, .55), 1500, .6)

# Eye level: ore bins and a hazard dado (relief), signage, tracks.
for side in 'nswe':
    area.wall_strip('Hazard dado', side, .6, .14, .03, ochre)
    for t in area.bays(side, 5.5, margin=2.5, door_margin=1.4):
        area.wall_box('Ore bin face', side, t, 1.2, 2.2, 1.6, .14, rust, .01)
        for y in (.6, 1.8):
            area.wall_box('Bin rib', side, t, y, 2.3, .12, .17, steel, .005)
area.wall_text('MILL  2  -  CRUSHER FEED', 'w', CZ, 5.6, .5, ochre, off=.17)
for dz in (-.55, .55):
    area.box('Rail', (CX, .0075, CZ + 3 + dz), (X1 - X0 - .4, .015, .07), edge, 0)

practicals = [
    {'x': frames[1], 'y': 6.75, 'z': Z0 + .95, 'color': [1, .82, .58], 'intensity': 26, 'distance': 24},
    {'x': frames[3], 'y': 6.75, 'z': Z0 + .95, 'color': [1, .82, .58], 'intensity': 26, 'distance': 24},
]
# Work lamps hung under the conveyor light the belt and the floor.
for x in frames:
    area.pipe('Belt lamp hanger', (x + 1.2, 7.6, BZ), (x + 1.2, 6.9, BZ), .015, steel, sides=4)
    area.pipe('Belt lamp', (x + 1.2, 6.7, BZ), (x + 1.2, 6.9, BZ), .2, flood, sides=10)
    area.light('Belt lamp', (x + 1.2, 6.6, BZ), (x + 1.2, 0, BZ), (1, .78, .5), 360, .3)
area.finish(practicals=practicals, bake_albedo=.55)
