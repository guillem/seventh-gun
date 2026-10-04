"""The Gullet arena: a ribbed visceral vault around the campaign's 14 x 12-cell
arena (world x 118..146, z 68..92). Original authored geometry; the floor and
boundary are the unchanged grid. The only opening is the 3-cell mouth on the
south wall (x 130..136) where the runtime arena seal and its corridor stay.

    node tools/modern-art/export_area_layout.mjs 2 gullet-arena 59,34,73,46
    /opt/homebrew/bin/blender --background --factory-startup --threads 4 \
        --python tools/modern-art/areas/gullet_arena.py -- --size 2048 --samples 96
"""
import importlib.util
import math
from pathlib import Path

spec = importlib.util.spec_from_file_location('area_lib', Path(__file__).resolve().parents[1] / 'area_lib.py')
lib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lib)

area = lib.Area('gullet-arena', world=(.35, .16, .14), world_strength=.004)
X0, X1, Z0, Z1 = area.bounds()          # 118, 146, 68, 92
ZC = (Z0 + Z1) / 2                       # 80
WALL = 9.0                               # vertical wall height; the vault springs here
RISE = 11.5                              # vault crown at WALL + RISE = 20.5 m
HALF = (Z1 - Z0) / 2                     # 12
MOUTH = (130, 136)                       # south opening, world x

floor = area.mat('floor', (.17, .13, .12), 0, .82)
wall = area.mat('organic.wall', (.3, .19, .17), 0, .62)
membrane = area.mat('organic.membrane', (.36, .21, .18), 0, .5)
sinew = area.mat('organic.sinew', (.34, .13, .11), 0, .45)
bone = area.mat('bone', (.52, .47, .37), 0, .68)
dark = area.mat('dark', (.07, .05, .05), .3, .6)
gland = area.mat('lamp.gland', (1, .46, .26), 0, .4, 3)
heart_glow = area.mat('lamp.heart', (1, .2, .12), 0, .4, 6)
oculus_glow = area.mat('lamp.oculus', (.72, .84, .96), 0, .3, 3)

area.floor(floor)
area.walls(lambda x, z: WALL, wall, curb=dark)


def profile(t, inset=0.0):
    """Point on the vault cross-section, t in [0, pi] from the south (z1) wall."""
    r = 1 - inset
    return ZC + HALF * r * math.cos(t), WALL + RISE * r * math.sin(t)


# Membrane vault: a ribbed, gently rippled skin spanning the short axis.
xs = [X0 + i * .5 for i in range(int((X1 - X0) / .5) + 1)]
ts = [math.pi * j / 32 for j in range(33)]
verts, faces = [], []
for x in xs:
    for t in ts:
        ripple = .22 * math.sin(x * 1.4) * math.sin(t * 7) + .12 * math.sin(t * 13 + x * .6)
        z, y = profile(t, ripple / HALF)
        verts.append((x, y, z))
n = len(ts)
for i in range(len(xs) - 1):
    for j in range(n - 1):
        faces.append((i * n + j, (i + 1) * n + j, (i + 1) * n + j + 1, i * n + j + 1))
area.mesh('Visceral vault membrane', verts, faces, membrane, smooth=True)

# Gable walls close the vault above the 9 m boundary walls.
for x, sign in [(X0, 1), (X1, -1)]:
    verts = [(x, WALL, ZC)] + [(x, profile(t)[1], profile(t)[0]) for t in ts]
    faces = [(0, j + 1, j + 2) if sign > 0 else (0, j + 2, j + 1) for j in range(n - 1)]
    area.mesh('Vault gable', verts, faces, wall, smooth=False)

