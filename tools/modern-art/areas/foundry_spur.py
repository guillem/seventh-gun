"""The Foundry spur, "pattern shop 02": a workshop under exposed beams and
cable trays, a glazed control booth cantilevered high on the east wall,
pattern racks and lockers at eye level. Room 2 (18 x 16 m).

    node tools/modern-art/export_area_layout.mjs 1 foundry-spur 22,26,31,34
    blender --background --factory-startup --python tools/modern-art/areas/foundry_spur.py -- --size 1024 --samples 128
"""
import importlib.util
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

area = lib.Area('foundry-spur', world=(.32, .43, .55), world_strength=.005)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
rng = random.Random(5)
WALL, ROOF = 7.0, 9.6

floor = area.mat('floor', (.18, .18, .17), 0, .85)
concrete = area.mat('concrete', (.3, .3, .28), 0, .9)
steel = area.mat('steel', (.1, .12, .13), .7, .42)
edge = area.mat('edge', (.3, .33, .34), .8, .36)
timber = area.mat('timber', (.36, .24, .13), 0, .8)
ochre = area.mat('hazard', (.5, .3, .07), .3, .6)
paint = area.mat('concrete.paint', (.7, .66, .52), 0, .9)
dark = area.mat('dark', (.03, .035, .04), .5, .6)
glass = area.mat('glass', (.12, .2, .22), .1, .15)
screen = area.mat('lamp.screen', (.45, .9, .75), 0, .4, 2)
tube = area.mat('lamp.tube', (.85, .92, 1), 0, .4, 4)
amber = area.mat('lamp.amber', (1, .58, .27), 0, .5, 3)

area.floor(floor)
area.walls(lambda x, z: WALL, concrete, curb=dark)
common.upper_walls(area, ROOF, concrete, base=WALL)
common.flat_roof(area, ROOF, concrete)

# Exposed beams across the short axis and cable trays along it.
x = X0 + 1.5
while x < X1 - 1:
    area.box('Roof beam', (x, ROOF - .35, CZ), (.35, .7, Z1 - Z0), steel, .01)
    x += 3.0
for z in [Z0 + 3, CZ, Z1 - 3]:
    area.box('Cable tray', (CX, ROOF - 1.0, z), (X1 - X0 - .4, .12, .6), edge, .005)
    for k in range(4):
        area.pipe('Tray cable', (X0 + .2, ROOF - .92 + k * .03, z - .2 + k * .13), (X1 - .2, ROOF - .92 + k * .03, z - .2 + k * .13), .03, dark, sides=6)

# Hanging fluorescent battens, lowest 6.2 m.
for z in [Z0 + 4, Z1 - 4]:
    for x in [X0 + 4.5, CX, X1 - 4.5]:
        for dx in (-.9, .9):
            area.pipe('Batten hanger', (x + dx, ROOF - .4, z), (x + dx, 6.4, z), .012, dark, sides=4)
        area.box('Batten housing', (x, 6.35, z), (2.2, .12, .3), steel, .01)
        area.box('Batten tube', (x, 6.27, z), (2.0, .05, .16), tube, 0)
        area.light('Batten light', (x, 6.15, z), (x, 0, z), (.85, .92, 1), 160, 1.6)

# A glazed control booth cantilevered on the east wall (scenery, 5-7.6 m).
BZ0, BZ1 = CZ - 3, CZ + 3
area.wall_box('Booth floor', 'e', CZ, 4.85, 6.4, .3, 2.4, steel, .02)
area.wall_box('Booth roof', 'e', CZ, 7.75, 6.4, .25, 2.4, steel, .02)
area.wall_box('Booth glazing', 'e', CZ, 6.3, 6.0, 2.6, .06, glass, 0, off=2.3)
for t in [BZ0 + .1, CZ, BZ1 - .1]:
    area.wall_box('Booth mullion', 'e', t, 6.3, .12, 2.8, .14, steel, .005, off=2.25)
for t in [BZ0 + 1.2, CZ, BZ1 - 1.2]:
    area.wall_box('Booth screen', 'e', t, 6.0, 1.0, .6, .05, screen, 0, off=.6)
for t in [BZ0 + .4, BZ1 - .4]:
    area.wall_tube('Booth strut', 'e', [(t, 4.7, 2.2), (t, 4.5, 1.1), (t, 4.45, .05)], .08, steel)
area.light('Booth glow', area.wall_point('e', CZ, 6.2, 1.3), area.wall_point('e', CZ, 0, 5), (.5, .9, .8), 140, 1.5)
area.wall_text('CONTROL', 'e', CZ, 8.3, .5, paint)

# Eye level: pattern racks, lockers, a gauge board; a hazard dado.
for side in 'nsw':
    for i, t in enumerate(area.bays(side, 3.2, margin=1.6)):
        kind = (i + 'nsw'.index(side)) % 3
        if kind == 0:
            for y in [.6, 1.4, 2.2, 3.0]:
                area.wall_box('Pattern shelf', side, t, y, 2.6, .06, .16, timber, .005)
            for k in range(5):
                area.wall_box('Wooden pattern', side, t - 1.0 + k * .5, 1.75 + rng.uniform(-.3, .3), .32, .45, .12, timber, .01)
        elif kind == 1:
            for k in range(4):
                area.wall_box('Locker', side, t - .9 + k * .6, 1.0, .56, 1.95, .14, steel, .01)
                area.wall_box('Locker vents', side, t - .9 + k * .6, 1.7, .36, .2, .16, dark, 0)
        else:
            area.wall_box('Gauge board', side, t, 1.9, 2.4, 1.4, .08, dark, .01)
            for k in range(3):
                area.wall_box('Gauge', side, t - .7 + k * .7, 2.05, .4, .4, .12, paint, .005)
            area.wall_box('Board lamp', side, t, 1.35, .3, .1, .14, amber, 0)
for side in 'nswe':
    a0, a1 = area.side_range(side)
    area.wall_box('Hazard dado', side, (a0 + a1) / 2, .55, a1 - a0, .12, .03, ochre, 0)
area.wall_text('PATTERN SHOP  /  02', 'w', CZ, 5.4, .45, paint)

# Floor: painted walkway and drain gratings (flat).
area.box('Walkway', (CX, .006, CZ), (X1 - X0 - 3, .012, 2.2), dark, 0)
for x in [X0 + 1.5, X1 - 1.5]:
    area.box('Walkway stripe', (x, .009, CZ), (.12, .018, 2.2), ochre, 0)
for z in [Z0 + 2, Z1 - 2]:
    area.box('Drain grate', (CX, .008, z), (2.4, .016, .4), edge, 0)

practicals = [
    {'x': CX, 'y': 6.0, 'z': Z0 + 4, 'color': [.85, .92, 1], 'intensity': 16, 'distance': 16},
    {'x': CX, 'y': 6.0, 'z': Z1 - 4, 'color': [.85, .92, 1], 'intensity': 16, 'distance': 16},
]
area.finish(practicals=practicals, bake_albedo=.45)
