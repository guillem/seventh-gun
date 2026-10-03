"""Author the seven experimental weapons as editable Blender assets.

Game coordinates are metres, X right / Y up / -Z bore. Saved glTF objects and
three authored NLA actions are loaded by the game, never constructed at runtime.
Run: blender -b --factory-startup --threads 4 --python tools/modern-art/build_weapons.py
"""
from __future__ import annotations
import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art/modern/roster/weapons'
DEST=ROOT/'public/modern/roster/weapons'
spec=importlib.util.spec_from_file_location('asset_helpers',Path(__file__).with_name('build_assets.py'))
h=importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
NAMES=['Viper Pistol','Ripjaw Shotgun','Hornet Chaingun','Spiker','Bile Launcher','Sunlance','The Seventh']
INTERVALS=[.30,1.05,.095,.22,1.15,1.05,1.35]
FPS=200  # exact millisecond-aligned authored fire intervals, including 95ms Hornet
COLORS=[(.9,.62,.24),(1,.30,.09),(1,.67,.23),(.75,.43,1),(.49,.8,.11),(.3,.86,1),(.53,.16,1)]


def tube(name,points,radius,mat,parent=None,sides=8):
    """Low-density rounded sweep with tapered closed ends and curved centerline."""
    points=[Vector(p) for p in points]
    verts=[]
    for i,p in enumerate(points):
        tangent=(points[min(len(points)-1,i+1)]-points[max(0,i-1)]).normalized()
        side=tangent.cross(Vector((0,1,0)))
        if side.length<.01: side=tangent.cross(Vector((1,0,0)))
        side.normalize(); up=tangent.cross(side).normalized()
        r=radius*(.75 if i in [0,len(points)-1] else 1)
        for j in range(sides):
            a=math.tau*j/sides; verts.append(tuple(p+r*(side*math.cos(a)+up*math.sin(a))))
    faces=[tuple(range(sides-1,-1,-1))]
    for i in range(len(points)-1):
        for j in range(sides): faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.append(tuple(range((len(points)-1)*sides,len(points)*sides)))
    return h.mesh(name,verts,faces,mat,parent,smooth=True)


def ring(name,p,r,thick,mat,parent,axis='z',segments=28):
    verts=[]
    for i in range(segments):
        a=math.tau*i/segments
        for j in range(6):
            b=math.tau*j/6; rr=r+thick*math.cos(b); depth=thick*math.sin(b)
            v=(rr*math.cos(a),rr*math.sin(a),depth)
            if axis=='x': v=(depth,v[0],v[1])
            if axis=='y': v=(v[0],depth,v[1])
            verts.append(tuple(p[k]+v[k] for k in range(3)))
    faces=[(i*6+j,((i+1)%segments)*6+j,((i+1)%segments)*6+(j+1)%6,i*6+(j+1)%6) for i in range(segments) for j in range(6)]
    return h.mesh(name,verts,faces,mat,parent,smooth=True)


def palette(gun_id):
    return {k:h.material('weapon.'+k,c,m,r,e) for k,c,m,r,e in [
        ('metal',(.37,.42,.43),.82,.31,0),('edge',(.60,.64,.61),.86,.25,0),
        ('dark',(.04,.052,.056),.68,.41,0),('grip',(.09,.102,.087),.05,.78,0),
        ('accent',COLORS[gun_id-1],.1,.36,1.7),('ceramic',(.43,.40,.32),.25,.58,0),
        ('engraving',(.57,.59,.51),.3,.5,0),('brass',(.43,.26,.07),.76,.34,0),
    ]}|{k:h.material('hand.'+k,c,m,r) for k,c,m,r in [
        ('glove',(.19,.205,.173),0,.76),('fabric',(.13,.15,.107),0,.93),
        ('stitch',(.3,.32,.25),0,.90),('pad',(.075,.085,.074),.01,.71)]}


def fastener(p,mat,parent,axis='x',r=.004):
    q=list(p); q['xyz'.index(axis)]+=.0017
    h.cylinder('Recessed Torx fastener',p,q,r,mat,parent,segments=8)
    ring('Fastener seat',p,r*1.45,.001,mat,parent,axis,16)


