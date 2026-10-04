"""The Pit start room, "adit 4": a mine drift through raw rock, braced with
timber sets under a lagged roof, lit by hanging lanterns; rails in the floor.

    node tools/modern-art/export_area_layout.mjs 4 pit-start 6,6,13,12
    blender --background --factory-startup --python tools/modern-art/areas/pit_start.py -- --size 1024 --samples 128
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

area = lib.Area('pit-start', world=(.3, .25, .2), world_strength=.003)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
ROOF = 6.6

floor = area.mat('floor', (.16, .14, .12), 0, .9)
rock = area.mat('basalt', (.36, .31, .26), 0, .92)
timber = area.mat('timber', (.32, .21, .12), 0, .85)
iron = area.mat('steel', (.12, .11, .1), .6, .5)
rail = area.mat('edge', (.3, .3, .3), .8, .35)
paint = area.mat('concrete.paint', (.7, .6, .38), 0, .9)
lantern = area.mat('lamp.lantern', (1, .62, .28), 0, .4, 6)

area.floor(floor)
area.walls(lambda x, z: ROOF, rock)
for side in 'nswe':
    common.rock_skin(area, side, 0, ROOF, rock, seed='nswe'.index(side) * 2.3)
# Lagged roof: planks across a rock ceiling.
area.box('Rock roof', (CX, ROOF + .3, CZ), (X1 - X0, .6, Z1 - Z0), rock, 0)
x = X0 + .15
while x < X1:
    area.box('Lagging plank', (x, ROOF - .08, CZ), (.28, .14, Z1 - Z0 - .2), timber, .01)
    x += .32

# Timber sets every 2.4 m: posts against the walls, a cap across the roof.
x = X0 + 1.2
while x < X1 - 1:
    for side in 'ns':
        if area.solid(side, x, .4):
            area.wall_box('Set post', side, x, (ROOF - .5) / 2, .3, ROOF - .5, .16, timber, .015)
            area.wall_box('Post wedge', side, x, ROOF - .45, .5, .3, .4, timber, .01)
    area.box('Set cap', (x, ROOF - .45, CZ), (.34, .36, Z1 - Z0 - .2), timber, .015)
    x += 2.4

# Hanging lanterns, lowest 4.9 m.
for k, x in enumerate([X0 + 2.2, X0 + 5.6, CX + 2.0, X1 - 2.0]):
    z = CZ + (.8 if k % 2 else -.8)
    area.pipe('Lantern wire', (x, ROOF - .3, z), (x, 5.3, z), .01, iron, sides=4)
    area.pipe('Lantern cage', (x, 4.95, z), (x, 5.3, z), .13, iron, sides=8)
    area.pipe('Lantern glass', (x, 5.0, z), (x, 5.25, z), .1, lantern, sides=8)
    area.light('Lantern light', (x, 4.85, z), (x, 0, z), (1, .62, .3), 600, .3)

# Rails in the floor (flat) and a painted shaft number.
for dz in (-.55, .55):
    area.box('Rail', (CX, .0075, CZ + dz), (X1 - X0 - .4, .015, .07), rail, 0)
x = X0 + .4
while x < X1 - .2:
    area.box('Sleeper', (x, .006, CZ), (.22, .012, 1.6), timber, 0)
    x += .7
area.wall_text('SHAFT  4', 'w', CZ, 3.6, .55, paint, off=.17)
area.wall_text('NO NAKED FLAME', 'e', CZ, 3.2, .3, paint, off=.17)

# Start rooms hold no enemies: the bake lights them, no runtime light.
practicals = []
area.finish(practicals=practicals, bake_albedo=.55)
