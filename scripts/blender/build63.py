# 63빌딩 외형 (블렌더 배경 실행): 지도 바닥 다각형 그대로 세운 몸체 + 사진의 특징 — 게임 외벽을 이것으로 갈아 끼운다 (실내·판정은 원래대로)
# blender -b --python scripts/blender/build63.py -- <out_dir>
# 입력 63.json: export-landmark.ts가 지도 데이터·공용 판정(landmarkRoofBoxes)에서 만든 바닥 다각형·높이·옥상 상자 (판정과 같은 값)
# - 몸체는 바닥 다각형 그대로 (좁아지지 않음 — 실내 층 평면·판정과 맞게)
# - 금색 반사 유리 커튼월 (가는 짙은 줄눈 격자 텍스처, 금속성 반사)
# - 좁은 옆면: 짙은 세로 홈(지도의 짧은 꺾임) + 가운데 은청색 유리 띠, 22·44층 짙은 기계층 띠는 옆면에만
# - 꼭대기 짙은 왕관 + 아래 가는 빛 줄, 빨강·흰 안테나, 아래 짙은 차양 기단
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.dirname(__file__)
DATA = json.load(open(os.path.join(os.path.dirname(__file__), '63.json'), encoding='utf-8'))
H = DATA['h']
FLOOR = H / 63
# 지도 (x 동, z 남) → 블렌더 (x 동, y 북)
RING = [Vector((x, -z, 0)) for x, z in DATA['ring']]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# 긴 방향: 가장 긴 구간의 방향
lens = [(RING[(i + 1) % len(RING)] - RING[i]).length for i in range(len(RING))]
li = max(range(len(lens)), key=lambda i: lens[i])
AX = (RING[(li + 1) % len(RING)] - RING[li]).normalized()
AY = Vector((-AX.y, AX.x, 0))
# 좁아지지 않음 (1 = 그대로): 실내·판정이 바닥 다각형을 그대로 세운 기둥이라
TAPER_LONG = 1.0
TAPER_WIDE = 1.0


def at_height(p, z):
    """바닥 점 p가 높이 z에서 있을 자리 (위로 좁아진다)"""
    t = z / H
    a = p.dot(AX)
    b = p.dot(AY)
    sa = 1 + (TAPER_LONG - 1) * t
    sb = 1 + (TAPER_WIDE - 1) * t
    return AX * (a * sa) + AY * (b * sb) + Vector((0, 0, z))


# ---------- 재질 ----------
def grid_image(name, w, h, base, line, cell=(16, 16), jitter=0.12, seed=1):
    import random
    rnd = random.Random(seed)
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = [0.0] * (w * h * 4)
    cw, ch = cell
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            if x % cw == 0 or y % ch == 0:
                c = line
            else:
                k = 1 + (rnd.random() - 0.5) * jitter if (x % cw == 1 and y % ch == 1) else None
                c = base
            px[i:i + 4] = [c[0], c[1], c[2], 1.0]
    # 판마다 밝기 조금씩 (하늘·구름 반사 흉내)
    for gy in range(0, h, ch):
        for gx in range(0, w, cw):
            k = 1 + (rnd.random() - 0.5) * jitter * 2
            for y in range(gy + 1, min(gy + ch, h)):
                for x in range(gx + 1, min(gx + cw, w)):
                    i = (y * w + x) * 4
                    px[i] *= k
                    px[i + 1] *= k
                    px[i + 2] *= k
    img.pixels = px
    img.pack()
    return img