def rail(y,z,length,p,parent):
    h.box('Integral sight rail',(0,y,z),(.037,.009,length),p['dark'],parent,.002)
    for i in range(round(length/.025)):
        h.box('Rail saddle',(0,y+.006,z+length/2-.010-i*.025),(.045,.007,.012),p['metal'],parent,.001)


def barrel(zfront,zback,y,r,p,parent,shroud=False):
    h.cylinder('Cold forged bore',(0,y,zfront+.006),(0,y,zback),r,p['dark'],parent,segments=24)
    ring('Machined muzzle lip',(0,y,zfront),r*.89,.0035,p['edge'],parent)
    h.cylinder('Deep bore shadow',(0,y,zfront-.0004),(0,y,zfront+.001),r*.65,p['dark'],parent,segments=24)
    if shroud:
        for i in range(3): ring('Barrel collar',(0,y,zfront+.035+i*.048),r*1.14,.004,p['metal'],parent)


def grip(p,parent,z=.03):
    h.side_profile('Contoured grip chassis',[(-.015,z+.018),(-.025,z-.054),(-.173,z-.008),(-.194,z+.061),(-.172,z+.092),(-.060,z+.066)],.057,p['dark'],parent,.007)
    for s in [-1,1]:
        h.side_profile('Grip panel',[(-.052,z+.034),(-.059,z-.026),(-.164,z+.008),(-.172,z+.053),(-.119,z+.065)],.004,p['grip'],parent,.003,x=s*.030)
        for y,zz in [(-.066,z+.013),(-.153,z+.039)]: fastener((s*.033,y,zz),p['edge'],parent,r=.003)
    h.box('Magazine heel',(0,-.183,z+.036),(.070,.025,.078),p['dark'],parent,.005)
    tube('Rounded trigger guard',[(0,-.017,z-.05),(0,-.056,z-.085),(0,-.061,z-.143),(0,-.029,z-.168),(0,-.01,z-.162)],.006,p['dark'],parent)
    h.box('Trigger shoe',(0,-.029,z-.079),(.009,.033,.008),p['metal'],parent,.003)


def hands(p,parent,support_z=None):
    """Anatomical closed grip: separated trigger finger, three curled digits,
    opposed thumb, metacarpal padding and taper from wrist to fabric forearm.
    The support hand uses an open cradle around the weapon's forend.
    """
    hands=h.group('hands',parent=parent)
    hand=h.group('right_hand',parent=hands)
    h.shell('Tapered right palm',[(.047,-.145,.078,.026,.027),(.050,-.115,.044,.033,.045),(.048,-.065,.032,.035,.047),(.041,-.039,.038,.025,.034)],p['glove'],hand,segments=16)
    for k in range(3):
        y=-.075-k*.026; z=-.018+k*.010
        path=[(.067,y,.025),(.064,y,z),(.047,y-.003,z-.018),(.018,y-.006,z-.022),(-.024,y-.011,z-.009),(-.029,y-.016,z+.020)]
        tube('Articulated gripping finger',path,.0105-k*.0005,p['glove'],hand,10)
        h.ellipsoid('Padded finger knuckle',(.071,y,.002),(.009,.009,.016),p['pad'],hand,12,6)
        tube('Finger topstitch',[(x,y+.006,z-.006) for x,y,z in path[:4]],.0008,p['stitch'],hand,5)
    tube('Trigger index finger',[(.053,-.041,.035),(.067,-.027,-.009),(.055,-.021,-.055),(.026,-.025,-.088),(.006,-.032,-.089)],.010,p['glove'],hand,12)
    tube('Opposed right thumb',[(.041,-.091,.086),(.017,-.052,.054),(-.021,-.039,.018),(-.030,-.050,-.017)],.013,p['glove'],hand,12)
    for k in range(3):
        h.ellipsoid('Flexible metacarpal pad',(.077,-.072-k*.026,.041),(.010,.010,.023),p['pad'],hand,12,6)
    forearm(p,hand,(.053,-.140,.083),(.156,-.26,.37),1)
    left=h.group('left_hand',parent=hands)
    if support_z is None:
        # Support palm wraps the free left side of the pistol grip, below trigger.
        h.ellipsoid('Support palm',(-.053,-.115,.045),(.027,.059,.037),p['glove'],left,16,8)
        for k in range(4):
            y=-.084-k*.022; z=-.042+k*.009
            tube('Support curled finger',[(-.066,y,.023),(-.069,y,z),(-.046,y-.008,z-.018),(-.004,y-.010,z-.022),(.032,y-.012,z-.006)],.0094,p['glove'],left,10)
        tube('Support thumb',[(-.074,-.099,.061),(-.071,-.056,.012),(-.058,-.043,-.054)],.012,p['glove'],left,12)
        forearm(p,left,(-.057,-.152,.08),(-.170,-.265,.35),-1)
    else:
        z=support_z
        h.ellipsoid('Support palm beneath forend',(-.013,-.070,z),(.050,.026,.060),p['glove'],left,16,8)
        for k in range(4):
            zz=z-.045+k*.027
            tube('Support cradle finger',[(-.049,-.068,zz),(-.018,-.089,zz),(.028,-.075,zz),(.052,-.044,zz),(.045,-.018,zz+.004)],.011-k*.0007,p['glove'],left,10)
        tube('Forend support thumb',[(-.053,-.065,z+.050),(-.065,-.023,z+.015),(-.058,.007,z-.036)],.013,p['glove'],left,12)
        forearm(p,left,(-.038,-.086,z+.041),(-.18,-.24,.27),-1)
    return hands


