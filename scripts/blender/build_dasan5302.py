# 다산 시험 건물(다산자연앤이편한세상 3차 5302동) 외형 (블렌더 배경 실행) — places 지도의 해 그림자 시험용
# blender -b --factory-startup --python scripts/blender/build_dasan5302.py -- <out_dir>
# 입력 dasan-5302.json: 지도에서 따 그린 바닥 다각형(가운데 기준 m, 지도 x 동·z 남)·높이·끝벽 변 번호·옥탑
# 사진(정면·측면·45도)에서 본 특징:
# - 앞뒤 긴 면: 흰 벽에 짙은 회색 창 상자가 층마다 엇갈려 (벽돌 쌓듯), 긴 면 가운데는 연회색 줄무늬 판 세로 띠
# - 짧은 끝벽: 연회색 가로 줄무늬 판, 양 모서리에 짙은 회색 세로 토막(두 층 남짓마다 흰 틈), 아래쪽에 동 번호
# - 1층: 짙은 유리 출입 띠, 꼭대기: 흰 난간 띠 + 옥탑 (옥상 사진이 없어 단순한 상자)
# 텍스처는 둘레 전체 × 높이를 한 장으로 칠해 되풀이가 없다 (밤은 지도가 화면 전체를 어둡게 깔아서 불빛을 따로 두지 않는다)
import json
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.dirname(__file__)
DATA = json.load(open(os.path.join(os.path.dirname(__file__), 'dasan-5302.json'), encoding='utf-8'))
H = DATA['h']
FLOORS = DATA['floors']
FLOOR = H / FLOORS
ENDS = set(DATA['ends'])
# 지도 (x 동, z 남) → 블렌더 (x 동, y 북)
RING = [Vector((x, -z, 0)) for x, z in DATA['ring']]
# 시계 반대 방향으로 (변 a→b 의 바깥 = (dy, -dx))
area = sum(RING[i].x * RING[(i + 1) % len(RING)].y - RING[(i + 1) % len(RING)].x * RING[i].y for i in range(len(RING)))
REVERSED = area < 0
if REVERSED:
    RING.reverse()
    # 끝벽 번호도 뒤집힌 순서로
    n0 = len(RING)
    ENDS = {(n0 - 2 - i) % n0 for i in ENDS}
N = len(RING)
LENS = [(RING[(i + 1) % N] - RING[i]).length for i in range(N)]
PERIM = sum(LENS)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- 텍스처 (둘레 × 높이, 1m = PPM 픽셀) ----------
PPM = 8
TW = int(math.ceil(PERIM * PPM))
TH = int(math.ceil(H * PPM))
day = np.zeros((TH, TW, 3), dtype=np.float32)

WHITE = (0.88, 0.89, 0.88)
PANEL = (0.76, 0.78, 0.79)
PANEL_LINE = (0.66, 0.68, 0.7)
CHAR = (0.25, 0.26, 0.28)
GLASS = (0.12, 0.15, 0.19)
BASE = (0.5, 0.51, 0.52)


def rect(img, u0, u1, z0, z1, c):
    """u: 둘레 거리(m), z: 높이(m) — 아래가 0행"""
    x0 = max(0, int(round(u0 * PPM)))
    x1 = min(TW, int(round(u1 * PPM)))
    y0 = max(0, int(round(z0 * PPM)))
    y1 = min(TH, int(round(z1 * PPM)))
    if x1 > x0 and y1 > y0:
        img[y0:y1, x0:x1] = c


def panel(u0, u1, z0, z1, gap=0.6):
    """연회색 가로 줄무늬 판"""
    rect(day, u0, u1, z0, z1, PANEL)
    z = z0
    while z < z1:
        rect(day, u0, u1, z, z + 1 / PPM, PANEL_LINE)
        z += gap


def window(u0, u1, z0, z1):
    """짙은 창 상자 + 안쪽 유리 + 가운데 창살"""
    rect(day, u0, u1, z0, z1, CHAR)
    rect(day, u0 + 0.2, u1 - 0.2, z0 + 0.2, z1 - 0.16, GLASS)
    # 유리 위쪽 하늘 반사 한 줄
    rect(day, u0 + 0.2, u1 - 0.2, z1 - 0.42, z1 - 0.16, (0.32, 0.38, 0.45))
    mid = (u0 + u1) / 2
    rect(day, mid - 0.04, mid + 0.04, z0, z1, CHAR)


