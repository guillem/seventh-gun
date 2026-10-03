"""Offline original biomechanical enemy roster: six skinned meshes, five clips each.

Author in Blender with --background --factory-startup --threads 4 --python ...
The game loads the saved GLBs. Geometry, skeletons and animation curves are never
constructed at runtime; the simulation remains authoritative for root movement.
"""
from __future__ import annotations
import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/modern/roster/enemies'
DEST = ROOT / 'public/modern/roster/enemies'
REVIEW = ROOT / 'art/modern/refinement/enemies'
spec = importlib.util.spec_from_file_location('authoring', Path(__file__).with_name('build_assets.py'))
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)
gv = a.gv
TYPES = ['husk', 'crawler', 'slab', 'wisp', 'hierophant', 'fiend']
COLORS = {'husk': (0.36, 1, .07), 'crawler': (1, .025, .035), 'slab': (1, .31, .045),
          'wisp': (.03, .72, 1), 'hierophant': (.66, .11, 1), 'fiend': (1, .2, .025)}
MUZZLES = {'husk': (.09, 1.668, .53), 'crawler': (0, .38, .64), 'slab': (.68, .752, .5),
           'wisp': (0, -.1, .34), 'hierophant': (0, 2.07, .24), 'fiend': (0, 2.216, .90)}
PARTS = []
BONES = {}
M = {}
CUTS = []


def part(ob, bone='chest'):
    ob['bone'] = bone
    PARTS.append(ob)
    return ob


def ell(name, p, s, mat='skin', bone='chest', seg=20, rings=10):
    return part(a.ellipsoid(name, p, s, M[mat], segments=seg, rings=rings), bone)


def box(name, p, s, mat='armour', bone='chest', bevel=.008):
    ob = a.box(name, p, s, M[mat], bevel=bevel)
    for mod in ob.modifiers:
        if mod.type == 'BEVEL': mod.segments = 2
    return part(ob, bone)


def pipe(name, pts, radii, mat='skin', bone='chest', sides=10):
    """Authored section tube: bevelled anatomy, tendons, horns and claws."""
    # Subdivide the authored path with a smooth Catmull-Rom curve. Keep the
    # endpoints exact so muzzles and claws stay attached to their rig.
    if len(pts)>2:
        original=[Vector(p) for p in pts]; rr=list(radii); pp=[]; radii=[]
        for i in range(len(original)-1):
            p0=original[max(0,i-1)]; p1=original[i]; p2=original[i+1]; p3=original[min(len(original)-1,i+2)]
            for j in range(3):
                t=j/3; p=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
                pp.append(tuple(p)); radii.append(rr[i]*(1-t)+rr[i+1]*t)
        pp.append(tuple(original[-1])); radii.append(rr[-1]); pts=pp
    verts=[]
    for i, p in enumerate(pts):
        p=Vector(p)
        tangent=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(i-1,0)])
        tangent.normalize()
        ref=Vector((0,1,0)) if abs(tangent.y)<.9 else Vector((1,0,0))
        u=tangent.cross(ref).normalized(); v=tangent.cross(u).normalized()
        for j in range(sides):
            t=math.tau*j/sides
            verts.append(tuple(p + radii[i]*(math.cos(t)*u+math.sin(t)*v)))
    faces=[tuple(range(sides-1,-1,-1))]
    for i in range(len(pts)-1):
        for j in range(sides): faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.append(tuple(range((len(pts)-1)*sides,len(pts)*sides)))
    return part(a.mesh(name,verts,faces,M[mat],smooth=True),bone)


def shell(name, sections, mat='skin', bone='spine', seg=32, ripple=0):
    return part(a.shell(name, sections, M[mat], segments=seg, ripple=ripple),bone)


def ring(name, center, radius, thick, mat='armour', bone='chest', axis='z', seg=24):
    pts=[]
    for j in range(seg+1):
        t=j*math.tau/seg
        if axis=='z': p=(center[0]+radius*math.cos(t),center[1]+radius*math.sin(t),center[2])
        elif axis=='x': p=(center[0],center[1]+radius*math.cos(t),center[2]+radius*math.sin(t))
        else: p=(center[0]+radius*math.cos(t),center[1],center[2]+radius*math.sin(t))
        pts.append(p)
    return pipe(name,pts,[thick]*len(pts),mat,bone,sides=6)


def bone(name, start, end, parent='root'):
    BONES[name]=(start,end,parent)


def start(kind):
    global PARTS,BONES,M,CUTS
    a.reset(); PARTS=[]; BONES={}; CUTS=[]
    M={
      'skin': a.material('enemy.skin', (.49,.57,.51) if kind=='husk' else (.58,.40,.32) if kind=='fiend' else (.34,.38,.31) if kind=='hierophant' else (.57,.60,.49) if kind in ('crawler','slab') else (.73,.77,.68),0,.75),
      'raw': a.material('enemy.raw',(.58,.31,.25),0,.52),
      'armour': a.material('enemy.armour', (.46,.45,.38) if kind in ('husk','slab') else (.40,.30,.21) if kind=='crawler' else (.42,.43,.37),.10,.59),
      'dark': a.material('enemy.dark',(.014,.021,.021),.05,.64),
      'bone': a.material('enemy.bone',(.68,.64,.52),.12,.72),
      'eye': a.material('eye.'+kind,COLORS[kind],0,.25,3)
    }
    bone('root',(0,0,0),(0,.2,0),None)


def human_skeleton(pelvis=1, chest=1.55, head=(0,1.8,.3), width=.27, arm_end=.58, leg_width=.13):
    bone('pelvis',(0,pelvis,0),(0,pelvis+.15,0))
    bone('spine',(0,pelvis,0),(0,chest-.15,0),'pelvis')
    bone('chest',(0,chest-.15,0),(0,chest+.12,0),'spine')
    bone('head',head,(head[0],head[1]+.12,head[2]),'chest')
    bone('jaw',(head[0],head[1]-.06,head[2]),(head[0],head[1]-.18,head[2]+.07),'head')
    for side, s in [('l',-1),('r',1)]:
        hip=(s*leg_width,pelvis,0); knee=(s*leg_width,pelvis*.5,.04); ankle=(s*leg_width,.12,-.04)
        bone('thigh_'+side,hip,knee,'pelvis'); bone('shin_'+side,knee,ankle,'thigh_'+side)
        bone('foot_'+side,ankle,(s*leg_width,.08,.18),'shin_'+side)
        shoulder=(s*width,chest,0); elbow=(s*(width+.065),(chest+arm_end)/2,0); hand=(s*(width+.035),arm_end,.08)
        bone('arm_'+side,shoulder,elbow,'chest'); bone('fore_'+side,elbow,hand,'arm_'+side)
        bone('hand_'+side,hand,(hand[0],hand[1]-.12,hand[2]+.04),'fore_'+side)


def sculpt_join(objects, label, material, bind, voxel=.004, budget=2400, cutters=()):
    """Fuse authored masses, subtract real cavities, then retain sculpt topology."""
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
        if ob in PARTS: PARTS.remove(ob)
    bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join()
    ob=bpy.context.object; ob.name=label
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    remesh=ob.modifiers.new('Continuous sculpt volume','REMESH'); remesh.mode='VOXEL'
    remesh.voxel_size=voxel; remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    for cutter in cutters:
        boolean=ob.modifiers.new('Carved anatomical cavity','BOOLEAN'); boolean.operation='DIFFERENCE'; boolean.solver='EXACT'; boolean.object=cutter
        bpy.ops.object.modifier_apply(modifier=boolean.name)
        bpy.data.objects.remove(cutter,do_unlink=True)
    relax=ob.modifiers.new('Sculpt relaxation','SMOOTH'); relax.factor=.45; relax.iterations=2
    bpy.ops.object.modifier_apply(modifier=relax.name)
    triangles=sum(len(p.vertices)-2 for p in ob.data.polygons)
    if triangles>budget:
        dec=ob.modifiers.new('Retained sculpt topology','DECIMATE'); dec.ratio=budget/triangles
        bpy.ops.object.modifier_apply(modifier=dec.name)
    for p in ob.data.polygons: p.use_smooth=True
    ob.data.materials.clear(); ob.data.materials.append(M[material]); ob['bone']=bind
    PARTS.append(ob)
    return ob


def cutter(name, pos, size):
    return a.ellipsoid(name,pos,size,M['dark'],segments=28,rings=16)


def plate(name,p,size,material='armour',bind='chest',lean=0):
    x,y,z=p; w,h,d=size
    return shell(name,[(x+w*.05,y-h*.52,z-d*.12,w*.04,d*.04),
        (x-w*.03,y-h*.33,z,w*.40,d*.55),(x,y-h*.02,z+d*.08,w*.52,d*.66),
        (x+w*.03,y+h*.28,z,w*.43,d*.48),(x+w*lean,y+h*.51,z-d*.16,w*.10,d*.07)],material,bind,seg=24,ripple=.028)


def scar_strip(name,pts,width,bind='chest'):
    pipe(name,pts,[width*.65]+[width]*(len(pts)-2)+[width*.4],'raw',bind,8)
    # An irregular lifted edge makes the material transition part of the mesh.
    edge=[(x-width*.6,y,z+.003) for x,y,z in pts]
    pipe(name+' dermal edge',edge,[width*.24]*len(edge),'skin',bind,6)


