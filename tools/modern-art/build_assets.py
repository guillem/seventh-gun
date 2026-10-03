"""Offline MR-7 art authoring. Run with Blender --background --factory-startup.

All input positions use the game's right-handed X/Y-up/Z coordinates. Blender's
glTF exporter restores those coordinates exactly. This script is never shipped
to / executed by the game: the editable .blend and optimized .glb are the assets.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art/modern"
DEST = ROOT / "public/modern/models"
TAU = math.tau


def gv(p):
    return Vector((p[0], -p[2], p[1]))


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)


def material(name, color, metal=0, rough=.5, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


def group(name, pos=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    ob.location = gv(pos)
    ob.parent = parent
    return ob


def assign(ob, mat, parent=None):
    ob.data.materials.append(mat)
    ob.parent = parent
    return ob


def mesh(name, verts, faces, mat, parent=None, bevel=0, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([gv(v) for v in verts], [], faces)
    data.update()
    bm=bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    assign(ob, mat, parent)
    if bevel:
        b = ob.modifiers.new('Machined edge radius', 'BEVEL')
        b.width = bevel
        b.segments = 3
        b.limit_method = 'ANGLE'
        n = ob.modifiers.new('Area weighted normals', 'WEIGHTED_NORMAL')
        n.keep_sharp = True
    for poly in data.polygons:
        poly.use_smooth = smooth
    return ob


def box(name, pos, size, mat, parent=None, bevel=.004):
    bpy.ops.mesh.primitive_cube_add(size=1, location=gv(pos))
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(ob, mat, parent)
    if bevel:
        b = ob.modifiers.new('Rounded machined corners', 'BEVEL')
        b.width = bevel
        b.segments = 3
        n = ob.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        n.keep_sharp = True
    return ob


def side_profile(name, points_yz, width, mat, parent=None, bevel=.002, x=0):
    n = len(points_yz)
    verts = [(x + s * width / 2, y, z) for s in [-1, 1] for y, z in points_yz]
    faces = [tuple(range(n-1, -1, -1)), tuple(range(n, n*2))]
    faces += [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
    return mesh(name, verts, faces, mat, parent, bevel)


def ellipsoid(name, pos, scale, mat, parent=None, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=gv(pos))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for p in ob.data.polygons:
        p.use_smooth = True
    return assign(ob, mat, parent)


def cylinder(name, a, b, radius, mat, parent=None, r2=None, segments=24):
    a, b = gv(a), gv(b)
    length = (b-a).length
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius,
        radius2=radius if r2 is None else r2, depth=length, location=(a+b)*.5)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(b-a)
    for p in ob.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    return assign(ob, mat, parent)


def tube(name, points, radius, mat, parent=None, sides=10):
    """Smooth authored tube, used for hoses, finger seams and tendons."""
    cr = bpy.data.curves.new(name, 'CURVE')
    cr.dimensions = '3D'
    cr.resolution_u = 8
    cr.bevel_depth = radius
    cr.bevel_resolution = 2
    cr.resolution_u = 6
    spl = cr.splines.new('BEZIER')
    spl.bezier_points.add(len(points)-1)
    for bp, xyz in zip(spl.bezier_points, points):
        bp.co = gv(xyz)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, cr)
    bpy.context.collection.objects.link(ob)
    assign(ob, mat, parent)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    return ob


def shell(name, sections, mat, parent=None, segments=24, ripple=0):
    """Sculpted loft along Y. Each cross section is (x,y,z,rx,rz)."""
    verts = []
    for j, (x, y, z, rx, rz) in enumerate(sections):
        for k in range(segments):
            t = TAU * k / segments
            r = 1 + ripple * math.sin(t*7 + j*1.7)
            verts.append((x + math.cos(t)*rx*r, y, z + math.sin(t)*rz*r))
    faces = [tuple(range(segments-1, -1, -1))]
    for j in range(len(sections)-1):
        for k in range(segments):
            faces.append((j*segments+k, j*segments+(k+1)%segments,
                          (j+1)*segments+(k+1)%segments, (j+1)*segments+k))
    faces.append(tuple(range((len(sections)-1)*segments, len(sections)*segments)))
    return mesh(name, verts, faces, mat, parent, smooth=True)


def ring(name, center, radius, thick, mat, parent=None, axis='z'):
    points=[]
    for i in range(25):
        a=TAU*i/24
        if axis == 'z': p=(center[0]+math.cos(a)*radius,center[1]+math.sin(a)*radius,center[2])
        elif axis == 'y': p=(center[0]+math.cos(a)*radius,center[1],center[2]+math.sin(a)*radius)
        else: p=(center[0],center[1]+math.cos(a)*radius,center[2]+math.sin(a)*radius)
        points.append(p)
    return tube(name, points, thick, mat, parent)


def kit_coupler(name, center, radius, thick, mat, parent):
    """A 128-triangle annulus, with no expensive Bezier sweep sampling.

    The kit is repeated hundreds of times in a level. Sixteen radial segments
    and four tube segments retain the clamp silhouette at gameplay distance.
    Its axis is Y, matching the authored vertical conduits before placement.
    """
    radial, cross = 16, 4
    vertices=[]
    for i in range(radial):
        theta=TAU*i/radial
        for j in range(cross):
            phi=TAU*j/cross
            r=radius+math.cos(phi)*thick
            vertices.append((center[0]+r*math.cos(theta),
                             center[1]+math.sin(phi)*thick,
                             center[2]+r*math.sin(theta)))
    faces=[]
    for i in range(radial):
        for j in range(cross):
            faces.append((i*cross+j, ((i+1)%radial)*cross+j,
                         ((i+1)%radial)*cross+(j+1)%cross, i*cross+(j+1)%cross))
    return mesh(name,vertices,faces,mat,parent,smooth=True)


def text_label(name, value, pos, size, mat, parent, side=1):
    # Text lies on the weapon side and is converted to regular exportable geometry.
    bpy.ops.object.text_add(location=gv(pos))
    ob=bpy.context.object
    ob.name=name
    ob.data.body=value
    ob.data.size=size
    ob.data.space_character=1.15
    ob.data.extrude=.00012
    ob.rotation_euler=(math.pi/2, 0, math.pi/2 if side > 0 else -math.pi/2)
    assign(ob,mat,parent)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def pistol():
    reset()
    root=group('pistol')
    gun=group('weapon', parent=root)
    steel=material('MR7 | bead blasted titanium',(.30,.34,.37),.86,.29)
    edge=material('MR7 | exposed nickel edges',(.54,.58,.60),.9,.25)
    black=material('MR7 | carbonized steel',(.027,.038,.045),.8,.32)
    polymer=material('MR7 | stippled polymer',(.040,.047,.046),.04,.79)
    glove=material('MR7 | charcoal glove leather',(.063,.072,.065),0,.88)
    stitch=material('MR7 | glove seam',(.115,.124,.101),0,.94)
    fabric=material('MR7 | woven olive sleeve',(.070,.084,.064),0,.95)
    brass=material('MR7 | brass witness',(.47,.29,.09),.7,.32)
    red=material('MR7 | safety ceramic',(.52,.065,.018),.15,.42)
    glow=material('MR7 | tritium',(.20,.83,.68),0,.32,2)
    mark=material('MR7 | laser engraving',(.65,.70,.67),.3,.59)
    # Main frame follows a continuous manufactured profile, with relieved nose.
    side_profile('Lower receiver',[(.026,.055),(.025,-.316),(-.005,-.344),(-.036,-.306),
        (-.042,-.126),(-.103,-.086),(-.177,.028),(-.179,.090),(-.031,.071)],.071,black,gun,.005)
    side_profile('Grip chassis',[(-.02,.028),(-.04,-.065),(-.178,-.007),(-.201,.059),
        (-.183,.101),(-.108,.078)],.068,polymer,gun,.010)
    side_profile('Magazine butt',[(-.177,-.012),(-.201,.003),(-.219,.086),(-.198,.113)],.083,black,gun,.004)
    for s in [-1,1]:
        side_profile('Grip inset', [(-.058,.015),(-.067,-.035),(-.175,.019),(-.185,.069),(-.17,.080)],.004,glove,gun,.003,x=s*.035)
        for k in range(12):
            # Cut stippling is authored geometry, visible only at viewmodel range.
            for j in range(4):
                y=-.071-k*.008
                z=-.023+j*.014+k*.0034
                cylinder('Grip stipple',(s*.037,y,z),(s*.0382,y,z),.0017,black,gun,segments=6)
    slide=group('slide',parent=gun)
    side_profile('Monolithic slide',[(.030,.071),(.093,.053),(.099,-.295),(.079,-.338),
        (.034,-.342)],.077,steel,slide,.005)
    # Hollow bore is an inset black cylinder surrounded by concentric steel rings.
    cylinder('Barrel',(0,.055,-.371),(0,.055,-.225),.020,black,gun)
    ring('Muzzle crown',(0,.055,-.371),.0165,.0033,edge,gun)
    cylinder('Bore recess',(0,.055,-.372),(0,.055,-.364),.0118,black,gun)
    group('muzzle',(0,.055,-.376),gun)
    for s in [-1,1]:
        # Rear gripping serrations and ejection-side milled channel.
        for k in range(8):
            side_profile('Slide cocking serration',[(.040,.040-k*.012),(.084,.021-k*.012),
                (.084,.025-k*.012),(.040,.044-k*.012)],.002,black,slide,.0007,x=s*.039)
        side_profile('Machined relief',[(.048,-.114),(.079,-.118),(.079,-.293),(.048,-.314)],.0018,black,slide,.002,x=s*.039)
        box('Relief interior',(s*.040,.062,-.217),(.0018,.017,.153),steel,slide,.001)
        for j in range(3):
            side_profile('Heat vent',[(.052,-.168-j*.045),(.077,-.168-j*.045),
                (.077,-.186-j*.045),(.052,-.186-j*.045)],.002,black,slide,.0015,x=s*.041)
        cylinder('Slide roll pin',(s*.039,.048,-.090),(s*.041,.048,-.090),.005,edge,slide,segments=12)
        cylinder('Frame pin',(s*.036,-.014,.031),(s*.038,-.014,.031),.006,steel,gun,segments=12)
        box('Safety paddle',(s*.044,.003,.032),(.012,.011,.036),steel,gun,.003)
    box('Ejection port',(.005,.099,-.059),(.042,.0018,.074),black,slide,.003)
    box('Chamber hood',(.007,.100,-.066),(.030,.0015,.053),edge,gun,.002)
    cylinder('Chamber witness',(.027,.091,-.067),(.028,.095,-.068),.006,brass,gun)
    box('Rear sight bridge',(0,.105,.044),(.060,.016,.025),black,slide,.002)
    box('Rear notch',(0,.111,.030),(.020,.012,.012),steel,slide,.001)
    for s in [-1,1]:
        ellipsoid('Sight dot',(s*.023,.108,.058),(.003,.003,.0018),glow,slide,12,6)
    box('Front sight blade',(0,.110,-.308),(.012,.024,.029),black,slide,.002)
    ellipsoid('Front sight tritium',(0,.114,-.292),(.003,.003,.002),glow,slide,12,6)
    side_profile('Trigger guard',[(-.022,-.060),(-.033,-.062),(-.076,-.100),(-.079,-.178),
        (-.037,-.213),(-.025,-.207),(-.062,-.170),(-.063,-.105)],.017,black,gun,.003)
    trigger=group('trigger',(0,-.030,-.075),gun)
    tube('Trigger shoe',[(0,0,0),(0,-.019,-.012),(0,-.037,-.006)],.0055,steel,trigger)
    box('Trigger safety',(0,-.020,-.015),(.003,.019,.006),red,trigger,.001)
    box('Accessory rail',(0,-.041,-.268),(.043,.016,.122),black,gun,.002)
    for k in range(5):
        box('Rail lug',(0,-.051,-.216-k*.023),(.055,.008,.012),steel,gun,.001)
    text_label('Model laser etch','MR-7',(.043,.083,-.125),.014,mark,slide)
    text_label('Serial laser etch','07 / 9 x 28',(.039,-.005,-.253),.008,mark,gun)
    # Hands use oval sculpted sections, padded knuckles, curved fingers and seams.
    hands=group('hands',parent=root)
    for s in [1,-1]:
        h=group('hand_r' if s==1 else 'hand_l',parent=hands)
        zoff=0 if s==1 else -.007
        xpos=s*(.050 if s==1 else .057)
        ellipsoid('Leather palm',(xpos,-.112,.041+zoff),(.041,.072,.044),glove,h)
        for k in range(4):
            y=-.062-k*.026
            zz=-.035+k*.006+zoff
            path=[(xpos,y,.022+zoff),(s*.049,y,zz),(s*.010,y-.004,zz-.012),(-s*.018,y-.007,zz+.004)]
            tube('Curled glove finger',path,.0105-k*.00035,glove,h)
            tube('Finger stitching',[(p[0],p[1]+.0075,p[2]-.007) for p in path[:3]],.0008,stitch,h)
            ellipsoid('Knuckle pad',(xpos*1.37,y,.003+zoff),(.012,.010,.017),polymer,h,16,8)
        tube('Gloved thumb',[(xpos,-.057,.054+zoff),(xpos*1.24,-.039,.012+zoff),
             (s*.030,-.047,-.034+zoff)],.014,glove,h)
        tube('Thumb seam',[(xpos+s*.010,-.045,.051+zoff),(xpos*1.26,-.028,.009+zoff),
             (s*.032,-.037,-.034+zoff)],.001,stitch,h)
        a=(xpos,-.17,.076+zoff)
        b=(s*.139,-.267,.295)
        cylinder('Soft glove cuff',a,(s*.080,-.205,.148),.040,glove,h,r2=.050)
        cylinder('Tactical sleeve',(s*.080,-.200,.142),b,.051,fabric,h,r2=.068)
        for j in range(5):
            t=j/5
            ellipsoid('Sleeve fold',(s*(.080+t*.045),-.206-t*.053,.15+t*.125),
                      (.052+t*.010,.018,.025),fabric,h,16,8)
        box('Wrist strap',(s*.079,-.182,.127),(.107,.018,.030),polymer,h,.005)
        box('Wrist clasp',(s*.122,-.180,.127),(.020,.022,.034),steel,h,.003)
        for k in range(4):
            tube('Backhand seam',[(xpos+s*.030,-.073-k*.024,.032),
                 (xpos+s*.029,-.08-k*.024,.063),(xpos+s*.015,-.091-k*.024,.079)],.0011,stitch,h)
    root['description']='MR-7 industrial service sidearm with two gloved hands. Bore -Z; Y up.'
    root['boreY']=.055
    return root


def husk():
    reset()
    root=group('husk')
    body=group('body',parent=root)
    skin=material('HUSK | desiccated tissue',(.23,.245,.21),.0,.86)
    tendon=material('HUSK | tendon sheath',(.105,.135,.116),.05,.76)
    bone=material('HUSK | worn ivory composite',(.49,.48,.405),.10,.63)
    shellmat=material('HUSK | graphite implant',(.052,.072,.073),.67,.39)
    metal=material('HUSK | oxidized surgical metal',(.28,.32,.305),.85,.37)
    dark=material('HUSK | cavity',(.008,.016,.013),0,.91)
    eye=material('HUSK | eyes',(.45,1,.12),0,.3,3)
    core=material('HUSK | sternum lumen',(.12,.63,.19),0,.43,1.7)
    # Lean torso with a contracted waist and a sharply expanded rib cage.
    shell('Torso musculature',[(0,.88,-.025,.125,.095),(-.01,.97,-.010,.17,.10),
        (-.01,1.10,.020,.105,.080),(-.025,1.22,.050,.13,.10),(-.035,1.35,.075,.22,.14),
        (-.04,1.48,.070,.25,.15),(-.05,1.61,.09,.22,.12),(-.035,1.70,.10,.09,.065)],skin,body,ripple=.04)
    # Deliberate segmented rib anatomy across the chest and wrapped to the back.
    for i in range(6):
        y=1.26+i*.055
        w=.135+math.sin(i/6*math.pi)*.09
        for s in [-1,1]:
            tube('Exposed composite rib',[(s*.019,y,.185),(s*w*.58,y+.026,.207),
                (s*w,y+.059,.128),(s*(w-.018),y+.074,-.006)],.011 if i<3 else .014,bone,body)
    tube('Sternum keel',[(-.026,1.25,.17),(-.035,1.42,.212),(-.050,1.59,.191)],.019,bone,body)
    for i in range(4):
        ellipsoid('Sternum lumen',(-.035,1.30+i*.055,.207),(.008,.017,.008),core,body,12,8)
    for s in [-1,1]:
        for i in range(4):
            ellipsoid('Abdominal tendon lobe',(s*(.056+i*.004),1.055+i*.046,.091+i*.015),
                (.045,.029,.024),tendon,body,16,8)
        for i in range(5):
            tube('Costal tension fiber',[(s*(.106+i*.011),1.08+i*.017,.066),
                 (s*(.122+i*.014),1.17+i*.022,.104),(s*(.13+i*.021),1.25+i*.025,.125)],
                 .0035,tendon,body)
    # Spinal hardware and tissue bundles are readable from behind.
    for i in range(11):
        y=.97+i*.061
        z=-.110 if i<5 else -.081
        box('Spinal vertebral plate',(-.025,y,z),(.076,.038,.032),shellmat,body,.007)
        cylinder('Spinal rivet',(-.025,y,z-.017),(-.025,y,z-.020),.009,metal,body,segments=12)
    for s in [-1,1]:
        tube('Paraspinal tendon',[(s*.08,.99,-.079),(s*.11,1.21,-.084),
             (s*.16,1.46,-.035),(s*.12,1.65,.013)],.022,tendon,body)
    # Hunched asymmetry is authored into the shoulders; joint pivots stay neutral.
    ellipsoid('Raised scapula',(-.24,1.63,.034),(.139,.154,.143),skin,body)
    side_profile('Shoulder implant',[(1.58,-.088),(1.78,-.018),(1.79,.089),(1.64,.181),
        (1.55,.11)],.20,shellmat,body,.018,x=-.25)
    for i in range(4):
        tube('Implant cooling fin',[(-.32+i*.044,1.64,-.055),(-.30+i*.040,1.743,.017),
             (-.29+i*.038,1.70,.127)],.009,metal,body)
    # Organic and mechanical neck lines carry the head forward to the sim's maw.
    tube('Neck stem',[(-.030,1.61,.10),(-.008,1.77,.22),(.040,1.80,.33)],.065,skin,body)
    for s in [-1,1]:
        tube('Neck tension cable',[(s*.09,1.54,.165),(s*.06,1.70,.260),(.04+s*.04,1.78,.38)],.013,tendon,body)
    head=group('head',(.055,1.805,.390),body)
    ellipsoid('Cranial vault',(0,.015,0),(.11,.147,.115),bone,head,32,18)
    ellipsoid('Occipital implant',(-.005,.025,-.071),(.118,.130,.073),shellmat,head)
    # Face plates are custom swept surfaces; dark sockets sit behind a brow.
    side_profile('Face wedge',[(.090,.077),(.038,.124),(-.048,.135),(-.103,.088),
        (-.087,.040),(.035,.049)],.038,bone,head,.009)
    for s in [-1,1]:
        ellipsoid('Eye socket',(s*.060,.029,.103),(.043,.031,.034),dark,head)
        ob=ellipsoid('eye_l' if s<0 else 'eye_r',(s*.060,.029,.130),(.019,.008,.009),eye,head,16,10)
        ob['preserveNode']=True
        tube('Orbital brow',[(s*.019,.045,.127),(s*.06,.065,.139),(s*.096,.063,.112)],.014,bone,head)
        tube('Cheek arch',[(s*.10,.022,.091),(s*.105,-.047,.103),(s*.060,-.073,.141)],.016,bone,head)
        cylinder('Temple fastener',(s*.106,.021,-.010),(s*.120,.021,-.010),.017,metal,head)
        for i in range(3):
            box('Cranial staple',(s*.079,.097-i*.031,-.059),(.010,.014,.037),metal,head,.002)
    # Mouth ends at Z=.53, matching existing projectile source.
    ellipsoid('Oral cavity',(.025,-.094,.119),(.058,.042,.035),dark,head)
    jaw=group('jaw',(0,-.055,.015),head)
    tube('Mandible', [(-.085,-.018,.075),(-.066,-.101,.117),(.030,-.120,.138),
          (.089,-.089,.115),(.095,-.023,.068)],.016,bone,jaw)
    for s in [-1,1]:
        cylinder('Jaw hinge',(s*.09,-.004,.040),(s*.101,-.004,.040),.018,metal,jaw)
    for i in range(7):
        x=-.038+i*.012
        cylinder('Upper tooth',(x,-.071,.14),(x,-.094,.142),.0045,bone,head,r2=.0009,segments=6)
        cylinder('Lower tooth',(x,-.104,.137),(x,-.083,.139),.004,bone,jaw,r2=.0009,segments=6)
    for s in [-1,1]:
        for i in range(3):
            tube('Cranial hairline seam',[(s*(.01+i*.02),.121,.050),
                 (s*(.02+i*.022),.090,.102),(s*(.022+i*.025),.071,.112)],.0008,tendon,head)
    group('mouth',(.035,-.137,.143),head)
    for s in [-1,1]:
        hipx=s*.114
        leg=group('leg_l' if s<0 else 'leg_r',(hipx,.96,-.012),body)
        shell('Thigh',[(0,0,0,.096,.086),(s*.015,-.10,-.012,.103,.084),
            (s*.035,-.23,.018,.078,.072),(s*.036,-.38,.055,.051,.056)],skin,leg,ripple=.055)
        ellipsoid('Knee joint',(s*.036,-.410,.065),(.058,.059,.058),shellmat,leg)
        ellipsoid('Patella',(s*.036,-.400,.112),(.039,.054,.019),bone,leg)
        shell('Calf',[(s*.036,-.44,.05,.053,.052),(s*.021,-.52,.004,.065,.066),
            (s*.010,-.65,-.042,.054,.056),(0,-.83,-.017,.033,.030)],skin,leg,ripple=.04)
        tube('Shin tendon',[(s*.037,-.46,.090),(s*.010,-.65,.013),(0,-.85,.025)],.013,bone,leg)
        for side in [-1,1]:
            tube('Knee linkage',[(s*.036+side*.048,-.36,.019),(s*.036+side*.053,-.455,.0),
                (side*.032,-.70,-.065)],.010,metal,leg)
        ellipsoid('Heel',(0,-.883,-.016),(.060,.049,.081),shellmat,leg)
        side_profile('Foot carapace',[(-.861,-.020),(-.889,.180),(-.951,.205),
              (-.954,-.077),(-.901,-.088)],.100,bone,leg,.009)
        for j in range(3):
            tube('Toe incision',[(-.03+j*.03,-.939,.11),(-.03+j*.03,-.941,.173)],.0025,dark,leg)
        shoulder_y=1.60 if s<0 else 1.53
        arm=group('arm_l' if s<0 else 'arm_r',(s*.268,shoulder_y,.045),body)
        length=.43 if s<0 else .48
        ellipsoid('Deltoid',(s*.027,-.049,-.005),(.093,.12,.087),skin,arm)
        shell('Upper arm',[(s*.018,-.08,-.007,.069,.069),(s*.055,-.18,-.006,.063,.063),
            (s*.095,-.33,.044,.045,.044),(s*.107,-length,.069,.037,.040)],skin,arm,ripple=.055)
        ellipsoid('Elbow',(s*.11,-length,.074),(.046,.049,.043),metal,arm)
        fore=group('forearm_l' if s<0 else 'forearm_r',(s*.11,-length,.074),arm)
        shell('Forearm tissue',[(0,-.025,0,.040,.042),(s*.006,-.101,.004,.057,.059),
            (-s*.019,-.235,.035,.045,.042),(-s*.028,-.35,.081,.030,.029)],tendon,fore,ripple=.08)
        tube('Forearm blade',[(-s*.022,-.040,-.022),(-s*.034,-.148,-.037),
            (-s*.057,-.314,.060)],.022,bone,fore)
        tube('Arm implant conduit',[(s*.038,.008,-.008),(s*.065,-.16,-.010),
            (s*.017,-.33,.066)],.012,shellmat,fore)
        ellipsoid('Hand palm',(-s*.034,-.404,.087),(.055,.081,.027),skin,fore)
        for finger in range(4):
            x=-s*.077+finger*.026
            tube('Elongated digit',[(x,-.422,.091),(x-s*.014,-.509,.086),
                  (x-s*.003,-.558,.131)],.010,bone,fore)
            cylinder('Obsidian claw',(x-s*.003,-.558,.131),(x+s*.008,-.561,.171),.011,
                     shellmat,fore,r2=.0008,segments=8)
        tube('Hooked thumb',[(-s*.003,-.363,.089),(s*.024,-.430,.132),(s*.004,-.477,.156)],.014,bone,fore)
    root['description']='Husk infected industrial worker. Y up, faces +Z. Existing simulation pivots and muzzle retained.'
    return root


def architecture():
    reset()
    root=group('architecture')
    steel=material('KIT | galvanized steel',(.24,.29,.31),.80,.43)
    dark=material('KIT | industrial graphite',(.037,.050,.055),.65,.52)
    rubber=material('KIT | cable insulation',(.015,.025,.023),.1,.80)
    ceramic=material('KIT | porcelain equipment',(.58,.63,.61),.15,.53)
    yellow=material('KIT | safety ochre',(.72,.35,.045),.2,.55)
    blue=material('KIT | phosphor teal',(.11,.70,.75),.1,.25,3)
    lampmat=material('KIT | linear work light',(.62,.78,.74),0,.25,4)
    # Modules all use zero origin at floor/wall attachment. Runtime selects nodes.
    panel=group('service_panel',parent=root)
    box('Enclosure shell',(0,.55,.095),(.65,1.10,.19),dark,panel,.025)
    box('Equipment face',(0,.55,.197),(.60,1.04,.023),ceramic,panel,.014)
    box('Access plate',(0,.41,.214),(.49,.53,.019),steel,panel,.008)
    box('Recessed readout',(-.072,.873,.216),(.34,.16,.016),rubber,panel,.004)
    for i in range(5):
        box('Diagnostic line',(-.18+i*.063,.877,.227),(.038,.055+(i%3)*.017,.003),blue,panel,.001)
    for s in [-1,1]:
        for y in [.075,1.026]:
            cylinder('Panel fastener',(s*.255,y,.209),(s*.255,y,.228),.015,steel,panel,segments=8)
    for i in range(7):
        box('Vent slot',(0,.24+i*.049,.229),(.38,.013,.007),dark,panel,.002)
    box('Warning plate',(.196,.875,.220),(.054,.125,.012),yellow,panel,.003)
    for k in range(3):
        tube('External cable',[(.13+k*.063,.050,.110),(.15+k*.064,-.13,.11),
             (.30+k*.062,-.31,.087),(.45+k*.072,-.33,.036)],.021,rubber,panel)
    frame=group('column',parent=root)
    box('Structural column',(0,1.35,0),(.19,2.7,.20),dark,frame,.008)
    for x in [-.13,.13]:
        box('I beam flange',(x,1.35,0),(.065,2.7,.31),steel,frame,.006)
    for y in [.18,1.27,2.45]:
        box('Beam gusset',(0,y,.165),(.38,.25,.024),steel,frame,.009)
        for x in [-.115,.115]:
            cylinder('Hex anchor',(x,y,.178),(x,y,.193),.024,dark,frame,segments=6)
    for y in [.14,.29,.44]:
        box('Column warning stripe',(0,y,.183),(.19,.056,.004),yellow,frame,.001)
    pipes=group('pipe_rack',parent=root)
    for k in range(3):
        x=-.18+k*.18
        radius=.049 if k==0 else .034
        cylinder('Vertical conduit',(x,0,.02),(x,2.8,.02),radius,steel,pipes,segments=12)
        for y in [.32,1.30,2.35]:
            kit_coupler('Conduit coupler',(x,y,.02),radius+.005,.008,dark,pipes)
            box('Wall standoff',(x,y,-.038),(.12,.046,.070),dark,pipes,.004)
    light=group('strip_light',parent=root)
    box('Luminaire housing',(0,0,0),(1.13,.085,.09),dark,light,.013)
    box('LED diffuser',(0,-.037,.040),(.99,.027,.034),lampmat,light,.008)
    for s in [-1,1]:
        box('Luminaire end cap',(s*.54,0,.015),(.035,.087,.10),steel,light,.005)
    grille=group('floor_grille',parent=root)
    box('Drain recess',(0,-.028,0),(.88,.065,.88),rubber,grille,.008)
    for i in range(13):
        box('Grille bar',(-.405+i*.0675,.010,0),(.019,.038,.86),steel,grille,.003)
    for z in [-.431,.431]:
        box('Grille trim',(0,.008,z),(.91,.055,.025),dark,grille,.005)
    for x in [-.431,.431]:
        box('Grille trim',(x,.008,0),(.025,.055,.91),dark,grille,.005)
    frame.name='wall_rib'
    frame.scale=(1,.45,4/2.7)
    frame.location=gv((0,0,.082))
    light.name='wall_fixture'
    light.location=gv((0,0,.050))
    pipes.name='pipe_run'
    pipes.rotation_euler.y=math.pi/2
    pipes.scale=(2/2.8,2/2.8,2/2.8)
    pipes.location=gv((-1,0,.10))
    return root


def optimize(root):
    """Collapse static pieces per parent/material, keeping articulation intact."""
    objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for ob in objs:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active=ob
        for mod in list(ob.modifiers):
            # Kit bevel highlights need one chamfer, not viewmodel rounding.
            # This only affects architecture; pistol and husk retain 3 segments.
            if root.name=='architecture' and mod.type=='BEVEL':
                mod.segments=1
            bpy.ops.object.modifier_apply(modifier=mod.name)
    batches={}
    for ob in objs:
        if ob.get('preserveNode'): continue
        key=(ob.parent.name if ob.parent else '',ob.data.materials[0].name)
        batches.setdefault(key,[]).append(ob)
    for (parent, mat), parts in batches.items():
        if len(parts) < 2: continue
        bpy.ops.object.select_all(action='DESELECT')
        for ob in parts: ob.select_set(True)
        bpy.context.view_layer.objects.active=parts[0]
        bpy.ops.object.join()
        bpy.context.object.name=parent+'__'+mat.split('|')[-1].strip().replace(' ','_')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH': ob.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.012)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')


def look_at(ob, target):
    ob.rotation_euler=(gv(target)-ob.location).to_track_quat('-Z','Y').to_euler()


def preview(kind):
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.device='CPU'
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1200
    scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    scene.world.color=(.15,.15,.15)
    scene.view_settings.view_transform='AgX'
    if kind=='pistol':
        cam=(.77,.48,.74); target=(0,-.04,-.04); ortho=1.04
        floor_y=-.34
    elif kind=='husk':
        cam=(3.4,2.55,5.6); target=(0,.99,.10); ortho=2.8
        floor_y=-.012
    else:
        # Asset-sheet staging is preview-only and never exported.
        for node,x in [('service_panel',-1.6),('wall_rib',-.65),('pipe_run',0),('wall_fixture',0),('floor_grille',1.4)]:
            ob=bpy.data.objects[node]; ob.location.x=x
            if node in ['wall_fixture','pipe_run']: ob.location.z=3 if node=='wall_fixture' else 2.3
        cam=(4.8,3.2,6.4); target=(0,1.85,0); ortho=5.7
        floor_y=-.035
    bpy.ops.object.camera_add(location=gv(cam))
    camera=bpy.context.object
    camera.name='PREVIEW camera'
    look_at(camera,target)
    camera.data.type='ORTHO'; camera.data.ortho_scale=ortho
    scene.camera=camera
    scale=.5 if kind=='pistol' else 2.0
    for name,power,color,pos,size in [
        ('Key',650,(.78,.89,1.0),(3,4,3),4),
        ('Rim',850,(.28,.67,.69),(-3,3,-3),3),
        ('Warm fill',300,(1,.73,.49),(-3,2,2),3)]:
        bpy.ops.object.light_add(type='AREA',location=gv(tuple(a*scale for a in pos)))
        ob=bpy.context.object; ob.name='PREVIEW '+name
        ob.data.energy=power*scale*scale
        ob.data.color=color; ob.data.shape='DISK'; ob.data.size=size*scale
        look_at(ob,target)
    groundmat=material('PREVIEW slate backdrop',(.028,.040,.047),.05,.77)
    box('PREVIEW floor',(0,floor_y-.05,0),(200,.1,200),groundmat,bevel=0)
    scene.render.filepath=str(SOURCE/(kind+'-preview.png'))
    bpy.ops.render.render(write_still=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--asset',choices=['pistol','husk','architecture','all'],default='all')
    parser.add_argument('--preview',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    SOURCE.mkdir(parents=True,exist_ok=True); DEST.mkdir(parents=True,exist_ok=True)
    summaries=[]
    for kind in ['pistol','husk','architecture'] if args.asset=='all' else [args.asset]:
        root=globals()[kind]()
        optimize(root)
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(kind+'.blend')),compress=True)
        bpy.ops.export_scene.gltf(filepath=str(DEST/(kind+'.glb')),export_format='GLB',
            export_yup=True,export_animations=False,export_cameras=False,export_lights=False,
            export_extras=True,export_apply=True)
        total=sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
        summaries.append({'asset':kind,'faces':total,'meshes':sum(o.type=='MESH' for o in bpy.context.scene.objects),
            'glbBytes':(DEST/(kind+'.glb')).stat().st_size})
        if args.preview: preview(kind)
    manifest_path=SOURCE/'model-manifest.json'
    # A focused re-export must not erase unrelated asset metadata.
    existing=json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    merged={entry['asset']:entry for entry in existing}
    merged.update({entry['asset']:entry for entry in summaries})
    manifest_path.write_text(json.dumps(list(merged.values()),indent=2)+'\n')
    print('MODERN_ASSET_SUMMARY '+json.dumps(summaries))


if __name__=='__main__': main()
