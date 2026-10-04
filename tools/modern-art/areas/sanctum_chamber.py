"""The Sanctum reactor hall: a long dark hall threaded by a glowing conduit
that passes through four great containment rings, cable bundles high on the
walls and shield vanes below. Room 3 (44 x 26 m).

    node tools/modern-art/export_area_layout.mjs 7 sanctum-chamber 32,52,54,65
    blender --background --factory-startup --python tools/modern-art/areas/sanctum_chamber.py -- --size 2048 --samples 128
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

area = lib.Area('sanctum-chamber', world=(.1, .3, .34), world_strength=.004)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
WALL, TOP = 9.0, 18.0
RY = 12.5  # ring and conduit axis height

floor = area.mat('floor', (.12, .14, .15), 0, .5)
hull = area.mat('steel.hull', (.16, .19, .21), .4, .45)
fin = area.mat('steel.fin', (.22, .26, .28), .4, .4)
dark = area.mat('dark', (.04, .05, .06), .3, .5)
cable = area.mat('dark.cable', (.06, .07, .07), 0, .7)
teal = area.mat('lamp.teal', (.3, .95, .95), 0, .4, 3.5)
core = area.mat('lamp.core', (.55, 1, 1), 0, .4, 6)

area.floor(floor)
area.walls(lambda x, z: WALL, hull, curb=dark)
common.upper_walls(area, TOP, hull, base=WALL)
common.flat_roof(area, TOP, hull)
x = X0 + 2
while x < X1:
    area.box('Roof rib', (x, TOP - .4, CZ), (.4, .8, Z1 - Z0), fin, .02)
    x += 4

# The conduit: a glowing core inside a ribbed sleeve, end to end at 12.5 m.
area.pipe('Conduit core', (X0, RY, CZ), (X1, RY, CZ), .55, core, sides=16)
x = X0 + .6
while x < X1:
    area.pipe('Conduit sleeve band', (x - .25, RY, CZ), (x + .25, RY, CZ), .85, fin, sides=16)
    x += 1.6
for x in [X0 + 4, X1 - 4]:
    area.light('Conduit glow', (x, RY - 1.2, CZ), (x, 0, CZ), (.5, 1, 1), 600, 1.5)

# Containment rings in the cross-section, lowest point 6 m.
for i, x in enumerate([X0 + 7.5, X0 + 17, X1 - 17, X1 - 7.5]):
    R = 6.5
    area.tube('Containment ring', [(x, RY + math.sin(a) * R, CZ + math.cos(a) * R) for a in [2 * math.pi * k / 48 for k in range(49)]], .55, fin)
    area.tube('Ring energy band', [(x - .6, RY + math.sin(a) * (R - .2), CZ + math.cos(a) * (R - .2)) for a in [2 * math.pi * k / 48 for k in range(49)]], .1, teal)
    for k in range(6):
        a = 2 * math.pi * k / 6 + math.pi / 6
        area.pipe('Ring spoke', (x, RY + math.sin(a) * .9, CZ + math.cos(a) * .9), (x, RY + math.sin(a) * (R - .5), CZ + math.cos(a) * (R - .5)), .12, fin, sides=8)
    for s in (-1, 1):
        area.pipe('Ring mount', (x, RY + 2, CZ + s * (R + .2)), (x, RY + 3.5, Z0 if s < 0 else Z1), .3, fin, sides=8)
    area.light('Ring band glow', (x - 1, RY - R + .6, CZ), (x, 0, CZ), (.3, .95, .95), 300, 1.0)

# Walls: shield vanes below, cable bundles above, teal seams.
for side in 'nswe':
    for t in area.bays(side, 1.8, margin=1.0, door_margin=.4):
        area.wall_box('Shield vane', side, t, 2.15, .5, 4.3, .16, fin, .02)
        area.wall_box('Vane channel', side, t, 2.3, .05, 3.6, .17, teal, 0)
    area.wall_strip('Plinth', side, .25, .5, .12, dark, .01)
    area.wall_strip('Seam', side, 4.5, .06, .06, teal)
    a0, a1 = area.side_range(side)
    for k in range(5):
        y = 7.0 + k * .32
        area.wall_tube('Cable bundle', side, [(a0 + .3, y, .5 + k * .05), ((a0 + a1) / 2, y - .5, .9), (a1 - .3, y, .5 + k * .05)], .13, cable)
area.portal_frames(fin)
area.wall_text('REACTOR HALL  B', 'w', CZ, 6.0, .55, teal, off=.2)

# Floor: teal guide lines along the hall (flat).
for dz in (-4.5, 4.5):
    area.box('Guide line', (CX, .008, CZ + dz), (X1 - X0 - 3, .016, .12), teal, 0)

practicals = [
    {'x': X0 + 7.5, 'y': RY - 5.9, 'z': CZ, 'color': [.4, .95, .95], 'intensity': 20, 'distance': 22},
    {'x': X1 - 7.5, 'y': RY - 5.9, 'z': CZ, 'color': [.4, .95, .95], 'intensity': 20, 'distance': 22},
]
area.finish(practicals=practicals, bake_albedo=.5)