def face(center, scale=1, kind='husk'):
    """Continuous eroded skull with recessed sockets and a real open dental arch."""
    x,y,z=center
    def p(xx,yy,zz): return (x+xx*scale*.90,y+yy*scale*.88,z+zz*scale)
    def sz(xx,yy,zz): return (xx*scale*.90,yy*scale*.88,zz*scale)
    skull=[]
    skull.append(ell('cranial vault',p(0,.035,-.027),sz(.097,.128,.105),'bone','head',28,16))
    skull.append(ell('occipital ridge',p(-.011,.036,-.081),sz(.079,.097,.073),'bone','head',24,12))
    skull.append(ell('maxilla',p(0,-.061,.058),sz(.060,.032,.054),'bone','head',24,12))
    for side in [-1,1]:
        skull.append(ell('zygomatic arch',p(side*.077,-.023,.019),sz(.029,.051,.051),'bone','head',24,12))
        skull.append(pipe('supraorbital ledge',[p(side*.015,.050,.065),p(side*.063,.046+.009*side,.079),p(side*.104,.022+.008*side,.024)],[.023*scale,.027*scale,.014*scale],'bone','head',10))
    skull.append(pipe('nasal bridge',[p(0,.069,.062),p(.003,.014,.101),p(0,-.023,.100)],[.020*scale,.019*scale,.010*scale],'bone','head',10))
    cuts=[]
    for side in [-1,1]:
        socket=cutter('socket void',p(side*.054,.007+.007*side,.087),sz(.037,.026,.068))
        socket.rotation_euler.y=side*.20
        cuts.append(socket)
    for side in [-1,1]: cuts.append(cutter('hollow subzygomatic recess',p(side*.093,-.072,.054),sz(.034,.041,.044)))
    cuts.append(cutter('nasal aperture',p(0,-.033,.113),sz(.016,.027,.035)))
    cuts.append(cutter('open palate',p(0,-.104,.083),sz(.055,.030,.080)))
    # Asymmetric erosion breaks the manufactured mask-like symmetry.
    cuts.append(cutter('eroded temple',p(.111,.066,.025),sz(.032,.047,.045)))
    sculpt_join(skull,'sculpted_cranium','bone','head',.0038*scale,3000,cuts)
    for side in [-1,1]:
        ell('recessed orbital tissue',p(side*.054,.007+.007*side,.041),sz(.030,.022,.030),'raw','head',20,10)
        ell('deep orbital shadow',p(side*.054,.007+.007*side,.052),sz(.026,.019,.011),'dark','head',20,10)
        # Restrained pinpricks sit inside the socket rather than on its surface.
        ell('optic',p(side*.052,.004+.007*side,.069),sz(.007,.005,.005),'eye','head',16,8)
        pipe('masseter muscle',[p(side*.088,-.022,.004),p(side*.074,-.095,.025),p(side*.046,-.130,.054)],[.020*scale,.018*scale,.010*scale],'raw','jaw',10)
    jawparts=[]
    for side in [-1,1]:
        jawparts.append(pipe('mandibular ramus',[p(side*.082,-.042,-.002),p(side*.075,-.110,.025),p(side*.047,-.120,.077),p(0,-.121,.085)],[.017*scale,.020*scale,.019*scale,.015*scale],'bone','jaw',10))
    sculpt_join(jawparts,'sculpted_mandible','bone','jaw',.0037*scale,1100)
    ell('oral cavity',p(0,-.097,.035),sz(.047,.023,.052),'dark','head',20,12)
    pipe('lingual muscle',[p(-.02,-.108,.044),p(.01,-.106,.074),p(.025,-.102,.077)],[.015*scale,.014*scale,.005*scale],'raw','jaw',10)
    for j in range(7):
        xx=(j-3)*.014; arch=.109-.015*(abs(j-3)/3)**1.5
        length=(.019 if j in [0,5] else .010)*(1+.30*math.sin(j*2.4))
        pipe('upper dental tooth',[p(xx,-.073,arch),p(xx,-.081,arch+.004),p(xx*.94,-.073-length,arch+.002)], [.0065*scale,.005*scale,.0014*scale],'bone','head',8)
    for j in range(5):
        xx=(j-2)*.016; zz=.10-.012*(abs(j-2)/2)**2
        pipe('lower dental tooth',[p(xx,-.114,zz),p(xx,-.105-(j%2)*.003,zz+.005)],[.0055*scale,.001],'bone','jaw',8)
    # Thin torn scalp and neck muscle retain soft/hard separation.
    ell('scalp remnant',p(-.022,.082,-.056),sz(.079,.065,.071),'skin','head',28,16)
    ell('forehead dermal shield',p(-.027,.070,.009),sz(.080,.097,.096),'skin','head',32,20)
    scar_strip('deep scalp laceration',[p(.021,.125,.076),p(.017,.086,.110),p(.010,.047,.105)],.008*scale,'head')
    ell('scarred left temple',p(-.063,.040,.027),sz(.042,.083,.055),'skin','head',28,16)
    ell('right maxillary flesh',p(.069,-.042,.035),sz(.031,.050,.041),'skin','head',24,14)
    pipe('torn facial tissue',[p(-.085,.027,.071),p(-.075,-.020,.077),p(-.058,-.060,.099)],[.011*scale,.016*scale,.010*scale],'skin','head',10)
    for side in [-1,1]: CUTS.append(cutter('orbital tissue recess',p(side*.054,.007+.007*side,.083),sz(.034,.025,.058)))
    scar_strip('cranial tear',[p(-.085,.070,-.018),p(-.079,.027,.009),p(-.070,-.015,.015)],.009*scale,'head')


def hands(side,s,pos,scale=1):
    x,y,z=pos; bind='hand_'+side
    ell('palm metacarpals',(x,y-.008*scale,z),(.050*scale,.079*scale,.034*scale),'skin',bind,20,12)
    for j in range(4):
        spread=(j-1.5)*.025*scale; length=(.12 if j in [1,2] else .092)*scale
        xx=x+spread
        points=[(xx,y-.035*scale,z+.008),(xx+spread*.22,y-.082*scale,z+.026*scale),
                (xx+spread*.32,y-.055*scale-length,z+.040*scale),(xx+spread*.26,y-.067*scale-length,z+.068*scale)]
        pipe('jointed phalanges',points,[.014*scale,.013*scale,.010*scale,.006*scale],'skin',bind,10)
        for i in [1,2]: ell('finger knuckle',points[i],(.015*scale,.014*scale,.013*scale),'skin',bind,12,8)
        end=points[-1]
        pipe('curved nail',[(end[0],end[1]+.012*scale,end[2]-.004*scale),end,(end[0]-spread*.10,end[1]-.036*scale,end[2]+.03*scale)],[.009*scale,.007*scale,.001],'bone',bind,8)
        pipe('extensor tendon',[(xx,y+.045*scale,z-.027*scale),(xx,y-.025*scale,z-.033*scale),points[1]],[.0035*scale,.005*scale,.003*scale],'raw',bind,6)
    pipe('opposed thumb',[(x-s*.038*scale,y+.02*scale,z),(x-s*.072*scale,y-.026*scale,z+.032*scale),(x-s*.058*scale,y-.071*scale,z+.054*scale)],[.019*scale,.014*scale,.009*scale],'skin',bind,10)


