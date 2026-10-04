"""Shared building blocks for area scripts (vaults, domes, roofs, trusses).

Import with:
    from common import lib, load_common  # see the area scripts
All coordinates are game metres; see tools/modern-art/area_lib.py.
"""
import math


class Vault:
    """Barrel vault springing from both long walls of a rectangular area.

    axis 'x' runs the vault along x (spanning z); 'z' runs it along z. The
    cross-section is a half ellipse from `spring` to `spring + rise`.
    """

    def __init__(self, area, axis, spring, rise, ripple=0.0, pointed=0.0):
        self.area, self.axis, self.spring, self.rise = area, axis, spring, rise
        self.ripple, self.pointed = ripple, pointed
        x0, x1, z0, z1 = area.bounds()
        if axis == 'x':
            self.a0, self.a1, self.c, self.half = x0, x1, (z0 + z1) / 2, (z1 - z0) / 2
        else:
            self.a0, self.a1, self.c, self.half = z0, z1, (x0 + x1) / 2, (x1 - x0) / 2

    def profile(self, t, inset=0.0):
        """(across, y) at t in [0, pi]; t = 0 is the + side wall."""
        r = 1 - inset
        across = self.c + self.half * r * math.cos(t)
        # A pointed (gothic) arch lifts the crown by `pointed` x rise.
        lift = 1 + self.pointed * (1 - abs(math.cos(t))) ** 2
        return across, self.spring + self.rise * r * math.sin(t) * lift

    def point(self, along, t, inset=0.0):
        across, y = self.profile(t, inset)
        return (along, y, across) if self.axis == 'x' else (across, y, along)

    def skin(self, name, mat, step=.5, segments=32, ripple_fn=None):
        alongs = [self.a0 + i * step for i in range(int((self.a1 - self.a0) / step) + 1)]
        ts = [math.pi * j / segments for j in range(segments + 1)]
        verts, faces = [], []
        for a in alongs:
            for t in ts:
                inset = (ripple_fn(a, t) if ripple_fn else 0) / self.half
                verts.append(self.point(a, t, inset))
        n = len(ts)
        for i in range(len(alongs) - 1):
            for j in range(n - 1):
                faces.append((i * n + j, (i + 1) * n + j, (i + 1) * n + j + 1, i * n + j + 1))
        return self.area.mesh(name, verts, faces, mat, smooth=True)

    def gables(self, name, mat, segments=32):
        ts = [math.pi * j / segments for j in range(segments + 1)]
        for along in (self.a0, self.a1):
            if self.axis == 'x':
                verts = [(along, self.spring, self.c)] + [self.point(along, t) for t in ts]
            else:
                verts = [(self.c, self.spring, along)] + [self.point(along, t) for t in ts]
            faces = [(0, j + 1, j + 2) for j in range(segments)]
            self.area.mesh(name, verts, faces, mat)

    def rib(self, name, along, mat, r=.3, inset=.03, samples=15):
        pts = [self.point(along, math.pi * k / (samples - 1), inset) for k in range(samples)]
        return self.area.tube(name, pts, r, mat)


def ring(center, radius, axis='y', samples=24, phase=0.0):
    """Points of a circle around `center`, normal to `axis`."""
    cx, cy, cz = center
    pts = []
    for k in range(samples + 1):
        a = phase + 2 * math.pi * k / samples
        c, s = math.cos(a) * radius, math.sin(a) * radius
        pts.append((cx + c, cy, cz + s) if axis == 'y' else (cx, cy + s, cz + c) if axis == 'x' else (cx + c, cy + s, cz))
    return pts


def disc(area, name, center, radius, mat, axis='y', samples=24):
    """Flat disc mesh (lenses, oculi, floor inlays)."""
    cx, cy, cz = center
    verts = [center]
    for k in range(samples):
        a = 2 * math.pi * k / samples
        c, s = math.cos(a) * radius, math.sin(a) * radius
        verts.append((cx + c, cy, cz + s) if axis == 'y' else (cx, cy + s, cz + c) if axis == 'x' else (cx + c, cy + s, cz))
    return area.mesh(name, verts, [(0, (k + 1) % samples + 1, k + 1) for k in range(samples)], mat)


