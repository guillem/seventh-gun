"""The Spire start room, "the vestibule": a coffered ceiling with gilt
rosettes over fluted pilasters, bronze relief panels and lit slits.

    node tools/modern-art/export_area_layout.mjs 5 spire-start 40,76,47,82
    blender --background --factory-startup --python tools/modern-art/areas/spire_start.py -- --size 1024 --samples 128
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

area = lib.Area('spire-start', world=(.6, .58, .52), world_strength=.006)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
WALL = 9.0

floor = area.mat('floor', (.3, .29, .27), 0, .6)
stone = area.mat('limestone', (.58, .55, .48), 0, .85)
cream = area.mat('limestone.cream', (.68, .65, .57), 0, .8)
bronze = area.mat('limestone.bronze', (.5, .36, .17), 0, .55)
gilt = area.mat('lamp.gilt', (1, .78, .4), 0, .4, .6)
slit = area.mat('lamp.slit', (1, .82, .5), 0, .4, 5)
marble = area.mat('basalt', (.16, .15, .14), 0, .4)
inlay = area.mat('limestone.inlay', (.3, .29, .27), 0, .6)

area.floor(floor)
area.walls(lambda x, z: WALL, stone, curb=cream)
common.flat_roof(area, WALL, stone)

# Coffered ceiling: a grid of beams, each coffer with a gilt rosette.
x = X0
while x <= X1 + .01:
    area.box('Coffer beam', (x, WALL - .35, CZ), (.4, .7, Z1 - Z0), cream, .02)
    x += 2.0
z = Z0
while z <= Z1 + .01:
    area.box('Coffer beam', (CX, WALL - .35, z), (X1 - X0, .7, .4), cream, .02)
    z += 2.0
for i in range(int((X1 - X0) / 2)):
    for j in range(int((Z1 - Z0) / 2)):
        cx, cz = X0 + 1 + i * 2, Z0 + 1 + j * 2
        area.box('Coffer step', (cx, WALL - .12, cz), (1.3, .24, 1.3), stone, .02)
        area.ellipsoid('Rosette', (cx, WALL - .26, cz), (.22, .08, .22), gilt, segments=12, rings=5)
area.light('Ceiling bounce', (CX, WALL - 1.2, CZ), (CX, WALL, CZ), (1, .86, .62), 300, 3)

# Walls: fluted pilasters, an entablature, bronze relief panels, gold slits.
for side in 'nswe':
    area.wall_strip('Entablature', side, 7.6, .9, .4, cream, .02)
    area.wall_strip('Base course', side, .4, .8, .12, cream, .01, margin=.1)
    for t in area.bays(side, 2.8, margin=1.0, door_margin=.4):
        area.wall_box('Pilaster', side, t, 3.6, .7, 7.2, .14, cream, .01)
        for dt in (-.2, 0, .2):
            area.wall_box('Flute', side, t + dt, 3.6, .07, 6.6, .17, stone, .005)
        area.wall_box('Capital', side, t, 7.0, .95, .45, .18, cream, .02)
    for t in area.bays(side, 5.6, margin=2.4, door_margin=1.6):
        area.wall_box('Relief panel', side, t - 1.4, 3.3, 1.5, 2.6, .1, bronze, .02)
        area.wall_box('Relief figure', side, t - 1.4, 3.4, .5, 1.8, .15, bronze, .03)
        area.wall_box('Light slit', side, t + 1.4, 3.6, .14, 4.2, .04, slit, 0)
        x, y, z = area.wall_point(side, t + 1.4, 3.6, .4)
        tx, _, tz = area.wall_point(side, t + 1.4, .2, 3)
        area.light('Slit glow', (x, y, z), (tx, .2, tz), (1, .82, .52), 70, .5)
area.wall_text('ASCENDANT  ORDER', 'w', CZ, 8.0, .38, bronze, off=.42)

# Floor: a marble border and a gilt star (flat inlays).
area.box('Marble border', (CX, .006, CZ), (X1 - X0 - 2, .012, Z1 - Z0 - 2), marble, 0)
area.box('Inner floor', (CX, .009, CZ), (X1 - X0 - 3, .012, Z1 - Z0 - 3), inlay, 0)
common.disc(area, 'Gilt star', (CX, .014, CZ), 1.4, gilt, samples=8)

# Start rooms hold no enemies: the bake lights them, no runtime light.
practicals = []
area.finish(practicals=practicals, bake_albedo=.5)