def husk_face(center):
    """Collapsed living face: dermis carries the silhouette, bone is exposed locally."""
    x,y,z=center
    def p(xx,yy,zz): return (x+xx,y+yy,z+zz)
    masses=[shell('collapsed facial dermis',[
        (*p(.006,-.138,.014),.032,.024),(*p(.002,-.112,.014),.052,.031),
        (*p(-.004,-.068,.001),.066,.042),(*p(-.001,-.018,-.006),.074,.048),
        (*p(.006,.047,-.028),.077,.059),(*p(.004,.092,-.033),.066,.049),
        (*p(.002,.117,-.035),.047,.036),(*p(.002,.129,-.035),.024,.018),
        (*p(.002,.133,-.035),.007,.006)],'skin','head',seg=40,ripple=.021)]
    for side in [-1,1]:
        masses.append(pipe('sloping supraorbital dermis',[p(side*.007,.039,.017),
            p(side*.031,.033+side*.003,.041),p(side*.067,.036,.004)],
            [.008,.013,.012],'skin','head',12))
        masses.append(pipe('taut buccal tendon',[p(side*.062,-.026,.026),
            p(side*.052,-.063,.018),p(side*.039,-.104,.034)],
            [.011,.007,.006],'skin','head',10))
    # Nose is a narrow ridge; no projecting maxillary cushion or paired cheek balls.
    masses.append(pipe('collapsed nasal bridge',[p(-.003,.029,.031),p(-.004,-.014,.064),
        p(-.009,-.038,.061)],[.009,.011,.007],'skin','head',12))
    cuts=[cutter('left sunken orbit',p(-.034,.009,.054),(.027,.020,.034)),
        cutter('right irregular orbit',p(.038,.003,.051),(.031,.021,.038)),
        cutter('collapsed right cheek',p(.056,-.044,.033),(.032,.044,.033)),
        cutter('left submalar hollow',p(-.058,-.054,.047),(.021,.027,.020)),
        cutter('left nostril',p(-.010,-.034,.062),(.005,.009,.009)),
        cutter('right nostril',p(.002,-.034,.059),(.005,.006,.010))]
    # The maw is an uneven slit cut through tissue; the lower face stays attached.
    for xx,yy in [(-.027,-.083),(-.003,-.080),(.022,-.088)]:
        cuts.append(cutter('torn lip opening',p(xx,yy,.045),(.023,.010,.021)))
    head=sculpt_join(masses,'husk collapsed flesh face','skin','head',.0024,4500,cuts)
    head['preserve_sculpt']=True
    for side in [-1,1]:
        yy=.009 if side<0 else .003
        ell('deep socket flesh',p(side*.035,yy,.027),(.024,.018,.015),'raw','head',20,12)
        ell('orbital recess',p(side*.035,yy,.036),(.020,.014,.009),'dark','head',20,12)
        ell('sunken optic',p(side*.035,yy-.001,.047),(.0045,.0035,.003),'eye','head',16,8)
    ell('ragged maw depth',p(-.006,-.086,.029),(.043,.012,.012),'dark','head',24,12)
    # One damaged side exposes thin, irregular bone beneath missing cheek tissue.
    pipe('exposed zygomatic edge',[p(.061,-.007,.009),p(.061,-.025,.029),p(.049,-.052,.028)],
        [.010,.009,.004],'bone','head',10)
    pipe('exposed mandibular splinter',[p(.052,-.074,.016),p(.039,-.107,.025),p(.021,-.119,.030)],
        [.008,.007,.003],'bone','jaw',10)
    ell('cheek wound depth',p(.055,-.049,.002),(.025,.034,.015),'raw','head',24,12)
    for j in [0,1,3,4]:
        xx=-.031+j*.013; yy=-.079-(.004 if j>2 else 0)
        pipe('broken exposed dentine',[p(xx,yy,.044),p(xx+.001,yy-.007-(j%2)*.003,.047)],
            [.0038,.002],'bone','head',8)
    scar_strip('split collapsed cheek',[p(.067,-.017,.014),p(.071,-.039,.008),p(.058,-.076,.019)],.004,'head')
    scar_strip('old oblique scalp tear',[p(-.043,.105,-.011),p(-.026,.078,.014),p(-.019,.046,.028)],.0035,'head')


def husk():
    start('husk'); human_skeleton(.93,1.57,(.06,1.755,.320),.255,.56)
    bone('arm_l',(-.255,1.57,0),(-.32,1.22,.05),'chest')
    bone('fore_l',(-.32,1.22,.05),(-.20,1.29,.28),'arm_l')
    bone('hand_l',(-.20,1.29,.28),(-.20,1.17,.32),'fore_l')
    # Pelvis, spine and thorax form one irregular, forward-slumped volume.
    shell('emaciated trunk',[(.01,.83,-.006,.092,.064),(.005,.93,-.005,.145,.101),
        (.021,1.04,.003,.123,.098),(.018,1.17,.024,.091,.077),(-.009,1.29,.05,.150,.120),
        (-.027,1.42,.065,.198,.138),(-.031,1.53,.073,.214,.143),(-.031,1.63,.084,.158,.109),
        (-.014,1.70,.125,.062,.062)],ripple=.025,seg=40)
    for side,sign in [('l',-1),('r',1)]:
        ell('iliac crest',(sign*.105,.938,-.022),(.070,.09,.091),'skin','pelvis',24,14)
        ell('scapula',(sign*.13,1.527,-.075),(.095,.144,.052),'skin','chest',24,14)
        pipe('clavicle',[(0,1.64,.169),(sign*.11,1.638,.148),(sign*.22,1.613,.039)],[.015,.022,.017],'skin','chest',12)
        # Ribs wrap the thorax; only the torn right side exposes dry bone.
        for k in range(7):
            y=1.285+k*.044; width=.139+.037*math.sin(k*.44)
            zz=.188+.027*math.sin(k*.33)
            material='bone' if sign>0 and k in [2,4] else 'skin'
            pipe('thoracic rib',[(sign*(.032+.009*(k%3)),y-.028,zz-.003),(sign*width*.62,y+.008,zz+.008),
                (sign*width,y+.030,.140),(sign*(width+.008),y+.021,.055)],
                [.005 if material=='bone' else .011,.015,.014,.010],material,'chest',10)
        ell('oblique muscle',(sign*.077,1.168,.064),(.044,.125,.029),'skin','spine',24,14)
    # Exposed flank is a recessed anatomical surface, not pasted red spheres.
    shell('torn right thoracic muscle',[(.118,1.295,.149,.035,.018),(.125,1.355,.158,.065,.028),
        (.133,1.44,.169,.062,.03),(.118,1.505,.169,.043,.025)],'raw','chest',seg=20)
    CUTS.append(cutter('torn ribcage skin',(.142,1.412,.215),(.10,.154,.058)))
    for k in range(4):
        scar_strip('ragged flank seam',[(.055+k*.035,1.286,.173),(.08+k*.029,1.32,.184),(.09+k*.026,1.355,.194)],.006,'chest')
    # Continuous spinal tendons replace the previous row of detached beads.
    for sign in [-1,1]:
        pipe('erector spinae',[(sign*.030,1.02,-.091),(sign*.045,1.22,-.09),
            (sign*.036,1.47,-.095),(sign*.047,1.67,-.03)],[.018,.022,.025,.013],'skin','spine',12)
    pipe('cervical muscle',[(-.015,1.63,.097),(.015,1.698,.170),(.036,1.737,.236),(.060,1.754,.282)],
        [.084,.081,.070,.053],'skin','head',20)
    for sign in [-1,1]:
        pipe('neck tendon',[(sign*.075,1.589,.147),(.03+sign*.045,1.686,.221),(.06+sign*.057,1.724,.299)],[.008,.010,.006],'raw','head',10)
    husk_face((.06,1.755,.320))
    for side,sign in [('l',-1),('r',1)]:
        shoulder=(sign*.255,1.57,0); elbow=(-.32,1.22,.05) if sign<0 else (.32,1.065,0)
        hand=(-.20,1.29,.28) if sign<0 else (.29,.56,.08)
        # Shape upper arms with asymmetric deltoid/biceps bellies that fuse
        # across their joints, rather than cylinders ending in white balls.
        mid=tuple((shoulder[k]+elbow[k])*.5 for k in range(3))
        pipe('humeral core',[shoulder,mid,elbow],[.070,.051,.044],'skin','arm_'+side,16)
        shell('continuous scapular deltoid',[(sign*.272,1.442,.006,.032,.034),
            (sign*.259,1.513,-.006,.058,.060),(sign*.241,1.560,.007,.079,.079),
            (sign*.218,1.590,.020,.093,.086),(sign*.174,1.620,.045,.112,.085),
            (sign*.115,1.656,.080,.096,.068),(sign*.063,1.687,.103,.034,.036)],'skin','arm_'+side,seg=32)
        ell('biceps belly',(mid[0]-.016*sign,mid[1]+.025,mid[2]+.023),(.056,.132 if sign>0 else .074,.058),'skin','arm_'+side,24,14)
        ell('olecranon',elbow,(.048,.053,.048),'skin','fore_'+side,20,12)
        midfore=tuple((elbow[k]+hand[k])*.5 for k in range(3))
        pipe('forearm muscle',[elbow,midfore,hand],[.043,.041,.025],'skin','fore_'+side,16)
        if sign>0:
            ell('forearm flexor',(.318,.884,.027),(.048,.130,.046),'skin','fore_'+side,24,14)
            pipe('exposed ulnar tendon',[(.345,1.02,.006),(.338,.81,.041),(.299,.582,.091)],[.009,.012,.006],'raw','fore_'+side,10)
            scar_strip('forearm tear',[(.345,.96,.038),(.355,.879,.054),(.326,.785,.07)],.012,'fore_'+side)
        hands(side,sign,hand)
        pipe('femoral core',[(sign*.13,.93,0),(sign*.145,.75,.015),(sign*.13,.465,.04)],[.074,.073,.039],'skin','thigh_'+side,16)
        ell('quadriceps',(sign*.135,.739,.046),(.073,.162,.071),'skin','thigh_'+side,24,14)
        ell('knee articulation',(sign*.13,.471,.030),(.044,.046,.042),'skin','shin_'+side,20,12)
        pipe('tibial crest',[(sign*.13,.465,.04),(sign*.137,.32,-.025),(sign*.13,.18,-.037),(sign*.13,.085,-.025)],
            [.038,.035,.036,.039],'skin','shin_'+side,16)
        ell('calf muscle',(sign*.136,.337,-.035),(.048,.110,.05),'skin','shin_'+side,24,14)
        pipe('achilles tendon',[(sign*.133,.275,-.069),(sign*.13,.155,-.071),(sign*.13,.078,-.019)],[.012,.014,.014],'raw','shin_'+side,10)
        ell('ankle',(sign*.13,.115,-.027),(.044,.066,.049),'skin','foot_'+side,20,12)
        ell('heel and instep',(sign*.13,.047,.037),(.049,.037,.090),'skin','foot_'+side,24,14)
        for toe in range(4):
            xx=sign*.13+(toe-1.5)*.024
            pipe('bare toes',[(xx,.044,.102),(xx,.031,.157),(xx,.022,.196-.011*abs(toe-1))],[.012,.011,.006],'skin','foot_'+side,10)
            tip=.196-.011*abs(toe-1)
            pipe('toenail claw',[(xx,.024,tip-.006),(xx,.016,tip+.017),(xx,.014,tip+.040)],[.006,.004,.0008],'bone','foot_'+side,8)
    plate('scarred left clavicle graft',(-.20,1.66,-.021),(.22,.13,.13),'armour','chest',-.12)
    scar_strip('abdominal incision',[(.023,1.014,.107),(.034,1.084,.108),(.022,1.165,.105),(.014,1.236,.151)],.007,'spine')
    for yy in [1.38,1.445]: ell('sternal optic',(.009,yy,.201),(.008,.021,.008),'eye','chest',12,8)