def forearm(p,parent,a,b,side):
    a,b=Vector(a),Vector(b); v=b-a
    h.cylinder('Leather wrist cuff',a,a+v*.24,.030,p['glove'],parent,r2=.044,segments=16)
    tangent=v.normalized(); right=tangent.cross(Vector((0,1,0))).normalized(); up=tangent.cross(right).normalized()
    vertices=[]; sections=[(.20,.043),(.26,.043),(.32,.047),(.38,.045),(.46,.051),(.53,.048),(.61,.057),(.69,.054),(.79,.064),(.89,.064),(1,.07)]
    for i,(t,r) in enumerate(sections):
        center=a+v*t+Vector((side*.012*math.sin(t*math.pi),-.008*math.sin(t*math.pi),0))
        for j in range(20):
            angle=math.tau*j/20
            # Fine asymmetric folds are sculpted into the continuous sleeve,
            # avoiding stacked torus bands or disconnected cuffs.
            radius=r*(1+.06*math.sin(angle*3+i*.8))
            vertices.append(tuple(center+right*math.cos(angle)*radius+up*math.sin(angle)*radius*.88))
    faces=[tuple(range(19,-1,-1))]
    for i in range(len(sections)-1):
        for j in range(20): faces.append((i*20+j,i*20+(j+1)%20,(i+1)*20+(j+1)%20,(i+1)*20+j))
    faces.append(tuple(range((len(sections)-1)*20,len(sections)*20)))
    h.mesh('Continuous tailored fabric sleeve',vertices,faces,p['fabric'],parent,smooth=True)
    tube('Sleeve lengthwise reinforced seam',[tuple(a+v*t+right*r*.96) for t,r in sections],.0011,p['stitch'],parent,6)
    at=a+v*.20
    h.box('Velcro glove wrist tab',(at.x+side*.031,at.y+.008,at.z),(.014,.031,.051),p['pad'],parent,.004)
    tube('Cuff stitched seam',[tuple(a+v*.12+Vector((side*.028,.012,-.005))),tuple(a+v*.26+Vector((side*.040,.012,0))),tuple(a+v*.38+Vector((side*.043,.012,0)))],.0012,p['stitch'],parent,6)


def receiver(p,parent,length=.28,width=.086):
    h.side_profile('Machined receiver',[(.018,.095),(.085,.061),(.092,-length+.10),(.059,-length),(-.025,-length),(-.039,-.12),(-.019,.090)],width,p['metal'],parent,.005)
    for s in [-1,1]:
        h.box('Receiver relief',(s*(width/2+.001),.041,-.059),(.002,.032,length*.55),p['dark'],parent,.003)
        for z in [.052,-length+.035]: fastener((s*(width/2+.003),.047,z),p['edge'],parent)
    h.box('Recessed ejection opening',(.043,.064,.006),(.003,.027,.071),p['dark'],parent,.003)
    h.box('Chamber closure',(.045,.058,-.008),(.004,.014,.034),p['edge'],parent,.001)
    h.text_label('Asset serial', 'SG / 07',(.046,.079,-.119),.009,p['engraving'],parent)