def paint_front(u, ln):
    rect(day, u, u + ln, FLOOR, H, WHITE)
    core = None
    if ln > 20:
        # 긴 면 가운데: 연회색 줄무늬 판 세로 띠 (계단실)
        c = u + ln / 2
        core = (c - 1.2, c + 1.2)
        panel(core[0], core[1], FLOOR, H - 0.6)
    for f in range(1, FLOORS):
        z = f * FLOOR
        # 창 상자 2.5m 폭·3.3m 간격, 층마다 반 칸씩 엇갈림 (사진: 흰 틀 사이로 짙은 상자가 빽빽)
        shift = 1.65 if f % 2 else 0.0
        a = u + 0.35 + shift
        while a + 2.5 <= u + ln - 0.25:
            if not core or a + 2.5 < core[0] - 0.2 or a > core[1] + 0.2:
                window(a, a + 2.5, z + 0.5, z + 2.6)
            a += 3.3
    # 1층: 짙은 유리 출입 띠
    rect(day, u, u + ln, 0, FLOOR, BASE)
    rect(day, u + 0.3, u + ln - 0.3, 0.3, FLOOR - 0.5, (0.16, 0.19, 0.22))


def paint_end(u, ln):
    panel(u, u + ln, FLOOR, H - 0.6)
    # 양 모서리 짙은 세로 토막 (두 층마다 흰 틈)
    for side in (u, u + ln - 0.9):
        rect(day, side, side + 0.9, FLOOR, H - 0.6, WHITE)
        z = FLOOR
        while z < H - 1:
            rect(day, side, side + 0.9, z + 0.35, min(z + 2 * FLOOR, H - 0.6), CHAR)
            z += 2 * FLOOR
    rect(day, u, u + ln, 0, FLOOR, BASE)


def paint_step(u, ln):
    panel(u, u + ln, FLOOR, H - 0.6)
    rect(day, u, u + ln, 0, FLOOR, BASE)


SEG_U = []
u = 0.0
for i, ln in enumerate(LENS):
    SEG_U.append(u)
    if i in ENDS:
        paint_end(u, ln)
    elif ln < 2.5:
        paint_step(u, ln)
    else:
        paint_front(u, ln)
    u += ln
# 꼭대기 흰 난간 띠
rect(day, 0, PERIM, H - 0.6, H, (0.93, 0.93, 0.92))


def to_image(name, arr):
    img = bpy.data.images.new(name, TW, TH, alpha=False)
    rgba = np.ones((TH, TW, 4), dtype=np.float32)
    rgba[:, :, :3] = arr
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


DAY_IMG = to_image('wall_day', day)


def material(name, color, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return m


M_WALL = material('apt_wall', (1, 1, 1), rough=0.55)
nt = M_WALL.node_tree
bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = DAY_IMG
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])

M_ROOF = material('apt_roof', (0.42, 0.43, 0.44), rough=0.8)
M_TOP = material('apt_rooftop', (0.82, 0.83, 0.83), rough=0.6)
M_NUM = material('apt_number', (0.05, 0.05, 0.06), rough=0.7)
M_GROUND = material('ground', (0.42, 0.44, 0.4), rough=0.9)


def assign(obj, mats):
    for m in mats:
        obj.data.materials.append(m)


# ---------- 몸체 ----------
me = bpy.data.meshes.new('apt_body')
body = bpy.data.objects.new('apt_body', me)
scene.collection.objects.link(body)
bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')
for i in range(N):
    a = RING[i]
    b = RING[(i + 1) % N]
    if LENS[i] < 0.01:
        continue
    f = bm.faces.new([bm.verts.new(a), bm.verts.new(b), bm.verts.new(b + Vector((0, 0, H))), bm.verts.new(a + Vector((0, 0, H)))])
    u0 = SEG_U[i]
    u1 = u0 + LENS[i]
    for loop, (uu, vv) in zip(f.loops, [(u0, 0), (u1, 0), (u1, H), (u0, H)]):
        loop[uvl].uv = (uu / PERIM, vv / H)
bm.to_mesh(me)
bm.free()
assign(body, [M_WALL])

