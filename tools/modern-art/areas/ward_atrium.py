"""The Ward atrium: three galleried floors look down into a light well under
a glazed roof lantern; glass balustrades, pendant lights on long cables and
hanging wayfinding banners. Room 1 (28 x 28 m).

    node tools/modern-art/export_area_layout.mjs 6 ward-atrium 18,36,32,50
    blender --background --factory-startup --python tools/modern-art/areas/ward_atrium.py -- --size 2048 --samples 128
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

area = lib.Area('ward-atrium', world=(.72, .82, .9), world_strength=.01)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
TOP = 17.5

floor = area.mat('floor', (.32, .36, .36), 0, .5)
tile = area.mat('ceramic', (.5, .56, .56), 0, .35)
slab = area.mat('ceramic.slab', (.7, .74, .74), 0, .5)
trim = area.mat('steel.trim', (.4, .43, .44), .5, .35)
teal = area.mat('ceramic.teal', (.12, .42, .42), 0, .4)
glass = area.mat('glass', (.2, .3, .32), .1, .1)
banner = area.mat('ceramic.banner', (.1, .3, .33), 0, .7)
sky = area.mat('lamp.sky', (.86, .93, 1), 0, .4, 1.3)
pendant = area.mat('lamp.pendant', (.92, .97, 1), 0, .4, 4)

area.floor(floor)
area.walls(lambda x, z: 5.0, tile, curb=teal)
common.upper_walls(area, TOP, tile, base=5.0)

# Galleries at 5.2, 9.2 and 13.2 m around all four sides (scenery).
for level, y in enumerate([5.2, 9.2, 13.2]):
    depth = 1.8 + level * .2
    for side in 'nswe':
        # Galleries run over the ground-floor doorways like balconies.
        a0, a1 = area.side_range(side)
        area.wall_box('Gallery slab', side, (a0 + a1) / 2, y, a1 - a0, .35, depth, slab, .02)
        area.wall_box('Balustrade glass', side, (a0 + a1) / 2, y + .7, a1 - a0 - 2 * depth, 1.0, .03, glass, 0, off=depth - .05)
        area.wall_box('Handrail', side, (a0 + a1) / 2, y + 1.22, a1 - a0 - 2 * depth, .06, .08, trim, .005, off=depth - .08)
        area.wall_box('Slab edge band', side, (a0 + a1) / 2, y - .1, a1 - a0, .16, .04, teal, 0, off=depth - .02)
        for t in area.bays(side, 4.0, margin=2.5, door_margin=-10):
            area.wall_box('Gallery door', side, t, y + 1.4, 1.2, 2.4, .04, teal, 0)
            if y > 6:
                area.wall_box('Gallery bracket', side, t, y - .6, .2, .9, depth * .8, trim, .005)
# Glazed roof lantern with daylight.
x = X0
while x < X1 - .1:
    area.box('Lantern pane', (x + 1.75, TOP + .1, CZ), (3.3, .05, Z1 - Z0), sky, 0)
    area.box('Lantern mullion', (x, TOP + .15, CZ), (.15, .3, Z1 - Z0), trim, .005)
    x += 3.5
area.box('Lantern mullion', (X1, TOP + .15, CZ), (.15, .3, Z1 - Z0), trim, .005)
for z in [Z0 + 4, CZ, Z1 - 4]:
    area.box('Lantern purlin', (CX, TOP - .1, z), (X1 - X0, .25, .2), trim, .005)
area.light('Roof daylight', (CX, TOP - .6, CZ), (CX + 3, 0, CZ + 2), (.86, .93, 1), 2600, 9)

# Pendants on long cables, lowest 7 m; hanging wayfinding banners.
for i in range(3):
    for j in range(3):
        x, z = CX - 6 + i * 6, CZ - 6 + j * 6
        bottom = 7.0 + (i + j) % 3 * 1.4
        area.pipe('Pendant cable', (x, TOP, z), (x, bottom + .3, z), .012, trim, sides=4)
        area.pipe('Pendant shade', (x, bottom, z), (x, bottom + .3, z), .45, trim, sides=16, r2=.1)
        common.disc(area, 'Pendant diffuser', (x, bottom + .01, z), .4, pendant)
        area.light('Pendant light', (x, bottom - .1, z), (x, 0, z), (.92, .97, 1), 240, .4)
for k, (x, z) in enumerate([(CX - 3, CZ + 2), (CX + 3, CZ - 2)]):
    area.box('Banner', (x, 12.0, z), (.05, 4.0, 1.4), banner, 0)
    area.pipe('Banner rod', (x, 14.05, z - .8), (x, 14.05, z + .8), .03, trim, sides=6)
    area.pipe('Banner cable', (x, 14.05, z), (x, TOP, z), .01, trim, sides=4)

# Ground floor: tiled walls with a teal dado, planters inset (relief), signage.
for side in 'nswe':
    area.wall_strip('Teal dado', side, .6, 1.2, .04, teal)
    for t in area.bays(side, 6.0, margin=3.0, door_margin=1.4):
        area.wall_box('Info panel', side, t, 2.6, 1.6, 1.0, .06, trim, .01)
        area.wall_box('Info screen', side, t, 2.6, 1.4, .8, .02, pendant, 0, off=.06)
area.wall_text('WARD  6  -  ATRIUM', 'n', CX, 3.9, .45, teal, off=.05)
common.disc(area, 'Atrium floor medallion', (CX, .008, CZ), 4.5, teal, samples=40)
common.disc(area, 'Medallion centre', (CX, .012, CZ), 3.8, area.mat('ceramic.inlay', (.32, .36, .36), 0, .5), samples=40)

# One runtime light per area (actors only; the bake lights surfaces),
# so ordinary rooms keep theirs within the map's 12-light budget.
practicals = [
    {'x': CX, 'y': 8.0, 'z': CZ, 'color': [.9, .96, 1], 'intensity': 24, 'distance': 26},
]
area.finish(practicals=practicals, bake_albedo=.5)