def crawler():
    start('crawler')
    bone('pelvis',(0,.52,-.23),(0,.66,-.24)); bone('spine',(0,.52,-.23),(0,.54,.08),'pelvis')
    bone('chest',(0,.54,.06),(0,.58,.28),'spine'); bone('head',(0,.50,.43),(0,.56,.53),'chest')
    bone('jaw',(0,.40,.52),(0,.34,.63),'head')
    # Flattened asymmetrical arthropod abdomen with segmented overlapping shell.
    shell('abdominal body',[(0,.275,-.20,.18,.28),(.013,.42,-.21,.29,.39),
        (.019,.59,-.26,.31,.37),(.01,.74,-.28,.263,.30),(0,.82,-.32,.15,.20)],'skin','pelvis',seg=36,ripple=.045)
    for j in range(6):
        z=-.56+j*.122; y=.646+.13*math.sin((j+.45)*.54); width=.46+.13*math.sin((j+.5)*.55)
        # Individual segment is a continuous curved crest, with pointed rims.
        shell('dorsal shell segment',[(0,y-.047,z,width*.44,.075),(0,y+.045,z,width*.51,.092),
            (-.006,y+.092,z-.011,width*.32,.074),(0,y+.113,z-.016,width*.08,.028)],'armour','pelvis',seg=28,ripple=.052)
        for sign in [-1,1]:
            pipe('serrated abdominal rim',[(sign*width*.43,y-.015,z+.021),
                (sign*(width*.51),y+.014,z-.014),(sign*(width*.56),y+.043,z-.052)], [.026,.019,.001],'armour','pelvis',10)
        pipe('intersegment tendon',[(-width*.40,y-.04,z+.061),(0,y-.019,z+.084),(width*.40,y-.04,z+.061)],[.012,.016,.012],'raw','pelvis',10)
    ell('thoracic muscle',(0,.50,.14),(.241,.198,.27),'skin','chest',28,16)
    # Thick cephalothorax plated around a tapered recessed head.
    for sign in [-1,1]:
        plate('cephalic shield',(sign*.143,.555,.215),(.235,.305,.22),'armour','chest',-.05*sign)
        pipe('raised head ridge',[(sign*.04,.60,.50),(sign*.08,.666,.362),(sign*.168,.663,.23)],[.025,.027,.019],'armour','head',12)
    headparts=[ell('head capsule',(0,.465,.483),(.167,.124,.156),'armour','head',28,16),
        ell('clypeus',(0,.53,.525),(.13,.087,.125),'armour','head',24,14)]
    mouthcut=cutter('crawler recessed mouth',(0,.384,.630),(.079,.063,.075))
    sculpt_join(headparts,'sculpted_crawler_head','armour','head',.0045,2200,[mouthcut])
    ell('salivary cavity',(0,.379,.585),(.070,.054,.030),'dark','head',20,12)
    scar_strip('oral muscle',[(-.069,.395,.612),(0,.348,.626),(.069,.395,.612)],.012,'jaw')
    for sign in [-1,1]:
        for k in range(3):
            px=sign*(.053+.028*k); py=.515+k*.034; pz=.622-.023*k
            ell('recessed ocular ridge',(px,py,pz-.008),(.027,.022,.025),'dark','head',16,10)
            ell('crawler lens',(px,py,pz+.009),(.0125,.011,.009),'eye','head',16,8)
        # Broad chelicerae taper to recurved piercing tips instead of L sticks.
        pipe('chelicera',[(sign*.139,.464,.579),(sign*.165,.390,.655),(sign*.135,.313,.714),
            (sign*.085,.310,.741),(sign*.035,.359,.72)],[.039,.036,.024,.013,.001],'bone','jaw',14)
        for tooth in range(3):
            yy=.393-tooth*.022
            pipe('mandible serration',[(sign*.149,yy,.67),(sign*(.123-.008*tooth),yy-.009,.704)],[.011,.001],'bone','jaw',8)
        pipe('palp',[(sign*.075,.414,.618),(sign*.098,.368,.721),(sign*.065,.393,.783)],[.018,.016,.004],'raw','jaw',10)
    for side,sign in [('l',-1),('r',1)]:
        for j in range(3):
            hip=(sign*.22,.52,.22-j*.22); knee=(sign*(.61+.055*(j==1)),.60,.42-j*.36); foot=(sign*(.91+.03*(j==1)),.045,.54-j*.50)
            upper=f'leg_{side}{j}'; lower=f'foot_{side}{j}'
            bone(upper,hip,knee,'chest'); bone(lower,knee,foot,upper)
            ell('fused coxa',hip,(.094,.077,.093),'skin',upper,24,14)
            mid=(sign*.43,.57,(hip[2]+knee[2])/2)
            pipe('sculpted femur',[hip,(sign*.32,.55,hip[2]+.035),mid,knee],[.051,.068,.047,.030],'armour',upper,14)
            ell('knee membrane',knee,(.047,.044,.043),'raw',lower,20,12)
            pipe('tibial carapace',[knee,(sign*.745,.428,(knee[2]+foot[2])*.48),
                (sign*.844,.238,(knee[2]+foot[2])*.52),foot],[.036,.039,.024,.006],'armour',lower,14)
            pipe('tarsal claw',[foot,(foot[0]+sign*.028,.029,foot[2]+.020),(foot[0]+sign*.043,.035,foot[2]+.055)],[.009,.009,.001],'bone',lower,8)
            pipe('leg tendon',[(hip[0],hip[1]-.036,hip[2]),(sign*.43,.533,knee[2]),(knee[0],knee[1]-.04,knee[2])],[.013,.014,.008],'raw',upper,8)
            # Articulated spines follow the hard leg segments and remain thin.
            for k in range(3):
                t=(k+1)/5; point=tuple(knee[n]*(1-t)+foot[n]*t for n in range(3))
                pipe('tibial spine',[point,(point[0]+sign*.048,point[1]+.008,point[2]-.036)],[.009,.001],'armour',lower,8)
    for sign in [-1,1]: pipe('swept antenna',[(sign*.11,.609,.45),(sign*.194,.745,.547),(sign*.273,.809,.708),(sign*.296,.780,.836)],[.019,.014,.006,.001],'armour','head',10)


