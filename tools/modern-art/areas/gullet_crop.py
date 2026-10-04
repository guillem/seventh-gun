"""The Gullet's crop: a swollen stomach chamber under a lumpy dome hung with
digestive sacs and villi, its floor pooled with acid. Room 2 (26 x 22 m).

    node tools/modern-art/export_area_layout.mjs 2 gullet-crop 38,6,51,17
    blender --background --factory-startup --python tools/modern-art/areas/gullet_crop.py -- --size 2048 --samples 128
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

area = lib.Area('gullet-crop', world=(.3, .14, .1), world_strength=.004)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
rng = random.Random(11)
WALL = 7.0

floor = area.mat('floor', (.16, .12, .1), 0, .8)
wall = area.mat('organic.wall', (.32, .19, .16), 0, .6)
skin = area.mat('organic.membrane', (.4, .22, .18), 0, .45)
villus = area.mat('organic.villus', (.46, .24, .2), 0, .5)
sinew = area.mat('organic.sinew', (.32, .12, .1), 0, .4)
bone = area.mat('bone', (.5, .45, .35), 0, .6)
acid = area.mat('lamp.acid', (.62, .9, .32), 0, .3, 1.2)
gland = area.mat('lamp.gland', (1, .48, .28), 0, .4, 3)
sac_glow = area.mat('lamp.sac', (1, .58, .3), 0, .4, 2.5)

area.floor(floor)
area.walls(lambda x, z: WALL, wall, curb=sinew)

# The dome: a squashed ellipsoidal cap over the whole room, lumpy with folds.
segments, rings = 40, 14
verts, faces = [], []
RX, RZ, RISE = (X1 - X0) / 2 * 1.02, (Z1 - Z0) / 2 * 1.02, 9.0
for i in range(rings + 1):
    phi = (math.pi / 2) * i / rings
    for j in range(segments):
        th = 2 * math.pi * j / segments
        lump = 1 + .05 * math.sin(th * 7 + phi * 5) + .04 * math.sin(th * 13 - phi * 9)
        r = math.cos(phi) * lump
        verts.append((CX + math.cos(th) * RX * r, WALL + math.sin(phi) * RISE * lump, CZ + math.sin(th) * RZ * r))
for i in range(rings):
    for j in range(segments):
        a, b = i * segments + j, i * segments + (j + 1) % segments
        faces.append((a, a + segments, b + segments, b))
area.mesh('Crop dome', verts, faces, skin, smooth=True)
# The rectangular walls meet the oval dome base: a ledge fills the corners
# between the wall top and the dome's springing ellipse.
verts, faces = [], []
for j in range(segments):
    th = 2 * math.pi * j / segments
    dx, dz = math.cos(th), math.sin(th)
    scale = min((X1 - X0) / 2 / abs(dx) if abs(dx) > 1e-6 else 1e9, (Z1 - Z0) / 2 / abs(dz) if abs(dz) > 1e-6 else 1e9)
    lump = 1 + .05 * math.sin(th * 7) + .04 * math.sin(th * 13)
    verts += [(CX + dx * scale, WALL, CZ + dz * scale), (CX + dx * RX * lump, WALL, CZ + dz * RZ * lump)]
for j in range(segments):
    k = (j + 1) % segments
    faces.append((2 * j, 2 * k, 2 * k + 1, 2 * j + 1))
area.mesh('Dome springing ledge', verts, faces, wall)

# Muscular bands sweep over the dome from wall to wall.
for k in range(8):
    th = k * math.pi / 8
    pts = []
    for i in range(13):
        phi = math.pi * i / 12
        c = math.cos(phi)
        y = WALL + math.sin(phi) * RISE * .97
        pts.append((CX + c * math.cos(th) * RX * .97, y, CZ + c * math.sin(th) * RZ * .97))
    area.tube('Muscle band', pts, .32, sinew)

# Digestive sacs hang in clusters, lowest point above 8 m.
for cx, cz, n in [(CX - 6, CZ - 3, 5), (CX + 5, CZ + 4, 6), (CX + 1, CZ - 5, 4), (CX - 3, CZ + 5, 4)]:
    top = WALL + RISE * .9
    for k in range(n):
        ox, oz = rng.uniform(-1.4, 1.4), rng.uniform(-1.2, 1.2)
        y = rng.uniform(9.0, 11.5)
        r = rng.uniform(.45, .8)
        area.tube('Sac stalk', [(cx + ox * .4, top, cz + oz * .4), (cx + ox * .8, (top + y) / 2, cz + oz * .8), (cx + ox, y + r, cz + oz)], .06, sinew)
        area.ellipsoid('Digestive sac', (cx + ox, y, cz + oz), (r * .85, r, r * .85), villus, segments=16, rings=8)
        area.ellipsoid('Sac light', (cx + ox, y - r * .45, cz + oz), (r * .4, r * .35, r * .4), sac_glow, segments=10, rings=5)
    area.light('Sac cluster glow', (cx, 8.2, cz), (cx, 0, cz), (1, .55, .3), 520, 2.0)

# Villi: dense short fingers lining the upper walls above the combat volume.
for side in 'nswe':
    a0, a1 = area.side_range(side)
    t = a0 + .3
    while t < a1 - .3:
        for y in (5.4, 6.4):
            if not area.solid(side, t, .2) and y < 6.3:
                continue
            ln = rng.uniform(.25, .45)
            area.wall_tube('Villus', side, [(t, y, .02), (t + rng.uniform(-.05, .05), y - ln * .4, ln * .6), (t, y - ln, ln)], .055, villus)
        t += rng.uniform(.6, .85)

# Eye level: ridged rugae folds, gland niches and acid seeps (flat inlays).
for side in 'nswe':
    for t in area.bays(side, 5.0, margin=1.6):
        area.wall_box('Gland niche', side, t, 2.4, 1.3, 1.6, .06, bone, .03)
        x, y, z = area.wall_point(side, t, 2.4, .12)
        nx, nz = area.SIDES[side]
        area.ellipsoid('Niche gland', (x, y, z), (.05 if nx else .36, .5, .36 if nx else .05), gland, segments=12, rings=6)
        lx, _, lz = area.wall_point(side, t, 2.4, .45)
        tx, _, tz = area.wall_point(side, t, .3, 3)
        area.light('Niche pool', (lx, 2.4, lz), (tx, .3, tz), (1, .5, .3), 34, .5)
    a0, a1 = area.side_range(side)
    for y in (.9, 1.5):
        t = a0 + .2
        while t < a1:
            end = min(a1 - .2, t + rng.uniform(2.0, 3.5))
            if area.solid(side, t, .4) and area.solid(side, end, .4) and area.solid(side, (t + end) / 2, .4):
                area.wall_tube('Ruga fold', side, [(t, y, .05), ((t + end) / 2, y + rng.uniform(-.1, .1), .1), (end, y, .05)], .06, sinew)
            t = end + .4
for px, pz, rx, rz in [(CX - 4, CZ + 1, 3.2, 2.0), (CX + 6, CZ - 4, 2.2, 1.4), (CX + 3, CZ + 6, 1.8, 1.2)]:
    verts = [(px, .012, pz)]
    for k in range(28):
        ang = 2 * math.pi * k / 28
        w = 1 + .2 * math.sin(ang * 3 + px) + .1 * math.sin(ang * 8)
        verts.append((px + math.cos(ang) * rx * w, .012, pz + math.sin(ang) * rz * w))
    area.mesh('Acid pool', verts, [(0, (k + 1) % 28 + 1, k + 1) for k in range(28)], acid)
    area.light('Acid glow', (px, .6, pz), (px, 3, pz), (.6, .95, .35), 60, max(rx, rz))

# One runtime light per area (actors only; the bake lights surfaces),
# so ordinary rooms keep theirs within the map's 12-light budget.
practicals = [
    {'x': CX - 6, 'y': 8.2, 'z': CZ - 3, 'color': [1, .5, .32], 'intensity': 26, 'distance': 22},
]
area.finish(practicals=practicals, bake_albedo=.4)