def pistol(p,gun,mechanism):
    grip(p,gun)
    h.side_profile('Forged service pistol frame',[(.021,.079),(.028,-.267),(-.005,-.291),(-.026,-.261),(-.029,-.112),(-.011,.061)],.065,p['dark'],gun,.004)
    h.side_profile('Sculpted slide with tapered nose',[(.036,.075),(.094,.044),(.096,-.219),(.080,-.298),(.037,-.299)],.076,p['metal'],mechanism,.006)
    for s in [-1,1]:
        for i in range(7):
            h.side_profile('Rear slide serration',[(.043,.050-i*.011),(.082,.034-i*.011),(.082,.038-i*.011),(.043,.054-i*.011)],.002,p['dark'],mechanism,.0005,x=s*.0385)
        h.side_profile('Milled slide bevel',[(.050,-.077),(.078,-.083),(.077,-.233),(.052,-.263)],.003,p['dark'],mechanism,.002,x=s*.038)
        h.box('Cut flank panel',(s*.040,.063,-.170),(.001,.015,.157),p['metal'],mechanism,.002)
        for i in range(3):
            h.box('Front cooling slot',(s*.041,.063,-.195-i*.026),(.002,.016,.007),p['dark'],mechanism,.001)
        fastener((s*.035,-.005,.032),p['edge'],gun,r=.0045)
        h.box('Ambidextrous slide catch',(s*.041,.007,.027),(.008,.009,.035),p['metal'],gun,.002)
    h.box('Ejection port',(0,.097,-.061),(.038,.002,.059),p['dark'],mechanism,.003)
    h.box('Barrel chamber hood',(0,.098,-.064),(.027,.003,.046),p['edge'],gun,.002)
    rail(-.036,-.213,.106,p,gun)
    h.box('Rear sight',(0,.106,.040),(.054,.016,.021),p['dark'],mechanism,.002)
    h.box('Sight notch',(0,.110,.034),(.015,.010,.018),p['metal'],mechanism,.001)
    h.box('Front sight',(0,.107,-.270),(.009,.016,.017),p['dark'],mechanism,.002)
    for x in [-.020,.020]: h.ellipsoid('Rear sight insert',(x,.110,.052),(.0025,.0025,.002),p['accent'],mechanism,10,6)
    h.ellipsoid('Front sight insert',(0,.114,-.260),(.0025,.0025,.002),p['accent'],mechanism,10,6)
    h.text_label('Viper engraved model','VIPER',(.041,.084,-.104),.011,p['engraving'],mechanism)
    barrel(-.326,-.245,.057,.019,p,gun)
    return (.057,-.329,None)


def shotgun(p,gun,mechanism):
    grip(p,gun); receiver(p,gun,.23,.084)
    barrel(-.620,-.22,.065,.024,p,gun,True)
    h.cylinder('Magazine tube',(0,.012,-.575),(0,.012,-.19),.017,p['dark'],gun,segments=24)
    ring('Magazine end',(0,.012,-.575),.016,.003,p['edge'],gun)
    h.side_profile('Pump forend',[(-.022,-.230),(.023,-.241),(.018,-.449),(-.030,-.456),(-.042,-.423),(-.042,-.245)],.094,p['grip'],mechanism,.008)
    for i in range(7):
        h.box('Pump grip rib',(0,-.01,-.265-i*.025),(.102,.061,.010),p['dark'],mechanism,.004)
    for s in [-1,1]:
        h.box('Pump guide rod',(s*.029,-.005,-.258),(.006,.008,.245),p['metal'],mechanism,.002)
    h.side_profile('Skeleton buttstock',[(.063,.10),(.043,.315),(-.104,.322),(-.099,.286),(-.011,.263),(-.001,.10)],.064,p['dark'],gun,.005)
    h.box('Rubber buttpad',(0,-.026,.314),(.076,.177,.033),p['grip'],gun,.005)
    for i in range(3):
        z=.063-i*.047
        h.cylinder('Shell carrier cartridge',(-.061,-.014,z),(-.061,.054,z),.011,p['brass'],gun,segments=12)
    rail(.099,-.069,.165,p,gun)
    h.box('Front bead',(0,.095,-.565),(.009,.017,.012),p['accent'],gun,.003)
    return (.065,-.626,-.31)