def slab():
    start('slab'); human_skeleton(1.04,1.92,(0,2.04,.30),.60,.75,.31)
    shell('siege torso',[(0,.92,0,.33,.27),(0,1.14,-.01,.43,.33),(0,1.42,-.06,.55,.39),(0,1.75,-.05,.62,.42),(0,2.01,-.09,.58,.39),(0,2.24,-.12,.42,.32),(0,2.44,-.13,.16,.13)],seg=40,ripple=.033)
    for j in range(5):
        yy=1.3+j*.205
        plate('overlapping dorsal armour',(0,yy,-.355),(.92-j*.026,.29,.21),'armour','chest',.05)
    for s in [-1,1]:
        for j in range(3):
            plate('thoracic exoskeleton',(s*(.235+.015*j),1.59+j*.20,.300),(.54-j*.045,.30,.18),'armour','chest',s*.1)
    visor=[ell('armoured cranial mass',(0,2.055,.325),(.246,.186,.158),'armour','head',32,20),
        ell('heavy frontal crest',(0,2.18,.346),(.239,.093,.160),'armour','head',28,16)]
    slit=cutter('carved siege eye slit',(0,2.065,.475),(.121,.044,.100))
    sculpt_join(visor,'scarred siege skull','armour','head',.005,2400,[slit])
    ell('single eye cavity',(0,2.06,.416),(.102,.035,.042),'dark','head',24,14)
    ell('single furnace eye',(0,2.062,.452),(.051,.021,.012),'eye','head',24,12)
    for sign in [-1,1]:
        pipe('mandibular siege brace',[(sign*.175,2.079,.413),(sign*.18,1.981,.442),(sign*.10,1.933,.47)],[.033,.046,.019],'bone','jaw',14)
        scar_strip('cranial split',[(sign*.203,2.20,.421),(sign*.214,2.12,.435),(sign*.192,2.033,.453)],.012,'head')
    shell('sternal connective tissue',[(0,1.38,.287,.105,.056),(0,1.58,.341,.09,.043),(0,1.80,.385,.060,.026),(0,1.97,.41,.043,.028)],'raw','chest',seg=24,ripple=.07)
    for side,s in [('l',-1),('r',1)]:
        pipe('pillar thigh',[(s*.31,1.04,0),(s*.34,.74,.03),(s*.31,.52,.04)],[.19,.18,.14],'skin','thigh_'+side,18)
        plate('interlocking knee shield',(s*.31,.52,.132),(.29,.31,.11),'armour','shin_'+side,s*.1)
        pipe('pillar shin',[(s*.31,.52,.04),(s*.31,.30,-.01),(s*.31,.12,-.04)],[.14,.12,.13],'skin','shin_'+side,16)
        ell('weight bearing sole',(s*.31,.075,.055),(.165,.074,.20),'skin','foot_'+side)
        for toe in range(3):
            plate('splayed siege toe',(s*.31+(toe-1)*.10,.06,.172),(.115,.12,.19),'bone','foot_'+side)
        plate('shoulder carapace',(s*.56,1.94,-.01),(.44,.43,.38),'armour','arm_'+side,s*.15)
        pipe('upper siege arm',[(s*.60,1.92,0),(s*.68,1.6,.02),(s*.665,1.335,0)],[.16,.15,.12],'skin','arm_'+side,18)
        ell('siege brachialis',(s*.645,1.59,.06),(.17,.20,.14),'raw','arm_'+side,24,16)
    pipe('bracing forearm',[(-.665,1.335,0),(-.69,1.0,.045),(-.635,.75,.08)],[.16,.14,.10],'armour','fore_l',16)
    hands('l',-1,(-.635,.75,.08),1.4)
    # Right launcher terminates at the existing projectile origin exactly.
    pipe('mortar casing',[(.665,1.335,0),(.68,1.07,.18),(.68,.80,.43)],[.19,.22,.18],'armour','fore_r',20)
    ring('mortar muzzle',MUZZLES['slab'],.155,.025,'bone','fore_r')
    ell('mortar throat',(.68,.752,.485),(.132,.132,.018),'dark','fore_r',20,10)
    ring('mortar emitter',(.68,.752,.502),.081,.012,'eye','fore_r')
    for j in range(4):
        yy=.89+j*.095
        plate('mortar keratin scale',(.68,yy,.290-j*.044),(.34,.15,.16),'armour','fore_r',.06)
    for s in [-1,1]:
        pipe('hydraulic trunk',[(s*.5,1.90,-.19),(s*.65,1.64,-.20),(s*.63,1.33,-.045)],[.03,.035,.025],'raw','arm_'+('l' if s<0 else 'r'))


def wisp_core():
    # An organ behind overlapping gill plates, with no miniature human face.
    ell('exposed respiratory organ',(-.025,.015,.198),(.122,.164,.095),'raw','head',28,18)
    for side in [-1,1]:
        for j in range(3):
            yy=-.10+j*.091; x=side*(.064+.009*j)
            plate('asymmetric facial gill',(x,yy,.253),(.115,.127,.101),'armour','head',side*.28)
            pipe('gill slit',[(side*.017,yy+.012,.291),(side*.071,yy+.035,.302),
                (side*.109,yy+.007,.267)],[.006,.012,.004],'dark','head',10)
    pipe('vertical photosensitive fissure',[(-.009,-.061,.289),(.009,-.012,.296),
        (.004,.035,.298),(.016,.088,.286)],[.007,.009,.006,.003],'eye','head',10)
    for side in [-1,1]:
        pipe('osseous gill spar',[(side*.112,-.112,.186),(side*.141,-.007,.194),
            (side*.094,.132,.208)],[.007,.012,.004],'bone','head',10)


def blind_crown_face(center):
    x,y,z=center
    def p(xx,yy,zz): return (x+xx,y+yy,z+zz)
    masses=[shell('overgrown blind face',[
        (*p(0,-.153,-.001),.039,.034),(*p(-.006,-.089,.013),.063,.052),
        (*p(-.012,-.009,-.004),.080,.062),(*p(-.004,.081,-.024),.083,.064),
        (*p(.004,.134,-.031),.047,.043),(*p(.006,.152,-.033),.012,.012)],'skin','head',seg=32)]
    hole=cutter('vertical face aperture',p(.003,-.014,.063),(.023,.108,.045))
    face=sculpt_join(masses,'blind crown dermis','skin','head',.003,3000,[hole]); face['preserve_sculpt']=True
    ell('vertical cavity',p(.003,-.016,.027),(.024,.099,.016),'dark','head',20,14)
    pipe('recessed vertical soul light',[p(.004,-.079,.044),p(-.003,-.023,.046),p(.009,.052,.045)],
        [.004,.006,.003],'eye','head',8)
    for side in [-1,1]:
        pipe('overgrown aperture margin',[p(side*.020,-.100,.061),p(side*.029,-.011,.077),
            p(side*.021,.082,.043)],[.007,.011,.005],'bone','head',12)
        plate('temporal hood',p(side*.088,-.019,-.003),(.111,.335,.132),'armour','head',side*.25)
        pipe('facial fusion seam',[p(side*.027,.116,.010),p(side*.038,.065,.034),
            p(side*.034,-.032,.047)],[.004,.006,.003],'raw','head',8)


def predatory_skull(center):
    x,y,z=center
    def p(xx,yy,zz): return (x+xx,y+yy,z+zz)
    def snout(name,sections,mat,bind):
        vertices=[]; count=24
        for zz,yy,rx,ry in sections:
            for k in range(count):
                theta=math.tau*k/count
                vertices.append(p(rx*math.cos(theta),yy+ry*math.sin(theta),zz))
        faces=[tuple(range(count-1,-1,-1))]
        for j in range(len(sections)-1):
            for k in range(count): faces.append((j*count+k,j*count+(k+1)%count,(j+1)*count+(k+1)%count,(j+1)*count+k))
        faces.append(tuple(range((len(sections)-1)*count,len(sections)*count)))
        return part(a.mesh(name,vertices,faces,M[mat],smooth=True),bind)
    masses=[snout('elongated predatory skull',[(-.113,.030,.084,.078),(-.035,.040,.139,.108),
        (.045,.022,.126,.092),(.125,-.015,.095,.053),(.201,-.033,.053,.031)],'skin','head')]
    for side in [-1,1]:
        masses.append(pipe('predatory brow',[p(side*.056,.088,-.003),p(side*.112,.059,.035),
            p(side*.119,.014,.092)],[.026,.025,.012],'skin','head',12))
    cuts=[cutter('left deep orbital hollow',p(-.112,.035,.054),(.037,.030,.042)),
        cutter('right deep orbital hollow',p(.112,.025,.054),(.040,.031,.043))]
    head=sculpt_join(masses,'fiend wedge cranium','skin','head',.0035,3600,cuts);head['preserve_sculpt']=True
    snout('canine mandibular body',[(-.061,-.071,.092,.035),(.035,-.110,.088,.029),
        (.130,-.107,.072,.020),(.195,-.079,.049,.020)],'bone','jaw')
    ell('long oral darkness',p(0,-.075,.103),(.083,.028,.099),'dark','head',24,14)
    for side in [-1,1]:
        ell('predatory orbital depth',p(side*.108,.030,.035),(.026,.021,.025),'dark','head',20,12)
        ell('predatory slit lens',p(side*.109,.030,.058),(.007,.014,.005),'eye','head',16,10)
        pipe('temporal keratin edge',[p(side*.084,.114,-.032),p(side*.128,.084,.005),
            p(side*.132,.028,.068)],[.013,.016,.009],'armour','head',12)
        for j in range(4):
            zz=.060+j*.036; xx=side*(.082-j*.009)
            length=.054 if j in [0,2] else .027
            pipe('predator upper fang',[p(xx,-.035,zz),p(xx*.98,-.057,zz+.003),
                p(xx*.89,-.035-length,zz+.010)],[.010,.008,.001],'bone','head',10)
        pipe('mandibular tendon',[p(side*.104,-.020,-.025),p(side*.101,-.092,.012),
            p(side*.076,-.115,.087)],[.019,.023,.011],'raw','jaw',12)
    ell('cartilaginous muzzle',p(0,-.028,.199),(.052,.027,.021),'armour','head',24,14)
    for side in [-1,1]: ell('nasal slit',p(side*.025,-.031,.218),(.011,.006,.004),'dark','head',16,8)


