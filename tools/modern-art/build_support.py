"""Offline saved pickup props and a five-material skinned arena marine.

The marine uses the game's existing remote-player pivots and animation timings.
All Blender materials and topology are saved; runtime only clones/tints/poses.
"""
import importlib.util
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art/modern/roster/support'; DEST=ROOT/'public/modern/roster/support'
spec=importlib.util.spec_from_file_location('weapon_helpers',Path(__file__).with_name('build_weapons.py'))
w=importlib.util.module_from_spec(spec); spec.loader.exec_module(w); h=w.h


def pickup_materials():
    return {key:h.material('support.'+key,c,m,r,e) for key,c,m,r,e in [
        ('metal',(.39,.43,.43),.72,.33,0),('dark',(.035,.045,.047),.35,.60,0),
        ('case',(.26,.28,.21),.08,.79,0),('accent',(.75,.8,.72),.15,.4,.65),
        ('medical',(.82,.84,.75),.1,.63,0),('medicalCross',(.1,.65,.28),0,.60,.35),
        ('gold',(.65,.42,.10),.72,.32,0),('bone',(.70,.64,.44),.15,.62,0),
    ]}


def pickups(root,p):
    kit=h.group('medikit',parent=root)
    h.box('Molded emergency case',(0,.29,0),(.55,.30,.43),p['medical'],kit,.030)
    h.box('Lid seal',(0,.402,0),(.562,.019,.441),p['dark'],kit,.008)
    h.box('Reinforced upper lid',(0,.44,0),(.55,.070,.43),p['medical'],kit,.022)
    for s in [-1,1]:
        for z in [-.158,.158]: h.box('Rubber impact bumper',(s*.238,.31,z),(.085,.25,.10),p['dark'],kit,.020)
        h.box('Latch clasp',(s*.154,.401,.224),(.052,.090,.020),p['metal'],kit,.008)
    w.tube('Carry handle',[(-.11,.477,0),(-.10,.545,0),(.10,.545,0),(.11,.477,0)],.016,p['dark'],kit)
    for z in [-.223,.223]:
        h.box('Medical emblem horizontal',(0,.293,z),(.225,.065,.011),p['medicalCross'],kit,.009)
        h.box('Medical emblem vertical',(0,.293,z),(.065,.205,.011),p['medicalCross'],kit,.009)
    # The emblem is neutral first-aid green; pickup identity/health behavior is unchanged.
    ammo=h.group('ammo',parent=root)
    h.box('Pressed ammunition crate',(0,.255,0),(.60,.40,.50),p['case'],ammo,.025)
    h.box('Weather seal',(0,.435,0),(.605,.024,.51),p['dark'],ammo,.006)
    h.box('Crate lid',(0,.493,0),(.638,.095,.535),p['case'],ammo,.020)
    for s in [-1,1]:
        h.box('Ammo identification strip',(s*.304,.326,0),(.009,.061,.428),p['accent'],ammo,.003)
        for x in [-.235,.235]: h.box('Reinforcing rib',(x,.254,s*.252),(.050,.322,.020),p['dark'],ammo,.005)
        w.tube('Folded carrying bail',[(s*.30,.410,-.13),(s*.355,.405,-.12),(s*.36,.310,0),(s*.355,.405,.12),(s*.30,.410,.13)],.012,p['metal'],ammo)
    for x in [-.18,.18]: h.box('Cam latch',(x,.447,.280),(.067,.095,.026),p['metal'],ammo,.006)
    h.box('Front color plate',(0,.325,.257),(.303,.072,.012),p['accent'],ammo,.004)
    key=h.group('key',parent=root)
    w.ring('Bone-key access bow',(0,.064,0),.131,.025,p['gold'],key)
    h.box('Key stem',(0,-.159,0),(.056,.272,.065),p['gold'],key,.010)
    for y in [-.195,-.270]: h.box('Indexed key tooth',(.049,y,0),(.110,.042,.064),p['gold'],key,.006)
    h.ellipsoid('Ivory credential medallion',(0,.064,.002),(.068,.077,.038),p['bone'],key,20,12)
    for s in [-1,1]: h.ellipsoid('Credential eye recess',(s*.023,.076,.037),(.012,.014,.004),p['dark'],key,12,6)
    h.box('Credential serial notch',(0,.029,.039),(.035,.012,.008),p['dark'],key,.004)
    core=h.group('powerup',parent=root)
    h.ellipsoid('Energized ceramic ampoule',(0,0,0),(.175,.256,.175),p['accent'],core,24,14)
    for y in [-.211,.211]:
        h.cylinder('Ampoule cap',(0,y-.033,0),(0,y+.033,0),.172,p['metal'],core,segments=24)
        w.ring('Cap retainer',(0,y,0),.178,.018,p['dark'],core,'y')
    for i in range(4):
        a=math.tau*i/4; x=math.cos(a)*.196; z=math.sin(a)*.196
        w.tube('Ampoule protective cage',[(x*.72,-.245,z*.72),(x,-.16,z),(x,.16,z),(x*.72,.245,z*.72)],.017,p['dark'],core)
    pedestal=h.group('pedestal',parent=root)
    h.cylinder('Weapon dispenser plinth',(0,.04,0),(0,.49,0),.405,p['dark'],pedestal,r2=.31,segments=24)
    h.cylinder('Machined dispenser top',(0,.475,0),(0,.548,0),.322,p['metal'],pedestal,segments=24)
    w.ring('Dispenser identification light',(0,.55,0),.305,.016,p['accent'],pedestal,'y')
    for i in range(6):
        a=math.tau*i/6
        h.box('Plinth mounting foot',(.32*math.cos(a),.044,.32*math.sin(a)),(.14,.075,.14),p['metal'],pedestal,.020)


