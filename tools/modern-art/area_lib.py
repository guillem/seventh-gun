"""Shared Blender library for hand-built, light-baked campaign areas.

Generalises tools/modern-art/build_foundry.py (the authored Foundry opening).
An area script exports its layout first (export_area_layout.mjs), then:

    area = Area('gullet-arena')            # reads art/modern/areas/<id>/layout.json
    area.floor(area.mat('floor', ...))
    area.walls(height=lambda x, z: 9, mat=...)
    ... authored geometry with area.box / pipe / tube / ellipsoid / mesh ...
    area.light(...)                        # bake lights (and actor practicals)
    area.finish()                          # join, UV, Cycles bake, GLB + WebP

Rules (enforced by tests/unit/authoredAreas.test.ts): the floor is the exact
walkable footprint; below 4.3 m nothing projects more than 0.18 m from a solid
boundary into the walkable volume; overhead pieces stay above 4.3 m. Doors,
the arena seal and secrets are runtime objects and must lie outside the area.
Material names are `area.<specimen>[.<variant>]`; the runtime binds the shared
generated surface images by specimen (src/render/authoredAreas.ts).
Coordinates are game metres (x, y up, z), converted with build_assets.gv.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('author', Path(__file__).with_name('build_assets.py'))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)

CORRIDOR_HEIGHT = 6.0
CELL = 2


def options():
    parser = argparse.ArgumentParser()
    parser.add_argument('--size', type=int, default=2048)
    parser.add_argument('--samples', type=int, default=96)
    parser.add_argument('--skip-bake', action='store_true')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


class Area:
    def __init__(self, area_id, world=(.32, .43, .55), world_strength=.012):
        self.id = area_id
        self.opt = options()
        self.source = ROOT / 'art/modern/areas' / area_id
        self.dest = ROOT / 'public/modern/areas' / area_id
        self.source.mkdir(parents=True, exist_ok=True)
        self.dest.mkdir(parents=True, exist_ok=True)
        self.layout = json.loads((self.source / 'layout.json').read_text())
        if self.layout['conflicts']:
            raise SystemExit(f'{area_id}: area owns runtime objects {self.layout["conflicts"]}')
        self.cells = {tuple(c) for c in self.layout['cells']}
        self.grid = self.layout['grid']
        self.w = self.layout['w']
        self.h = self.layout['h']
        self.meshes = []
        self.lights = []
        self.materials = {}
        a.reset()
        scene = self.scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = self.opt.samples
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 5
        scene.cycles.diffuse_bounces = 4
        scene.render.threads_mode = 'FIXED'
        scene.render.threads = 4
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs[0].default_value = (*world, 1)
        scene.world.node_tree.nodes['Background'].inputs[1].default_value = world_strength
        self.shared_surfaces = {}
        # Runtime-drawn walkable cells outside the area own their 6 m walls
        # and ceilings; saved faces in the same planes are trimmed.
        for z in range(self.h):
            for x in range(self.w):
                if not self.walk(x, z) or (x, z) in self.cells:
                    continue
                self._shared(1, CORRIDOR_HEIGHT, -1, (0, 2), (2 * x, 2 * x + 2, 2 * z, 2 * z + 2))
                for dx, dz in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                    if self.walk(x + dx, z + dz):
                        continue
                    if dx:
                        self._shared(0, 2 * x + (2 if dx > 0 else 0), -dx, (2, 1), (2 * z, 2 * z + 2, 0, CORRIDOR_HEIGHT))
                    else:
                        self._shared(2, 2 * z + (2 if dz > 0 else 0), -dz, (0, 1), (2 * x, 2 * x + 2, 0, CORRIDOR_HEIGHT))
        self.seam_cleanup = {'clippedFaces': 0, 'removedArea': 0.0, 'corridorHeight': CORRIDOR_HEIGHT}

    # ------------------------------------------------------------ grid
    def walk(self, x, z):
        return 0 <= x < self.w and 0 <= z < self.h and self.grid[z * self.w + x] == 1

    def bounds(self):
        xs = [x for x, _ in self.cells]
        zs = [z for _, z in self.cells]
        return min(xs) * CELL, (max(xs) + 1) * CELL, min(zs) * CELL, (max(zs) + 1) * CELL

    # ------------------------------------------------------------ authoring
    def mat(self, name, color, metal=0, rough=.6, emission=0):
        key = 'area.' + name
        if key not in self.materials:
            self.materials[key] = a.material(key, color, metal, rough, emission)
        return self.materials[key]

    def box(self, name, pos, size, mat, bevel=.02):
        ob = a.box(name, pos, size, mat, bevel=bevel)
        for mod in ob.modifiers:
            if mod.type == 'BEVEL':
                mod.segments = 1
        self.meshes.append(ob)
        return ob

    def pipe(self, name, p, q, r, mat, sides=12, r2=None):
        ob = a.cylinder(name, p, q, r, mat, r2=r2, segments=sides)
        self.meshes.append(ob)
        return ob

    def tube(self, name, points, r, mat):
        ob = a.tube(name, points, r, mat)
        self.meshes.append(ob)
        return ob

    def ellipsoid(self, name, pos, scale, mat, segments=24, rings=12):
        ob = a.ellipsoid(name, pos, scale, mat, segments=segments, rings=rings)
        self.meshes.append(ob)
        return ob

    def shell(self, name, sections, mat, segments=16):
        """Loft along Y through elliptical sections (x, y, z, rx, rz)."""
        ob = a.shell(name, sections, mat, segments=segments)
        self.meshes.append(ob)
        return ob

    def mesh(self, name, verts, faces, mat, smooth=False):
        ob = a.mesh(name, verts, faces, mat, smooth=smooth)
        self.meshes.append(ob)
        return ob

    def light(self, name, pos, target, color, power, size, kind='AREA'):
        data = bpy.data.lights.new(name, kind)
        data.energy = power
        data.color = color
        if kind == 'AREA':
            data.shape = 'DISK'
            data.size = size
        else:
            data.shadow_soft_size = size
        ob = bpy.data.objects.new(name, data)
        self.scene.collection.objects.link(ob)
        ob.location = a.gv(pos)
        ob.rotation_euler = (a.gv(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()
        self.lights.append({'name': name, 'kind': kind, 'position': pos, 'target': target, 'color': color, 'power': power, 'size': size})
        return ob

    def floor(self, mat):
        verts, faces = [], []
        for x, z in sorted(self.cells):
            i = len(verts)
            verts.extend([(x * 2, 0, z * 2), ((x + 1) * 2, 0, z * 2), ((x + 1) * 2, 0, (z + 1) * 2), (x * 2, 0, (z + 1) * 2)])
            faces.append((i + 3, i + 2, i + 1, i))
        return self.mesh('Original walkable floor', verts, faces, mat)

    def walls(self, height, mat, curb=None, thickness=.5):
        """Boundary walls on the exact grid edges, projecting into solid cells
        only; openings to runtime cells get an upper closure above 6 m."""
        for x, z in sorted(self.cells):
            h = height(x, z)
            for dx, dz in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                if self.walk(x + dx, z + dz):
                    if (x + dx, z + dz) in self.cells:
                        continue
                    if h > CORRIDOR_HEIGHT:
                        self.box('Portal upper closure', ((x + .5) * 2 + dx, h - (h - CORRIDOR_HEIGHT) / 2, (z + .5) * 2 + dz),
                                 (.35, h - CORRIDOR_HEIGHT, 2) if dx else (2, h - CORRIDOR_HEIGHT, .35), mat, 0)
                    continue
                px = (x + .5) * 2 + dx * (1 + thickness / 2)
                pz = (z + .5) * 2 + dz * (1 + thickness / 2)
                self.box('Boundary wall', (px, h / 2, pz), (thickness, h, 2) if dx else (2, h, thickness), mat, 0)
                if curb:
                    self.box('Foundation curb', (px, .17, pz), (thickness + .06, .34, 2) if dx else (2, .34, thickness + .06), curb, .015)

    def boundary_faces(self):
        """(x, z, dx, dz) for every solid boundary face of the footprint."""
        for x, z in sorted(self.cells):
            for dx, dz in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                if not self.walk(x + dx, z + dz):
                    yield x, z, dx, dz

    # ------------------------------------------------------------ seams
    def _shared(self, axis, plane, direction, axes, bounds):
        self.shared_surfaces.setdefault((axis, plane, direction), []).append((axes, bounds))

    @staticmethod
    def _half_plane(points, axis, bound, direction):
        result = []
        for p, q in zip(points, points[1:] + points[:1]):
            pa = (p[axis] - bound) * direction
            qa = (q[axis] - bound) * direction
            if pa >= 0:
                result.append(p)
            if (pa >= 0) != (qa >= 0):
                t = pa / (pa - qa)
                result.append(tuple(p[i] + t * (q[i] - p[i]) for i in range(3)))
        return result

    @staticmethod
    def _area(points):
        if len(points) < 3:
            return 0
        origin = Vector(points[0])
        return sum((Vector(points[i]) - origin).cross(Vector(points[i + 1]) - origin).length / 2 for i in range(1, len(points) - 1))

    def _subtract(self, points, axes, bounds):
        inside, outside = points, []
        for axis, bound, direction in [(axes[0], bounds[0], 1), (axes[0], bounds[1], -1), (axes[1], bounds[2], 1), (axes[1], bounds[3], -1)]:
            part = self._half_plane(inside, axis, bound, -direction)
            if self._area(part) > 1e-8:
                outside.append(part)
            inside = self._half_plane(inside, axis, bound, direction)
        if self._area(inside) < 1e-8:
            return [points], 0
        return outside, self._area(inside)

    def _trim_shared(self, ob):
        mesh = bmesh.new()
        mesh.from_mesh(ob.data)
        inverse = ob.matrix_world.inverted()
        for face in list(mesh.faces):
            normal = ob.matrix_world.to_3x3() @ face.normal
            normal = (normal.x, normal.z, -normal.y)
            axis = next((i for i, n in enumerate(normal) if abs(n) > .99999), None)
            if axis is None:
                continue
            points = []
            for vert in face.verts:
                p = ob.matrix_world @ vert.co
                points.append((p.x, p.z, -p.y))
            plane = round(points[0][axis], 5)
            if any(abs(p[axis] - plane) > 1e-5 for p in points):
                continue
            candidates = self.shared_surfaces.get((axis, plane, 1 if normal[axis] > 0 else -1), [])
            pieces, removed = [points], 0
            for axes, bounds in candidates:
                remaining = []
                for piece in pieces:
                    parts, area = self._subtract(piece, axes, bounds)
                    remaining.extend(parts)
                    removed += area
                pieces = remaining
            if removed < 1e-8:
                continue
            material, smooth = face.material_index, face.smooth
            mesh.faces.remove(face)
            for piece in pieces:
                replacement = mesh.faces.new([mesh.verts.new(inverse @ a.gv(p)) for p in piece])
                replacement.material_index = material
                replacement.smooth = smooth
                replacement.normal_update()
            self.seam_cleanup['clippedFaces'] += 1
            self.seam_cleanup['removedArea'] += removed
        mesh.to_mesh(ob.data)
        mesh.free()
        ob.data.update()

    # ------------------------------------------------------------ output
    def finish(self, practicals=(), uv_scale=3, floor_uv_scale=7, bake_albedo=.5):
        bpy.ops.object.select_all(action='DESELECT')
        for ob in self.meshes:
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            for mod in list(ob.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)
            self._trim_shared(ob)
        bpy.context.view_layer.objects.active = self.meshes[0]
        bpy.ops.object.join()
        hero = bpy.context.object
        hero.name = f'{self.id} authored environment'
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        uv = hero.data.uv_layers.get('SurfaceUV') or hero.data.uv_layers.new(name='SurfaceUV')
        for poly in hero.data.polygons:
            n = poly.normal
            axes = (0, 1) if abs(n.z) > .7 else (0, 2) if abs(n.y) > .7 else (1, 2)
            scale = floor_uv_scale if hero.data.materials[poly.material_index].name.startswith('area.floor') else uv_scale
            for li in poly.loop_indices:
                v = hero.data.vertices[hero.data.loops[li].vertex_index].co
                uv.data[li].uv = (v[axes[0]] / scale, v[axes[1]] / scale)
        while len(hero.data.uv_layers) > 1:
            hero.data.uv_layers.remove(hero.data.uv_layers[0 if hero.data.uv_layers[0].name != 'SurfaceUV' else 1])
        hero.data.uv_layers.new(name='BakeUV')
        hero.data.uv_layers.active_index = 1
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=.00001)
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.004, area_weight=.5)
        bpy.ops.object.mode_set(mode='OBJECT')

        size = self.opt.size
        image = bpy.data.images.new(f'{self.id} static irradiance', width=size, height=size, alpha=False, float_buffer=True)
        image.colorspace_settings.name = 'Non-Color'
        original = []
        for mat in hero.data.materials:
            p = mat.node_tree.nodes.get('Principled BSDF')
            original.append((mat, p.inputs['Base Color'].default_value[:], p.inputs['Metallic'].default_value))
            if '.lamp' not in mat.name:
                # Colour is excluded from the receiving pass, but bounce light
                # still needs plausible, darker-than-specimen albedos.
                c = p.inputs['Base Color'].default_value
                p.inputs['Base Color'].default_value = (c[0] * bake_albedo, c[1] * bake_albedo, c[2] * bake_albedo, 1)
                p.inputs['Metallic'].default_value = 0
            target = mat.node_tree.nodes.new('ShaderNodeTexImage')
            target.name = 'Baked irradiance target'
            target.image = image
            mat.node_tree.nodes.active = target
        scene = self.scene
        scene.render.bake.use_pass_direct = True
        scene.render.bake.use_pass_indirect = True
        scene.render.bake.use_pass_color = False
        scene.render.bake.margin = 8
        peak = None
        if not self.opt.skip_bake:
            print(f'AREA {self.id}: baking static irradiance', flush=True)
            bpy.ops.object.bake(type='DIFFUSE')
            import array
            pixels = array.array('f', [0]) * (size * size * 4)
            image.pixels.foreach_get(pixels)
            peak = max(pixels)
            # Same encoding as the Foundry: linear irradiance / 8 with an explicit
            # sRGB OETF into a Non-Color PNG; the runtime restores 8 * pi.
            for i in range(0, len(pixels), 4):
                for c in range(3):
                    v = max(0, pixels[i + c] / 8)
                    pixels[i + c] = 12.92 * v if v <= .0031308 else 1.055 * v ** (1 / 2.4) - .055
            image.pixels.foreach_set(pixels)
            image.filepath_raw = str(self.source / 'irradiance-source.png')
            image.file_format = 'PNG'
            image.save()
            subprocess.run(['cwebp', '-quiet', '-q', '94', str(self.source / 'irradiance-source.png'), '-o', str(self.dest / 'irradiance.webp')], check=True)
        for mat, color, metal in original:
            p = mat.node_tree.nodes.get('Principled BSDF')
            p.inputs['Base Color'].default_value = color
            p.inputs['Metallic'].default_value = metal
        hero.data.uv_layers.active_index = 0
        hero.data.uv_layers[0].active_render = True
        bpy.ops.file.make_paths_relative()
        bpy.ops.wm.save_as_mainfile(filepath=str(self.source / 'area.blend'), compress=True)
        bpy.ops.object.select_all(action='DESELECT')
        hero.select_set(True)
        bpy.context.view_layer.objects.active = hero
        bpy.ops.export_scene.gltf(filepath=str(self.dest / 'environment.glb'), export_format='GLB', use_selection=True,
                                  export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=True,
                                  export_animations=False, export_cameras=False, export_lights=False)
        manifest = {'id': self.id, 'mapSeed': self.layout['seed'], 'cells': len(self.cells), 'rects': self.layout['rects'],
                    'bakeSize': size, 'bakeSamples': self.opt.samples, 'bakePeak': peak,
                    'bake': 'Cycles CPU diffuse direct+indirect, colour excluded; sRGB OETF of linear irradiance / 8 (runtime 8*pi)',
                    'meshFaces': len(hero.data.polygons), 'glbBytes': (self.dest / 'environment.glb').stat().st_size,
                    'irradianceBytes': (self.dest / 'irradiance.webp').stat().st_size if (self.dest / 'irradiance.webp').exists() else None,
                    'lights': self.lights, 'practicals': list(practicals), 'seamCleanup': self.seam_cleanup}
        (self.source / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        print(f'AREA {self.id}: export complete', json.dumps({k: v for k, v in manifest.items() if k not in ('lights', 'practicals')}), flush=True)
