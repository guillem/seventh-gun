"""Bake technical maps from saved, geometrically modelled material specimens.

These are independent of the generated colour images. Specimens are half-metre
periodic surfaces: folds/scars and dermal grain, muscle fibres, keratin ridges and
eroded dentine. Tangent normals come from high-to-low Cycles geometry baking;
roughness comes from explicitly assigned anatomical surface regions.
"""
from pathlib import Path
import math
import subprocess
import bpy

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art/modern/refinement/materials'
DEST=ROOT/'public/modern/refinement/materials'
TAU=math.tau
RES=256
SIZE=.5


def wrapped(x): return (x+.5)%1-.5

def specimen(kind,u,v):
    # Fixed authored features, no random seed or colour-to-normal conversion.
    grain=(math.sin(TAU*(u*29+.13*math.sin(TAU*v*7)))*math.sin(TAU*(v*31+.17*math.sin(TAU*u*5))))
    if kind=='skin':
        fold=math.sin(TAU*(u*6+.19*math.sin(TAU*v*3)))
        scar=math.exp(-(wrapped(u-.36-.038*math.sin(TAU*v))/.010)**2)
        h=.00034*grain+.00043*fold+.00105*scar
        rough=.74+.035*grain+.045*scar
    elif kind=='raw':
        fibre=math.sin(TAU*(u*36+.27*math.sin(TAU*v*2)))
        tendon=math.exp(-(wrapped(u-.66-.028*math.sin(TAU*v*2))/.025)**2)
        h=.00076*fibre+.00026*math.sin(TAU*v*11)+.00120*tendon
        rough=.52+.040*fibre+.030*tendon
    elif kind=='chitin':
        ridge=math.sin(TAU*(v*8+.07*math.sin(TAU*u*3)))
        split=math.exp(-(wrapped(u-.27-.046*math.sin(TAU*v*2))/.007)**2)
        h=.00110*ridge+.00032*grain-.00140*split
        rough=.70+.055*grain+.07*split
    else:
        pore=math.exp(-((math.sin(TAU*u*13)**2+math.sin(TAU*v*17)**2)/.085))
        wear=math.sin(TAU*(u*4+.1*math.sin(TAU*v*5)))
        h=-.00062*pore+.00024*wear+.00015*grain
        rough=.75+.04*pore+.024*grain
    return h,max(.4,min(.85,rough))


def main():
    SOURCE.mkdir(parents=True,exist_ok=True); DEST.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=8
    scene.render.bake.use_selected_to_active=True; scene.render.bake.cage_extrusion=.012
    scene.render.bake.max_ray_distance=.025; scene.render.bake.margin=12
    meshes=[]
    for index,kind in enumerate(['skin','raw','chitin','bone']):
        xoffset=index*.65
        vertices=[]; rough=[]
        for y in range(RES+1):
            v=y/RES
            for x in range(RES+1):
                u=x/RES; h,r=specimen(kind,u,v)
                vertices.append((u*SIZE,v*SIZE,h)); rough.append(r)
        faces=[]
        for y in range(RES):
            for x in range(RES):
                i=y*(RES+1)+x; faces.append((i,i+1,i+RES+2,i+RES+1))
        data=bpy.data.meshes.new(kind+' sculpt specimen'); data.from_pydata(vertices,[],faces); data.update()
        high=bpy.data.objects.new(kind+' HIGH geometric folds',data); bpy.context.collection.objects.link(high)
        high.location.x=xoffset
        for face in data.polygons: face.use_smooth=True
        attr=data.color_attributes.new(name='surface_roughness',type='FLOAT_COLOR',domain='POINT')
        for i,value in enumerate(rough): attr.data[i].color=(value,value,value,1)
        mat=bpy.data.materials.new(kind+' assigned surface regions'); mat.use_nodes=True
        nodes=mat.node_tree.nodes; nodes.clear(); out=nodes.new('ShaderNodeOutputMaterial')
        emit=nodes.new('ShaderNodeEmission'); attrnode=nodes.new('ShaderNodeVertexColor'); attrnode.layer_name='surface_roughness'
        mat.node_tree.links.new(attrnode.outputs['Color'],emit.inputs[0]); mat.node_tree.links.new(emit.outputs[0],out.inputs['Surface'])
        high.data.materials.append(mat)
        lowdata=bpy.data.meshes.new(kind+' bake plane'); lowdata.from_pydata([(0,0,0),(SIZE,0,0),(SIZE,SIZE,0),(0,SIZE,0)],[],[(0,1,2,3)]); lowdata.update()
        low=bpy.data.objects.new(kind+' LOW tangent UV',lowdata); bpy.context.collection.objects.link(low); low.location.x=xoffset
        uv=lowdata.uv_layers.new(name='UVMap')
        for i,p in enumerate([(0,0),(1,0),(1,1),(0,1)]): uv.data[i].uv=p
        target=bpy.data.materials.new(kind+' bake output'); target.use_nodes=True; low.data.materials.append(target)
        tex=target.node_tree.nodes.new('ShaderNodeTexImage'); target.node_tree.nodes.active=tex
        for role,mode in [('normal','NORMAL'),('roughness','EMIT')]:
            image=bpy.data.images.new(kind+' '+role,width=512,height=512,float_buffer=False)
            image.colorspace_settings.name='Non-Color'; tex.image=image
            bpy.ops.object.select_all(action='DESELECT'); high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active=low
            bpy.ops.object.bake(type=mode)
            path=SOURCE/f'{kind}-{role}.png'; image.filepath_raw=str(path); image.file_format='PNG'; image.save()
            subprocess.run(['/opt/homebrew/bin/cwebp','-quiet','-lossless',str(path),'-o',str(DEST/f'{kind}-{role}.webp')],check=True)
            image.pack(); print('BAKED',kind,role,flush=True)
        high.hide_render=True; low.hide_render=True; meshes.extend([high,low])
    # Stored geometry, scalar roughness regions, UVs and baked PNGs are editable.
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'creature-material-specimens.blend'),compress=True)

if __name__=='__main__': main()
