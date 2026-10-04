"""The Sanctum arena, "the core": a reactor core hangs at the centre of a dark
chamber inside a gimballed cage of rings, eight gantries reach it from the
walls and teal channels run through radiating fins. Room 10 (32 x 28 m).

    node tools/modern-art/export_area_layout.mjs 7 sanctum-arena 71,67,87,81
    blender --background --factory-startup --python tools/modern-art/areas/sanctum_arena.py -- --size 2048 --samples 128
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

area = lib.Area('sanctum-arena', world=(.1, .3, .34), world_strength=.004)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
WALL, TOP = 8.0, 22.0
CY = 14.0  # core centre

floor = area.mat('floor', (.12, .14, .15), 0, .5)
hull = area.mat('steel.hull', (.16, .19, .21), .4, .45)
fin = area.mat('steel.fin', (.22, .26, .28), .4, .4)
dark = area.mat('dark', (.04, .05, .06), .3, .5)
teal = area.mat('lamp.teal', (.3, .95, .95), 0, .4, 3.5)
core = area.mat('lamp.core', (.6, 1, 1), 0, .4, 8)

area.floor(floor)
area.walls(lambda x, z: WALL, hull, curb=dark)
common.upper_walls(area, TOP, hull, base=WALL)
common.flat_roof(area, TOP, hull)

# The core and its gimbal cage (three rings on different axes).
area.ellipsoid('Reactor core', (CX, CY, CZ), (2.6, 2.6, 2.6), core, segments=32, rings=16)
for k in range(12):
    a = 2 * math.pi * k / 12
    area.pipe('Core rib', (CX + math.cos(a) * 2.7, CY - 2.2, CZ + math.sin(a) * 2.7), (CX + math.cos(a) * 2.7, CY + 2.2, CZ + math.sin(a) * 2.7), .12, fin, sides=6)
area.tube('Gimbal ring', common.ring((CX, CY, CZ), 4.4, axis='y', samples=48), .3, fin)
area.tube('Gimbal ring', common.ring((CX, CY, CZ), 5.2, axis='x', samples=48), .3, fin)
area.tube('Gimbal ring', common.ring((CX, CY, CZ), 6.0, axis='z', samples=48), .3, fin)
area.tube('Gimbal glow', common.ring((CX, CY, CZ), 4.15, axis='y', samples=48), .08, teal)
area.pipe('Core mast', (CX, CY + 6, CZ), (CX, TOP, CZ), .6, fin, sides=12)
area.light('Core glow', (CX, CY - 3.4, CZ), (CX, 0, CZ), (.5, 1, 1), 2400, 2.5)
area.light('Core uplight', (CX, CY + 3.4, CZ), (CX, TOP, CZ), (.5, 1, 1), 900, 2.5)

# Eight gantries from the walls to the cage at 11 m (scenery, above combat).
for k in range(8):
    a = 2 * math.pi * k / 8 + math.pi / 8
    dx, dz = math.cos(a), math.sin(a)
    # Wall point along this direction.
    sx = (X1 - X0) / 2 / abs(dx) if abs(dx) > 1e-6 else 1e9
    sz = (Z1 - Z0) / 2 / abs(dz) if abs(dz) > 1e-6 else 1e9
    s = min(sx, sz)
    wx, wz = CX + dx * s, CZ + dz * s
    ix, iz = CX + dx * 6.4, CZ + dz * 6.4
    area.pipe('Gantry girder', (wx, 11.0, wz), (ix, 11.6, iz), .35, fin, sides=4)
    area.pipe('Gantry conduit', (wx, 11.5, wz), (ix, 12.1, iz), .1, teal, sides=8)
    area.pipe('Gantry strut', (wx - dx * .4, 9.0, wz - dz * .4), (wx - dx * 3.5, 11.0, wz - dz * 3.5), .14, fin, sides=6)

# Walls: radiating fins with teal channels; an upper ring gallery band.
for side in 'nswe':
    for t in area.bays(side, 1.6, margin=1.0, door_margin=.4):
        area.wall_box('Radiator fin', side, t, 2.15, .3, 4.3, .16, fin, .02)
        area.wall_box('Fin upper', side, t, (4.4 + 16) / 2, .4, 11.6, .9, fin, .02)
        area.wall_box('Fin channel', side, t, 2.15, .05, 3.8, .17, teal, 0)
    area.wall_strip('Plinth', side, .25, .5, .12, dark, .01)
    area.wall_strip('Gallery band', side, 16.4, .4, 1.6, fin, .02)
    area.wall_strip('Gallery glow', side, 16.1, .06, 1.62, teal)
area.portal_frames(fin)
area.wall_text('CORE  ACCESS  RESTRICTED', 'n', CX, 5.4, .5, teal, off=.95)

# Floor: radial teal lines to the centre and a containment circle (flat).
for k in range(16):
    a = 2 * math.pi * k / 16
    area.box('Radial line', (CX + math.cos(a) * 7, .008, CZ + math.sin(a) * 7), (.1, .016, .1), teal, 0)
area.tube('Containment circle', [(x, .008, z) for x, _, z in common.ring((CX, 0, CZ), 4.5, samples=56)], .006, teal)

practicals = [
    {'x': CX, 'y': CY - 3.4, 'z': CZ, 'color': [.5, 1, 1], 'intensity': 34, 'distance': 30},
]
area.finish(practicals=practicals, bake_albedo=.5)