def chaingun(p,gun,mechanism):
    grip(p,gun); receiver(p,gun,.225,.132)
    h.cylinder('Feed motor',(0,.055,-.201),(0,.055,-.31),.081,p['dark'],gun,segments=24)
    for z in [-.301,-.494]: ring('Rotor bearing collar',(0,.055,z),.068,.011,p['metal'],mechanism)
    for i in range(6):
        a=math.tau*i/6; x=math.cos(a)*.046; y=.055+math.sin(a)*.046
        h.cylinder('Six forged rotating barrels',(x,y,-.548),(x,y,-.269),.014,p['dark'],mechanism,segments=16)
        ring('Barrel crown',(x,y,-.550),.012,.0025,p['edge'],mechanism,segments=16)
    h.cylinder('Drive shaft',(0,.055,-.547),(0,.055,-.245),.016,p['metal'],mechanism,segments=16)
    h.box('Feed cassette',(-.103,-.004,-.046),(.087,.168,.173),p['dark'],gun,.015)
    h.box('Feed cassette cover',(-.149,.000,-.046),(.009,.136,.131),p['ceramic'],gun,.008)
    tube('Feed cable',[(-.125,.088,-.099),(-.158,.107,.028),(-.104,.059,.104),(-.064,.019,.086)],.009,p['grip'],gun)
    for i in range(5):
        h.cylinder('Belt cartridge',(-.068-i*.018,-.087,.013),(-.068-i*.018,-.087,-.046),.006,p['brass'],gun,segments=12)
    h.box('Heavy support forend',(0,-.047,-.214),(.085,.056,.126),p['grip'],gun,.009)
    rail(.122,-.09,.169,p,gun)
    h.box('Motor status diode',(.072,.083,.044),(.002,.008,.022),p['accent'],gun,.001)
    return (.055,-.557,-.205)


def spiker(p,gun,mechanism):
    grip(p,gun); receiver(p,gun,.259,.084)
    h.box('Linear accelerator housing',(0,.057,-.335),(.074,.081,.238),p['dark'],gun,.009)
    for s in [-1,1]:
        h.box('Ceramic guide rail',(s*.045,.056,-.335),(.013,.046,.260),p['ceramic'],gun,.004)
        for i in range(5):
            h.box('Accelerator coil saddle',(s*.049,.057,-.229-i*.046),(.020,.065,.014),p['metal'],gun,.003)
    barrel(-.479,-.402,.059,.013,p,gun)
    h.box('Magazine well',(0,-.061,-.088),(.065,.051,.077),p['dark'],gun,.005)
    h.side_profile('Nail magazine',[(-.063,-.135),(-.072,-.059),(-.227,-.025),(-.237,-.096)],.050,p['metal'],gun,.007)
    for s in [-1,1]:
        for i in range(5): h.box('Magazine witness channel',(s*.026,-.090-i*.024,-.091+i*.005),(.002,.007,.039),p['dark'],gun,.001)
    h.box('Reciprocating bolt',(0,.112,-.083),(.033,.016,.11),p['metal'],mechanism,.004)
    h.cylinder('Charging lever',(.040,.080,.010),(.086,.080,.010),.006,p['edge'],mechanism,segments=12)
    rail(.112,-.154,.114,p,gun)
    for i in range(3): h.box('Charge status bar',(.045,.077,-.23-i*.035),(.003,.009,.020),p['accent'],gun,.001)
    h.box('Forend cradle',(0,-.006,-.316),(.080,.026,.145),p['grip'],gun,.005)
    return (.059,-.484,-.319)


