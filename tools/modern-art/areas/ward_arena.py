"""The Ward arena, "theatre one": an operating theatre whose tiered
observation galleries rise behind glass on all sides, a cluster of great
surgical lamps on articulated arms over the centre and a clean-air canopy.
Room 7 (36 x 30 m).

    node tools/modern-art/export_area_layout.mjs 6 ward-arena 59,52,77,67
    blender --background --factory-startup --python tools/modern-art/areas/ward_arena.py -- --size 2048 --samples 128
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

area = lib.Area('ward-arena', world=(.6, .7, .74), world_strength=.006)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
WALL, TOP = 6.0, 16.0

floor = area.mat('floor', (.3, .34, .34), 0, .45)
tile = area.mat('ceramic', (.6, .66, .66), 0, .35)
seat = area.mat('ceramic.seat', (.14, .36, .38), 0, .6)
trim = area.mat('steel.trim', (.42, .45, .46), .5, .35)
glass = area.mat('glass', (.2, .3, .32), .1, .1)
dark = area.mat('dark', (.05, .06, .06), .3, .5)
lens = area.mat('lamp.surgical', (.92, .98, 1), 0, .4, 6)
canopy = area.mat('lamp.canopy', (.8, .92, .98), 0, .4, 1.4)
red = area.mat('lamp.red', (1, .22, .16), 0, .4, 3)

area.floor(floor)
area.walls(lambda x, z: WALL, tile, curb=dark)
common.upper_walls(area, TOP, tile, base=WALL)
common.flat_roof(area, TOP, tile)

# Observation tiers: four stepped rows set back behind a glazed screen.
for side in 'nswe':
    a0, a1 = area.side_range(side)
    mid, length = (a0 + a1) / 2, a1 - a0
    area.wall_box('Gallery sill', side, mid, WALL + .2, length, .4, 1.0, trim, .01)
    area.wall_box('Observation glass', side, mid, WALL + 2.4, length, 4.0, .03, glass, 0, off=.95)
    for t in [a0 + 3 + i * (length - 6) / max(1, int((length - 6) / 4)) for i in range(int((length - 6) / 4) + 1)]:
        area.wall_box('Glazing post', side, t, WALL + 2.4, .12, 4.0, .1, trim, .005, off=.92)
    for k in range(4):
        y = WALL + .5 + k * .9
        area.wall_box('Seat tier', side, mid, y, length, .45, .9 - k * .18, seat, .02, off=.0)
    area.wall_box('Gallery ceiling', side, mid, WALL + 4.6, length, .2, 1.1, tile, .01)
    area.wall_strip('Red stripe', side, 2.2, .08, .03, red)
    area.wall_strip('Tile dado', side, .7, 1.4, .05, tile, .005)
    for t in area.bays(side, 6.0, margin=3.0, door_margin=1.4):
        area.wall_box('Scrub station', side, t, 1.6, 1.4, 1.0, .14, trim, .01)
        area.wall_box('Gas outlets', side, t, 3.2, .8, .3, .12, dark, .01)
        for k in range(3):
            area.wall_box('Gas valve', side, t - .25 + k * .25, 3.2, .1, .1, .17, red if k == 1 else trim, 0)

# Clean-air canopy: a luminous field over the table zone.
area.box('Canopy frame', (CX, 12.2, CZ), (12, .4, 10), trim, .02)
area.box('Canopy diffuser', (CX, 11.98, CZ), (11.4, .05, 9.4), canopy, 0)
for dx in (-5.6, 5.6):
    for dz in (-4.6, 4.6):
        area.pipe('Canopy hanger', (CX + dx, 12.4, CZ + dz), (CX + dx, TOP, CZ + dz), .05, trim, sides=6)
area.light('Canopy field', (CX, 11.7, CZ), (CX, 0, CZ), (.82, .93, 1), 1500, 8)

# The surgical lamps: three great heads on articulated arms, lowest 7.4 m.
hub = (CX, 11.6, CZ)
area.pipe('Lamp mast', (CX, 12.0, CZ), (CX, 10.6, CZ), .18, trim, sides=12)
for k, (r, h) in enumerate([(4.2, 8.2), (3.4, 7.6), (4.8, 8.8)]):
    th = 2 * math.pi * k / 3 + .4
    ex, ez = CX + math.cos(th) * r, CZ + math.sin(th) * r
    elbow = (CX + math.cos(th) * r * .55, 10.9, CZ + math.sin(th) * r * .55)
    area.pipe('Lamp arm', (CX, 10.8, CZ), elbow, .1, trim, sides=10)
    area.pipe('Lamp forearm', elbow, (ex, h + .6, ez), .09, trim, sides=10)
    area.ellipsoid('Arm joint', elbow, (.18, .18, .18), dark, segments=10, rings=5)
    area.pipe('Lamp head', (ex, h, ez), (ex, h + .55, ez), 1.15, tile, sides=24, r2=.5)
    common.disc(area, 'Lamp lens', (ex, h - .01, ez), 1.0, lens, samples=24)
    for j in range(6):
        a = 2 * math.pi * j / 6
        common.disc(area, 'Lamp cell', (ex + math.cos(a) * .55, h - .02, ez + math.sin(a) * .55), .2, dark, samples=10)
    area.light('Surgical lamp', (ex, h - .3, ez), (CX, 0, CZ), (.95, .98, 1), 900, 1.0)

# Floor: the table zone in teal with a radiating drain pattern (flat).
area.box('Table zone', (CX, .006, CZ), (9, .012, 7), seat, 0)
for k in range(12):
    th = 2 * math.pi * k / 12
    area.box('Drain line', (CX + math.cos(th) * 2.4, .011, CZ + math.sin(th) * 2.4), (.06, .008, .06), dark, 0)
common.disc(area, 'Central drain', (CX, .013, CZ), .5, dark, samples=20)
area.wall_text('THEATRE  1  -  STERILE FIELD', 'n', CX, 4.2, .5, seat, off=.06)

practicals = [
    {'x': CX, 'y': 7.9, 'z': CZ, 'color': [.95, .98, 1], 'intensity': 28, 'distance': 28},
    {'x': CX - 10, 'y': 11.7, 'z': CZ, 'color': [.82, .93, 1], 'intensity': 14, 'distance': 24},
]
area.finish(practicals=practicals, bake_albedo=.5)
