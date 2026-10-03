"""Offline bevelled guard rails and fasteners for the existing rising slab.

Origin is the original door centre. Bounds preserve its 6m span and 4.32m
height; only thin machined face relief projects beyond the old slab depth.
"""
import importlib.util
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('author',Path(__file__).with_name('build_assets.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
a.reset()
steel=a.material('door.guard',(.17,.19,.18),.65,.46)
edge=a.material('door.fastener',(.31,.32,.29),.8,.38)
parts=[]
for side in [-1,1]:
    for z in [-2.94,2.94]:
        parts.append(a.box('Machined edge guard',(side*.269,0,z),(.038,4.3,.07),steel,bevel=.008))
        for y in [-1.8,-.9,0,.9,1.8]:
            parts.append(a.cylinder('Captive hex head',(side*.282,y,z),(side*.302,y,z),.026,edge,segments=6))
    for y in [-2.105,2.105]:
        parts.append(a.box('Rolled door lip',(side*.269,y,0),(.038,.07,5.82),steel,bevel=.008))
    # Shallow lifting strip follows the texture's central horizontal weld.
    parts.append(a.box('Central reinforcement',(side*.26,.02,0),(.018,.036,5.82),steel,bevel=.004))
for ob in parts:
    bpy.context.view_layer.objects.active=ob
    for mod in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
ob=bpy.context.object;ob.name='Door guard hardware'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project();bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/modern/entrance/door-hardware.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/modern/foundry/door-hardware.glb'),export_format='GLB',use_selection=True,export_animations=False)