def bile(p,gun,mechanism):
    grip(p,gun); receiver(p,gun,.193,.106)
    h.cylinder('Rotating sealed chamber',(0,.020,-.227),(0,.020,-.069),.099,p['dark'],mechanism,segments=32)
    for z in [-.229,-.067]: ring('Chamber retaining flange',(0,.020,z),.099,.007,p['metal'],mechanism)
    for i in range(6):
        a=math.tau*i/6; x=math.cos(a)*.080; y=.020+math.sin(a)*.080
        h.cylinder('Pressure cartridge',(x,y,-.201),(x,y,-.082),.023,p['ceramic'],mechanism,segments=16)
        h.cylinder('Cartridge witness window',(x*1.07,.020+(y-.020)*1.07,-.172),(x*1.07,.020+(y-.020)*1.07,-.135),.014,p['accent'],mechanism,segments=12)
    barrel(-.467,-.216,.061,.049,p,gun,True)
    h.side_profile('Protective chamber bridge',[(.118,.04),(.125,-.250),(.102,-.259),(.099,.036)],.052,p['metal'],gun,.004)
    h.box('Front cradle',(0,-.015,-.327),(.098,.060,.130),p['grip'],gun,.008)
    tube('Pressure return line',[(.065,.108,.014),(.092,.151,-.095),(.093,.140,-.245),(.056,.091,-.323)],.008,p['dark'],gun)
    ring('Pressure gauge housing',(.072,.137,.031),.026,.004,p['metal'],gun,axis='x')
    h.cylinder('Pressure gauge face',(.072,.137,.031),(.077,.137,.031),.023,p['ceramic'],gun,segments=24)
    tube('Gauge indicator',[(.079,.137,.031),(.079,.149,.025)],.0016,p['dark'],gun)
    return (.061,-.473,-.324)


def sunlance(p,gun,mechanism):
    grip(p,gun); receiver(p,gun,.274,.079)
    h.cylinder('Electromagnetic guide tube',(0,.064,-.574),(0,.064,-.220),.021,p['dark'],gun,segments=24)
    for i in range(3):
        z=-.304-i*.094
        ring('Three exposed accelerator coils',(0,.064,z),.043,.007,p['accent'],gun)
        ring('Coil armored retainer',(0,.064,z-.014),.047,.006,p['metal'],gun)
        for s in [-1,1]: h.box('Coil support spar',(s*.042,.046,z+.037),(.008,.020,.085),p['dark'],gun,.002)
    h.box('Ceramic discharge jaws',(0,.065,-.570),(.066,.063,.046),p['ceramic'],gun,.009)
    barrel(-.599,-.563,.064,.017,p,gun)
    h.box('Capacitor module',(0,-.052,-.047),(.080,.065,.167),p['dark'],gun,.007)
    for i in range(5): h.box('Capacitor cooling plate',(0,-.050,-.097+i*.025),(.093,.063,.009),p['metal'],gun,.003)
    h.cylinder('Optical sight',(0,.155,-.004),(0,.155,-.188),.025,p['dark'],gun,segments=24)
    for z in [-.194,.001]: ring('Optic bezel',(0,.155,z),.026,.004,p['metal'],gun)
    h.cylinder('Amber optic glass',(0,.155,.003),(0,.155,.005),.021,p['accent'],gun,segments=24)
    h.box('Scope mounting shoe',(0,.114,-.079),(.043,.031,.110),p['metal'],gun,.003)
    h.box('Capacitor reset carriage',(0,.102,-.020),(.026,.017,.060),p['metal'],mechanism,.003)
    h.box('Insulated forend',(0,.008,-.245),(.070,.039,.099),p['grip'],gun,.007)
    return (.064,-.604,-.242)


def seventh(p,gun,mechanism):
    grip(p,gun); receiver(p,gun,.226,.127)
    h.ellipsoid('Void containment core',(0,.086,-.159),(.067,.071,.067),p['accent'],mechanism,24,12)
    for axis in ['x','z']:
        ring('Containment gimbal',(0,.086,-.159),.088,.009,p['metal'],mechanism,axis)
    for s in [-1,1]:
        h.side_profile('Swept ceramic containment wing',[(.019,-.03),(.145,-.089),(.164,-.230),(.076,-.349),(.018,-.301)],.021,p['ceramic'],gun,.009,x=s*.089)
        tube('Containment cable',[(s*.095,.029,.014),(s*.141,.099,-.120),(s*.125,.040,-.304),(s*.059,.031,-.360)],.009,p['dark'],gun)
        for i in range(3): h.box('Field gradient indicator',(s*.102,.119-i*.024,-.117-i*.029),(.004,.010,.018),p['accent'],gun,.001)
    h.cylinder('Discharge throat',(0,.055,-.506),(0,.055,-.271),.055,p['dark'],gun,segments=28)
    for i in range(3): ring('Flared containment crown',(0,.055,-.437-i*.040),.063+i*.006,.007,p['metal'],gun)
    ring('Active aperture',(0,.055,-.522),.047,.005,p['accent'],gun)
    h.cylinder('Aperture darkness',(0,.055,-.524),(0,.055,-.523),.036,p['dark'],gun,segments=28)
    h.box('Shielded foregrip',(0,-.041,-.272),(.085,.048,.124),p['grip'],gun,.009)
    return (.055,-.530,-.28)


