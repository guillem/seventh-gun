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
    global PARTS,BONES,M
    a.reset(); PARTS=[]; BONES={}
    M={
      'skin': a.material('enemy.skin', (.86,.88,.76) if kind=='husk' else (.76,.48,.36) if kind=='fiend' else (.66,.69,.58),0,.82),
      'armour': a.material('enemy.armour', (.35,.39,.4) if kind in ('husk','slab') else (.43,.3,.24) if kind=='crawler' else (.34,.39,.43),.32,.57),
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


def face(center, scale=1, kind='husk'):
    x,y,z=center
    ell('occipital skull',(x,y+.02*scale,z-.045*scale),(.105*scale,.15*scale,.115*scale),'bone','head')
    ell('temple armour',(x,y+.075*scale,z-.065*scale),(.122*scale,.1*scale,.112*scale),'armour','head')
    ell('jaw tendon',(x,y-.16*scale,z+.035*scale),(.065*scale,.055*scale,.060*scale),'bone','jaw')
    ell('open mouth',(x,y-.087*scale,z+.08*scale),(.052*scale,.052*scale,.016*scale),'dark','head')
    for s in [-1,1]:
        ell('eye socket',(x+s*.058*scale,y+.025*scale,z+.059*scale),(.041*scale,.030*scale,.034*scale),'dark','head',16,8)
        ell('optic',(x+s*.058*scale,y+.028*scale,z+.098*scale),(.021*scale,.011*scale,.009*scale),'eye','head',16,8)
        pipe('brow ridge',[(x+s*.005*scale,y+.071*scale,z+.065*scale),(x+s*.07*scale,y+.072*scale,z+.077*scale),(x+s*.105*scale,y+.035*scale,z+.02*scale)],[.012*scale,.017*scale,.007*scale],'bone','head')
        pipe('cheek blade',[(x+s*.104*scale,y-.014*scale,z+.005*scale),(x+s*.092*scale,y-.063*scale,z+.06*scale),(x+s*.055*scale,y-.103*scale,z+.074*scale)],[.035*scale,.03*scale,.012*scale],'bone','head')
        for j in range(3):
            px=x+s*(.017+j*.016)*scale
            pipe('teeth',[(px,y-.057*scale,z+.105*scale),(px,y-(.087+j*.003)*scale,z+.112*scale)],[.006*scale,.001],'bone','head',6)
    pipe('nasal keel',[(x,y+.075*scale,z+.05*scale),(x,y-.015*scale,z+.12*scale)],[.023*scale,.012*scale],'bone','head')


def hands(side,s,pos,scale=1):
    x,y,z=pos
    ell('metacarpal',(x,y,z),(.061*scale,.105*scale,.045*scale),'skin','hand_'+side,16,8)
    for j in range(3):
        xx=x+(j-1)*.041*scale
        pipe('articulated claw',[(xx,y-.04*scale,z),(xx+s*.012*scale,y-.15*scale,z+.025*scale),(xx+s*.015*scale,y-.205*scale,z+.065*scale)], [.016*scale,.013*scale,.002],'bone','hand_'+side,8)


def husk():
    start('husk'); human_skeleton(.93,1.57,(.06,1.755,.405),.255,.56)
    bone('arm_l',(-.255,1.57,0),(-.32,1.22,.05),'chest')
    bone('fore_l',(-.32,1.22,.05),(-.20,1.29,.28),'arm_l')
    bone('hand_l',(-.20,1.29,.28),(-.20,1.17,.32),'fore_l')
    shell('continuous wasted torso',[(0,.87,0,.13,.10),(.01,1.01,0,.15,.115),(.02,1.16,.01,.105,.09),(0,1.32,.035,.19,.145),(-.02,1.49,.06,.23,.16),(-.03,1.62,.08,.18,.12),(0,1.7,.1,.06,.07)],ripple=.026)
    for i in range(6):
        y=1.28+i*.057; width=.13+(.05*math.sin(i*.48))
        for s in [-1,1]:
            pipe('exposed rib',[(s*.025,y,.200),(s*width*.66,y+.029,.200),(s*width,y+.052,.130),(s*width*.92,y+.052,.050)],[.011,.014,.014,.008],'bone','chest',8)
    for i in range(8):
        ell('vertebra',(0,1.06+i*.072,-.109),(.038,.023,.026),'bone','spine',12,6)
    pipe('cranial umbilical',[(0,1.67,.09),(.03,1.78,.24),(.06,1.755,.37)],[.052,.048,.037],'skin','head')
    face((.06,1.755,.405))
    for side,s in [('l',-1),('r',1)]:
        shoulder=(s*.255,1.57,0); elbow=(-.32,1.22,.05) if s<0 else (.32,1.065,0); hand=(-.20,1.29,.28) if s<0 else (.29,.56,.08)
        ell('deltoid',shoulder,(.098,.16,.108),'skin','arm_'+side)
        pipe('humerus',[shoulder,(s*.315,1.3,.014),elbow],[.065,.055,.045],'skin','arm_'+side,12)
        ell('elbow capsule',elbow,(.061,.068,.059),'bone','fore_'+side,16,8)
        pipe('forearm radius',[elbow,tuple((elbow[i]+hand[i])*.5 for i in range(3)),hand],[.058,.044,.027],'skin','fore_'+side,12)
        if s>0: pipe('forearm cable',[(s*.35,1.04,-.015),(s*.347,.80,.015),(s*.31,.59,.06)],[.012,.012,.009],'dark','fore_'+side,8)
        hands(side,s,hand)
        pipe('thigh',[(s*.13,.93,0),(s*.14,.7,.04),(s*.13,.465,.04)],[.089,.075,.045],'skin','thigh_'+side,14)
        ell('patella',(s*.13,.465,.088),(.048,.047,.024),'bone','shin_'+side,12,6)
        pipe('tibia',[(s*.13,.465,.04),(s*.13,.25,-.015),(s*.13,.12,-.04)],[.046,.033,.038],'skin','shin_'+side,12)
        ell('bare foot',(s*.13,.07,.085),(.065,.065,.155),'skin','foot_'+side,16,8)
    # Surgical shoulder reinforcement and sternum seam remain asymmetric.
    ell('left shoulder graft',(-.20,1.655,-.028),(.14,.084,.135),'armour','chest')
    for yy in [1.37,1.44,1.51]: box('sternum optic',(.008,yy,.193),(.012,.045,.009),'eye',bevel=.002)


def crawler():
    start('crawler')
    bone('pelvis',(0,.52,-.23),(0,.66,-.24)); bone('spine',(0,.52,-.23),(0,.54,.08),'pelvis')
    bone('chest',(0,.54,.06),(0,.58,.28),'spine'); bone('head',(0,.50,.43),(0,.56,.53),'chest')
    bone('jaw',(0,.40,.52),(0,.34,.63),'head')
    ell('abdomen',(0,.57,-.28),(.31,.34,.40),'skin','pelvis',28,14)
    for j in range(5):
        yy=.58+.22*math.sin((j+1)*.49)
        ell('overlapping dorsal scute',(0,yy,-.58+j*.135),(.30-j*.014,.11,.125),'armour','pelvis',20,8)
    ell('cephalothorax',(0,.53,.19),(.25,.23,.29),'armour','chest',24,12)
    ell('mouth mass',(0,.45,.49),(.19,.15,.18),'skin','head',20,10)
    ell('spit orifice',(0,.38,.632),(.08,.066,.02),'dark','head',16,8)
    for s in [-1,1]:
        for k in range(2):
            ell('crawler lens',(s*(.071+.04*k),.54+k*.055,.60-.027*k),(.026,.029,.020),'eye','head',12,8)
        pipe('fang',[(s*.13,.44,.60),(s*.115,.29,.72),(s*.04,.30,.72)],[.027,.018,.001],'bone','jaw')
    for side,s in [('l',-1),('r',1)]:
        for j in range(3):
            hip=(s*.22,.52,.22-j*.22); knee=(s*(.61+.055*(j==1)),.60,.42-j*.36); foot=(s*(.91+.03*(j==1)),.045,.54-j*.50)
            upper=f'leg_{side}{j}'; lower=f'foot_{side}{j}'
            bone(upper,hip,knee,'chest'); bone(lower,knee,foot,upper)
            ell('coxa socket',hip,(.083,.081,.10),'dark',upper,16,8)
            pipe('femur chitin',[hip,(s*.43,.57,(hip[2]+knee[2])/2),knee],[.07,.061,.044],'armour',upper,12)
            ell('ball joint',knee,(.055,.053,.055),'bone',lower,16,8)
            pipe('tarsus',[knee,(s*.82,.31,(knee[2]+foot[2])/2),foot],[.044,.023,.006],'armour',lower,10)
            pipe('leg tendon',[(hip[0],hip[1]-.035,hip[2]),(s*.43,.535,knee[2]),(knee[0],knee[1]-.04,knee[2])],[.012,.012,.01],'skin',upper,8)
    for s in [-1,1]: pipe('sensory antenna',[(s*.16,.60,.39),(s*.25,.81,.60),(s*.32,.87,.70)],[.014,.008,.001],'bone','head',8)


def slab():
    start('slab'); human_skeleton(1.04,1.92,(0,2.04,.30),.60,.75,.31)
    shell('siege torso',[(0,.92,0,.33,.27),(0,1.14,-.01,.43,.33),(0,1.42,-.06,.55,.39),(0,1.75,-.05,.62,.42),(0,2.01,-.09,.58,.39),(0,2.24,-.12,.42,.32),(0,2.37,-.13,.16,.13)],seg=36,ripple=.018)
    for j in range(5):
        yy=1.3+j*.205
        ell('back scute',(0,yy,-.37),(.47-j*.016,.17,.16),'armour','chest',24,10)
    for s in [-1,1]:
        for j in range(3):
            ell('thoracic plate',(s*.26,1.64+j*.18,.27),(.275,.14,.165),'armour','chest',20,8)
    ell('iron visor',(0,2.03,.34),(.24,.17,.18),'dark','head')
    box('visor brow',(0,2.15,.44),(.44,.075,.10),'armour','head')
    ell('single furnace eye',(0,2.06,.511),(.095,.032,.018),'eye','head',20,8)
    for side,s in [('l',-1),('r',1)]:
        pipe('pillar thigh',[(s*.31,1.04,0),(s*.34,.74,.03),(s*.31,.52,.04)],[.19,.18,.14],'skin','thigh_'+side,18)
        ell('armoured knee',(s*.31,.52,.145),(.155,.18,.08),'armour','shin_'+side)
        pipe('pillar shin',[(s*.31,.52,.04),(s*.31,.30,-.01),(s*.31,.12,-.04)],[.14,.12,.13],'skin','shin_'+side,16)
        ell('weight bearing foot',(s*.31,.075,.075),(.185,.073,.25),'armour','foot_'+side)
        ell('shoulder nacelle',(s*.56,1.92,-.01),(.24,.22,.25),'armour','arm_'+side)
        pipe('upper siege arm',[(s*.60,1.92,0),(s*.68,1.6,.02),(s*.665,1.335,0)],[.16,.14,.13],'skin','arm_'+side,16)
    pipe('bracing forearm',[(-.665,1.335,0),(-.69,1.0,.045),(-.635,.75,.08)],[.16,.14,.10],'armour','fore_l',16)
    hands('l',-1,(-.635,.75,.08),1.4)
    # Right launcher terminates at the existing projectile origin exactly.
    pipe('mortar casing',[(.665,1.335,0),(.68,1.07,.18),(.68,.80,.43)],[.19,.22,.18],'armour','fore_r',20)
    ring('mortar muzzle',MUZZLES['slab'],.155,.025,'bone','fore_r')
    ell('mortar throat',(.68,.752,.485),(.132,.132,.018),'dark','fore_r',20,10)
    ring('mortar emitter',(.68,.752,.502),.081,.012,'eye','fore_r')
    for s in [-1,1]:
        pipe('hydraulic trunk',[(s*.5,1.90,-.19),(s*.65,1.64,-.20),(s*.63,1.33,-.045)],[.03,.025,.025],'dark','arm_'+('l' if s<0 else 'r'))


def wisp():
    start('wisp')
    bone('pelvis',(0,-.15,0),(0,0,0)); bone('spine',(0,-.15,0),(0,.1,0),'pelvis')
    bone('chest',(0,.05,0),(0,.23,0),'spine'); bone('head',(0,.14,.13),(0,.28,.16),'chest')
    bone('jaw',(0,-.1,.21),(0,-.2,.27),'head')
    ell('levitation bladder',(0,.035,-.04),(.31,.37,.255),'skin','spine',28,16)
    for s in [-1,1]:
        ell('split carapace',(s*.19,.07,-.03),(.14,.37,.26),'armour','chest',24,12)
        ring('gimbal',(.0,.035,-.04),.345,.019,'bone','chest',axis='x')
    ell('face plate',(0,.02,.212),(.17,.22,.072),'bone','head')
    for s in [-1,1]: ell('cold optic',(s*.077,.065,.283),(.040,.032,.011),'eye','head',16,8)
    ell('discharge mouth',(0,-.10,.331),(.048,.05,.016),'dark','head',16,8)
    ring('emitter lip',MUZZLES['wisp'],.048,.009,'bone','head')
    for side,s in [('l',-1),('r',1)]:
        bone('fin_'+side,(s*.24,.13,-.06),(s*.43,.25,-.12),'chest')
        shell('lateral fin',[(s*.24,-.24,-.04,.045,.095),(s*.38,-.08,-.11,.07,.11),(s*.40,.15,-.12,.085,.12),(s*.31,.35,-.10,.035,.08)],'armour','fin_'+side,seg=16)
    for j in range(5):
        x=(j-2)*.085
        name=f'tendril{j}'; bone(name,(x,-.20,-.035),(x,-.38,-.07),'pelvis')
        pipe('hanging sensor',[(x,-.20,-.035),(x*1.2,-.36,-.06),(x*1.1,-.49,-.005)],[.024,.017,.004],'skin',name,10)
        ell('sensor ember',(x*1.1,-.47,-.009),(.010,.017,.01),'eye',name,12,6)


def hierophant():
    start('hierophant'); human_skeleton(1.07,1.86,(0,2.12,.12),.30,1.10,.15)
    shell('layered ritual mantle',[(0,.14,-.025,.40,.29),(0,.36,-.015,.41,.28),(0,.75,-.01,.30,.23),(0,1.1,0,.23,.17),(0,1.38,0,.23,.16),(0,1.66,0,.31,.18),(0,1.85,.01,.34,.18),(0,2.00,.03,.12,.09)],'skin','spine',seg=40,ripple=.11)
    for j in range(8):
        ang=j*math.tau/8; x,z=math.cos(ang),math.sin(ang)
        pipe('mantle binding',[(x*.34,.24,z*.25),(x*.26,.9,z*.21),(x*.23,1.46,z*.17),(x*.29,1.81,z*.17)],[.012,.014,.012,.011],'armour','spine',8)
    for s in [-1,1]:
        ell('ceremonial pauldron',(s*.30,1.84,0),(.17,.135,.22),'armour','chest')
    face((0,2.12,.12),.9,'hierophant')
    for s in [-1,1]:
        pipe('split crown',[(s*.105,2.17,.04),(s*.17,2.33,0),(s*.10,2.46,-.035)],[.053,.041,.002],'bone','head',12)
        pipe('long sleeve',[(s*.30,1.86,0),(s*.40,1.55,.02),(s*.335,1.1,.08)],[.095,.12,.069],'skin','arm_'+('l' if s<0 else 'r'),14)
        hands('l' if s<0 else 'r',s,(s*.335,1.1,.08),.9)
    # Three anchored emitters preserve the old burst silhouette without a wide staff.
    for j,(x,z) in enumerate([(-.55,.07),(.55,.07),(0,-.43)]):
        n='halo'+str(j); bone(n,(x,1.90,z),(x,2.04,z),'chest')
        ell('orb housing',(x,1.95,z),(.092,.105,.086),'armour',n,20,10)
        ring('orb coil',(x,1.95,z+.07),.063,.012,'bone',n)
        ell('orb aperture',(x,1.95,z+.081),(.041,.052,.015),'eye',n,16,8)
        pipe('floating cable',[(x,1.92,z),(x*.75,1.81,z-.08),(x*.36,1.70,-.12)],[.018,.018,.012],'dark','chest',8)
    for side,s in [('l',-1),('r',1)]:
        pipe('concealed leg',[(s*.15,1.07,0),(s*.15,.53,.04),(s*.15,.12,-.04)],[.06,.045,.038],'dark','thigh_'+side,12)
        ell('ritual boot',(s*.15,.075,.06),(.075,.07,.16),'armour','foot_'+side,16,8)


def fiend():
    start('fiend'); human_skeleton(1.04,2.05,(0,2.36,.68),.53,.82,.26)
    shell('predatory torso',[(0,.90,-.01,.25,.23),(0,1.1,.02,.30,.25),(0,1.39,.10,.39,.31),(0,1.70,.22,.50,.34),(0,1.99,.27,.54,.35),(0,2.18,.30,.40,.28),(0,2.30,.40,.14,.13)],seg=36,ripple=.035)
    for s in [-1,1]:
        ell('pectoralis',(s*.22,1.95,.48),(.27,.27,.14),'skin','chest',24,12)
        for j in range(4):
            pipe('rib armour',[(s*.04,1.35+j*.14,.36+j*.018),(s*.27,1.40+j*.14,.38),(s*.42,1.47+j*.14,.26)],[.022,.027,.016],'bone','chest',10)
        ell('scapular shield',(s*.37,2.10,.01),(.25,.26,.22),'armour','chest')
    face((0,2.36,.68),1.48,'fiend')
    for s in [-1,1]:
        pipe('swept horn',[(s*.14,2.46,.56),(s*.31,2.59,.46),(s*.39,2.73,.57),(s*.35,2.82,.73)],[.067,.053,.024,.001],'bone','head',12)
    for side,s in [('l',-1),('r',1)]:
        pipe('upper predatory arm',[(s*.53,2.05,0),(s*.62,1.74,.08),(s*.595,1.435,0)],[.17,.145,.094],'skin','arm_'+side,18)
        ell('elbow shield',(s*.595,1.435,-.04),(.13,.13,.13),'armour','fore_'+side)
        pipe('forearm sinew',[(s*.595,1.435,0),(s*.59,1.12,.11),(s*.565,.82,.08)],[.12,.11,.062],'skin','fore_'+side,16)
        hands(side,s,(s*.565,.82,.08),1.7)
        pipe('digitigrade thigh',[(s*.26,1.04,0),(s*.28,.75,.16),(s*.26,.52,.04)],[.15,.13,.085],'skin','thigh_'+side,16)
        pipe('hock',[(s*.26,.52,.04),(s*.26,.32,-.16),(s*.26,.12,-.04)],[.086,.064,.065],'skin','shin_'+side,14)
        ell('split hoof',(s*.26,.072,.045),(.11,.07,.18),'bone','foot_'+side,20,10)
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
    remesh.voxel_size={'husk':.012,'crawler':.012,'slab':.019,'wisp':.010,'hierophant':.014,'fiend':.016}[kind]
    remesh.use_smooth_shade=True; remesh.adaptivity=0
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=mesh.modifiers.new('Dermal relaxation','SMOOTH'); smooth.factor=.6; smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    triangles=sum(len(p.vertices)-2 for p in mesh.data.polygons)
    if triangles>7500:
        dec=mesh.modifiers.new('Surface topology budget','DECIMATE'); dec.ratio=7500/triangles
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
    for polygon in mesh.data.polygons: polygon.use_smooth=True


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
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects: ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join()
        mesh=bpy.context.object; mesh.name=material.replace('.','_')+'_'+kind
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        if material=='enemy.skin': fuse_skin(mesh,kind)
        mesh.parent=rig
        modifier=mesh.modifiers.new('Authored deform rig','ARMATURE'); modifier.object=rig
        mesh['authoredSpecies']=kind
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.008)
        bpy.ops.object.mode_set(mode='OBJECT')
        # Surface grain is millimetre detail rather than large reptile scales.
        uv_scale=3 if material=='enemy.skin' else 2 if material in ('enemy.bone','enemy.armour') else 1
        for loop in mesh.data.uv_layers.active.data: loop.uv *= uv_scale
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
    for key,path in [('skin','dermal.webp'),('armour','carapace.webp'),('bone','titanium.webp')]:
        image_path=ROOT/('public/modern/roster/materials' if key=='armour' else 'public/modern/textures')/path
        if not image_path.exists(): image_path=ROOT/'public/modern/textures/titanium.webp'
        image=bpy.data.images.load(str(image_path),check_existing=True)
        material=M[key]; nodes=material.node_tree.nodes
        tex=nodes.new('ShaderNodeTexImage'); tex.image=image
        mix=nodes.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1
        mix.inputs[2].default_value=material.diffuse_color
        material.node_tree.links.new(tex.outputs['Color'],mix.inputs[1])
        material.node_tree.links.new(mix.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
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
    cam=(height*1.9,target[1]+height*.5,height*3.5)
    bpy.ops.object.camera_add(location=gv(cam)); camera=bpy.context.object; a.look_at(camera,target)
    camera.data.type='ORTHO'; camera.data.ortho_scale=height*1.35 if kind!='crawler' else 2.6
    scene.camera=camera
    for name,power,color,pos,size in [('key',500,(.80,.89,1),(3,4,4),3),('rim',650,(.27,.67,.8),(-3,3,-2),2),('fill',200,(1,.71,.45),(-3,2,3),3)]:
        bpy.ops.object.light_add(type='AREA',location=gv(pos)); ob=bpy.context.object; ob.name='PREVIEW '+name
        ob.data.energy=power; ob.data.color=color; ob.data.size=size; a.look_at(ob,target)
    floor=a.material('PREVIEW floor',(.025,.035,.04),0,.8)
    a.box('PREVIEW floor',(0,-.55 if kind=='wisp' else -.04,0),(200,.05,200),floor,bevel=0)
    scene.render.filepath=str(SOURCE/(kind+'-preview.png')); bpy.ops.render.render(write_still=True)


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
