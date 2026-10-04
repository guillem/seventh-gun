"""The Sanctum start room, "the airlock": dark shield fins chevron the walls,
a concentric ceiling iris glows teal at its seams, a ring set into the floor.

    node tools/modern-art/export_area_layout.mjs 7 sanctum-start 41,3,48,9
    blender --background --factory-startup --python tools/modern-art/areas/sanctum_start.py -- --size 1024 --samples 128
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

area = lib.Area('sanctum-start', world=(.1, .3, .34), world_strength=.004)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
WALL = 8.0

floor = area.mat('floor', (.12, .14, .15), 0, .5)
hull = area.mat('steel.hull', (.16, .19, .21), .4, .45)
fin = area.mat('steel.fin', (.22, .26, .28), .4, .4)
dark = area.mat('dark', (.04, .05, .06), .3, .5)
teal = area.mat('lamp.teal', (.3, .95, .95), 0, .4, 3.5)
white = area.mat('lamp.white', (.8, .95, 1), 0, .4, 2)

area.floor(floor)
area.walls(lambda x, z: WALL, hull, curb=dark)
common.flat_roof(area, WALL, hull)

# Ceiling iris: concentric plates stepping up, teal seams between.
for k, r in enumerate([5.5, 4.3, 3.1, 1.9]):
    y = WALL - .25 - k * .3
    area.tube('Iris plate edge', common.ring((CX, y, CZ), r, samples=40), .14, fin)
    area.tube('Iris seam', common.ring((CX, y - .12, CZ), r - .25, samples=40), .04, teal)
common.disc(area, 'Iris core', (CX, WALL - 1.5, CZ), 1.4, white, samples=24)
area.light('Iris core', (CX, WALL - 1.9, CZ), (CX, 0, CZ), (.7, .95, 1), 520, 1.6)

# Walls: chevron shield fins with teal channels, a seal frame round openings.
for side in 'nswe':
    for t in area.bays(side, 1.4, margin=.8, door_margin=.4):
        area.wall_box('Shield fin', side, t, 2.15, .35, 4.3, .16, fin, .02)
        area.wall_box('Fin upper', side, t, 6.1, .45, 3.4, .55, fin, .02)
        area.wall_box('Fin channel', side, t, 2.15, .05, 3.8, .17, teal, 0)
    area.wall_strip('Upper seam', side, 4.4, .05, .06, teal)
    area.wall_strip('Base plinth', side, .25, .5, .12, dark, .01)
area.portal_frames(fin)
area.wall_text('SEAL INTEGRITY  -  NOMINAL', 'n', CX, 5.2, .32, teal, off=.6)
for side in 'we':
    x, y, z = area.wall_point(side, CZ, 3.0, .5)
    area.light('Wall channel glow', (x, y, z), area.wall_point(side, CZ, 0, 4), (.3, .95, .95), 90, 1.2)

# Floor: a teal ring and radial seams (flat).
area.tube('Floor ring', [(x, .008, z) for x, _, z in common.ring((CX, 0, CZ), 3.6, samples=48)], .006, teal)
for k in range(8):
    th = k * math.pi / 4
    area.box('Floor seam', (CX + math.cos(th) * 2.0, .006, CZ + math.sin(th) * 2.0), (.05, .012, .05), dark, 0)

practicals = [
    {'x': CX, 'y': WALL - 1.9, 'z': CZ, 'color': [.6, .95, 1], 'intensity': 18, 'distance': 16},
]
area.finish(practicals=practicals, bake_albedo=.5)