BUILDERS=[pistol,shotgun,chaingun,spiker,bile,sunlance,seventh]


def authored_action(node,name,keys,seconds):
    node.animation_data_create()
    action=bpy.data.actions.new(name+'__'+node.name)
    node.animation_data.action=action
    for t,pos,rot in keys:
        node.location=h.gv(pos)
        # Game X/Y/Z rotation axes map to Blender X/Z/-Y.
        node.rotation_euler=(rot[0],-rot[2],rot[1])
        node.keyframe_insert('location',frame=t*FPS)
        node.keyframe_insert('rotation_euler',frame=t*FPS)
    track=node.animation_data.nla_tracks.new(); track.name=name
    strip=track.strips.new(name,0,action); strip.action_frame_start=0; strip.action_frame_end=seconds*FPS
    node.animation_data.action=None
    node.location=(0,0,0); node.rotation_euler=(0,0,0)


def animate(gun_id,motion,equip,recoil,mechanism,left_hand):
    authored_action(motion,'idle',[(0,(0,0,0),(0,0,0)),(1.2,(.001,.0015,0),(.003,0,.002)),(2.4,(0,0,0),(0,0,0)),(3.6,(-.001,-.0015,0),(-.003,0,-.002)),(4.8,(0,0,0),(0,0,0))],4.8)
    authored_action(equip,'equip',[(0,(.035,-.23,.19),(-.55,.09,-.15)),(.18,(.008,-.048,.023),(-.10,.015,-.04)),(.30,(0,.004,-.006),(.013,0,.008)),(.45,(0,0,0),(0,0,0))],.45)
    dur=INTERVALS[gun_id-1]; peak=min(.035,dur*.20)
    amplitude=[.031,.062,.020,.034,.045,.039,.047][gun_id-1]
    authored_action(recoil,'fire',[(0,(0,0,0),(0,0,0)),(peak,(0,.008,amplitude),(.045,0,-.007)),(dur*.38,(0,.002,amplitude*.22),(.013,0,.002)),(dur,(0,0,0),(0,0,0))],dur)
    if gun_id==3:
        authored_action(mechanism,'fire',[(0,(0,0,0),(0,0,0)),(dur,(0,0,0),(0,0,math.tau/6))],dur)
    elif gun_id==5:
        authored_action(mechanism,'fire',[(0,(0,0,0),(0,0,0)),(dur*.32,(0,0,0),(0,0,0)),(dur*.65,(0,0,0),(0,0,math.tau/6)),(dur,(0,0,0),(0,0,math.tau/6))],dur)
    elif gun_id==7:
        authored_action(mechanism,'fire',[(0,(0,0,0),(0,0,0)),(dur*.30,(0,0,0),(0,0,.12)),(dur*.60,(0,0,0),(0,0,-.05)),(dur,(0,0,0),(0,0,0))],dur)
    else:
        peakz=.05 if gun_id==2 else .037
        t1,t2=(.30,.54) if gun_id==2 else (peak,min(dur*.32,.09))
        keys=[(0,(0,0,0),(0,0,0)),(t1,(0,0,peakz),(0,0,0)),(t2,(0,0,peakz*.95),(0,0,0)),(max(t2+.03,dur*.75),(0,0,0),(0,0,0)),(dur,(0,0,0),(0,0,0))]
        authored_action(mechanism,'fire',keys,dur)
        if gun_id==2: authored_action(left_hand,'fire',keys,dur)
    bpy.context.scene.frame_set(0)