# 지붕 (난간 띠 높이만큼 아래 — 위에서 보면 난간이 둘러 보인다)
me = bpy.data.meshes.new('apt_roof')
bm = bmesh.new()
bm.faces.new([bm.verts.new(p + Vector((0, 0, H - 0.6))) for p in RING])
bm.to_mesh(me)
bm.free()
roof = bpy.data.objects.new('apt_roof', me)
scene.collection.objects.link(roof)
assign(roof, [M_ROOF])
# 난간 안쪽 면 (지붕 아래로 꺼진 둘레가 비어 보이지 않게)
me = bpy.data.meshes.new('apt_parapet_in')
bm = bmesh.new()
for i in range(N):
    a = RING[i]
    b = RING[(i + 1) % N]
    if LENS[i] < 0.01:
        continue
    bm.faces.new([bm.verts.new(b + Vector((0, 0, H - 0.6))), bm.verts.new(a + Vector((0, 0, H - 0.6))), bm.verts.new(a + Vector((0, 0, H))), bm.verts.new(b + Vector((0, 0, H)))])
bm.to_mesh(me)
bm.free()
par = bpy.data.objects.new('apt_parapet_in', me)
scene.collection.objects.link(par)
assign(par, [M_TOP])

# 옥탑
for k, t in enumerate(DATA['rooftops']):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(t['x'], -t['z'], H - 0.6 + t['h'] / 2))
    o = bpy.context.active_object
    o.name = f'apt_rooftop_{k}'
    o.scale = (t['w'], t['d'], t['h'])
    o.rotation_euler = (0, 0, math.radians(t['rot']))
    assign(o, [M_TOP])

# 끝벽 동 번호 (아래쪽, 벽에서 살짝 밖으로)
for i in sorted(ENDS):
    a = RING[i]
    b = RING[(i + 1) % N]
    d = (b - a).normalized()
    out = Vector((d.y, -d.x, 0))
    cu = bpy.data.curves.new(f'num_{i}', 'FONT')
    cu.body = '5302'
    cu.size = 3.4
    cu.extrude = 0.08
    cu.align_x = 'CENTER'
    o = bpy.data.objects.new(f'apt_number_{i}', cu)
    scene.collection.objects.link(o)
    mid = (a + b) / 2 + out * 0.06
    o.location = (mid.x, mid.y, FLOOR + 2.2)
    # 글자 면(+Z)을 바깥으로, 글자 가로(+X)를 벽 방향으로
    o.rotation_euler = (math.pi / 2, 0, math.atan2(d.y, d.x))
    assign(o, [M_NUM])
    bpy.context.view_layer.objects.active = o
    for s in scene.objects:
        s.select_set(s == o)
    bpy.ops.object.convert(target='MESH')

# 바닥
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
ground = bpy.context.active_object
ground.name = 'ground'
assign(ground, [M_GROUND])

# ---------- 빛·하늘·카메라 (확인용 렌더) ----------
world = bpy.data.worlds.new('sky')
scene.world = world
world.use_nodes = True
wn = world.node_tree
SUN_FROM = Vector((0.45, -0.75, 0.6)).normalized()  # 남동쪽 오전 해
sky = wn.nodes.new('ShaderNodeTexSky')
try:
    sky.sky_type = 'NISHITA'
    sky.sun_elevation = math.asin(SUN_FROM.z)
    sky.sun_rotation = math.atan2(-SUN_FROM.x, SUN_FROM.y)
except Exception:  # noqa: BLE001 — 버전마다 다름
    pass
wn.links.new(sky.outputs['Color'], wn.nodes['Background'].inputs['Color'])
wn.nodes['Background'].inputs['Strength'].default_value = 0.6
sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = 3.5
sun = bpy.data.objects.new('sun', sun_data)
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
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
shots = {
    'render_45': ((95, -150, 30), (0, 0, 40)),
    'render_side': ((150, 10, 25), (0, 0, 40)),
    'render_north': ((-30, 170, 30), (0, 0, 40)),
}
for name, (loc, target) in shots.items():
    cam.location = loc
    look(cam, target)
    scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)

# ---------- 웹용 내보내기 (바닥·빛·카메라 빼고) ----------
for o in scene.objects:
    o.select_set(o.type == 'MESH' and o.name != 'ground')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'dasan-5302.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('exported glb')