# Ossified ribs: arch over the vault, then descend the long walls. Below
# 4.3 m they flatten to plates within the 0.18 m wall-relief limit.
RIBS = [121.5, 126, 130.5, 135, 139.5, 144]
for x in RIBS:
    pts = []
    for k in range(15):
        t = math.pi * k / 14
        z, y = profile(t, .035)
        pts.append((x, y, z))
    area.tube('Ossified vault rib', pts, .36, bone)
    for z_wall, side in [(Z0, 1), (Z1, -1)]:
        if z_wall == Z1 and MOUTH[0] - 1 < x < MOUTH[1] + 1:
            continue
        # Lofted rib root: flat against the wall below 4.3 m (0.16 m deep),
        # swelling into the vault rib above the combat volume.
        root = [(0, .34, .08), (2.2, .32, .08), (4.25, .31, .08), (5.6, .3, .2), (7.3, .31, .3), (WALL + .3, .34, .34)]
        a_secs = []
        for y, rx, rz in root:
            off = rz if y > 4.3 else .08
            a_secs.append((x, y, z_wall + side * off, rx, rz))
        area.shell('Rib root', a_secs, bone)
        for y in [.9, 2.0, 3.1]:
            area.box('Root suture', (x, y, z_wall + side * .155), (.5, .05, .02), dark, 0)

# Spine along the crown with vertebral knots at each rib.
crown_z, crown_y = profile(math.pi / 2, .04)
area.tube('Crown spine', [(X0, crown_y, crown_z), (ZC * 0 + 132, crown_y + .25, crown_z), (X1, crown_y, crown_z)], .55, bone)
for x in RIBS:
    area.ellipsoid('Vertebral knot', (x, crown_y - .1, crown_z), (.9, .7, 1.0), bone, segments=14, rings=8)

# The suspended heart: lowest surface 10.5 m, far above combat.
HX, HY, HZ = 132.5, 13.7, ZC
area.ellipsoid('Suspended heart', (HX, HY, HZ), (2.3, 3.1, 2.0), membrane, segments=32, rings=18)
for dx, dz, sy in [(-.9, .6, 1.2), (.8, -.5, .4), (.1, .9, -.6), (-.5, -.8, -1.4)]:
    area.ellipsoid('Heart chamber glow', (HX + dx * 1.7, HY + sy, HZ + dz * 1.5), (.5, .9, .45), heart_glow, segments=12, rings=6)
for a_ in range(8):
    ang = a_ * math.pi / 4
    area.tube('Heart vessel', [
        (HX + math.cos(ang) * 1.6, HY + 2.4, HZ + math.sin(ang) * 1.4),
        (HX + math.cos(ang) * 2.3, HY + .3, HZ + math.sin(ang) * 2.0),
        (HX + math.cos(ang) * 1.5, HY - 2.3, HZ + math.sin(ang) * 1.3)], .09, sinew)
for dx, dz in [(-6, -5), (6, -5), (-6, 5), (6, 5)]:
    tz, ty = profile(math.pi / 2 + (.55 if dz < 0 else -.55), .04)
    area.tube('Suspensory tendon', [(HX + dx * .25, HY + 2.6, HZ + dz * .2), (HX + dx * .7, HY + 4.5, HZ + dz * .6), (HX + dx, ty - .2, tz)], .16, sinew)

# Eye-level glands between ribs light the floor; bodies stay within 0.14 m.
practical_glands = []
bays = [(RIBS[i] + RIBS[i + 1]) / 2 for i in range(len(RIBS) - 1)]
for z_wall, side in [(Z0, 1), (Z1, -1)]:
    for x in bays:
        if z_wall == Z1 and MOUTH[0] - 1 < x < MOUTH[1] + 1:
            continue
        area.tube('Gland collar', [(x + .42 * math.cos(k * math.pi / 6), 3.0 + .6 * math.sin(k * math.pi / 6), z_wall + side * .06) for k in range(13)], .05, bone)
        area.ellipsoid('Wall gland', (x, 3.0, z_wall + side * .1), (.3, .45, .06), gland, segments=12, rings=6)
        area.light('Wall gland pool', (x, 3.0, z_wall + side * .35), (x, .5, z_wall + side * 3), (1, .5, .3), 32, .5)
        practical_glands.append((x, z_wall + side * .35))
        # Horizontal sinew folds give the walls human-scale texture.
        xa, xb = x - 2.1, x + 2.1
        if z_wall == Z1:
            # Folds stop short of the mouth's open edges.
            if x < MOUTH[0]: xb = min(xb, MOUTH[0] - .3)
            if x > MOUTH[1]: xa = max(xa, MOUTH[1] + .3)
        for y in [1.15, 1.75]:
            area.tube('Sinew fold', [(xa, y, z_wall + side * .07), ((xa + xb) / 2, y + .12, z_wall + side * .09), (xb, y, z_wall + side * .07)], .055, sinew)