def wisp():
    start('wisp')
    bone('pelvis',(0,-.15,0),(0,0,0)); bone('spine',(0,-.15,0),(0,.1,0),'pelvis')
    bone('chest',(0,.05,0),(0,.23,0),'spine'); bone('head',(0,.14,.13),(0,.28,.16),'chest')
    bone('jaw',(0,-.1,.21),(0,-.2,.27),'head')
    ell('distended respiratory sac',(0,.034,-.053),(.269,.327,.223),'skin','spine',36,22)
    for sign in [-1,1]:
        # Rib-like plates wrap the bladder but expose pale pulsing tissue.
        for j in range(4):
            yy=-.20+j*.138
            pipe('respiratory carapace arch',[(sign*.092,yy,.212),(sign*.251,yy+.058,.139),
                (sign*.303,yy+.098,-.012),(sign*.231,yy+.102,-.172)],
                [.024,.037,.044,.021],'armour','chest',14)
        for j in range(3):
            scar_strip('bladder scar',[(sign*.115,-.05+j*.095,.169),(sign*.171,.005+j*.082,.153),(sign*.201,.019+j*.078,.125)],.008,'spine')
    wisp_core()
    for side,sign in [('l',-1),('r',1)]:
        bone('fin_'+side,(sign*.24,.13,-.06),(sign*.43,.25,-.12),'chest')
        shell('tattered lateral web',[(sign*.24,-.24,-.04,.025,.064),(sign*.35,-.10,-.11,.038,.109),
            (sign*.395,.09,-.15,.055,.134),(sign*.367,.28,-.132,.056,.098),(sign*.29,.389,-.095,.014,.026)],'raw','fin_'+side,seg=28,ripple=.18)
        pipe('lateral skeletal spar',[(sign*.245,-.19,-.03),(sign*.357,-.045,-.080),
            (sign*.425,.172,-.12),(sign*.31,.40,-.07)],[.017,.024,.021,.002],'bone','fin_'+side,12)
    for j in range(5):
        x=(j-2)*.085; end=-.46-.058*(j%2)
        name=f'tendril{j}'; bone(name,(x,-.20,-.035),(x,-.38,-.07),'pelvis')
        pipe('visceral feeler',[(x,-.18,-.035),(x*1.22,-.32,-.072),(x*.96,end,.01),(x*.74,end+.032,.054)],
            [.027,.026,.014,.003],'raw',name,14)
        pipe('feeler dermal seam',[(x-.008,-.205,-.021),(x*1.23-.006,-.335,-.052),(x*.96,end+.025,.023)],
            [.007,.009,.003],'skin',name,8)
        ell('sensor ember',(x*.74,end+.032,.054),(.006,.008,.006),'eye',name,12,8)


def hierophant():
    start('hierophant'); human_skeleton(1.07,1.86,(0,2.12,.12),.30,1.10,.15)
    shell('layered ritual mantle',[(0,.14,-.025,.40,.29),(0,.36,-.015,.41,.28),(0,.75,-.01,.30,.23),(0,1.1,0,.23,.17),(0,1.38,0,.23,.16),(0,1.66,0,.31,.18),(0,1.85,.01,.34,.18),(0,2.00,.03,.12,.09)],'skin','spine',seg=40,ripple=.11)
    for j in range(11):
        ang=j*math.tau/11; x,z=math.cos(ang),math.sin(ang)
        offset=.017*math.sin(j*2.71)
        pipe('deep mantle fold',[(x*.355,.20+offset,z*.255),(x*.333,.51,z*.245),
            (x*.253,.98,z*.189),(x*.230,1.40,z*.167),(x*.29,1.78,z*.17)],
            [.014,.026,.021,.017,.010],'skin','spine',12)
    for sign in [-1,1]:
        CUTS.append(cutter('ragged mantle hem',(sign*.29,.145,.174),(.084,.105,.105)))
        scar_strip('mantle exposed seam',[(sign*.17,.30,.248),(sign*.165,.59,.243),
            (sign*.127,.90,.191),(sign*.114,1.12,.162)],.012,'spine')
    shell('sternal woven fascia',[(0,1.10,.163,.042,.019),(0,1.36,.17,.073,.026),
        (0,1.66,.177,.083,.030),(0,1.88,.149,.045,.020)],'raw','chest',seg=24,ripple=.09)
    for s in [-1,1]:
        plate('ceremonial shoulder carapace',(s*.30,1.87,0),(.32,.31,.29),'armour','chest',s*.23)
    blind_crown_face((0,2.12,.12))
    for s in [-1,1]:
        pipe('split crown',[(s*.105,2.17,.04),(s*.17,2.33,0),(s*.10,2.46,-.035)],[.053,.041,.002],'bone','head',12)
        pipe('draped upper arm',[(s*.30,1.86,0),(s*.365,1.66,.035),(s*.365,1.48,.04)],[.081,.069,.050],'skin','arm_'+('l' if s<0 else 'r'),16)
        pipe('forearm under mantle',[(s*.365,1.48,.04),(s*.377,1.29,.061),(s*.335,1.10,.08)],[.053,.061,.027],'skin','fore_'+('l' if s<0 else 'r'),16)
        scar_strip('wrist connective slit',[(s*.38,1.37,.093),(s*.374,1.24,.099),(s*.338,1.13,.11)],.008,'fore_'+('l' if s<0 else 'r'))
        hands('l' if s<0 else 'r',s,(s*.335,1.1,.08),.9)
    # Three anchored emitters preserve the old burst silhouette without a wide staff.
    for j,(x,z) in enumerate([(-.55,.07),(.55,.07),(0,-.43)]):
        n='halo'+str(j); bone(n,(x,1.90,z),(x,2.04,z),'chest')
        plate('floating carapace emitter',(x,1.95,z),(.19,.24,.135),'armour',n,(-.18 if j%2 else .12))
        ring('orb bony rim',(x,1.95,z+.07),.061,.010,'bone',n)
        ell('orb cavity',(x,1.95,z+.065),(.045,.052,.013),'dark',n,20,12)
        ell('orb aperture',(x,1.95,z+.081),(.025,.039,.008),'eye',n,20,12)
        pipe('floating cable',[(x,1.92,z),(x*.75,1.81,z-.08),(x*.36,1.70,-.12)],[.018,.018,.012],'dark','chest',8)
    for side,s in [('l',-1),('r',1)]:
        pipe('concealed leg',[(s*.15,1.07,0),(s*.15,.53,.04),(s*.15,.12,-.04)],[.06,.045,.038],'dark','thigh_'+side,12)
        ell('ritual boot',(s*.15,.075,.06),(.075,.07,.16),'armour','foot_'+side,16,8)


def fiend():
    start('fiend'); human_skeleton(1.04,2.05,(0,2.36,.68),.53,.82,.26)
    shell('predatory torso',[(0,.90,-.01,.25,.23),(0,1.1,.02,.30,.25),(0,1.39,.10,.39,.31),(0,1.70,.22,.50,.34),(0,1.99,.27,.54,.35),(0,2.18,.30,.40,.28),(0,2.30,.40,.14,.13)],seg=36,ripple=.035)
    for s in [-1,1]:
        ell('pectoral insertion',(s*.22,1.954,.47),(.25,.218,.119),'skin','chest',32,18)
        ell('serratus belly',(s*.31,1.62,.345),(.14,.199,.106),'skin','chest',28,16)
        for j in range(4):
            pipe('rib armour',[(s*.04,1.35+j*.14,.36+j*.018),(s*.27,1.40+j*.14,.38),(s*.42,1.47+j*.14,.26)],[.019,.026,.014],'skin' if j%2==0 else 'bone','chest',12)
        plate('scapular carapace',(s*.37,2.11,.01),(.46,.45,.34),'armour','chest',s*.16)
        for k in range(3):
            pipe('shoulder keratin spine',[(s*(.34+k*.035),2.20+k*.05,.02),(s*(.45+k*.041),2.30+k*.052,-.029)],[.032,.001],'armour','chest',10)
    shell('torn pectoral muscle',[(.075,1.76,.443,.071,.035),(.11,1.92,.559,.086,.043),(.09,2.077,.544,.05,.029)],'raw','chest',seg=24,ripple=.05)
    CUTS.append(cutter('exposed sternum breach',(.14,1.98,.617),(.12,.21,.08)))
    for sign in [-1,1]:
        pipe('thick cervical tendon',[(sign*.20,2.11,.43),(sign*.12,2.235,.575),(sign*.10,2.37,.65)],[.026,.032,.021],'raw','head',12)
    predatory_skull((0,2.36,.68))
    for s in [-1,1]:
        pipe('swept horn',[(s*.14,2.46,.56),(s*.31,2.59,.46),(s*.39,2.73,.57),(s*.35,2.82,.73)],[.067,.053,.024,.001],'bone','head',12)
    for side,s in [('l',-1),('r',1)]:
        pipe('upper predatory arm',[(s*.53,2.05,0),(s*.62,1.74,.08),(s*.595,1.435,0)],[.17,.145,.094],'skin','arm_'+side,18)
        ell('elbow membrane',(s*.595,1.435,.015),(.094,.104,.098),'raw','fore_'+side,24,14)
        plate('elbow osteoderm',(s*.595,1.465,-.06),(.22,.25,.19),'armour','fore_'+side,s*.1)
        pipe('forearm sinew',[(s*.595,1.435,0),(s*.59,1.12,.11),(s*.565,.82,.08)],[.12,.11,.062],'skin','fore_'+side,16)
        ell('brachial muscle',(s*.583,1.76,.053),(.155,.235,.13),'skin','arm_'+side,28,16)
        ell('forearm flexor',(s*.59,1.14,.091),(.115,.19,.105),'skin','fore_'+side,28,16)
        scar_strip('exposed forearm tendon',[(s*.641,1.25,.165),(s*.63,1.07,.176),(s*.58,.865,.136)],.014,'fore_'+side)
        hands(side,s,(s*.565,.82,.08),1.7)
        pipe('digitigrade thigh',[(s*.26,1.04,0),(s*.28,.75,.16),(s*.26,.52,.04)],[.15,.13,.085],'skin','thigh_'+side,16)
        pipe('hock',[(s*.26,.52,.04),(s*.26,.32,-.16),(s*.26,.12,-.04)],[.086,.064,.065],'skin','shin_'+side,14)
        ell('hoof root',(s*.26,.087,.011),(.092,.073,.12),'skin','foot_'+side,24,14)
        for split in [-1,1]:
            ell('cloven keratin hoof',(s*.26+split*.049,.06,.105),(.053,.058,.145),'armour','foot_'+side,24,14)
        box('hoof cleft',(s*.26,.07,.177),(.015,.10,.028),'dark','foot_'+side,bevel=.001)
    bone('tail',(0,1.02,-.15),(0,.75,-.46),'pelvis')
    pipe('tail',[(0,1.02,-.15),(.05,.68,-.45),(.10,.43,-.68),(.08,.48,-.79)],[.092,.067,.045,.014],'skin','tail',14)
    ell('tail ember',(.08,.48,-.79),(.035,.045,.035),'eye','tail',16,8)