def build(gun_id):
    h.reset(); bpy.context.scene.render.fps=FPS
    root=h.group('weapon_'+str(gun_id)); motion=h.group('weapon_motion',parent=root)
    equip=h.group('equip_motion',parent=motion); recoil=h.group('recoil_motion',parent=equip)
    gun=h.group('weapon',parent=recoil); mechanism=h.group('mechanism',parent=gun)
    p=palette(gun_id); y,z,support=BUILDERS[gun_id-1](p,gun,mechanism)
    h.group('muzzle',(0,y,z),gun)
    hands(p,recoil,support)
    if gun_id in [3,5,7]:
        pivot=(0,{3:.055,5:.020,7:.086}[gun_id],-.159 if gun_id==7 else 0)
        pivot_node=h.group('mechanism_pivot',pivot,gun); mechanism.parent=pivot_node
        for child in list(mechanism.children): child.location-=h.gv(pivot)
    h.optimize(root)
    animate(gun_id,motion,equip,recoil,mechanism,bpy.data.objects['left_hand'])
    animation_nodes=[o for o in bpy.context.scene.objects if o.animation_data and o.animation_data.nla_tracks]
    root['description']=NAMES[gun_id-1]+'; authored mechanical assembly, paired gloved hands, cosmetic NLA actions.'
    root['id']=gun_id; root['boreDirection']='-Z'; root['units']='meters'
    # Keep the editable source at rest. NLA actions remain stored but muted in
    # source view until animation playback is intentionally enabled.
    for node in animation_nodes:
        for track in node.animation_data.nla_tracks: track.mute=True
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(str(gun_id)+'.blend')),compress=True)
    for node in animation_nodes:
        for track in node.animation_data.nla_tracks: track.mute=True
        node.location=(0,0,0); node.rotation_euler=(0,0,0)
    bpy.ops.export_scene.gltf(filepath=str(DEST/(str(gun_id)+'.glb')),export_format='GLB',export_yup=True,
        export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',
        export_force_sampling=True,export_anim_slide_to_zero=True,export_cameras=False,export_lights=False,
        export_extras=True,export_apply=True)
    for node in animation_nodes:
        for track in node.animation_data.nla_tracks: track.mute=True
    bpy.context.scene.frame_set(0)
    for node in animation_nodes: node.location=(0,0,0); node.rotation_euler=(0,0,0)
    triangles=0
    for o in bpy.context.scene.objects:
        if o.type=='MESH': o.data.calc_loop_triangles(); triangles+=len(o.data.loop_triangles)
    return {'id':gun_id,'name':NAMES[gun_id-1],'triangles':triangles,'bytes':(DEST/(str(gun_id)+'.glb')).stat().st_size,'muzzle':[0,y,z],'clips':['idle','fire','equip'],'fireDuration':INTERVALS[gun_id-1]}


def preview(gun_id):
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=24; scene.cycles.use_denoising=True
    scene.render.resolution_x=1000; scene.render.resolution_y=700; scene.render.resolution_percentage=100
    scene.world.color=(.17,.17,.17); scene.view_settings.view_transform='AgX'
    bpy.ops.object.camera_add(location=h.gv((.78,.45,.75))); cam=bpy.context.object
    h.look_at(cam,(0,-.06,-.12)); cam.data.type='ORTHO'; cam.data.ortho_scale=1.18; scene.camera=cam
    for power,pos,color in [(110,(1,1.6,.7),(.8,.9,1)),(160,(-.7,1,-1),(.3,.7,.8)),(45,(-1,.7,.7),(1,.7,.4))]:
        bpy.ops.object.light_add(type='AREA',location=h.gv(pos)); light=bpy.context.object; light.data.energy=power; light.data.color=color; light.data.shape='DISK'; light.data.size=1.5; h.look_at(light,(0,0,-.12))
    scene.render.film_transparent=True; scene.render.filepath=str(SOURCE/(str(gun_id)+'-preview.png')); bpy.ops.render.render(write_still=True)


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--id',type=int,choices=range(1,8)); parser.add_argument('--preview',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    SOURCE.mkdir(parents=True,exist_ok=True); DEST.mkdir(parents=True,exist_ok=True)
    manifests=[]
    for gun_id in [args.id] if args.id else range(1,8):
        manifests.append(build(gun_id))
        if args.preview: preview(gun_id)
    path=SOURCE/'manifest.json'; existing=json.loads(path.read_text()) if path.exists() else []
    merged={x['id']:x for x in existing}; merged.update({x['id']:x for x in manifests}); path.write_text(json.dumps(list(merged.values()),indent=2)+'\n')
    print('WEAPON_MANIFEST '+json.dumps(manifests))

if __name__=='__main__': main()