for x_wall, side in [(X0, 1), (X1, -1)]:
    for z in [74, 86]:
        area.tube('Gland collar', [(x_wall + side * .06, 3.0 + .6 * math.sin(k * math.pi / 6), z + .42 * math.cos(k * math.pi / 6)) for k in range(13)], .05, bone)
        area.ellipsoid('Wall gland', (x_wall + side * .1, 3.0, z), (.06, .45, .3), gland, segments=12, rings=6)
        area.light('Gable gland pool', (x_wall + side * .35, 3.0, z), (x_wall + side * 3, .5, z), (1, .5, .3), 32, .5)

# Upper glands on the ribs, above the combat volume.
for x in RIBS:
    for t in [.5, math.pi - .5]:
        z, y = profile(t, .07)
        area.ellipsoid('Rib gland', (x, y, z), (.32, .32, .32), gland, segments=10, rings=6)
        area.light('Rib gland glow', (x, y - .45, z), (x, 0, ZC), (1, .45, .28), 28, .35)

# A membrane oculus in the east gable admits cold light across the vault.
OY = 14.0
ring = []
for k in range(25):
    ang = 2 * math.pi * k / 24
    ring.append((X1 - .2, OY + math.sin(ang) * 3.0, ZC + math.cos(ang) * 3.0))
area.tube('Oculus bone ring', ring, .3, bone)
verts = [(X1 - .12, OY, ZC)] + [(X1 - .12, OY + math.sin(2 * math.pi * k / 24) * 2.85, ZC + math.cos(2 * math.pi * k / 24) * 2.85) for k in range(24)]
area.mesh('Oculus membrane', verts, [(0, k + 1, (k + 1) % 24 + 1) for k in range(24)], oculus_glow)
area.light('Oculus shaft', (X1 - .6, OY, ZC), (124, 0, ZC + 2), (.72, .84, 1), 1500, 4.5)

# Heart glow, cast down onto the arena floor.
area.light('Heart glow', (HX, HY - 3.6, HZ), (HX, 0, HZ), (1, .25, .16), 1700, 2.6)

# The mouth: an ossified jaw over the 3-cell opening, teeth above 6 m.
area.tube('Jaw arch', [(MOUTH[0] - .4, 6.0, Z1 - .45), (MOUTH[0] + .8, 8.0, Z1 - .5), ((MOUTH[0] + MOUTH[1]) / 2, 8.6, Z1 - .55),
                       (MOUTH[1] - .8, 8.0, Z1 - .5), (MOUTH[1] + .4, 6.0, Z1 - .45)], .32, bone)
for i in range(9):
    x = MOUTH[0] + .4 + i * (MOUTH[1] - MOUTH[0] - .8) / 8
    area.pipe('Jaw tooth', (x, 6.9, Z1 - .45), (x, 6.05, Z1 - .45), .14, bone, sides=8, r2=.01)
for x in MOUTH:
    area.box('Jaw hinge', (x, 5.1, Z1 - .08), (.7, 1.4, .14), bone, .03)

# Floor: flat fluid pools and drain channels set into the slab, 1.5 cm proud
# at most; they change the material, never the walkable surface.
fluid = area.mat('organic.fluid', (.12, .04, .035), .1, .12)
channel = area.mat('dark.channel', (.05, .035, .03), .2, .5)
for cx, cz, rx, rz, rot in [(124.5, 74, 2.6, 1.6, .4), (139, 86.5, 3.2, 1.8, -.3), (131, 82, 1.8, 1.2, 1.1), (143, 72.5, 1.4, 1.0, .2)]:
    verts = [(cx, .012, cz)]
    for k in range(24):
        ang = 2 * math.pi * k / 24
        wob = 1 + .18 * math.sin(ang * 3 + cx) + .08 * math.sin(ang * 7)
        lx, lz = math.cos(ang) * rx * wob, math.sin(ang) * rz * wob
        verts.append((cx + lx * math.cos(rot) - lz * math.sin(rot), .012, cz + lx * math.sin(rot) + lz * math.cos(rot)))
    area.mesh('Fluid pool', verts, [(0, (k + 1) % 24 + 1, k + 1) for k in range(24)], fluid)
