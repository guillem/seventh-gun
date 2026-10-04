"""The Ward start room, "decontamination": a luminous ceiling grid over rows
of shower heads, glazed partitions, a drained floor and clinical signage.

    node tools/modern-art/export_area_layout.mjs 6 ward-start 6,40,13,47
    blender --background --factory-startup --python tools/modern-art/areas/ward_start.py -- --size 1024 --samples 128
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = _load('area_lib', HERE.parent / 'area_lib.py')
common = _load('common', HERE / 'common.py')

area = lib.Area('ward-start', world=(.7, .8, .82), world_strength=.006)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
WALL = 7.5

floor = area.mat('floor', (.32, .36, .36), 0, .5)
tile = area.mat('ceramic', (.5, .56, .56), 0, .35)
trim = area.mat('steel.trim', (.4, .43, .44), .5, .35)
teal = area.mat('ceramic.teal', (.12, .42, .42), 0, .4)
glass = area.mat('glass', (.2, .3, .32), .1, .1)
dark = area.mat('dark', (.05, .06, .06), .3, .5)
panel = area.mat('lamp.panel', (.86, .95, 1), 0, .4, 1.1)
warn = area.mat('lamp.warn', (1, .3, .2), 0, .4, 3)

area.floor(floor)
area.walls(lambda x, z: WALL, tile, curb=teal)
common.flat_roof(area, WALL, tile)

# Luminous ceiling: a grid of diffuser panels between steel tees.
x = X0 + 1
while x < X1:
    z = Z0 + 1
    while z < Z1:
        area.box('Ceiling diffuser', (x, WALL - .06, z), (1.7, .06, 1.7), panel, 0)
        z += 2
    x += 2
for x in [X0 + 2 * i for i in range(int((X1 - X0) / 2) + 1)]:
    area.box('Ceiling tee', (x, WALL - .1, CZ), (.12, .2, Z1 - Z0), trim, .005)
for z in [Z0 + 2 * j for j in range(int((Z1 - Z0) / 2) + 1)]:
    area.box('Ceiling tee', (CX, WALL - .1, z), (X1 - X0, .2, .12), trim, .005)
area.light('Ceiling field', (CX, WALL - .4, CZ), (CX, 0, CZ), (.88, .96, 1), 380, 6)

# Shower heads on drop pipes, lowest 5.2 m.
for i in range(3):
    for j in range(3):
        x, z = X0 + 3.5 + i * 3.5, Z0 + 3.5 + j * 3.5
        area.pipe('Drop pipe', (x, WALL - .2, z), (x, 5.45, z), .04, trim, sides=8)
        area.pipe('Shower rose', (x, 5.2, z), (x, 5.45, z), .22, trim, sides=14, r2=.06)

# Walls: tile courses, glazed partitions, a teal band and signage.
for side in 'nswe':
    area.wall_strip('Teal band', side, 1.2, .3, .04, teal)
    area.wall_strip('Upper band', side, 5.6, .2, .05, teal)
    for t in area.bays(side, 3.0, margin=1.2, door_margin=1.3):
        area.wall_box('Partition frame', side, t, 2.3, 2.0, 3.0, .06, trim, .005)
        area.wall_box('Partition glass', side, t, 2.3, 1.8, 2.8, .02, glass, 0, off=.06)
        area.wall_box('Hand basin', side, t, 1.0, .7, .18, .16, tile, .02)
    for t in area.bays(side, 7.0, margin=3.0, door_margin=1.4):
        area.wall_box('Warning lamp', side, t, 4.6, .4, .18, .1, warn, 0)
        x, y, z = area.wall_point(side, t, 4.6, .4)
        area.light('Warning glow', (x, y, z), area.wall_point(side, t, 3, 2), (1, .3, .2), 40, .2)
area.wall_text('DECONTAMINATION', 'n', CX, 6.4, .55, teal, off=.05)
area.wall_text('REMAIN UNDER SPRAY  60 S', 's', CX, 6.4, .35, teal, off=.05)

# Floor: a central drain grid and teal walkway stripes (flat).
area.box('Drain field', (CX, .006, CZ), (5.5, .012, 5.5), dark, 0)
for k in range(9):
    area.box('Drain slot', (CX - 2.4 + k * .6, .011, CZ), (.1, .008, 5.2), trim, 0)
for z in [Z0 + 1.2, Z1 - 1.2]:
    area.box('Walkway stripe', (CX, .008, z), (X1 - X0 - 2.4, .016, .3), teal, 0)

practicals = [
    {'x': CX, 'y': WALL - .5, 'z': CZ, 'color': [.88, .96, 1], 'intensity': 18, 'distance': 18},
]
area.finish(practicals=practicals, bake_albedo=.5)