def marine(root):
    group=h.group('marine',parent=root)
    mats={k:h.material('marine.'+k,c,m,r,e) for k,c,m,r,e in [
        ('team',(.75,.77,.72),.25,.50,0),('steel',(.37,.42,.43),.65,.38,0),
        ('fabric',(.11,.13,.10),0,.88,0),('dark',(.025,.035,.039),.12,.67,0),
        ('visor',(.18,.49,.53),.62,.22,.35)]}
    ad=bpy.data.armatures.new('Marine anatomical skeleton'); arm=bpy.data.objects.new('marine_skeleton',ad)
    bpy.context.collection.objects.link(arm); arm.parent=group; bpy.context.view_layer.objects.active=arm
    arm.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    positions={'skeleton_root':(0,0,0),'torso':(0,0,0),'head':(0,1.6,0),
        'arm_r':(.36,1.46,0),'elbow_r':(.36,1.16,0),'arm_l':(-.36,1.46,0),'elbow_l':(-.36,1.16,0),
        'leg_r':(.15,.95,0),'knee_r':(.15,.52,0),'leg_l':(-.15,.95,0),'knee_l':(-.15,.52,0)}
    parents={'torso':'skeleton_root','head':'torso','arm_r':'torso','arm_l':'torso','elbow_r':'arm_r','elbow_l':'arm_l','leg_r':'skeleton_root','leg_l':'skeleton_root','knee_r':'leg_r','knee_l':'leg_l'}
    for name,p in positions.items():
        bone=ad.edit_bones.new(name); bone.head=h.gv(p); bone.tail=h.gv((p[0],p[1]+.1,p[2]))
        if name in parents: bone.parent=ad.edit_bones[parents[name]]
    bpy.ops.object.mode_set(mode='OBJECT'); arm.select_set(False)
    def bind(ob,bone):
        ob.parent=arm; vg=ob.vertex_groups.new(name=bone); vg.add(list(range(len(ob.data.vertices))),1,'REPLACE'); return ob
    def box(name,p,size,mat,bone,bevel=.012): return bind(h.box(name,p,size,mats[mat],bevel=bevel),bone)
    def ell(name,p,size,mat,bone,segs=16,rings=10): return bind(h.ellipsoid(name,p,size,mats[mat],segments=segs,rings=rings),bone)
    def cyl(name,a,b,r,mat,bone,r2=None): return bind(h.cylinder(name,a,b,r,mats[mat],r2=r2,segments=16),bone)
    def shell(name,sections,mat,bone): return bind(h.shell(name,sections,mats[mat],segments=20),bone)
    def tube(name,points,r,mat,bone): return bind(w.tube(name,points,r,mats[mat],sides=8),bone)
    shell('Tailored armored torso',[(0,.94,0,.17,.12),(0,1.10,0,.175,.13),(0,1.30,0,.255,.158),(0,1.48,.005,.272,.145),(0,1.56,.006,.153,.104)],'fabric','torso')
    shell('Contoured team cuirass',[(0,1.10,-.012,.184,.144),(0,1.20,-.021,.226,.158),(0,1.41,-.010,.268,.169),(0,1.49,0,.232,.145)],'team','torso')
    for s in [-1,1]:
        box('Overlapping pectoral plate',(s*.13,1.384,-.156),(.234,.185,.064),'team','torso',.034)
        box('Chest harness riser',(s*.171,1.449,-.175),(.045,.201,.029),'dark','torso',.009)
        box('Harness quick release',(s*.171,1.342,-.194),(.063,.046,.018),'steel','torso',.006)
        for i in range(2): box('Chest utility pouch',(s*(.057+i*.091),1.179,-.170),(.076,.104,.052),'fabric','torso',.010)
    box('Sternum armored inset',(0,1.411,-.195),(.045,.124,.024),'steel','torso',.012)
    box('Waist belt',(0,1.026,0),(.375,.071,.294),'dark','torso',.018)
    box('Belt buckle',(0,1.028,-.162),(.097,.052,.018),'steel','torso',.008)
    shell('Pelvic undersuit',[(0,.849,0,.143,.108),(0,.93,0,.174,.128),(0,1.012,0,.174,.136)],'fabric','torso')
    box('Back life support housing',(0,1.300,.189),(.27,.335,.111),'steel','torso',.035)
    for s in [-1,1]:
        cyl('Back filter canister',(s*.096,1.204,.260),(s*.096,1.400,.260),.045,'dark','torso')
        tube('Respirator air hose',[(s*.110,1.425,.231),(s*.18,1.545,.152),(s*.127,1.665,.004)],.014,'dark','head')
    cyl('Ribbed neck seal',(0,1.53,0),(0,1.655,0),.077,'dark','head')
    ell('Formed helmet shell',(0,1.733,.005),(.171,.153,.177),'team','head',24,14)
    ell('Dark visor surround',(0,1.737,-.142),(.148,.065,.070),'dark','head',20,10)
    ell('Wraparound smoked visor',(0,1.744,-.183),(.129,.041,.034),'visor','head',20,10)
    box('Helmet brow',(0,1.800,-.157),(.292,.032,.088),'steel','head',.014)
    box('Respirator chin guard',(0,1.655,-.156),(.181,.070,.099),'steel','head',.019)
    for s in [-1,1]:
        ell('Respirator cheek filter',(s*.105,1.662,-.123),(.035,.040,.046),'dark','head')
        box('Helmet side rail',(s*.164,1.745,.006),(.021,.066,.102),'steel','head',.008)
        ell('Helmet fastener',(s*.174,1.77,-.022),(.003,.010,.010),'dark','head',12,6)
    for s,name in [(1,'r'),(-1,'l')]:
        arm_b='arm_'+name; elbow='elbow_'+name; leg='leg_'+name; knee='knee_'+name
        shell('Padded upper arm',[(s*.36,1.454,0,.083,.083),(s*.37,1.32,0,.071,.071),(s*.36,1.167,0,.058,.059)],'fabric',arm_b)
        ell('Team shoulder cap',(s*.353,1.458,.005),(.166,.121,.155),'team',arm_b,20,12)
        box('Shoulder inset stripe',(s*.460,1.466,-.015),(.025,.069,.148),'steel',arm_b,.010)
        ell('Elbow joint sleeve',(s*.36,1.155,0),(.063,.066,.064),'dark',elbow)
        shell('Forearm textile',[(s*.36,1.147,0,.061,.066),(s*.36,.99,0,.065,.071),(s*.36,.865,0,.046,.047)],'fabric',elbow)
        box('Armored forearm',(s*.36,1.018,-.053),(.117,.209,.067),'steel',elbow,.022)
        box('Wrist strap',(s*.36,.887,0),(.113,.039,.110),'dark',elbow,.012)
        ell('Gloved hand',(s*.36,.830,-.005),(.054,.070,.046),'dark',elbow)
        for j in range(4): ell('Finger knuckle',(s*(.326+j*.020),.810,-.044),(.010,.024,.009),'steel',elbow,10,6)
        shell('Anatomical thigh',[(s*.15,.946,0,.095,.092),(s*.15,.814,.004,.092,.087),(s*.15,.65,0,.082,.078),(s*.15,.522,0,.062,.063)],'fabric',leg)
        box('Thigh armor plate',(s*.15,.742,-.065),(.136,.247,.067),'team',leg,.027)
        ell('Knee joint',(s*.15,.516,0),(.070,.064,.068),'dark',knee)
        box('Kneecap armor',(s*.15,.506,-.063),(.120,.102,.047),'steel',knee,.022)
        shell('Lower leg textile',[(s*.15,.477,0,.060,.060),(s*.15,.34,.01,.073,.068),(s*.15,.191,.018,.055,.051),(s*.15,.116,.005,.050,.051)],'fabric',knee)
        box('Contoured shin plate',(s*.15,.318,-.047),(.117,.230,.065),'steel',knee,.020)
        box('Boot toe',(s*.15,.089,-.053),(.169,.152,.271),'dark',knee,.034)
        box('Boot tread sole',(s*.15,.029,-.053),(.177,.052,.281),'steel',knee,.012)
        for j in range(3): box('Boot lace bridge',(s*.15,.158,-.064+j*.027),(.099,.007,.010),'steel',knee,.002)
    # Compact service carbine bound rigidly to the existing right elbow frame.
    box('Carbine receiver',(.342,.814,.118),(.083,.295,.081),'dark','elbow_r',.010)
    box('Carbine magazine',(.342,.805,.047),(.054,.082,.121),'steel','elbow_r',.007)
    cyl('Carbine barrel',(.342,.640,.118),(.342,.391,.118),.017,'steel','elbow_r')
    box('Carbine foregrip',(.342,.610,.118),(.071,.140,.073),'dark','elbow_r',.010)
    box('Carbine stock',(.342,1.031,.118),(.063,.176,.074),'dark','elbow_r',.015)
    return arm


