"""The Spire arena, "the lantern": a tall chamber whose walls rise in stepped
stages to 22 m, gold light pouring through tall windows, a gilt sun disc in
the coffered ceiling and bronze ring lamps. Room 11 (28 x 24 m).

    node tools/modern-art/export_area_layout.mjs 5 spire-arena 24,4,38,16
    blender --background --factory-startup --python tools/modern-art/areas/spire_arena.py -- --size 2048 --samples 128
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

area = lib.Area('spire-arena', world=(.62, .58, .5), world_strength=.007)
X0, X1, Z0, Z1 = area.bounds()
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2
TOP = 22.0

floor = area.mat('floor', (.3, .29, .27), 0, .6)
stone = area.mat('limestone', (.58, .55, .48), 0, .85)
cream = area.mat('limestone.cream', (.68, .65, .57), 0, .8)
bronze = area.mat('limestone.bronze', (.5, .36, .17), 0, .55)
gold = area.mat('lamp.gold', (1, .8, .42), 0, .4, 3.5)
sun = area.mat('lamp.sun', (1, .86, .55), 0, .4, 5)
marble = area.mat('basalt', (.16, .15, .14), 0, .4)
inlay = area.mat('limestone.inlay', (.3, .29, .27), 0, .6)

area.floor(floor)
area.walls(lambda x, z: 8.0, stone, curb=cream)
common.upper_walls(area, TOP, stone, base=8.0)
common.flat_roof(area, TOP, stone, thickness=.6)

# Stepped stages: each a cornice band set further out, with tall windows.
stages = [(8.0, .5), (13.5, .9), (18.5, 1.3)]
for side in 'nswe':
    for y, d in stages:
        area.wall_strip('Stage cornice', side, y, .5, d, cream, .02)
        area.wall_strip('Stage frieze', side, y - .6, .7, d * .6, stone, .01)
    a0, a1 = area.side_range(side)
    span = a1 - a0
    n = 5 if span > 25 else 4
    for k in range(n):
        t = a0 + span * (k + .5) / n
        for y0, y1 in [(9.2, 12.8), (14.4, 17.8)]:
            area.wall_box('Tall window', side, t, (y0 + y1) / 2, 1.4, y1 - y0, .05, gold, 0, off=.0)
            area.wall_box('Window surround', side, t, (y0 + y1) / 2, 1.9, y1 - y0 + .5, .04, cream, 0, off=-.02)
        x, y, z = area.wall_point(side, t, 13, .6)
        tx, _, tz = area.wall_point(side, t, 0, 10)
        area.light('Window light', (x, y, z), (tx, 0, tz), (1, .82, .5), 340, 1.0)
    for t in area.bays(side, 4.0, margin=1.5, door_margin=.5):
        area.wall_box('Lower pilaster', side, t, 3.8, .8, 7.6, .15, cream, .01)

# Coffered ceiling with a great gilt sun disc and radiating rays.
for x in [X0 + 2 + i * 3 for i in range(9)]:
    area.box('Ceiling beam', (x, TOP - .45, CZ), (.4, .9, Z1 - Z0), cream, .02)
for z in [Z0 + 2 + j * 3 for j in range(8)]:
    area.box('Ceiling beam', (CX, TOP - .45, z), (X1 - X0, .9, .4), cream, .02)
common.disc(area, 'Sun disc', (CX, TOP - 1.0, CZ), 3.2, sun, samples=40)
area.tube('Sun rim', common.ring((CX, TOP - 1.0, CZ), 3.3, samples=40), .2, bronze)
for k in range(16):
    th = 2 * math.pi * k / 16
    area.pipe('Sun ray', (CX + math.cos(th) * 3.4, TOP - 1.05, CZ + math.sin(th) * 3.4), (CX + math.cos(th) * 6.5, TOP - 1.05, CZ + math.sin(th) * 6.5), .12, bronze, sides=6, r2=.02)
area.light('Sun disc glow', (CX, TOP - 1.6, CZ), (CX, 0, CZ), (1, .86, .58), 2600, 3.5)

# Bronze ring lamps on chains, lowest 9 m.
for cx, cz in [(CX - 7, CZ - 5), (CX + 7, CZ - 5), (CX - 7, CZ + 5), (CX + 7, CZ + 5)]:
    area.tube('Ring lamp', common.ring((cx, 9.4, cz), 1.4, samples=28), .09, bronze)
    for k in range(3):
        th = 2 * math.pi * k / 3
        area.pipe('Ring chain', (cx + math.cos(th) * 1.4, 9.4, cz + math.sin(th) * 1.4), (cx, TOP - .9, cz), .025, bronze, sides=5)
    for k in range(10):
        th = 2 * math.pi * k / 10
        common.disc(area, 'Ring flame', (cx + math.cos(th) * 1.4, 9.55, cz + math.sin(th) * 1.4), .09, gold, samples=6)
    area.light('Ring lamp glow', (cx, 9.0, cz), (cx, 0, cz), (1, .8, .5), 320, 1.4)

# Floor: concentric marble rings around a gilt centre (flat inlays).
for r, m in [(9.5, marble), (8.8, inlay), (5.5, marble), (4.8, inlay), (1.6, sun)]:
    common.disc(area, 'Floor ring', (CX, .004 + (9.5 - r) * .001, CZ), r, m, samples=48)

# One runtime light per area (actors only; the bake lights surfaces),
# so ordinary rooms keep theirs within the map's 12-light budget.
practicals = [
    {'x': CX, 'y': TOP - 1.6, 'z': CZ, 'color': [1, .86, .6], 'intensity': 30, 'distance': 30},
]
area.finish(practicals=practicals, bake_albedo=.5)
