"""The Pit arena, "the open stope": a cavern blasted open under a ragged rock
dome with daylight falling through a breach, timber scaffolds and hoist gear
on the walls and floodlights lashed to the staging. Room 10 (28 x 24 m).

    node tools/modern-art/export_area_layout.mjs 4 pit-arena 42,62,56,74
    blender --background --factory-startup --python tools/modern-art/areas/pit_arena.py -- --size 2048 --samples 128
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

area = lib.Area('pit-arena', world=(.55, .6, .66), world_strength=.01)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
rng = random.Random(29)
WALL = 8.0

floor = area.mat('floor', (.15, .13, .11), 0, .92)
rock = area.mat('basalt', (.36, .31, .26), 0, .93)
timber = area.mat('timber', (.33, .22, .12), 0, .85)
steel = area.mat('steel', (.12, .11, .1), .65, .45)
rope = area.mat('dark', (.08, .07, .05), 0, .9)
ochre = area.mat('hazard', (.55, .35, .06), .2, .6)
flood = area.mat('lamp.flood', (1, .8, .55), 0, .4, 6)
sky = area.mat('lamp.sky', (.78, .85, .95), 0, .4, 2.5)

area.floor(floor)
area.walls(lambda x, z: WALL, rock)
for side in 'nswe':
    common.rock_skin(area, side, 0, WALL, rock, depth_high=1.1, seed=7 + 'nswe'.index(side) * 1.9)

# Rock dome: an irregular cap from the walls up to ~19 m, breached off-centre.
BX, BZ, BR = CX + 4, CZ - 2, 3.2
segments, rings = 44, 14
verts, faces = [], []
RX, RZ, RISE = (X1 - X0) / 2 * 1.42, (Z1 - Z0) / 2 * 1.42, 11.0
keep = []
for i in range(rings + 1):
    phi = (math.pi / 2) * i / rings
    for j in range(segments):
        th = 2 * math.pi * j / segments
        lump = 1 + .07 * math.sin(th * 5 + phi * 6) + .05 * math.sin(th * 11 - phi * 9) + .04 * math.sin(th * 17 + phi * 13)
        x = CX + math.cos(th) * RX * math.cos(phi) * lump
        z = CZ + math.sin(th) * RZ * math.cos(phi) * lump
        # Clamp the cap inside the room's walls: it springs from them.
        x = min(max(x, X0 - .3), X1 + .3)
        z = min(max(z, Z0 - .3), Z1 + .3)
        verts.append((x, WALL + math.sin(phi) * RISE * lump, z))
for i in range(rings):
    for j in range(segments):
        a, b = i * segments + j, i * segments + (j + 1) % segments
        cxm = sum(verts[k][0] for k in (a, b, a + segments, b + segments)) / 4
        czm = sum(verts[k][2] for k in (a, b, a + segments, b + segments)) / 4
        if math.hypot(cxm - BX, czm - BZ) < BR:
            continue
        faces.append((a, a + segments, b + segments, b))
area.mesh('Stope dome', verts, faces, rock, smooth=True)
# The breach: a rough rim and a sky disc beyond it, daylight falling in.
rim = []
for k in range(25):
    th = 2 * math.pi * k / 24
    r = BR * (1 + .15 * math.sin(th * 5))
    x, z = BX + math.cos(th) * r, BZ + math.sin(th) * r
    d = math.hypot((x - CX) / RX, (z - CZ) / RZ)
    rim.append((x, WALL + RISE * math.sqrt(max(0, 1 - d * d)) - .2, z))
area.tube('Breach rim', rim, .5, rock)
common.disc(area, 'Breach sky', (BX, WALL + RISE + 3, BZ), BR * 1.6, sky)
area.light('Breach daylight', (BX, WALL + RISE - .5, BZ), (BX - 3, 0, BZ + 3), (.8, .86, .95), 9000, BR * 1.6)

# Timber scaffolds against the long walls, staging from 5 m (scenery).
for side in 'ns':
    a0, a1 = area.side_range(side)
    for t in [a0 + 3, a0 + 9, a1 - 9, a1 - 3]:
        area.wall_box('Scaffold standard', side, t, 2.2, .26, 4.4, .16, timber, .01)
        area.wall_tube('Scaffold upper', side, [(t, 4.4, .1), (t, 7.5, .9), (t, 11.5, 1.2)], .13, timber)
        area.wall_tube('Scaffold raker', side, [(t, 4.6, .05), (t + 1.8, 5.2, 1.5)], .1, timber)
    area.wall_box('Staging', side, (a0 + a1) / 2, 5.25, a1 - a0 - 3, .14, 1.6, timber, .01)
    area.wall_tube('Staging rail', side, [(a0 + 1.5, 6.3, 1.55), (a1 - 1.5, 6.3, 1.55)], .05, timber)
    for i, t in enumerate([a0 + 6, (a0 + a1) / 2, a1 - 6]):
        x, y, z = area.wall_point(side, t, 6.0, 1.3)
        area.box('Floodlight', (x, y, z), (.6, .45, .45), steel, .02)
        lx, ly, lz = area.wall_point(side, t, 5.8, 1.55)
        area.box('Floodlight lens', (lx, ly, lz), (.48, .32, .05), flood, 0)
        tx, _, tz = area.wall_point(side, t + (2 if i % 2 else -2), 0, 10)
        area.light('Staging flood', (lx, ly - .2, lz), (tx, 0, tz), (1, .8, .55), 1300, .5)

# Hoist gear on the west wall: a sheave wheel and cable into the dome.
hx, hy, hz = area.wall_point('w', CZ, 11.5, 1.2)
area.tube('Sheave wheel', common.ring((hx, hy, hz), 1.6, axis='x', samples=32), .16, steel)
for k in range(6):
    th = k * math.pi / 3
    area.pipe('Sheave spoke', (hx, hy, hz), (hx, hy + math.sin(th) * 1.5, hz + math.cos(th) * 1.5), .07, steel, sides=6)
area.pipe('Hoist cable', (hx, hy + 1.6, hz), (CX - 3, 17, CZ), .04, rope, sides=6)
area.pipe('Hoist cable', (CX - 3, 17, CZ), (CX - 3, 10.5, CZ), .04, rope, sides=6)
area.box('Kibble bucket', (CX - 3, 9.8, CZ), (1.2, 1.3, 1.2), steel, .04)
area.wall_text('STOPE  9  -  BLASTING ZONE', 'e', CZ, 3.6, .5, ochre, off=.15)

# Floor: blast debris inlays and a drill pattern (flat).
for k in range(40):
    x, z = rng.uniform(X0 + 2, X1 - 2), rng.uniform(Z0 + 2, Z1 - 2)
    r = rng.uniform(.3, .9)
    common.disc(area, 'Debris patch', (x, .008, z), r, rock, samples=8)
for i in range(6):
    for j in range(4):
        common.disc(area, 'Drill hole', (CX - 5 + i * 2, .011, CZ + 4 + j * 1.2), .07, rope, samples=8)

practicals = [
    {'x': BX, 'y': 12, 'z': BZ, 'color': [.8, .86, .95], 'intensity': 22, 'distance': 30},
    {'x': CX, 'y': 5.6, 'z': Z0 + 1.55, 'color': [1, .82, .58], 'intensity': 24, 'distance': 22},
]
area.finish(practicals=practicals, bake_albedo=.55)
