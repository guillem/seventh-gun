"""Author saved campaign architecture in Blender; no geometry generation at runtime.

All modules face game +Z. Wall relief is <= 0.18 m; crown assemblies start
above 4.3 m, outside the original combat/collision volume. The seven sets use
different constructions, not recoloured copies of a common kit.
"""
from pathlib import Path
import importlib.util
import json
import math
import bpy

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('base_art', HERE / 'build_assets.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
SOURCE = HERE.parents[1] / 'art/modern/roster/environment'
DEST = HERE.parents[1] / 'public/modern/roster/environment'


def beam(name, a, b, width, depth, mat, parent):
    # Wall-aligned structural member, square cross section, thin in game Z.
    x, y = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    ob = h.box(name, (x, y, .09), (width, math.dist(a, b), depth), mat, parent, .008)
    ob.rotation_euler.y = -math.atan2(b[0] - a[0], b[1] - a[1])
    return ob


def arch(name, width, spring, rise, thick, depth, mat, parent, steps=12):
    verts, faces = [], []
    for z in [.018, depth]:
        for inner in [False, True]:
            for i in range(steps + 1):
                t = math.pi * i / steps
                r = width / 2 - (thick if inner else 0)
                verts.append((math.cos(t) * r, spring + math.sin(t) * (rise - (thick if inner else 0)), z))
    n = steps + 1
    for i in range(steps):
        faces += [(i, i+1, n+i+1, n+i), (2*n+i, 3*n+i, 3*n+i+1, 2*n+i+1),
                  (i, 2*n+i, 2*n+i+1, i+1), (n+i, n+i+1, 3*n+i+1, 3*n+i)]
    faces += [(0,n,3*n,2*n),(n-1,3*n-1,4*n-1,2*n-1)]
    return h.mesh(name, verts, faces, mat, parent, bevel=.006)


def pipe(name, points, radius, mat, parent):
    for i, (a,b) in enumerate(zip(points,points[1:])):
        h.cylinder(name+str(i),a,b,radius,mat,parent,segments=8)


def main():
    SOURCE.mkdir(parents=True, exist_ok=True)
    DEST.mkdir(parents=True, exist_ok=True)
    h.reset()
    root = h.group('architecture')
    iron = h.material('env.alloy',(.38,.41,.43),.55,.48)
    dark = h.material('env.dark',(.055,.071,.08),.4,.65)
    stone = h.material('env.basalt',(.48,.48,.48),0,.9)
    pale = h.material('env.limestone',(.78,.75,.69),0,.88)
    tissue = h.material('env.organic',(.65,.46,.39),0,.56)
    bone = h.material('env.bone',(.72,.67,.51),0,.7)
    ceramic = h.material('env.ceramic',(.78,.85,.84),.03,.3)
    amber = h.material('env.lamp.amber',(1,.43,.13),0,.35,5)
    teal = h.material('env.lamp.teal',(.31,.87,.89),0,.35,4)
    red = h.material('env.lamp.red',(.78,.13,.10),0,.35,3)
    white = h.material('env.lamp.white',(.73,.84,1),0,.35,4)
    gold = h.material('env.lamp.gold',(1,.76,.39),0,.35,4)
    cut = h.material('env.cutStone',(.52,.56,.56),0,.86)
    trim_metal = h.material('env.trimMetal',(.3,.34,.34),.35,.69)

    def module(art,role): return h.group(art+'_'+role,parent=root)
    def box(name,p,s,m,r,b=.006): return h.box(name,p,s,m,r,b)

    # Foundry: riveted I-section, cable raceway and suspended heat exchanger.
    r=module('foundry','relief')
    box('Structural web',(0,2.8,.055),(.28,5.6,.09),iron,r)
    for x in [-.21,.21]: box('I flange',(x,2.8,.1),(.07,5.6,.15),iron,r)
    for y in [.3,1.8,3.3,4.8]:
        box('Bolted gusset',(0,y,.13),(.64,.23,.06),dark,r)
        for x in [-.22,.22]: h.cylinder('Anchor bolt',(x,y,.158),(x,y,.178),.027,iron,r,segments=6)
    r=module('foundry','fixture')
    box('Luminaire housing',(0,3.6,.075),(1.45,.25,.13),dark,r)
    box('Diffuser',(0,3.57,.151),(1.23,.105,.025),amber,r)
    for x in [-.45,0,.45]: box('Lamp cage',(x,3.58,.172),(.025,.18,.012),iron,r)
    r=module('foundry','crown')
    for y in [4.65,5.12,5.59]:
        h.cylinder('Process pipe',(-.94,y,.37),(.94,y,.37),.14,iron,r,segments=12)
        for x in [-.68,.68]: box('Pipe strap',(x,y,.39),(.09,.35,.35),dark,r)

    # Gullet: buttressed organic folds and sutured ossified collar arches.
    r=module('gullet','relief')
    for s in [-1,1]:
        for k in range(5):
            y=.6+k*.9
            pipe('Costal fold',[(s*.87,y,.085),(s*.59,y+.18,.09),(s*.38,y+.6,.09),(s*.27,y+.82,.07)],.055,tissue,r)
        pipe('Ossified spine',[(s*.27,.15,.07),(s*.33,1.9,.08),(s*.28,3.3,.08),(s*.45,5.6,.07)],.065,bone,r)
    r=module('gullet','fixture')
    for x,y in [(-.31,3.31),(0,3.57),(.29,3.43)]:
        h.ellipsoid('Translucent gland',(x,y,.07),(.15,.27,.08),red,r,segments=12,rings=6)
        arch('Gland collar',.35,y-.15,.42,.035,.12,bone,r,8)
    r=module('gullet','crown')
    arch('Ossified vault',1.96,4.55,1.2,.17,.62,bone,r)
    for s in [-1,1]: pipe('Upper tendon',[(s*.87,4.55,.48),(s*.58,5.2,.5),(0,5.62,.55)],.12,tissue,r)

    # Catacombs: a masonry blind arch, radiating voussoirs and burial niches.
    r=module('catacombs','relief')
    for x in [-.8,.8]:
        for y in [.42,1.24,2.06,2.88,3.7]: box('Stone pier',(x,y,.085),(.3,.76,.16),stone,r,.025)
    arch('Blind arch',1.93,3.73,1.63,.3,.175,stone,r)
    for y in [1,2.18,3.3]:
        box('Recess border',(0,y,.05),(1.1,.7,.07),dark,r)
        box('Niche lintel',(0,y+.36,.12),(1.25,.1,.1),stone,r,.015)
    r=module('catacombs','fixture')
    box('Bronze sconce',(0,3.35,.06),(.3,.65,.1),iron,r)
    box('Warm lens',(0,3.42,.135),(.12,.42,.05),gold,r)
    r=module('catacombs','crown')
    arch('Corbel arch',1.96,4.6,1.2,.35,.5,stone,r)
    box('Keystone',(0,5.64,.31),(.34,.54,.61),stone,r,.025)

    # Pit: mine shoring, tension bolts and an overhead hoist support.
    r=module('pit','relief')
    for x in [-.78,.78]: box('Mine support',(x,2.7,.085),(.2,5.4,.17),iron,r,.008)
    beam('Diagonal brace',(-.72,.3),(.72,2.8),.13,.13,iron,r)
    beam('Reverse brace',(-.72,2.9),(.72,5.4),.13,.13,iron,r)
    for x in [-.77,.77]:
        for y in [.36,2.8,5.25]:
            box('Rock anchor plate',(x,y,.12),(.3,.3,.06),dark,r)
            h.cylinder('Tension bolt',(x,y,.15),(x,y,.179),.055,iron,r,segments=6)
    r=module('pit','fixture')
    box('Caged work light',(0,3.35,.07),(.56,.4,.12),dark,r)
    box('Work light face',(0,3.35,.139),(.41,.25,.03),amber,r)
    for x in [-.14,0,.14]: box('Protection grille',(x,3.35,.167),(.018,.28,.016),iron,r)
    r=module('pit','crown')
    box('Hoist channel',(0,5.3,.38),(1.95,.22,.7),iron,r)
    for x in [-.72,.72]: box('Suspension bracket',(x,5.62,.3),(.16,.61,.55),dark,r)
    for x in [-.65,-.33,0,.33,.65]: box('Track teeth',(x,5.06,.39),(.14,.25,.36),iron,r)

    # Spire: fluted monolithic pilaster and a deep coffering cornice.
    r=module('spire','relief')
    box('Pilaster field',(0,2.8,.045),(1.5,5.6,.08),pale,r,.015)
    for x in [-.61,-.3,0,.3,.61]: box('Stone flute',(x,2.8,.113),(.12,5.3,.105),pale,r,.012)
    for y in [.17,5.4]: box('Entablature',(0,y,.08),(1.92,.3,.16),pale,r,.02)
    r=module('spire','fixture')
    box('Inset bronze plate',(0,3.3,.052),(.22,1.6,.09),iron,r)
    box('Vertical light slit',(0,3.3,.108),(.065,1.39,.03),gold,r)
    r=module('spire','crown')
    for y,w,d in [(4.68,1.96,.24),(4.92,1.8,.38),(5.18,1.63,.55),(5.47,1.48,.75)]:
        box('Stepped cornice',(0,y,d/2),(w,.22,d),pale,r,.014)

    # Ward: medical service cabinet, inset instrumentation and filtered air.
    r=module('ward','relief')
    box('Ceramic cabinet',(0,2.6,.065),(1.6,2.35,.12),ceramic,r,.018)
    for x in [-.77,.77]: box('Cabinet frame',(x,2.6,.131),(.045,2.3,.035),iron,r)
    for y in [1.7,2.12,2.54,2.96,3.38]:
        box('Drawer seam',(0,y,.135),(1.46,.018,.009),dark,r,0)
        box('Recessed pull',(.47,y+.17,.146),(.26,.055,.025),iron,r)
    box('Instrument screen',(-.26,3.29,.145),(.62,.32,.02),dark,r)
    for x in [-.47,-.32,-.17]: box('Status readout',(x,3.29,.161),(.035,.18,.008),teal,r,0)
    r=module('ward','fixture')
    box('Clean light housing',(0,4.0,.06),(1.8,.25,.1),ceramic,r)
    box('Frosted strip',(0,4.0,.126),(1.56,.12,.03),white,r)
    r=module('ward','crown')
    box('Air return casing',(0,5.24,.31),(1.92,.74,.58),ceramic,r)
    box('Filter shadow',(0,5.22,.612),(1.65,.48,.025),dark,r)
    for y in [5.05,5.16,5.27,5.38]: box('Filter louvre',(0,y,.648),(1.64,.033,.055),iron,r)

    # Sanctum: black alloy radiation shielding and recessed energy channels.
    r=module('sanctum','relief')
    for x in [-.72,-.24,.24,.72]:
        box('Armour vane',(x,2.8,.085),(.34,5.6,.16),dark,r,.024)
        box('Nickel arris',(x-.13,2.8,.173),(.027,5.4,.012),iron,r,.002)
    for y in [.8,2.5,4.2]: box('Conduit link',(0,y,.147),(1.8,.095,.05),iron,r)
    r=module('sanctum','fixture')
    box('Energy well',(0,3.4,.057),(.8,1.2,.1),dark,r,.018)
    for x in [-.22,0,.22]: box('Contained energy column',(x,3.4,.131),(.085,1.05,.04),teal,r)
    r=module('sanctum','crown')
    for x in [-.7,-.35,0,.35,.7]:
        box('Shield fin',(x,5.1,.4),(.15,1.3,.77),dark,r,.016)
        box('Energy fin edge',(x,5.1,.795),(.045,.98,.025),teal,r)

    # Tall-room vertical set (room vertical grammar, src/render/roomVolumes.ts).
    # Everything here lives above the original six-metre wall, never in the
    # combat volume. Conventions, in module space:
    #   course  string course placed at the six-metre line, y -.25..+.35
    #   upper   upper-wall register, y 0..4, stretched in Y to the band height;
    #           so it is built from prismatic vertical members that tolerate it
    #   span    2 m tile of an overhead member along local X, hanging from y 0
    #           (the ceiling) down to at most -1.5
    #   hang    suspended piece from y 0 to at most -3.2 (needs >= 8 m rooms)
    def ceiling_rod(name,length,mat,r,radius=.03,x=0,z=0):
        h.cylinder(name,(x,0,z),(x,-length,z),radius,mat,r,segments=6)

    # Foundry: column, crane-rail corbel and clerestory glazing; a Warren truss
    # and a chained ladle.
    r=module('foundry','course')
    box('Crane rail girder',(0,.05,.2),(1.99,.42,.4),iron,r)
    box('Rail head',(0,.29,.33),(1.99,.06,.12),dark,r)
    for x in [-.6,.6]: box('Girder stiffener',(x,.05,.36),(.05,.38,.06),dark,r)
    r=module('foundry','upper')
    box('Column web',(0,2,.07),(.3,4,.12),iron,r)
    for x in [-.2,.2]: box('Column flange',(x,2,.13),(.06,4,.2),iron,r)
    for x in [-.62,.62]:
        box('Clerestory mullion',(x,2.2,.06),(.08,3.2,.1),dark,r)
        box('Clerestory glazing',(x*1.04,2.2,.025),(.44,3.0,.02),white,r,0)
    for y in [.55,3.85]: box('Glazing transom',(0,y,.07),(1.99,.1,.12),dark,r)
    r=module('foundry','span')
    for y in [-.12,-1.28]: box('Truss chord',(0,y,0),(1.99,.16,.22),iron,r)
    beam_x=lambda n,a,b: h.cylinder(n,a,b,.045,iron,r,segments=6)
    beam_x('Truss diagonal',(-.98,-1.2,0),(0,-.2,0)); beam_x('Truss diagonal',(0,-.2,0),(.98,-1.2,0))
    for x in [-.98,0]: box('Truss gusset',(x,-.7,0),(.05,1.05,.26),dark,r)
    r=module('foundry','hang')
    for x in [-.18,.18]: ceiling_rod('Ladle chain',1.75,dark,r,.025,x)
    box('Spreader bar',(0,-1.78,0),(.6,.1,.12),iron,r)
    h.cylinder('Pour ladle',(0,-1.85,0),(0,-2.95,0),.42,iron,r,r2=.3,segments=14)
    h.cylinder('Ladle lip glow',(0,-1.86,0),(0,-1.9,0),.36,amber,r,segments=14)

    # Gullet: rising rib cage with taut membrane, ossified tendon arches across
    # the room and suspended glandular sacs.
    r=module('gullet','course')
    pipe('Collar tendon',[(-1,.05,.22),(-.5,.12,.26),(0,.06,.24),(.5,.12,.26),(1,.05,.22)],.1,tissue,r)
    box('Ossified shelf',(0,-.12,.14),(1.99,.14,.26),bone,r,.02)
    r=module('gullet','upper')
    # Two ribs rise from the course and meet in an ogive; sinew webbing
    # stretches between them and a gland sits in the apex. No flat panel.
    for s in [-1,1]:
        pipe('Rising rib',[(s*.86,0,.1),(s*.8,1.4,.2),(s*.55,2.9,.32),(s*.05,4,.4)],.1,bone,r)
        for k in range(4):
            y=.5+k*.85
            w=.78-k*.13
            pipe('Sinew web',[(s*w,y,.16+k*.05),(s*w*.5,y+.25,.1+k*.04),(0,y+.12,.08+k*.04)],.035,tissue,r)
    pipe('Costal ridge',[(0,.1,.06),(0,1.6,.1),(0,3.0,.18),(0,3.75,.3)],.06,tissue,r)
    h.ellipsoid('Apex gland',(0,3.45,.33),(.16,.26,.1),red,r,segments=10,rings=5)
    r=module('gullet','span')
    pipe('Ossified tendon arch',[(-1,-.35,0),(-.5,-.62,0),(0,-.7,0),(.5,-.62,0),(1,-.35,0)],.14,bone,r)
    pipe('Sinew strand',[(-1,-.12,.12),(0,-.32,.14),(1,-.12,.12)],.06,tissue,r)
    pipe('Sinew strand',[(-1,-.15,-.12),(0,-.38,-.14),(1,-.15,-.12)],.06,tissue,r)
    h.ellipsoid('Arch gland',(0,-.84,0),(.12,.1,.12),red,r,segments=8,rings=4)
    r=module('gullet','hang')
    pipe('Suspensory tendon',[(0,0,0),(.05,-.8,.03),(-.04,-1.5,0)],.05,tissue,r)
    h.ellipsoid('Hanging sac',(0,-2.1,0),(.42,.62,.4),tissue,r,segments=14,rings=8)
    h.ellipsoid('Sac glow',(0,-2.25,0),(.24,.36,.24),red,r,segments=10,rings=6)
    for a in [0,2.1,4.2]:
        pipe('Sac vein',[(0,-1.55,0),(math.cos(a)*.38,-2.0,math.sin(a)*.38),(math.cos(a)*.2,-2.65,math.sin(a)*.2)],.025,bone,r)

    # Catacombs: tall stone piers with stacked ossuary niches, transverse
    # stone ribs and an iron corona.
    r=module('catacombs','course')
    box('Cornice',(0,.05,.18),(1.99,.3,.36),stone,r,.025)
    box('Cornice drip',(0,-.16,.24),(1.99,.1,.3),stone,r,.015)
    r=module('catacombs','upper')
    for x in [-.78,.78]: box('Tall pier',(x,2,.12),(.42,4,.24),stone,r,.02)
    for y in [.7,2,3.3]:
        box('Ossuary niche',(0,y,.04),(.9,.8,.06),dark,r)
        box('Niche sill',(0,y-.45,.14),(1.05,.1,.2),stone,r,.012)
    r=module('catacombs','span')
    box('Transverse rib',(0,-.42,0),(1.99,.84,.5),stone,r,.03)
    box('Voussoir joint',(.99,-.42,0),(.03,.86,.52),dark,r,0)
    r=module('catacombs','hang')
    for a in [0,2.1,4.2]: h.cylinder('Corona chain',(0,0,0),(math.cos(a)*.6,-2.2,math.sin(a)*.6),.02,iron,r,segments=5)
    h.cylinder('Iron corona',(0,-2.2,0),(0,-2.32,0),.7,iron,r,segments=16)
    for a in range(6):
        t=a*math.pi/3
        h.cylinder('Corona flame',(math.cos(t)*.6,-2.2,math.sin(t)*.6),(math.cos(t)*.6,-2.0,math.sin(t)*.6),.04,gold,r,segments=6)

    # Pit: shoring towers, hoist girders and a hook block with a work lamp.
    r=module('pit','course')
    box('Ring beam',(0,.05,.22),(1.99,.36,.44),iron,r,.01)
    for x in [-.65,0,.65]: h.cylinder('Ring bolt',(x,.05,.44),(x,.05,.47),.05,dark,r,segments=6)
    r=module('pit','upper')
    for x in [-.8,.8]: box('Shoring post',(x,2,.14),(.22,4,.26),iron,r,.01)
    beam('Shoring brace',(-.72,.15),(.72,1.95),.12,.14,iron,r)
    beam('Shoring brace',(.72,2.05),(-.72,3.85),.12,.14,iron,r)
    for y in [1,3]: box('Rock bolt plate',(0,y,.05),(.3,.3,.06),dark,r)
    r=module('pit','span')
    box('Hoist girder',(0,-.4,0),(1.99,.7,.3),iron,r,.01)
    for y in [-.08,-.72]: box('Girder flange',(0,y,0),(1.99,.07,.5),dark,r)
    r=module('pit','hang')
    for x in [-.08,.08]: ceiling_rod('Hoist cable',2.1,dark,r,.018,x)
    box('Hook block',(0,-2.3,0),(.34,.42,.22),iron,r)
    box('Hook lamp',(0,-2.62,0),(.3,.14,.3),amber,r)

    # Spire: fluted giant order with lancet light slots, coffered beams and a
    # bronze lantern.
    r=module('spire','course')
    for y,d in [(-.12,.2),(.04,.32),(.2,.42)]: box('Stepped string course',(0,y,d/2),(1.99,.16,d),pale,r,.012)
    r=module('spire','upper')
    box('Giant order field',(0,2,.05),(1.6,4,.08),pale,r,.012)
    for x in [-.55,-.27,0,.27,.55]: box('Giant flute',(x,2,.12),(.13,3.9,.1),pale,r,.01)
    for x in [-.86,.86]: box('Lancet slot',(x,2,.03),(.08,3.2,.03),gold,r,0)
    r=module('spire','span')
    box('Coffer beam',(0,-.5,0),(1.99,1,.4),pale,r,.02)
    for y in [-.95,-.62]: box('Beam fascia',(0,y,0),(1.99,.08,.5),pale,r,.01)
    r=module('spire','hang')
    ceiling_rod('Lantern rod',1.6,iron,r,.03)
    h.cylinder('Lantern cage',(0,-1.6,0),(0,-2.5,0),.3,iron,r,r2=.22,segments=8)
    h.cylinder('Lantern light',(0,-1.7,0),(0,-2.4,0),.22,gold,r,r2=.16,segments=8)

    # Ward: ceramic upper panelling with air louvres, service ducts and an
    # articulated examination lamp.
    r=module('ward','course')
    box('Service rail',(0,.05,.16),(1.99,.3,.3),ceramic,r,.02)
    box('Rail light',(0,-.12,.2),(1.8,.04,.18),white,r,0)
    r=module('ward','upper')
    box('Upper ceramic panel',(0,2,.05),(1.92,3.9,.09),ceramic,r,.02)
    for y in [.6,1.0,1.4,2.6,3.0,3.4]: box('Air louvre',(0,y,.11),(1.4,.06,.05),iron,r)
    box('Panel seam',(.97,2,.1),(.03,4,.04),trim_metal,r,0)
    r=module('ward','span')
    box('Service duct',(0,-.45,0),(1.99,.55,.7),ceramic,r,.03)
    box('Duct band',(.9,-.45,0),(.08,.6,.75),trim_metal,r)
    box('Duct light',(0,-.74,0),(1.6,.03,.3),white,r,0)
    r=module('ward','hang')
    ceiling_rod('Lamp arm',1.4,trim_metal,r,.04)
    h.cylinder('Exam lamp head',(0,-1.4,0),(0,-1.75,0),.12,ceramic,r,r2=.5,segments=16)
    h.cylinder('Exam lamp lens',(0,-1.74,0),(0,-1.77,0),.44,white,r,segments=16)

    # Sanctum: armour vanes with energy conduits, shield beams and a
    # suspended containment capsule.
    r=module('sanctum','course')
    box('Shield ledge',(0,.05,.2),(1.99,.3,.4),dark,r,.016)
    box('Ledge channel',(0,.05,.405),(1.99,.06,.02),teal,r,0)
    r=module('sanctum','upper')
    for x in [-.66,0,.66]:
        box('Upper vane',(x,2,.11),(.4,4,.2),dark,r,.02)
        box('Vane conduit',(x,2,.215),(.05,3.6,.02),teal,r,0)
    r=module('sanctum','span')
    box('Shield beam',(0,-.45,0),(1.99,.8,.35),dark,r,.016)
    box('Beam energy line',(0,-.86,0),(1.99,.03,.08),teal,r,0)
    r=module('sanctum','hang')
    ceiling_rod('Capsule mast',1.2,dark,r,.06)
    h.cylinder('Containment capsule',(0,-1.2,0),(0,-2.8,0),.3,dark,r,segments=10)
    h.cylinder('Contained energy',(0,-1.35,0),(0,-2.65,0),.32,teal,r,segments=10)
    for y in [-1.3,-2.0,-2.7]: h.cylinder('Capsule band',(0,y,0),(0,y-.08,0),.36,iron,r,segments=10)

    # Continuous wall-to-floor connections and courses give large flat rooms
    # construction scale. Each saved section remains inside its two-metre wall
    # cell and below the original 0.18m relief allowance; none is new cover.
    for art in ['foundry','gullet','catacombs','pit','spire','ward','sanctum']:
        r=module(art,'trim')
        if art in ['catacombs','spire']:
            height=.68 if art=='catacombs' else .45
            box('Stone plinth',(0,height/2,.065),(1.99,height,.12),cut,r,.012)
            box('Plinth coping',(0,height+.06,.115),(1.99,.12,.12),cut,r,.014)
            box('Upper stone course',(0,4.32,.065),(1.99,.16,.12),cut,r,.01)
            box('Cut stone vertical joint',(.975,2.7,.012),(.025,3.95,.019),dark,r,0)
        elif art=='gullet':
            box('Containment skirting',(0,.4,.054),(1.99,.79,.10),trim_metal,r,.006)
            box('Ossified ground seam',(0,.84,.093),(1.99,.11,.14),bone,r,.02)
            box('Containment upper rail',(0,4.42,.065),(1.99,.13,.12),trim_metal,r)
        elif art=='ward':
            box('Hygiene cove',(0,.18,.055),(1.99,.36,.10),trim_metal,r,.026)
            box('Cabinet service band',(0,1.17,.042),(1.99,.23,.073),ceramic,r,.01)
            box('Service band metal lip',(0,1.31,.081),(1.99,.035,.025),trim_metal,r,.002)
            box('Panel seal',(.97,3.4,.016),(.026,5.1,.025),trim_metal,r,0)
        else:
            box('Wall foot channel',(0,.2,.066),(1.99,.4,.12),trim_metal,r,.012)
            box('Floor perimeter flange',(0,.043,.085),(1.99,.075,.16),trim_metal,r,.008)
            box('Panel horizontal seam',(0,1.32,.026),(1.99,.045,.046),trim_metal,r,.003)
            if art=='sanctum':
                box('Upper shield division',(0,4.35,.054),(1.99,.095,.10),trim_metal,r,.004)
            if art=='foundry':
                for x in [-.74,.74]: h.cylinder('Skirt bolt',(x,.23,.125),(x,.23,.149),.025,iron,r,segments=6)

    h.optimize(root)
    # Deterministic architectural UVs in world metres, not packed tiny islands.
    # Textures repeat across a 2m specimen; each face uses its dominant normal.
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH': continue
        uv = ob.data.uv_layers.active.data
        for poly in ob.data.polygons:
            normal = poly.normal
            axis = max(range(3), key=lambda i:abs(normal[i]))
            axes = [i for i in range(3) if i != axis]
            for li in poly.loop_indices:
                v = ob.matrix_world @ ob.data.vertices[ob.data.loops[li].vertex_index].co
                uv[li].uv = (v[axes[0]] / 2,v[axes[1]] / 2)
    modules={}
    for ob in root.children:
        meshes=[o for o in ob.children if o.type=='MESH']
        modules[ob.name]={'meshes':len(meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)}
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'environment-kit.blend'),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(DEST/'kit.glb'),export_format='GLB',export_yup=True,
        export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_apply=True)
    (SOURCE/'manifest.json').write_text(json.dumps({'modules':modules,'bytes':(DEST/'kit.glb').stat().st_size,
        'authoring':'Original offline Blender assemblies; runtime instancing only',
        'limits':{'wallReliefMetres':.18,'crownMinHeightMetres':4.3}},indent=2)+'\n')
    print('ENVIRONMENT_KIT '+json.dumps(modules))


if __name__ == '__main__': main()