def fuse_skin(mesh,kind):
    source=[(v.co.copy(),[(mesh.vertex_groups[g.group].name,g.weight) for g in v.groups]) for v in mesh.data.vertices]
    tree=KDTree(len(source))
    for i,(co,_) in enumerate(source): tree.insert(co,i)
    tree.balance()
    remesh=mesh.modifiers.new('Unified authored dermal surface','REMESH'); remesh.mode='VOXEL'
    remesh.voxel_size={'husk':.008,'crawler':.010,'slab':.013,'wisp':.0075,'hierophant':.010,'fiend':.010}[kind]
    remesh.use_smooth_shade=True; remesh.adaptivity=0
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    for cut in CUTS:
        boolean=mesh.modifiers.new('Authored dermal tear','BOOLEAN'); boolean.operation='DIFFERENCE'; boolean.solver='EXACT'; boolean.object=cut
        bpy.ops.object.modifier_apply(modifier=boolean.name)
        bpy.data.objects.remove(cut,do_unlink=True)
    smooth=mesh.modifiers.new('Dermal relaxation','SMOOTH'); smooth.factor=.6; smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    triangles=sum(len(p.vertices)-2 for p in mesh.data.polygons)
    if triangles>10500:
        dec=mesh.modifiers.new('Surface topology budget','DECIMATE'); dec.ratio=10500/triangles
        bpy.ops.object.modifier_apply(modifier=dec.name)
    for group in list(mesh.vertex_groups): mesh.vertex_groups.remove(group)
    groups={name:mesh.vertex_groups.new(name=name) for name in BONES}
    for v in mesh.data.vertices:
        near=tree.find_n(v.co,3); accum={}; total=0
        for _,idx,distance in near:
            weight=1/max(.001,distance); total+=weight
            for name,amount in source[idx][1]: accum[name]=accum.get(name,0)+weight*amount
        strongest=sorted(accum.items(),key=lambda item:-item[1])[:4]
        denom=sum(w for _,w in strongest)
        for name,weight in strongest: groups[name].add([v.index],weight/denom,'REPLACE')
    # Boolean cutter material slots otherwise split this one surface into an
    # additional glTF primitive. Cavity interiors remain the dermal surface;
    # authored recessed raw/dark meshes provide their separate tissue layers.
    mesh.data.materials.clear(); mesh.data.materials.append(M['skin'])
    for polygon in mesh.data.polygons:
        polygon.use_smooth=True
        polygon.material_index=0