def render_preview():
    # Stage only the editable inspection render; exports retain zero origins.
    for node,x,z in [('medikit',-1.55,0),('ammo',-.85,0),('key',-.22,0),('powerup',.39,0),('pedestal',1.1,0)]:
        o=bpy.data.objects[node]; o.location=h.gv((x,.45 if node in ['key','powerup'] else 0,z))
    bpy.data.objects['marine'].location=h.gv((0,0,1.18))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.device='CPU';scene.cycles.use_denoising=True
    scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.world.color=(.15,.15,.15)
    bpy.ops.object.camera_add(location=h.gv((3.4,2.5,-5.8)));cam=bpy.context.object;h.look_at(cam,(0,.88,.35));cam.data.type='ORTHO';cam.data.ortho_scale=4.0;scene.camera=cam
    for pos,power,color in [((1,4,-3),450,(.75,.85,1)),((-3,3,-1),300,(1,.7,.4)),((0,3,3),550,(.3,.75,.8))]:
        bpy.ops.object.light_add(type='AREA',location=h.gv(pos));light=bpy.context.object;light.data.energy=power;light.data.color=color;light.data.size=3;h.look_at(light,(0,.8,0))
    scene.render.film_transparent=True;scene.render.filepath=str(SOURCE/'support-preview.png');bpy.ops.render.render(write_still=True)


def main():
    SOURCE.mkdir(parents=True,exist_ok=True);DEST.mkdir(parents=True,exist_ok=True);h.reset()
    root=h.group('support_pack');pickups(root,pickup_materials());arm=marine(root)
    h.optimize(root)
    # Add skin deformation only after mesh consolidation, retaining vertex groups.
    for ob in list(arm.children):
        if ob.type=='MESH': mod=ob.modifiers.new('Marine skin deformation','ARMATURE');mod.object=arm
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'support.blend'),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(DEST/'support.glb'),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_apply=False)
    result=[]
    for name in ['medikit','ammo','key','powerup','pedestal','marine']:
        meshes=[o for o in bpy.data.objects[name].children_recursive if o.type=='MESH'];triangles=0
        for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
        result.append({'node':name,'meshes':len(meshes),'triangles':triangles})
    (SOURCE/'manifest.json').write_text(json.dumps({'glbBytes':(DEST/'support.glb').stat().st_size,'models':result},indent=2)+'\n')
    render_preview();print('SUPPORT_MANIFEST '+json.dumps(result))

if __name__=='__main__':main()