def dome(area, name, center, radius, mat, rings=12, segments=32, base_y=None, flatten=1.0, oculus=0.0):
    """Hemispherical (or flattened) dome; optional open oculus fraction."""
    cx, cy, cz = center
    verts, faces = [], []
    top = math.pi / 2 * (1 - oculus)
    for i in range(rings + 1):
        phi = top * i / rings
        for j in range(segments):
            th = 2 * math.pi * j / segments
            verts.append((cx + math.cos(phi) * math.cos(th) * radius, cy + math.sin(phi) * radius * flatten, cz + math.cos(phi) * math.sin(th) * radius))
    for i in range(rings):
        for j in range(segments):
            a, b = i * segments + j, i * segments + (j + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    return area.mesh(name, verts, faces, mat, smooth=True)


def flat_roof(area, y, mat, thickness=.3):
    x0, x1, z0, z1 = area.bounds()
    return area.box('Roof slab', ((x0 + x1) / 2, y + thickness / 2, (z0 + z1) / 2), (x1 - x0, thickness, z1 - z0), mat, 0)


def upper_walls(area, top, mat, base=None, thickness=.5):
    """Solid walls between the boundary wall top and `top` on every side,
    including over openings (portal closures handle below `top` there)."""
    x0, x1, z0, z1 = area.bounds()
    base = base if base is not None else 0
    h = top - base
    area.box('Upper wall', ((x0 + x1) / 2, base + h / 2, z0 - thickness / 2), (x1 - x0 + 2 * thickness, h, thickness), mat, 0)
    area.box('Upper wall', ((x0 + x1) / 2, base + h / 2, z1 + thickness / 2), (x1 - x0 + 2 * thickness, h, thickness), mat, 0)
    area.box('Upper wall', (x0 - thickness / 2, base + h / 2, (z0 + z1) / 2), (thickness, h, z1 - z0), mat, 0)
    area.box('Upper wall', (x1 + thickness / 2, base + h / 2, (z0 + z1) / 2), (thickness, h, z1 - z0), mat, 0)


def truss(area, a, b, depth, chord_mat, web_mat, panels=8, r=.07):
    """Warren truss between points a and b hanging `depth` below them."""
    ax, ay, az = a
    bx, by, bz = b
    top = [(ax + (bx - ax) * i / panels, ay + (by - ay) * i / panels, az + (bz - az) * i / panels) for i in range(panels + 1)]
    bot = [(x, y - depth, z) for x, y, z in top]
    area.pipe('Truss top chord', top[0], top[-1], r * 1.6, chord_mat, sides=8)
    area.pipe('Truss bottom chord', bot[0], bot[-1], r * 1.4, chord_mat, sides=8)
    for i in range(panels):
        p, q = (top[i], bot[i + 1]) if i % 2 == 0 else (bot[i], top[i + 1])
        area.pipe('Truss web', p, q, r, web_mat, sides=6)
        area.pipe('Truss post', top[i], bot[i], r * .8, web_mat, sides=6)


def rock_skin(area, side, y0, y1, mat, depth_low=.14, depth_high=.9, step=.5, seed=0, skip_openings=True):
    """Lumpy rock facing on a wall from y0 to y1. Below 4.3 m the bulge into
    the room stays under `depth_low` (wall-relief limit); above, up to
    `depth_high`. Openings are left clear up to 6.2 m."""
    a0, a1 = area.side_range(side)
    cols = int((a1 - a0) / step) + 1
    rows = int((y1 - y0) / step) + 1
    verts, faces = [], []

    def bulge(t, y):
        n = (math.sin(t * 1.7 + seed) * math.sin(y * 1.3 + seed * .7) + .6 * math.sin(t * 3.9 - y * 2.3 + seed)
             + .35 * math.sin(t * 7.1 + y * 5.3))
        n = (n + 1.95) / 3.9
        limit = depth_low if y < 4.4 else depth_low + (depth_high - depth_low) * min(1, (y - 4.4) / 2)
        return .02 + max(0, n) * limit

    for i in range(rows):
        y = y0 + (y1 - y0) * i / (rows - 1)
        for j in range(cols):
            t = a0 + (a1 - a0) * j / (cols - 1)
            verts.append(area.wall_point(side, t, y, bulge(t, y)))
    for i in range(rows - 1):
        for j in range(cols - 1):
            t = a0 + (a1 - a0) * (j + .5) / (cols - 1)
            y = y0 + (y1 - y0) * (i + .5) / (rows - 1)
            ta = a0 + (a1 - a0) * j / (cols - 1)
            tb = a0 + (a1 - a0) * (j + 1) / (cols - 1)
            if skip_openings and y < 6.2 and not (area.solid(side, ta, .05) and area.solid(side, tb, .05)):
                continue
            a, b = i * cols + j, i * cols + j + 1
            faces.append((a, b, b + cols, a + cols))
    return area.mesh('Rock face', verts, faces, mat, smooth=True)
