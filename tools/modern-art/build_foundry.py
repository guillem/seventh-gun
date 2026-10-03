"""Author and light-bake the experimental Foundry environment in local Blender.

The floor footprint is an exported copy of the unchanged campaign grid. Details
below the combat envelope stay behind solid boundaries; galleries and vessels
are above it. Nothing here runs in the browser or modifies the simulation.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys
import subprocess

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/modern/foundry-room'
DEST = ROOT / 'public/modern/foundry'
spec = importlib.util.spec_from_file_location('author', Path(__file__).with_name('build_assets.py'))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
args = argparse.ArgumentParser()
args.add_argument('--size', type=int, default=2048)
args.add_argument('--samples', type=int, default=32)
args.add_argument('--skip-bake', action='store_true')
opt = args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
SOURCE.mkdir(parents=True, exist_ok=True)
DEST.mkdir(parents=True, exist_ok=True)
a.reset()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = opt.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 5
scene.cycles.diffuse_bounces = 4
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.32, .43, .55, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .012

concrete = a.material('foundry.concrete', (.27,.29,.27), 0, .91)
arrival_concrete = a.material('foundry.arrivalConcrete', (.28,.29,.26), 0, .92)
arrival_floor = a.material('foundry.arrivalFloor', (.13,.14,.13), 0, .86)
floor = a.material('foundry.floor', (.18,.21,.22), .55, .47)
steel = a.material('foundry.steel', (.085,.115,.13), .75, .4)
edge = a.material('foundry.edge', (.31,.35,.36), .8, .36)
ochre = a.material('foundry.ochre', (.44,.25,.07), .35, .64)
label_paint = a.material('foundry.labelPaint', (.72,.68,.55), 0, .9)
black = a.material('foundry.black', (.026,.034,.04), .5, .65)
white = a.material('foundry.whiteLamp', (.81,.88,1), 0, .5, .8)
amber = a.material('foundry.amberLamp', (1,.58,.27), 0, .5, 3)
meshes = []
lights = []

def box(name, pos, size, mat, bevel=.02):
    ob = a.box(name,pos,size,mat,bevel=bevel)
    for mod in ob.modifiers:
        if mod.type == 'BEVEL': mod.segments = 1
    meshes.append(ob)
    return ob

def pipe(name, p, q, r, mat=steel, sides=12):
    ob = a.cylinder(name,p,q,r,mat,segments=sides)
    meshes.append(ob)
    return ob

def area(name, pos, target, color, power, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.color = color
    data.shape = 'DISK'
    data.size = size
    ob = bpy.data.objects.new(name,data)
    scene.collection.objects.link(ob)
    ob.location = a.gv(pos)
    ob.rotation_euler = (a.gv(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    lights.append({'name':name,'position':pos,'target':target,'color':color,'power':power,'size':size})
    return ob

layout = json.loads((SOURCE/'layout.json').read_text())
cells = {tuple(c) for c in layout['cells']}
grid = layout['grid']
width = layout['w']
def walk(x,z):
    return 0 <= x < width and 0 <= z < layout['h'] and grid[z*width+x] == 1
def height(x):
    return 11 if x < 13 else 6.4 if x < 18 else 16

# Exact floor footprint: join tiles into one low-poly mesh, then use a separate
# atlas UV set for light baking. No raised objects obstruct the walkable floor.
verts=[]; faces=[]
for x,z in sorted(cells):
    i=len(verts)
    verts.extend([(x*2,0,z*2),((x+1)*2,0,z*2),((x+1)*2,0,(z+1)*2),(x*2,0,(z+1)*2)])
    faces.append((i+3,i+2,i+1,i))
ob=a.mesh('Continuous original walkable floor',verts,faces,floor)
ob.data.materials.append(arrival_floor)
for poly,(x,z) in zip(ob.data.polygons,sorted(cells)):
    if x<18: poly.material_index=1
meshes.append(ob)

# Boundary walls use the exact same grid edges. Their thickness projects into
# solid cells only, so no new fake cover is placed in the traversable region.
for x,z in sorted(cells):
    h=height(x)
    for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
        if walk(x+dx,z+dz):
            next_h=height(x+dx) if (x+dx,z+dz) in cells else 4.2
            if h > next_h:
                box('Portal upper closure',((x+.5)*2+dx,h-(h-next_h)/2,(z+.5)*2+dz),
                    (.35,h-next_h,2) if dx else (2,h-next_h,.35),arrival_concrete if x<18 else concrete,0)
            continue
        px=(x+.5)*2+dx*1.25; pz=(z+.5)*2+dz*1.25
        box('Cast concrete boundary',(px,h/2,pz),(.5,h,2) if dx else (2,h,.5),arrival_concrete if x<18 else concrete,0)
        # A visible steel curb must sit distinctly in front of its concrete
        # backing, rather than sharing its rasterized plane at long distance.
        box('Foundation curb',(px,.17,pz),(.56,.34,2) if dx else (2,.34,.56),black,.015)

# Entrance roof: two narrow clerestories bring daylight across the room.
for za,zb in [(80,81.1),(82.1,90),(91,94)]:
    box('Arrival roof',(19,11.12,(za+zb)/2),(14,.24,zb-za),concrete)
for z in [81.6,90.5]:
    box('Arrival clerestory',(19,11.22,z),(13.9,.045,.96),white,0)
    area('Arrival daylight',(19,10.9,z),(20,0,87),(.77,.85,1),520 if z<87 else 90,1.1)
for x in [12.3,25.7]:
    for z in [80.35,84,90,93.65]:
        # The lower column face stays at the collision wall; the upper frame
        # projects inward only above the combat volume.
        box('Arrival upper pier',(x,7.9,z),(.65,6.2,.7),concrete,.055)
        box('Pier capital',(x,10.4,z),(.95,.42,1.05),steel)
for z in [82.8,87,92]:
    box('Arrival roof girder',(19,10.5,z),(14,.65,.32),steel)
    for x in [14,17,20,23]:
        pipe('Roof brace',(x,10.1,z),(x+1.1,9.55,z),.035,edge)

# A generous portal makes the narrow original connection read as an airlock.
# Original corridor spans x26..36,z84..90, with the moving door at x35.
for x in [26.1,30.4,34.3,36]:
    box('Portal lintel',(x,4.8,87),(.42,.9,6.6),steel,.045)
    for z in [83.78,90.22]:
        box('Portal jamb',(x,2.25,z),(.36,4.5,.44),steel,.025)
        box('Doorway brass trim',(x-.23,2.1,z),(.04,3.3,.22),ochre,.009)
box('Airlock roof',(31,6.55,87),(10,.3,6),concrete)
for z in [84.45,89.55]:
    pipe('Airlock feed',(26,5.6,z),(36,5.6,z),.16)
for x in [28,32]:
    box('Airlock light',(x,6.32,87),(.7,.06,3),white)
    area('Airlock downlight',(x,6.15,87),(x,0,87),(.68,.8,1),135,.8)

# Entrance eye-level assemblies sit against existing solid wall faces. The
# largest relief is 0.16m, within the unchanged player-wall clearance margin.
def lettering(label, pos, size, mat=label_paint):
    curve=bpy.data.curves.new('Cast foundry lettering', 'FONT')
    curve.body=label
    curve.align_x='CENTER'; curve.align_y='CENTER'
    curve.size=size; curve.extrude=.001; curve.resolution_u=3
    ob=bpy.data.objects.new(label,curve); scene.collection.objects.link(ob)
    ob.location=a.gv(pos); ob.rotation_euler=(math.pi/2,0,-math.pi/2)
    ob.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH'); meshes.append(bpy.context.object)

for z in [81.9,92.1]:
    box('Recessed service assembly',(26.015,1.8,z),(.1,2.85,2.5),black,.025)
    box('Worn access cover',(25.955,1.83,z),(.045,2.6,2.26),steel,.018)
    for zz in [z-1.12,z+1.12]:
        box('Panel edge weld',(25.915,1.83,zz),(.025,2.58,.026),edge,.005)
        for y in [.65,1.2,2.4,3]:
            pipe('Hex fastener',(25.91,y,zz),(25.875,y,zz),.043,edge,6)
    if z<87:
        for y in [.7+i*.115 for i in range(12)]:
            box('Exhaust louvre',(25.907,y,z),(.038,.04,1.8),black,.008)
        box('Vent identification plate',(25.9,2.64,z),(.025,.42,1.7),black,.008)
        lettering('EXTRACTION', (25.877,2.64,z),.19)
    else:
        for zz in [z-.62,z+.62]:
            box('Fuse cabinet',(25.912,2.03,zz),(.032,1.45,.85),black,.025)
            box('Cabinet inset',(25.89,2.05,zz),(.024,1.22,.68),steel,.015)
            box('Cabinet pull',(25.852,1.9,zz+.21),(.026,.26,.038),edge,.006)
        lettering('POWER / 07',(25.884,2.95,z),.19)
        lettering('480 V',(25.875,.72,z),.2)
    # Conduit leaves the panel vertically; no free-standing cable obstacles.
    for zz in [z-.7,z+.7]:
        pipe('Panel supply conduit',(25.91,3.1,zz),(25.91,5.35,zz),.043)
        for y in [3.5,4.5,5.2]:
            box('Conduit saddle',(25.93,y,zz),(.05,.055,.16),edge,.006)

box('Cast hall enamel sign',(25.87,5.72,87),(.10,.84,4.65),black,.025)
lettering('CASTING  /  01',(25.805,5.76,87),.36)
lettering('FOUNDRY ACCESS',(25.805,5.43,87),.13)
# Two visible warm sconces create local light pools around the doorway.
for z in [83.1,90.9]:
    box('Caged amber sconce',(25.975,3.62,z),(.09,.78,.24),black,.015)
    box('Sconce diffuser',(25.915,3.62,z),(.03,.58,.12),amber,.015)
    for y in [3.38,3.62,3.86]:
        box('Sconce guard',(25.885,y,z),(.025,.022,.22),edge,.004)
    area('Portal warm pool',(25.68,3.6,z),(23,1.2,z),(1,.46,.17),145,.42)

# Flush wall cladding and pinned pipework give the corridor human-scale detail.
for z,sgn in [(84,1),(90,-1)]:
    for x in [27.6,29.7,31.8,33.9]:
        box('Airlock lower cladding',(x,1.45,z+sgn*.025),(1.94,2.7,.05),steel,.018)
        box('Cladding recessed joint',(x-1,1.45,z+sgn*.055),(.025,2.72,.023),black,.002)
        for xx in [x-.8,x+.8]:
            for y in [.35,2.55]:
                pipe('Cladding fastener',(xx,y,z+sgn*.052),(xx,y,z+sgn*.085),.032,edge,6)
    for y in [3.15,3.42,3.69]:
        pipe('Clipped airlock cable',(26.35,y,z+sgn*.07),(34.5,y,z+sgn*.07),.038,black)
        for x in [27,29,31,33]:
            box('Cable clip',(x,y,z+sgn*.095),(.05,.11,.035),edge,.004)
# Door header mechanism lives above the original moving slab / combat height.
box('Lift motor housing',(34.4,5.35,87),(.7,.85,2.4),steel,.055)
for z in [85.9,88.1]:
    pipe('Header drive shaft',(34.4,5.35,z-.12),(34.4,5.35,z+.12),.31,edge,16)
    for y in [4.9,5.8]:
        pipe('Header hydraulic',(34.22,y,z),(35.6,y,z),.065,ochre)


# Seven structural bays turn the large rectangular castfloor into a foundry.
# Hanging vessels and galleries remain above the unchanged combat space.
for i,x in enumerate([39,49,59,69,79,89,99]):
    for z in [78.4,95.6]:
        box('Upper concrete buttress',(x,10.6,z),(1.25,10.8,1.1),concrete,.075)
        box('Buttress footing above combat',(x,5.35,z),(1.65,.7,1.3),steel)
        box('Crown beam shoe',(x,15,z),(1.75,.6,1.65),steel)
        # Never place a pier through an existing side passage. At solid walls
        # its 0.15m relief stays inside the original player-clearance margin.
        outside=77.6 if z<87 else 96.4
        row=38 if z<87 else 48
        if all(not walk(math.floor(xx/2),row) for xx in [x-.7,x,x+.7]):
            box('Full height structural pier',(x,7.8,outside),(1.3,15.6,1.1),concrete,.025)
            # The former 1.1m base exactly coincided with the concrete pier's
            # front face, producing black z-fighting patches. A 3cm wrap keeps
            # the sheet visibly proud while staying inside 0.2m clearance.
            box('Pier steel base',(x,.8,outside),(1.36,1.6,1.16),steel,.015)
    box('Cross hall structural beam',(x,15.4,87),(.7,1.1,18),steel,.04)
    for z in [80,83,86,89,92]:
        pipe('Truss diagonal',(x,14.8,z),(x,13.9,z+2.2),.065,edge)
        pipe('Truss return',(x,13.9,z+2.2),(x,14.8,z+2.2),.055,edge)
    # A high vessel at alternating sides gives the skyline an authored rhythm.
    z=80.15 if i%2==0 else 93.85
    pipe('Overhead process vessel',(x+3,8.2,z),(x+3,13.7,z),1.22,steel,24)
    for y in [8.2,8.45,10.0,12.8,13.65]:
        pipe('Vessel flange',(x+3,y-.065,z),(x+3,y+.065,z),1.34,edge,24)
    pipe('Vessel neck',(x+3,13.7,z),(x+3,15.8,z),.32,edge)
    for sx in [-.6,.6]:
        pipe('Vessel suspension',(x+3+sx,13.8,z),(x+3+sx,16,z),.07)
    pipe('Process downfeed',(x+4.8,6,z),(x+4.8,14,z),.14,ochre)
    box('Process status lamp',(x+2.97,10.5,z+(1.24 if z<87 else -1.24)),(.1,.38,.045),amber)

# One distinct suspended pressure chamber interrupts the repeated bays. Its
# lowest surface is eight metres above the floor, safely outside combat.
pipe('Central pressure chamber',(65,8.3,87),(65,14.2,87),2.35,steel,32)
for y in [8.4,8.7,10.8,13.8]:
    # The bottom flange must cover, rather than coincide with, the chamber's
    # y=8.3 end cap. The 3cm lip removes a second coplanar flicker source.
    lower=y-.13 if y==8.4 else y-.1
    pipe('Central chamber flange',(65,lower,87),(65,y+.1,87),2.48,edge,32)
for z in [85.1,88.9]:
    pipe('Central load hanger',(65,14.2,z),(65,16,z),.13,ochre)
    pipe('Central chamber bypass',(62.3,9.2,z),(62.3,14.5,z),.2,edge)
box('Central instrument housing',(65,11,84.65),(1.15,1.8,.18),black)
box('Central instrument light',(65,11.45,84.53),(.64,.06,.04),amber)

# Elevated side galleries are scenery only; no stairs imply a playable route.
for z in [79.1,94.9]:
    box('Service gallery',(70,6.6,z),(68,.22,1.8),steel)
    inner=z+(1 if z<87 else -1)
    for y in [7.05,7.65]: pipe('Gallery handrail',(36,y,inner),(104,y,inner),.035,ochre)
    for x in range(37,105,3):
        pipe('Railing post',(x,6.7,inner),(x,7.7,inner),.036,ochre)
        pipe('Gallery brace',(x,5.6,z-.7 if z<87 else z+.7),(x,6.5,inner),.065,steel)
    for j in range(4):
        pz=z+(j-.5)*.28
        pipe('Main roof utility',(36,12.8+j*.27,pz),(104,12.8+j*.27,pz),.12+j*.035,steel)
        for x in range(38,104,6):
            pipe('Utility coupling',(x-.055,12.8+j*.27,pz),(x+.055,12.8+j*.27,pz),.16+j*.035,edge)

# Only three selected clerestory slots admit daylight. Closed intermediate
# bays leave the roof, galleries and machinery in shadow, instead of bathing
# every wall in one continuous cool wash.
for bay,x0 in enumerate(range(36,104,10)):
    x1=min(104,x0+10)
    for za,zb in [(78,80.0),(81.6,96)]:
        box('Casting roof',((x0+x1)/2,16.15,(za+zb)/2),(x1-x0,.3,zb-za),concrete)
    mid=(x0+x1)/2
    if bay in [0,3,6]:
        slot=3.2
        for xa,xb in [(x0,mid-slot/2),(mid+slot/2,x1)]:
            box('Closed clerestory roof',((xa+xb)/2,16.15,80.8),(xb-xa,.3,1.6),concrete,0)
        box('Hall skylight',(mid,16.23,80.8),(slot,.06,1.6),white)
        area('Selective hall daylight',(mid,15.85,80.8),(mid+2,0,88),(.81,.88,1),1400 if bay==0 else 1050 if bay==3 else 850,.85)
    else:
        box('Closed clerestory roof',(mid,16.15,80.8),(x1-x0,.3,1.6),concrete,0)

# Suspended high-bay practicals give the travel route warm, separated pools.
# Their lenses and cables are visible; everything stays above combat height.
# Runtime stationary lights for moving actors use these same fixed positions.
for i,x in enumerate([46,61,76,91]):
    z=85.5 if i%2==0 else 89
    pipe('Pendant power cable',(x,8.95,z),(x,15.75,z),.026,black,8)
    pipe('Pendant lamp housing',(x,8.58,z),(x,8.94,z),.34,steel,16)
    pipe('Pendant diffuser',(x,8.545,z),(x,8.58,z),.27,amber,16)
    area('Warm high-bay pool',(x,8.5,z),(x+.8,0,z+.35),(1,.66,.38),430,.38)

# Low amber wall lamps in the start and casting hall. Bodies stay behind the
# boundary plane; their luminous lenses project less than the player radius.
for x,z,side in [(12,83,1),(12,91,1),(24,80,0),(24,94,0)]+[(x,z,0) for x in [40,50,60,70,80,90,100] for z in [78,96]]:
    inward=1 if z<87 else -1
    if not side and walk(math.floor(x/2),math.floor((z-inward*.2)/2)): continue
    if side:
        box('Wall luminaire',(x-.06,2.8,z),(.12,.64,.3),black)
        box('Amber lens',(x+.012,2.8,z),(.035,.4,.16),amber)
        area('Arrival wall light',(x+.16,2.8,z),(x+3,1,z),(1,.47,.16),80,1)
    else:
        box('Wall luminaire',(x,2.8,z-inward*.06),(.3,.64,.12),black)
        box('Amber lens',(x,2.8,z+inward*.012),(.16,.4,.035),amber)
        area('Casting wall light',(x,2.8,z+inward*.16),(x,1,z+inward*3),(1,.59,.29),180,.45)

# Join the static assembly into one GLB mesh with a small set of materials.
bpy.ops.object.select_all(action='DESELECT')
for ob in meshes:
    ob.select_set(True)
    bpy.context.view_layer.objects.active=ob
    for mod in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.join()
hero=bpy.context.object
hero.name='Foundry authored environment'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
uv=hero.data.uv_layers.get('SurfaceUV') or hero.data.uv_layers.new(name='SurfaceUV')
for poly in hero.data.polygons:
    n=poly.normal
    axes=(0,1) if abs(n.z)>.7 else (0,2) if abs(n.y)>.7 else (1,2)
    for li in poly.loop_indices:
        v=hero.data.vertices[hero.data.loops[li].vertex_index].co
        scale=7 if hero.data.materials[poly.material_index].name=='foundry.arrivalFloor' else 3
        uv.data[li].uv=(v[axes[0]]/scale,v[axes[1]]/scale)
while len(hero.data.uv_layers)>1:
    hero.data.uv_layers.remove(hero.data.uv_layers[0 if hero.data.uv_layers[0].name!='SurfaceUV' else 1])
hero.data.uv_layers.new(name='BakeUV')
hero.data.uv_layers.active_index=1
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.00001)
bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.004,area_weight=.5)
bpy.ops.object.mode_set(mode='OBJECT')

image=bpy.data.images.new('Foundry static irradiance',width=opt.size,height=opt.size,alpha=False,float_buffer=True)
image.colorspace_settings.name='Non-Color'
original=[]
for mat in hero.data.materials:
    p=mat.node_tree.nodes.get('Principled BSDF')
    original.append((mat,p.inputs['Base Color'].default_value[:],p.inputs['Metallic'].default_value))
    if 'Lamp' not in mat.name:
        # Color is excluded from the receiving pass, but surrounding albedos
        # must remain plausible: white bounce surfaces badly over-light rooms.
        if mat.name=='foundry.concrete': p.inputs['Base Color'].default_value=(.13,.14,.13,1)
        if mat.name=='foundry.arrivalConcrete': p.inputs['Base Color'].default_value=(.18,.19,.17,1)
        if mat.name in ['foundry.floor','foundry.arrivalFloor']: p.inputs['Base Color'].default_value=(.045,.052,.058,1)
        p.inputs['Metallic'].default_value=0
    target=mat.node_tree.nodes.new('ShaderNodeTexImage')
    target.name='Baked irradiance target'
    target.image=image
    mat.node_tree.nodes.active=target
scene.render.bake.use_pass_direct=True
scene.render.bake.use_pass_indirect=True
scene.render.bake.use_pass_color=False
scene.render.bake.margin=8
if not opt.skip_bake:
    print('FOUNDRY: baking static irradiance',flush=True)
    bpy.ops.object.bake(type='DIFFUSE')
    # Preserve irradiance above one without shipping a float EXR. Encode an
    # exposure-scaled sRGB PNG and restore this scale in the material lightMap.
    # Explicit OETF into a Non-Color image avoids implicit save transforms.
    import array
    pixels=array.array('f',[0])*(opt.size*opt.size*4)
    image.pixels.foreach_get(pixels)
    peak=max(pixels)
    for i in range(0,len(pixels),4):
        for c in range(3):
            v=max(0, pixels[i+c]/8)
            pixels[i+c]=12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055
    image.pixels.foreach_set(pixels)
    image.filepath_raw=str(SOURCE/'irradiance-source.png')
    image.file_format='PNG'
    image.save()
    subprocess.run(['cwebp','-quiet','-q','94',str(SOURCE/'irradiance-source.png'),'-o',str(DEST/'irradiance.webp')],check=True)
for mat,color,metal in original:
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=color
    p.inputs['Metallic'].default_value=metal
hero.data.uv_layers.active_index=0
hero.data.uv_layers[0].active_render=True
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'foundry.blend'),compress=True)
bpy.ops.object.select_all(action='DESELECT')
hero.select_set(True)
bpy.context.view_layer.objects.active=hero
bpy.ops.export_scene.gltf(filepath=str(DEST/'environment.glb'),export_format='GLB',use_selection=True,
    export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,
    export_animations=False,export_cameras=False,export_lights=False)
manifest={'source':'foundry.blend','mapSeed':layout['seed'],'cells':len(cells),'bakeSize':opt.size,
    'bakeSamples':opt.samples,'bake':'Cycles CPU diffuse direct+indirect, color excluded; explicit sRGB OETF of linear irradiance / 8; Non-Color PNG storage',
    'meshFaces':len(hero.data.polygons),'glbBytes':(DEST/'environment.glb').stat().st_size,'lights':lights,
    'limits':'Only existing floor boundaries collide. Galleries, vessels and utility details are overhead scenery.'}
(SOURCE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('FOUNDRY: export complete',json.dumps({k:v for k,v in manifest.items() if k!='lights'}),flush=True)
