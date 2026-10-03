"""Bake authored surface specimens to tangent normals and roughness textures.

These are offline Blender assets, not runtime noise. The original AI-generated
base-color images remain untouched; the specimens supply independent microrelief.
"""
import subprocess
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'public/modern/foundry'
DEST.mkdir(parents=True, exist_ok=True)
(ROOT/'art/modern/foundry-room').mkdir(parents=True, exist_ok=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=8
scene.render.threads_mode='FIXED'
scene.render.threads=4
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_plane_add(size=3)
plane=bpy.context.object
plane.name='Three metre surface bake specimen'

for name in ['concrete','steel']:
    mat=bpy.data.materials.new('Authored '+name+' microrelief')
    mat.use_nodes=True
    mat.use_fake_user=True
    plane.data.materials.clear()
    plane.data.materials.append(mat)
    n=mat.node_tree.nodes; links=mat.node_tree.links
    shader=n.get('Principled BSDF')
    coord=n.new('ShaderNodeTexCoord')
    grain=n.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value=170 if name=='concrete' else 320
    grain.inputs['Detail'].default_value=2
    links.new(coord.outputs['UV'],grain.inputs['Vector'])
    bumps=n.new('ShaderNodeBump')
    bumps.inputs['Distance'].default_value=.014 if name=='concrete' else .003
    bumps.inputs['Strength'].default_value=.65
    links.new(grain.outputs['Fac'],bumps.inputs['Height'])
    links.new(bumps.outputs['Normal'],shader.inputs['Normal'])
    variation=n.new('ShaderNodeTexNoise')
    variation.inputs['Scale'].default_value=7
    variation.inputs['Detail'].default_value=3
    links.new(coord.outputs['UV'],variation.inputs['Vector'])
    ramp=n.new('ShaderNodeMapRange')
    ramp.inputs['To Min'].default_value=.72 if name=='concrete' else .28
    ramp.inputs['To Max'].default_value=.98 if name=='concrete' else .68
    links.new(variation.outputs['Fac'],ramp.inputs['Value'])
    links.new(ramp.outputs['Result'],shader.inputs['Roughness'])
    normal=bpy.data.images.new(name+' tangent normal',width=1024,height=1024,alpha=False)
    normal.colorspace_settings.name='Non-Color'
    target=n.new('ShaderNodeTexImage');target.image=normal;n.active=target
    bpy.ops.object.bake(type='NORMAL')
    normal.filepath_raw=str(ROOT/'art/modern/foundry-room'/(name+'-normal.png'));normal.file_format='PNG';normal.save()
    subprocess.run(['cwebp','-quiet','-lossless','-resize','512','512',normal.filepath_raw,'-o',str(DEST/(name+'-normal.webp'))],check=True)
    rough=bpy.data.images.new(name+' roughness',width=512,height=512,alpha=False)
    rough.colorspace_settings.name='Non-Color'
    target.image=rough
    output=n.get('Material Output')
    emission=n.new('ShaderNodeEmission')
    links.new(ramp.outputs['Result'],emission.inputs['Color'])
    links.new(emission.outputs[0],output.inputs['Surface'])
    bpy.ops.object.bake(type='EMIT')
    rough.filepath_raw=str(ROOT/'art/modern/foundry-room'/(name+'-roughness.png'));rough.file_format='PNG';rough.save()
    subprocess.run(['cwebp','-quiet','-lossless',rough.filepath_raw,'-o',str(DEST/(name+'-roughness.webp'))],check=True)
    links.new(shader.outputs[0],output.inputs['Surface'])
    normal.pack();rough.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/modern/foundry-room/material-specimens.blend'),compress=True)
print('Material specimen maps saved',flush=True)