for x in RIBS:
    area.box('Drain channel', (x, .003, ZC), (.32, .006, HALF * 2 - 1.2), channel, 0)

# Eye-level texture: a bone baseboard of small teeth, clustered pustules and
# vertical membrane folds; all within 0.15 m of the wall face.
import random
rng = random.Random(2)
for x0, z0, x1, z1, nx, nz in [(X0, Z0, X1, Z0, 0, 1), (X0, Z1, X1, Z1, 0, -1), (X0, Z0, X0, Z1, 1, 0), (X1, Z0, X1, Z1, -1, 0)]:
    length = abs(x1 - x0) + abs(z1 - z0)
    for i in range(int(length / .45)):
        t = (i + .5) * .45
        x, z = x0 + (t if x1 != x0 else 0), z0 + (t if z1 != z0 else 0)
        if nz < 0 and MOUTH[0] - .3 < x < MOUTH[1] + .3:
            continue
        hgt = .32 + .12 * math.sin(i * 1.7)
        area.pipe('Baseboard tooth', (x + nx * .07, .02, z + nz * .07), (x + nx * .05, hgt, z + nz * .05), .065, bone, sides=6, r2=.012)
    for i in range(int(length / 3.2)):
        t = rng.uniform(1, length - 1)
        x, z = x0 + (t if x1 != x0 else 0), z0 + (t if z1 != z0 else 0)
        if nz < 0 and MOUTH[0] - 1 < x < MOUTH[1] + 1:
            continue
        if any(abs(x - r) < .6 for r in RIBS) and nz != 0:
            continue
        y = rng.uniform(.7, 2.4)
        for k in range(rng.randint(3, 6)):
            ox, oy = rng.uniform(-.35, .35), rng.uniform(-.3, .3)
            px, pz = (x + ox, z + nz * .05) if nz else (x + nx * .05, z + ox)
            r = rng.uniform(.07, .14)
            area.ellipsoid('Wall pustule', (px, y + oy, pz), (r if nz else .06, r, .06 if nz else r), membrane, segments=10, rings=5)
    for i in range(int(length / 1.6)):
        t = (i + .5) * 1.6 + rng.uniform(-.3, .3)
        x, z = x0 + (t if x1 != x0 else 0), z0 + (t if z1 != z0 else 0)
        if nz < 0 and MOUTH[0] - .5 < x < MOUTH[1] + .5:
            continue
        top = rng.uniform(4.6, 8.2)
        off = .06
        area.tube('Membrane fold', [(x + nx * off, .4, z + nz * off), (x + nx * (off + .02), top * .5, z + nz * (off + .02)), (x + nx * off, top, z + nz * off)], .05, sinew)

# Sinew strands hang from the vault between ribs, ending in small lights.
for i, x in enumerate([(RIBS[k] + RIBS[k + 1]) / 2 for k in range(len(RIBS) - 1)]):
    for t in [1.1, math.pi / 2 + (.35 if i % 2 else -.35), math.pi - 1.1]:
        z, y = profile(t, .02)
        drop = rng.uniform(3.5, 6.5)
        end = max(7.4, y - drop)
        area.tube('Hanging sinew', [(x, y, z), (x + .15, (y + end) / 2, z + .1), (x, end, z)], .045, sinew)
        area.ellipsoid('Sinew bead', (x, end - .12, z), (.11, .16, .11), gland, segments=8, rings=4)

# Runtime lights at baked fixtures (src/render/authoredAreas.ts), for actors
# and the arena seal; they must match these positions.
# One runtime light per area (actors only; the bake lights surfaces),
# so ordinary rooms keep theirs within the map's 12-light budget.
practicals = [
    {'x': HX, 'y': HY - 3.6, 'z': HZ, 'color': [1, .42, .3], 'intensity': 40, 'distance': 28},
]
area.finish(practicals=practicals, bake_albedo=.4)