def skeleton(kind):
    data=bpy.data.armatures.new(kind+' skeleton')
    rig=bpy.data.objects.new('rig_'+kind,data); bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name,(head,tail,parent) in BONES.items():
        b=data.edit_bones.new(name); b.head=gv(head); b.tail=gv(tail)
        if parent: b.parent=data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
    for ob in PARTS:
        bpy.context.view_layer.objects.active=ob
        for mod in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
        group=ob.vertex_groups.new(name=ob['bone'])
        group.add(list(range(len(ob.data.vertices))),1,'REPLACE')
        # The torso bends across three spine bones, with continuous skin weights.
        if ob['bone']=='spine':
            low=BONES['spine'][0][1]; high=BONES['chest'][0][1]
            vg=ob.vertex_groups.new(name='chest')
            for v in ob.data.vertices:
                y=(ob.matrix_world @ v.co).z
                w=max(0,min(1,(y-low)/max(.1,high-low)))
                vg.add([v.index],w,'REPLACE'); group.add([v.index],1-w,'REPLACE')
    batches={}
    for ob in PARTS: batches.setdefault(ob.data.materials[0].name,[]).append(ob)
    for material,objects in batches.items():
        retained=[ob for ob in objects if ob.get('preserve_sculpt')]
        joined=[ob for ob in objects if ob not in retained]
        bpy.ops.object.select_all(action='DESELECT')
        for ob in joined: ob.select_set(True)
        bpy.context.view_layer.objects.active=joined[0]; bpy.ops.object.join()
        mesh=bpy.context.object; mesh.name=material.replace('.','_')+'_'+kind
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        if material=='enemy.skin': fuse_skin(mesh,kind)
        if retained:
            for ob in retained: ob.select_set(True)
            bpy.context.view_layer.objects.active=mesh; bpy.ops.object.join()
        mesh.parent=rig
        modifier=mesh.modifiers.new('Authored deform rig','ARMATURE'); modifier.object=rig
        mesh['authoredSpecies']=kind
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.008)
        bpy.ops.object.mode_set(mode='OBJECT')
        # Fixed half-metre material specimens keep pores/scars at consistent
        # physical scale rather than stretching an atlas across whole limbs.
        uv=mesh.data.uv_layers.active.data
        for face in mesh.data.polygons:
            axis=max(range(3),key=lambda n:abs(face.normal[n]))
            axes=[n for n in range(3) if n!=axis]
            for index in face.loop_indices:
                point=mesh.data.vertices[mesh.data.loops[index].vertex_index].co
                uv[index].uv=(point[axes[0]]*2,point[axes[1]]*2)
        if kind=='husk' and material=='enemy.skin':
            # Authored local discoloration follows attachment/cavity zones;
            # stored vertex colour adds no runtime material or texture draw.
            for old in list(mesh.data.color_attributes): mesh.data.color_attributes.remove(old)
            attr=mesh.data.color_attributes.new(name='tissue_tone',type='FLOAT_COLOR',domain='POINT')
            mesh.data.color_attributes.active_color=attr
            zones=[((.097,1.745,.362),(.070,.065,.075),(.34,.29,.27)),
                ((.004,1.705,.361),(.035,.059,.041),(.39,.37,.32)),
                ((.194,1.412,.186),(.086,.180,.069),(.40,.31,.28)),
                ((-.184,1.565,.108),(.108,.089,.087),(.49,.51,.40)),
                ((.216,1.565,.096),(.105,.097,.085),(.42,.44,.36)),
                ((.338,.864,.063),(.049,.195,.057),(.38,.30,.29)),
                ((0,1.036,.117),(.142,.172,.050),(.55,.47,.40))]
            for vertex in mesh.data.vertices:
                pos=(vertex.co.x,vertex.co.z,-vertex.co.y); colour=[1.,1.,1.]
                for center,extent,tint in zones:
                    d=sum(((pos[n]-center[n])/extent[n])**2 for n in range(3))
                    weight=math.exp(-d*1.7)
                    for n in range(3): colour[n]*=1+(tint[n]-1)*weight
                attr.data[vertex.index].color=(*(colour[n]*M['skin'].diffuse_color[n] for n in range(3)),1)
            nodes=M['skin'].node_tree.nodes; links=M['skin'].node_tree.links
            tone=nodes.new('ShaderNodeVertexColor'); tone.layer_name='tissue_tone'
            links.new(tone.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
    bpy.ops.object.select_all(action='DESELECT')
    marker=a.group('muzzle',MUZZLES[kind],rig)
    marker['meaning']='Neutral attack endpoint; simulation owns projectile origin.'
    return rig


def setrot(rig,name,rotation):
    if name not in rig.pose.bones: return
    b=rig.pose.bones[name]
    q=Quaternion((1,0,0,0))
    inv=rig.data.bones[name].matrix_local.to_quaternion().inverted()
    for axis,angle in zip([(1,0,0),(0,1,0),(0,0,1)],rotation):
        if angle: q @= Quaternion(inv @ gv(axis),angle)
    b.rotation_mode='QUATERNION'; b.rotation_quaternion=q


def clips(rig,kind):
    scene=bpy.context.scene; scene.render.fps=24
    durations={'idle':2,'walk':1,'attack':1,'hit':.5,'death':.625}
    for name,duration in durations.items():
        action=bpy.data.actions.new(name); rig.animation_data_create(); rig.animation_data.action=action
        frames=round(duration*24)
        for frame in range(0,frames+1,3):
            t=frame/frames; phase=t*math.tau
            for b in rig.pose.bones:
                b.location=(0,0,0); b.rotation_mode='QUATERNION'; b.rotation_quaternion=(1,0,0,0); b.scale=(1,1,1)
            if name=='idle':
                setrot(rig,'chest',(.014*math.sin(phase),0,.006*math.sin(phase)))
                setrot(rig,'head',(.014*math.sin(phase+.7),.016*math.sin(phase),0))
                if kind=='wisp':
                    for s in ['l','r']: setrot(rig,'fin_'+s,(0,.1*math.sin(phase),0))
                setrot(rig,'tail',(0,.07*math.sin(phase),0))
            elif name=='walk':
                swing=.20 if kind=='slab' else .32
                setrot(rig,'chest',(.02*math.sin(phase*2),.025*math.sin(phase),.025*math.sin(phase)))
                for side,sgn in [('l',1),('r',-1)]:
                    step=math.sin(phase)*sgn
                    setrot(rig,'thigh_'+side,(swing*step,0,0))
                    setrot(rig,'shin_'+side,(.28*max(0,-step),0,0))
                    setrot(rig,'foot_'+side,(-.10*step,0,0))
                    setrot(rig,'arm_'+side,(-swing*.6*step,0,0))
                    setrot(rig,'fore_'+side,(-.08*max(0,step),0,0))
                    if kind=='crawler':
                        for j in range(3):
                            p=phase+sgn*math.pi/2+j*math.pi/1.5
                            setrot(rig,f'leg_{side}{j}',(.10*math.sin(p),.17*math.sin(p),sgn*.06*math.cos(p)))
                            setrot(rig,f'foot_{side}{j}',(0,.05*math.sin(p),sgn*.08*math.cos(p)))
                    setrot(rig,'fin_'+side,(0,.16*math.sin(phase*2),sgn*.05*math.sin(phase)))
                for j in range(5): setrot(rig,f'tendril{j}',(.10*math.sin(phase+j*.3),0,.04*math.sin(phase)))
                setrot(rig,'tail',(.025,.11*math.sin(phase),0))
            elif name=='attack':
                # Anticipation returns to the exact rest/muzzle pose at t=1.
                wind=math.sin(t*math.pi)
                setrot(rig,'chest',(-.07*wind,0,0)); setrot(rig,'head',(-.04*wind,0,0))
                setrot(rig,'jaw',(.30*wind,0,0))
                for s,sign in [('l',-1),('r',1)]:
                    setrot(rig,'arm_'+s,(-.32*wind,0,-sign*.05*wind)); setrot(rig,'fore_'+s,(-.12*wind,0,0))
                for j in range(3): setrot(rig,'halo'+str(j),(0,.12*wind,0))
            elif name=='hit':
                recoil=math.sin(math.pi*t)*(1-t)
                setrot(rig,'chest',(.23*recoil,0,.04*recoil)); setrot(rig,'head',(-.17*recoil,0,0))
                setrot(rig,'arm_l',(.22*recoil,0,.1*recoil))
            elif name=='death':
                f=t*t*(3-2*t)
                setrot(rig,'root',(-1.48*f,0,.12*math.sin(math.pi*t)))
                setrot(rig,'chest',(.16*f,0,0)); setrot(rig,'head',(.25*f,.12*f,0))
                for side,sgn in [('l',-1),('r',1)]:
                    setrot(rig,'arm_'+side,(.3*f,0,sgn*.35*f)); setrot(rig,'fore_'+side,(-.65*f,0,0))
                    setrot(rig,'thigh_'+side,(sgn*.18*f,0,0)); setrot(rig,'shin_'+side,(.35*f,0,0))
                if kind=='crawler':
                    for side,sgn in [('l',-1),('r',1)]:
                        for j in range(3): setrot(rig,f'leg_{side}{j}',(.10*f,0,-sgn*.55*f))
            for b in rig.pose.bones:
                b.keyframe_insert(data_path='rotation_quaternion',frame=frame+1,group=b.name)
        track=rig.animation_data.nla_tracks.new(); track.name=name
        strip=track.strips.new(name,1,action); strip.action_frame_start=1; strip.action_frame_end=frames+1
        track.mute=True
    rig.animation_data.action=None
    for b in rig.pose.bones: b.rotation_quaternion=(1,0,0,0)
    scene.frame_set(1)
    return durations


def preview(kind):
    # References are attached only after compact GLB export; runtime cache binds
    # the same base colour maps. Editable .blend retains relative source links.
    for key,path in [('skin','skin.png'),('raw','raw.png'),('armour','chitin.png'),('bone','bone.png')]:
        image_path=ROOT/'art/modern/refinement/materials'/path
        if not image_path.exists(): image_path=ROOT/'public/modern/textures/titanium.webp'
        image=bpy.data.images.load(str(image_path),check_existing=True)
        material=M[key]; nodes=material.node_tree.nodes
        tex=nodes.new('ShaderNodeTexImage'); tex.image=image
        mix=nodes.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1
        mix.inputs[2].default_value=material.diffuse_color
        material.node_tree.links.new(tex.outputs['Color'],mix.inputs[1])
        material.node_tree.links.new(mix.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
        if kind=='husk' and key=='skin':
            tone=nodes.new('ShaderNodeVertexColor'); tone.layer_name='tissue_tone'
            material.node_tree.links.new(tone.outputs['Color'],mix.inputs[2])
        specimen='chitin' if key=='armour' else key
        normal_path=ROOT/'art/modern/refinement/materials'/f'{specimen}-normal.png'
        roughness_path=ROOT/'art/modern/refinement/materials'/f'{specimen}-roughness.png'
        if normal_path.exists():
            normal_tex=nodes.new('ShaderNodeTexImage'); normal_tex.image=bpy.data.images.load(str(normal_path),check_existing=True)
            normal_tex.image.colorspace_settings.name='Non-Color'
            normal=nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=.45
            material.node_tree.links.new(normal_tex.outputs['Color'],normal.inputs['Color'])
            material.node_tree.links.new(normal.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
        if roughness_path.exists():
            rough_tex=nodes.new('ShaderNodeTexImage'); rough_tex.image=bpy.data.images.load(str(roughness_path),check_existing=True)
            rough_tex.image.colorspace_settings.name='Non-Color'
            material.node_tree.links.new(rough_tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Roughness'])
    bpy.ops.file.make_paths_relative()
    for ob in bpy.context.scene.objects:
        if ob.type=='ARMATURE':
            ob.animation_data.action=None
            for track in ob.animation_data.nla_tracks: track.mute=True
            for b in ob.pose.bones: b.rotation_quaternion=(1,0,0,0)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(kind+'.blend')),compress=True)
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=24; scene.cycles.use_denoising=True
    scene.render.resolution_x=900; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
    scene.world.color=(.10,.10,.10); scene.view_settings.view_transform='AgX'
    heights={'husk':1.9,'crawler':1.0,'slab':2.6,'wisp':1.1,'hierophant':2.5,'fiend':2.8}
    height=heights[kind]; target=(0,0 if kind=='wisp' else height*.52,.08)
    cam=(height*1.9,target[1]+height*.9,height*3.5)
    bpy.ops.object.camera_add(location=gv(cam)); camera=bpy.context.object; a.look_at(camera,target)
    camera.data.type='ORTHO'; camera.data.clip_end=500; camera.data.ortho_scale=height*1.35 if kind!='crawler' else 2.6
    scene.camera=camera
    for name,power,color,pos,size in [('key',500,(.80,.89,1),(3,4,4),3),('rim',650,(.27,.67,.8),(-3,3,-2),2),('fill',200,(1,.71,.45),(-3,2,3),3)]:
        bpy.ops.object.light_add(type='AREA',location=gv(pos)); ob=bpy.context.object; ob.name='PREVIEW '+name
        ob.data.energy=power; ob.data.color=color; ob.data.size=size; a.look_at(ob,target)
    floor=a.material('PREVIEW floor',(.025,.035,.04),0,.8)
    a.box('PREVIEW floor',(0,-.55 if kind=='wisp' else -.04,0),(200,.05,200),floor,bevel=0)
    REVIEW.mkdir(parents=True,exist_ok=True)
    scene.render.filepath=str(REVIEW/(kind+'-sculpt.png')); bpy.ops.render.render(write_still=True)


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--asset',choices=TYPES+['all'],default='all'); parser.add_argument('--preview',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    SOURCE.mkdir(parents=True,exist_ok=True); DEST.mkdir(parents=True,exist_ok=True)
    manifest=[]
    for kind in TYPES if args.asset=='all' else [args.asset]:
        globals()[kind](); rig=skeleton(kind); animation=clips(rig,kind)
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(kind+'.blend')),compress=True)
        bpy.ops.export_scene.gltf(filepath=str(DEST/(kind+'.glb')),export_format='GLB',export_yup=True,
            export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,
            export_cameras=False,export_lights=False,export_extras=True,export_apply=False,
            export_force_sampling=True,export_frame_range=False)
        meshes=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
        tris=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in meshes)
        entry={'type':kind,'triangles':tris,'materialMeshes':len(meshes),'bones':len(BONES),'clips':animation,'muzzle':MUZZLES[kind],'bytes':(DEST/(kind+'.glb')).stat().st_size}
        manifest.append(entry); print('ENEMY_ASSET '+json.dumps(entry),flush=True)
        if args.preview: preview(kind)
    path=SOURCE/'manifest.json'; old=json.loads(path.read_text()) if path.exists() else []
    bykind={e['type']:e for e in old}; bykind.update({e['type']:e for e in manifest})
    path.write_text(json.dumps(list(bykind.values()),indent=2)+'\n')

if __name__=='__main__': main()