def material(name, color, metal=0.0, rough=0.5, image=None, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if image:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.interpolation = 'Linear'
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if emit:
        key = 'Emission Color' if 'Emission Color' in bsdf.inputs else 'Emission'
        bsdf.inputs[key].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    return m


GOLD_IMG = grid_image('gold_grid', 512, 512, (0.86, 0.66, 0.36), (0.3, 0.24, 0.17), cell=(32, 32), jitter=0.05, seed=3)
SILVER_IMG = grid_image('silver_grid', 512, 512, (0.62, 0.72, 0.82), (0.26, 0.29, 0.33), cell=(32, 32), jitter=0.05, seed=5)
M_GOLD = material('gold_glass', (1, 1, 1), metal=0.92, rough=0.07, image=GOLD_IMG)
M_SILVER = material('silver_glass', (1, 1, 1), metal=0.9, rough=0.06, image=SILVER_IMG)
M_DARK = material('dark_metal', (0.06, 0.06, 0.06), metal=0.6, rough=0.4)
M_GROOVE = material('groove', (0.04, 0.035, 0.03), metal=0.3, rough=0.5)
M_LIGHT = material('crown_light', (0.7, 0.8, 1.0), emit=(0.7, 0.82, 1.0), emit_strength=2.0)
M_RED = material('antenna_red', (0.75, 0.1, 0.08), rough=0.5)
M_WHITE = material('antenna_white', (0.9, 0.9, 0.9), rough=0.5)
M_PODIUM = material('podium', (0.09, 0.09, 0.1), metal=0.4, rough=0.35)
M_GROUND = material('ground', (0.42, 0.44, 0.4), rough=0.9)

# 텍스처 한 장 = 유리 판 16×16 (판 하나 = 가로 1.5m·한 층 높이) → 24m × 16층 (되풀이가 덜 보이게)
TILE_U = 24.0
TILE_V = FLOOR * 16

PERIM = sum(lens)
CROWN = H - 2 * FLOOR
LOBBY = 2 * FLOOR


def wall_mesh(name, z0, z1, pick):
    """z0~z1 높이의 벽 (구간마다 pick(i, len)이 재질 번호를 고른다). UV는 둘레 거리·높이로 이어진다"""
    me = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    nuv = bm.loops.layers.uv.new('night')
    u = 0.0
    n = len(RING)
    for i in range(n):
        a = RING[i]
        b = RING[(i + 1) % n]
        ln = (b - a).length
        if ln < 0.01:
            continue
        vs = [bm.verts.new(at_height(a, z0)), bm.verts.new(at_height(b, z0)), bm.verts.new(at_height(b, z1)), bm.verts.new(at_height(a, z1))]
        f = bm.faces.new(vs)
        f.material_index = pick(i, ln)
        for loop, (uu, vv) in zip(f.loops, [(u, z0), (u + ln, z0), (u + ln, z1), (u, z1)]):
            loop[uv].uv = (uu / TILE_U, vv / TILE_V)
            loop[nuv].uv = (uu / PERIM, vv / H)
        u += ln
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return obj


def near_short(i, d):
    return lens[(i + d) % len(lens)] < 2.5


def pick_body(i, ln):
    if ln < 2.5:
        return 2  # 홈
    if 4.5 <= ln <= 7 and near_short(i, -1) and near_short(i, 1):
        return 1  # 은청색 띠
    return 0


def assign(obj, mats):
    for m in mats:
        obj.data.materials.append(m)


def night_image():
    """밤 불빛 (둘레 전체 × 높이 한 장, 2도트/m · 층마다 4도트): 켜진 층(22%)은 둘레의 30~100%가 이어서 켜지고, 옆면 가운데 띠는 위아래 주황, 왕관 아래 가는 빛 줄"""
    import random
    rnd = random.Random(7)
    W = int(math.ceil(PERIM * 2))
    HP = 63 * 4
    px = [0.0] * (W * HP * 4)

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < HP:
            i = (y * W + x) * 4
            px[i:i + 4] = [c[0], c[1], c[2], 1.0]
    for f in range(2, 61):
        if rnd.random() >= 0.22:
            continue
        span = int(W * (0.3 + 0.7 * rnd.random()))
        start = rnd.randrange(W)
        warm = 0.78 + 0.22 * rnd.random()
        y = f * 4 + 2  # 층 가운데 줄 (아래가 v=0)
        for o in range(span):
            if rnd.random() > 0.1:
                put((start + o) % W, y, (warm, warm * 0.88, warm * 0.63))
    # 옆면 가운데 띠: 위아래 주황
    u = 0.0
    for i, ln in enumerate(lens):
        if pick_body(i, ln) == 1:
            for x in range(int(u * 2), int((u + ln) * 2)):
                for y in range(8, 61 * 4):
                    put(x, y, (1.0, 0.6, 0.23))
        u += ln
    # 왕관 바로 아래 가는 빛 줄
    for x in range(W):
        put(x, 61 * 4 - 1, (0.72, 0.83, 1.0))
    img = bpy.data.images.new('night_lights', W, HP, alpha=False)
    img.pixels = px
    img.pack()
    return img


NIGHT_IMG = night_image()
for m in (M_GOLD, M_SILVER):
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'night'
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = NIGHT_IMG
    tex.interpolation = 'Closest'
    nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
    key = 'Emission Color' if 'Emission Color' in bsdf.inputs else 'Emission'
    nt.links.new(tex.outputs['Color'], bsdf.inputs[key])
    # 블렌더 렌더(낮)에선 꺼 두고, 게임이 밤 정도만큼 세기를 켠다 (glTF에는 불빛 텍스처만 실린다)
    bsdf.inputs['Emission Strength'].default_value = 1.0 if 'night' in sys.argv else 0.0


# 몸체 (로비 위 ~ 왕관 아래)
body = wall_mesh('tower_body', LOBBY, CROWN, pick_body)
assign(body, [M_GOLD, M_SILVER, M_GROOVE])
# 왕관 (짙은 띠) — 맨 위 가는 밝은 테두리는 지붕 가장자리로
crown = wall_mesh('tower_crown', CROWN, H, lambda i, ln: 0)
assign(crown, [M_DARK])
# 왕관 바로 아래 가는 빛 줄 (살짝 밖으로)
glow = wall_mesh('crown_glow', CROWN - 0.6, CROWN, lambda i, ln: 0)
glow.scale = (1.003, 1.003, 1)
assign(glow, [M_LIGHT])
# 로비 (짙은 기단)
lobby = wall_mesh('tower_lobby', 0, LOBBY, lambda i, ln: 0)
assign(lobby, [M_PODIUM])

# 지붕
me = bpy.data.meshes.new('roof')
bm = bmesh.new()
bm.faces.new([bm.verts.new(at_height(p, H)) for p in RING])
bm.to_mesh(me)
bm.free()
roof = bpy.data.objects.new('roof', me)
scene.collection.objects.link(roof)
assign(roof, [M_DARK])


def json_box(b, mat, name):
    """판정 상자(지도 x 동·z 남, 가운데 기준) → 블렌더 상자: 지붕(H)부터 꼭대기(top)까지"""
    tall = b['top'] - H
    bpy.ops.mesh.primitive_cube_add(size=1, location=(b['x'], -b['z'], H + tall / 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = (b['hl'] * 2, b['hw'] * 2, tall)
    o.rotation_euler = (0, 0, math.atan2(-b['dz'], b['dx']))
    assign(o, [mat])
    return o


# 옥상 설비(기계실 박스·냉각탑)와 둘레 난간 — 판정 상자와 똑같이 (보이는 것 = 막는 것)
M_ROOFBOX = material('roof_box', (0.45, 0.45, 0.44), rough=0.7)
M_VENT = material('roof_vent', (0.3, 0.31, 0.32), metal=0.5, rough=0.4)
for k, b in enumerate(DATA['roofBoxes']):
    json_box(b, M_VENT if k == len(DATA['roofBoxes']) - 1 else M_ROOFBOX, f'roof_box_{k}')
for k, b in enumerate(DATA['parapet']):
    json_box(b, M_DARK, f'parapet_{k}')


def side_bands():
    """옆면(넓은 앞뒤 면이 아닌 곳)에만 짙은 기계층 띠 — 22·44층, 벽에서 살짝 밖으로"""
    me = bpy.data.meshes.new('bands')
    bm = bmesh.new()
    n = len(RING)
    for floor in (22, 44):
        z0 = floor * FLOOR
        z1 = z0 + FLOOR
        for i in range(n):
            a = RING[i]
            b = RING[(i + 1) % n]
            ln = (b - a).length
            if ln >= 30 or ln < 2.5:
                continue
            pa0 = at_height(a, z0)
            pb0 = at_height(b, z0)
            out = (pb0 - pa0).cross(Vector((0, 0, 1))).normalized() * 0.08
            vs = [bm.verts.new(at_height(a, z0) + out), bm.verts.new(at_height(b, z0) + out), bm.verts.new(at_height(b, z1) + out), bm.verts.new(at_height(a, z1) + out)]
            bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new('bands', me)
    scene.collection.objects.link(obj)
    assign(obj, [M_DARK])


side_bands()

# 안테나: 빨강·흰 줄무늬 철탑
top = at_height(Vector((0, 0, 0)), H)
for k in range(8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.55 - k * 0.04, depth=2.6, location=(top.x, top.y, H + 1.3 + k * 2.6))
    seg = bpy.context.active_object
    seg.name = f'antenna_{k}'
    assign(seg, [M_RED if k % 2 == 0 else M_WHITE])

# 바닥
bpy.ops.mesh.primitive_plane_add(size=900, location=(0, 0, 0))
ground = bpy.context.active_object
ground.name = 'ground'
assign(ground, [M_GROUND])

# ---------- 빛·하늘·카메라 ----------
world = bpy.data.worlds.new('sky')
scene.world = world
world.use_nodes = True
wn = world.node_tree
# 해 방향: 게임과 같게 (게임 SUN_DIR = (-0.55, 1, 0.45), x 동·y 위·z 남 → 블렌더 x 동·y 북·z 위: (-0.55, -0.45, 1))
SUN_FROM = Vector((-0.55, -0.45, 1.0)).normalized()
sky = wn.nodes.new('ShaderNodeTexSky')
try:
    sky.sky_type = 'NISHITA'
    sky.sun_elevation = math.asin(SUN_FROM.z)
    # 하늘의 해 방위: 하늘 텍스처는 +Y(북)에서 시계 반대로 잰다
    sky.sun_rotation = math.atan2(-SUN_FROM.x, SUN_FROM.y)
except Exception:  # noqa: BLE001 — 버전마다 다름
    pass
wn.links.new(sky.outputs['Color'], wn.nodes['Background'].inputs['Color'])
wn.nodes['Background'].inputs['Strength'].default_value = 0.6

sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = 3.5
sun = bpy.data.objects.new('sun', sun_data)
# 해 램프는 빛이 나가는 쪽(-Z)이 해에서 땅으로 향하게
sun.rotation_euler = (-SUN_FROM).to_track_quat('-Z', 'Y').to_euler()
scene.collection.objects.link(sun)

cam_data = bpy.data.cameras.new('cam')
cam_data.lens = 35
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def look(obj, target):
    d = (Vector(target) - obj.location).normalized()
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        continue
# 반사: 금색 유리에 하늘·주변이 비치게 (Eevee 레이트레이싱)
try:
    scene.eevee.use_raytracing = True
    scene.eevee.ray_tracing_options.resolution_scale = '1'
except Exception:  # noqa: BLE001
    pass
scene.render.resolution_x = 900
scene.render.resolution_y = 1400
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'

shots = {
    'render_45': ((-330, -330, 60), (0, 0, 120)),
    'render_front': ((AY.x * -420, AY.y * -420, 40), (0, 0, 125)),
}
for name, (loc, target) in shots.items():
    cam.location = loc
    look(cam, target)
    scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)

# ---------- 웹용 내보내기 (바닥·빛·카메라 빼고) ----------
ground.select_set(False)
for o in scene.objects:
    o.select_set(o.type == 'MESH' and o.name != 'ground')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, '63-building.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('exported glb')
