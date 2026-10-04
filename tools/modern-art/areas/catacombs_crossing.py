"""The Catacombs crossing: four great blind arches carry pendentives and a
dome with an open oculus; an iron corona of candles hangs in the centre.
Room 3 (24 x 24 m).

    node tools/modern-art/export_area_layout.mjs 3 catacombs-crossing 38,38,50,50
    blender --background --factory-startup --python tools/modern-art/areas/catacombs_crossing.py -- --size 2048 --samples 128
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

area = lib.Area('catacombs-crossing', world=(.42, .5, .62), world_strength=.006)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
HALF = (X1 - X0) / 2
WALL, SPRING = 13.0, 13.0

floor = area.mat('floor', (.15, .15, .15), 0, .9)
stone = area.mat('limestone', (.32, .33, .33), 0, .9)
ashlar = area.mat('limestone.ashlar', (.4, .4, .39), 0, .88)
dark = area.mat('dark', (.03, .03, .035), .2, .8)
iron = area.mat('alloy', (.09, .09, .09), .6, .5)
marble = area.mat('basalt', (.2, .2, .21), 0, .5)
flame = area.mat('lamp.flame', (1, .72, .35), 0, .4, 7)
sky = area.mat('lamp.sky', (.7, .8, .95), 0, .4, 1.5)

area.floor(floor)
area.walls(lambda x, z: WALL, stone, curb=ashlar)

# Each wall carries a great blind arch (moulding above the combat volume),
# with a shallow recessed tympanum field.
for side in 'nswe':
    a0, a1 = area.side_range(side)
    mid = (a0 + a1) / 2
    pts = []
    for k in range(25):
        th = math.pi * k / 24
        pts.append((mid + math.cos(th) * (HALF - 1.3), 6.5 + math.sin(th) * 5.6, .35))
    pts = [(mid - HALF + 1.3, 4.5, .35)] + pts[::-1] + [(mid + HALF - 1.3, 4.5, .35)]
    area.wall_tube('Arch moulding', side, pts, .38, ashlar)
    area.wall_box('Tympanum field', side, mid, 9.0, 2 * HALF - 4.5, 5.0, .08, ashlar, .02)
    for k in range(6):
        t = mid - 5 + k * 2
        area.wall_box('Loculus', side, t, 8.6, 1.2, .62, .02, dark, 0, off=.08)
        for j in range(3):
            x, y, z = area.wall_point(side, t - .35 + j * .35, 8.55, .16)
            area.ellipsoid('Loculus skull', (x, y, z), (.1, .12, .1), ashlar, segments=8, rings=5)
    for t in (mid - HALF + .9, mid + HALF - .9):
        if area.solid(side, t, .3):
            area.wall_box('Pilaster', side, t, 2.15, 1.0, 4.3, .16, ashlar, .02)
        area.wall_box('Pier capital', side, t, 4.8, 1.4, .6, .55, ashlar, .03)
    area.wall_box('Cornice', side, mid, WALL - .2, a1 - a0, .4, .5, ashlar, .02)

# Pendentives: curved triangles from each corner up to the dome's base ring.
R = HALF
segs = 10
for qx, qz in [(-1, -1), (1, -1), (1, 1), (-1, 1)]:
    th0 = math.atan2(qz, qx) - math.pi / 4
    verts = [(CX + qx * R, SPRING, CZ + qz * R)]
    for k in range(segs + 1):
        th = th0 + (math.pi / 2) * k / segs
        verts.append((CX + math.cos(th) * R, SPRING + 1.8, CZ + math.sin(th) * R))
    faces = [(0, k + 1, k + 2) for k in range(segs)]
    area.mesh('Pendentive', verts, faces, stone, smooth=True)
area.box('Drum cornice ring', (CX, SPRING + 1.85, CZ), (.01, .01, .01), stone, 0)
area.tube('Drum cornice', common.ring((CX, SPRING + 1.9, CZ), R - .3, samples=48), .28, ashlar)
# Drum with small windows, then the dome and its open oculus.
DRUM = 2.8
verts, faces = [], []
for j in range(48):
    th = 2 * math.pi * j / 48
    verts += [(CX + math.cos(th) * R, SPRING + 1.8, CZ + math.sin(th) * R), (CX + math.cos(th) * R, SPRING + 1.8 + DRUM, CZ + math.sin(th) * R)]
for j in range(48):
    k = (j + 1) % 48
    if j % 6 != 3:
        faces.append((2 * j, 2 * k, 2 * k + 1, 2 * j + 1))
area.mesh('Drum wall', verts, faces, stone)
for j in range(8):
    th = 2 * math.pi * (j * 6 + 3.5) / 48
    area.box('Drum window glow', (CX + math.cos(th) * (R + .05), SPRING + 1.8 + DRUM / 2, CZ + math.sin(th) * (R + .05)), (.6, DRUM * .8, .6), sky, 0)
DOME_Y = SPRING + 1.8 + DRUM
# Close the wall planes above the cornice up to the dome's base: the
# pendentives and drum stand inside them.
common.upper_walls(area, DOME_Y + .4, stone, base=WALL)
common.dome(area, 'Dome', (CX, DOME_Y, CZ), R, stone, rings=14, segments=48, oculus=.12)
for j in range(16):
    th = 2 * math.pi * j / 16
    pts = []
    for i in range(9):
        phi = (math.pi / 2) * (1 - .12) * i / 8
        pts.append((CX + math.cos(phi) * math.cos(th) * (R - .15), DOME_Y + math.sin(phi) * (R - .15), CZ + math.cos(phi) * math.sin(th) * (R - .15)))
    area.tube('Dome rib', pts, .16, ashlar)
oy = DOME_Y + R * math.sin(math.pi / 2 * .88)
orad = R * math.cos(math.pi / 2 * .88)
area.tube('Oculus ring', common.ring((CX, oy, CZ), orad, samples=32), .3, ashlar)
common.disc(area, 'Oculus sky', (CX, oy + .6, CZ), orad, sky)
area.light('Oculus shaft', (CX, oy - .5, CZ), (CX + 2, 0, CZ + 1), (.75, .82, .95), 1800, orad * 1.5)

# The corona: an iron ring of candles hung on chains, lowest 9.6 m.
CY = 9.8
area.tube('Corona ring', common.ring((CX, CY, CZ), 3.2, samples=40), .1, iron)
area.tube('Corona inner ring', common.ring((CX, CY + .25, CZ), 2.6, samples=36), .06, iron)
for j in range(4):
    th = j * math.pi / 2 + math.pi / 4
    area.pipe('Corona chain', (CX + math.cos(th) * 3.2, CY, CZ + math.sin(th) * 3.2), (CX, oy - 1.4, CZ), .04, iron, sides=6)
for j in range(16):
    th = 2 * math.pi * j / 16
    x, z = CX + math.cos(th) * 3.2, CZ + math.sin(th) * 3.2
    area.pipe('Corona candle', (x, CY + .1, z), (x, CY + .45, z), .04, ashlar, sides=8)
    area.ellipsoid('Corona flame', (x, CY + .52, z), (.035, .07, .035), flame, segments=6, rings=4)
area.light('Corona glow', (CX, CY - .3, CZ), (CX, 0, CZ), (1, .68, .36), 900, 3.0)

# Floor: a radial compass of marble slabs (flat inlay).
for j in range(16):
    th = 2 * math.pi * j / 16
    verts = [(CX, .008, CZ), (CX + math.cos(th) * 7.5, .008, CZ + math.sin(th) * 7.5),
             (CX + math.cos(th + math.pi / 16) * 4.5, .008, CZ + math.sin(th + math.pi / 16) * 4.5)]
    area.mesh('Compass ray', verts, [(0, 2, 1)], marble if j % 2 else ashlar)
area.tube('Compass ring', [(x, .012, z) for x, _, z in common.ring((CX, .012, CZ), 7.6, samples=48)], .006, ashlar)

# Low candle stands against the piers (within relief).
for side in 'nswe':
    for t in area.bays(side, 7.0, margin=3.0):
        area.wall_box('Sconce plate', side, t, 3.0, .35, .6, .06, iron, .01)
        x, y, z = area.wall_point(side, t, 3.2, .14)
        area.pipe('Wall candle', (x, y - .25, z), (x, y, z), .03, ashlar, sides=8)
        area.ellipsoid('Wall flame', (x, y + .06, z), (.03, .06, .03), flame, segments=6, rings=4)
        lx, ly, lz = area.wall_point(side, t, 3.3, .4)
        tx, _, tz = area.wall_point(side, t, .2, 3)
        area.light('Wall candle glow', (lx, ly, lz), (tx, .2, tz), (1, .66, .34), 50, .3)

practicals = [
    {'x': CX, 'y': CY - .3, 'z': CZ, 'color': [1, .68, .38], 'intensity': 30, 'distance': 24},
    {'x': CX, 'y': oy - 2, 'z': CZ, 'color': [.75, .82, .95], 'intensity': 14, 'distance': 26},
]
area.finish(practicals=practicals, bake_albedo=.45)
