# KBS 본관 외형 (블렌더 배경 실행): 지도 바닥 다각형 그대로 + 사진(정면·측면·45도)의 특징 — 게임 외벽을 이것으로 갈아 끼운다 (판정은 원래대로)
# blender -b --factory-startup --python scripts/blender/build_kbs.py -- <out_dir>
# 입력 kbs.json: export-landmark.ts가 지도 데이터·공용 판정(landmarkRoofBoxes)에서 만든 바닥 다각형·높이(지붕면 29m)·송신탑 받침·처마 난간
# - 긴 면(정면·뒷면): 바닥부터 처마까지 닿는 흰 큰 기둥 줄(약 9m 간격), 기둥 사이 1층 위는 1.5m 들어간 짙은 유리면 (양 끝 칸은 흰 석재)
#   1층 벽은 바닥선에 맞춘다 — 걸어서 닿는 높이는 보이는 것 = 막는 것
# - 짧은 면(측면): 흰 석재 벽에 창 4줄(얇은 기둥 사이 두 칸씩), 1층은 회색 석재 + 가운데 유리 출입구
# - 꼭대기: 바깥으로 2.5m 나온 두꺼운 처마(흰색), 처마 아래쪽 짙은 통풍구 띠, 처마 밑면 짙은 회색
# - 옥상: 빨강·흰 격자 송신탑 (판정 받침 자리)
# - 3m 기단 위에 건물이 올라앉고, 공원 쪽 긴 면 앞으로 기단 테라스 + 가운데 넓은 계단 + 양옆 화단 (판정 상자 그대로 — 걸어 올라간다)
#   계단 위 가운데는 유리 출입구
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
DATA = json.load(open(os.path.join(os.path.dirname(__file__), 'kbs.json'), encoding='utf-8'))
H = DATA['h']                      # 지붕면
TOP = DATA['parapet'][0]['top']    # 처마 위 (난간 판정 높이)
PLINTH = DATA['podium'][0]['top']  # 기단 높이 (판정 기단 판 윗면)
LOBBY = PLINTH + 4.0               # 1층 로비 위
EAVE = 26.0                        # 처마 밑
FLOOR = (EAVE - LOBBY) / 4         # 층고 높은 4층
OVER = 2.5                         # 처마가 바깥으로 나온 길이
RECESS = 1.5                       # 긴 면 유리가 들어간 깊이
INNER = DATA['parapet'][0]['hw'] * 2  # 처마 안쪽 두께 (난간 판정 두께)

# 지도 (x 동, z 남) → 블렌더 (x 동, y 북)
RING = [Vector((x, -z, 0)) for x, z in DATA['ring']]
area = sum(RING[i].x * RING[(i + 1) % len(RING)].y - RING[(i + 1) % len(RING)].x * RING[i].y for i in range(len(RING)))
if area < 0:
    RING.reverse()
N = len(RING)
LENS = [(RING[(i + 1) % N] - RING[i]).length for i in range(N)]
LONG = max(LENS) * 0.8


def outward(i):
    d = (RING[(i + 1) % N] - RING[i]).normalized()
    return Vector((d.y, -d.x, 0))


def offset_ring(dist):
    """바닥 다각형을 바깥(+)·안(-)으로 dist만큼 (꼭짓점은 두 변 법선의 이등분 방향)"""
    out = []
    for i in range(N):
        n0 = outward((i - 1) % N)
        n1 = outward(i)
        m = (n0 + n1)
        if m.length < 1e-6:
            m = n1.copy()
        m.normalize()
        k = max(0.3, m.dot(n1))
        out.append(RING[i] + m * (dist / k))
    return out


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- 무늬 (작은 칸을 되풀이, 1m = 10픽셀) ----------
PPM = 10


def tile_image(name, w, h, paint):
    W = int(round(w * PPM))
    HP = int(round(h * PPM))
    arr = np.zeros((HP, W, 3), dtype=np.float32)

    def r(x0, z0, x1, z1, c):
        arr[max(0, int(round(z0 * PPM))):min(HP, int(round(z1 * PPM))), max(0, int(round(x0 * PPM))):min(W, int(round(x1 * PPM)))] = c
    paint(r, w, h)
    img = bpy.data.images.new(name, W, HP, alpha=False)
    rgba = np.ones((HP, W, 4), dtype=np.float32)
    rgba[:, :, :3] = arr
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def srgb(h):
    h = h.lstrip('#')
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))


STONE = srgb('#e8e6e0')
STONE_LINE = srgb('#cfccc4')
GLASS = srgb('#36414c')
GLASS_LINE = srgb('#5d6b78')
GLASS_SKY = srgb('#4d5d6d')
WIN = srgb('#3e4a56')
WIN_FRAME = srgb('#8d939a')
BASE = srgb('#b9b7af')
DARK = srgb('#2e3135')


def paint_curtain(r, w, h):
    # 한 층 높이: 짙은 유리, 1.25m마다 가로 살, 1.5m마다 세로 살, 층 사이 밝은 띠
    r(0, 0, w, h, GLASS)
    r(0, h * 0.55, w, h, GLASS_SKY)
    z = 0.0
    while z < h:
        r(0, z, w, z + 0.08, GLASS_LINE)
        z += 1.25
    r(0, 0, 0.08, h, GLASS_LINE)
    r(1.5, 0, 1.58, h, GLASS_LINE)
    r(0, h - 0.35, w, h, srgb('#4a525a'))


def paint_side(r, w, h):
    # 한 층: 흰 석재, 가운데 창 두 칸 + 얇은 기둥
    r(0, 0, w, h, STONE)
    r(0, 0, w, 0.06, STONE_LINE)
    r(0, 0, 0.5, h, srgb('#f0eee9'))
    for x in (0.9, 3.5):
        r(x, 1.4, x + 2.2, 3.7, WIN_FRAME)
        r(x + 0.12, 1.52, x + 2.08, 3.58, WIN)
        r(x + 0.12, 3.1, x + 2.08, 3.58, srgb('#5a6876'))
        r(x + 1.06, 1.4, x + 1.14, 3.7, WIN_FRAME)


def paint_lobby(r, w, h):
    # 1층 (기단 위 4m): 회색 석재 판 + 짙은 유리 띠
    r(0, 0, w, h, BASE)
    r(0, 3.0, w, 3.05, srgb('#a3a199'))
    r(0.6, 0.0, w - 0.6, 2.7, srgb('#2c3742'))
    r(w / 2 - 0.05, 0, w / 2 + 0.05, 2.7, srgb('#7d868e'))


def paint_entrance(r, w, h):
    # 계단 위 출입구: 큰 유리 + 위 짙은 차양
    r(0, 0, w, h, srgb('#2a3540'))
    for x in np.arange(0, w, 1.5):
        r(x, 0, x + 0.08, 3.2, srgb('#8a939b'))
    r(0, 3.2, w, 3.6, srgb('#3a3d41'))
    r(0, 3.6, w, h, BASE)


def paint_plinth(r, w, h):
    # 기단: 짙은 회색 화강석 판 (가로 0.75m·세로 1.5m 줄눈)
    r(0, 0, w, h, srgb('#a8a69e'))
    z = 0.0
    while z < h:
        r(0, z, w, z + 0.04, srgb('#8f8d86'))
        z += 0.75
    for x in np.arange(0, w, 1.5):
        r(x, 0, x + 0.04, h, srgb('#8f8d86'))


def paint_fascia(r, w, h):
    # 처마 바깥면: 흰 판, 아래쪽 1.2m에 짙은 통풍구 띠
    r(0, 0, w, h, STONE)
    r(0, 0, w, 1.2, srgb('#d6d3cb'))
    for x in np.arange(0.15, w, 0.75):
        r(x, 0.25, x + 0.35, 0.95, srgb('#3b3d40'))
    r(0, h - 0.1, w, h, srgb('#f4f3ef'))


TILES = {
    'curtain': (3.0, FLOOR, paint_curtain),
    'side': (6.0, FLOOR, paint_side),
    'lobby': (6.0, LOBBY - PLINTH, paint_lobby),
    'entrance': (12.0, LOBBY - PLINTH, paint_entrance),
    'fascia': (1.5, TOP - EAVE, paint_fascia),
    'plinth': (6.0, PLINTH, paint_plinth),
}


def material(name, color=None, image=None, rough=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    if color:
        bsdf.inputs['Base Color'].default_value = (*srgb(color), 1)
    bsdf.inputs['Roughness'].default_value = rough
    if image:
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.interpolation = 'Closest'
        m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


MATS = {k: material(f'kbs_{k}', image=tile_image(k, w, h, p)) for k, (w, h, p) in TILES.items()}
M_STONE = material('kbs_stone', '#ebe9e3')
M_SOFFIT = material('kbs_soffit', '#45484c')
M_ROOF = material('kbs_roof', '#86817a', rough=1.0)  # 하늘빛을 받아 파래 보이지 않게 따뜻한 회색
M_RED = material('kbs_red', '#c8402f', rough=0.5)
M_WHITE = material('kbs_white', '#f2f2f0', rough=0.5)
M_GROUND = material('ground', '#6c7068', rough=0.9)
M_PAVE = material('kbs_pave', '#d4d1c9', rough=0.9)
M_HEDGE = material('kbs_hedge', '#4f7a3e', rough=1.0)

# 재질 번호 (한 메시에 여러 재질)
TEX_KEYS = ['curtain', 'side', 'lobby', 'entrance', 'fascia', 'plinth']
MAT_ORDER = TEX_KEYS + ['stone', 'soffit', 'roof', 'pave', 'hedge']
MAT_LIST = [MATS[k] for k in TEX_KEYS] + [M_STONE, M_SOFFIT, M_ROOF, M_PAVE, M_HEDGE]
MI = {k: i for i, k in enumerate(MAT_ORDER)}

me = bpy.data.meshes.new('kbs_body')
body = bpy.data.objects.new('kbs_body', me)
scene.collection.objects.link(body)
for m in MAT_LIST:
    body.data.materials.append(m)
bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')


def quad(p0, p1, z0, z1, mat, u0=0.0):
    """세운 벽 (p0→p1 바깥에서 볼 때 왼→오), 무늬 칸 크기로 UV"""
    tw, th = (TILES[mat][0], TILES[mat][1]) if mat in TILES else (1.0, 1.0)
    ln = (p1 - p0).length
    f = bm.faces.new([bm.verts.new(p0 + Vector((0, 0, z0))), bm.verts.new(p1 + Vector((0, 0, z0))),
                      bm.verts.new(p1 + Vector((0, 0, z1))), bm.verts.new(p0 + Vector((0, 0, z1)))])
    f.material_index = MI[mat]
    for loop, (uu, vv) in zip(f.loops, [(u0, 0), (u0 + ln, 0), (u0 + ln, z1 - z0), (u0, z1 - z0)]):
        loop[uvl].uv = (uu / tw, vv / th)
    return f


def flat(pts, z, mat, down=False):
    vs = [bm.verts.new(p + Vector((0, 0, z))) for p in (reversed(pts) if down else pts)]
    f = bm.faces.new(vs)
    f.material_index = MI[mat]
    return f


def ring_band(outer, inner, z, mat, down=False):
    """두 고리 사이 수평 띠 (처마 윗면·밑면)"""
    for i in range(N):
        j = (i + 1) % N
        pts = [outer[i], outer[j], inner[j], inner[i]]
        vs = [bm.verts.new(p + Vector((0, 0, z))) for p in (reversed(pts) if down else pts)]
        f = bm.faces.new(vs)
        f.material_index = MI[mat]


def box(center, along, across, w, d, z0, z1, mat):
    """기둥: along 방향 폭 w, across 방향 깊이 d"""
    hw = along * (w / 2)
    corners = [center - hw, center + hw, center + hw + across * d, center - hw + across * d]
    for k in range(4):
        quad(corners[k], corners[(k + 1) % 4], z0, z1, mat)
    flat(corners, z1, mat)


COL_W = 2.4
COL_STEP = 9.0
# 기단이 붙는 정면: 기단 판(판정 상자 첫째) 가운데에서 가장 가까운 긴 변
POD = DATA['podium']
pc = Vector((POD[0]['x'], -POD[0]['z'], 0))
FRONT = min((i for i in range(N) if LENS[i] >= LONG),
            key=lambda i: ((RING[i] + RING[(i + 1) % N]) / 2 + outward(i) * POD[0]['hw'] - pc).length)
STAIR_W = POD[1]['hl'] * 2
for i in range(N):
    a = RING[i]
    b = RING[(i + 1) % N]
    ln = LENS[i]
    if ln < 0.05:
        continue
    d = (b - a).normalized()
    n = outward(i)
    # 기단 (모든 면, 정면은 테라스에 가려진다)
    quad(a, b, 0, PLINTH, 'plinth')
    if ln >= LONG:
        # 긴 면: 1층은 바닥선 벽 (정면은 계단 위 가운데 유리 출입구), 그 위는 들어간 유리 + 기둥
        if i == FRONT:
            m0 = ln / 2 - STAIR_W / 2
            quad(a, a + d * m0, PLINTH, LOBBY, 'lobby')
            quad(a + d * m0, a + d * (m0 + STAIR_W), PLINTH, LOBBY, 'entrance')
            quad(a + d * (m0 + STAIR_W), b, PLINTH, LOBBY, 'lobby', u0=m0 + STAIR_W)
        else:
            quad(a, b, PLINTH, LOBBY, 'lobby')
        # 1층 위 턱 (바닥선 → 들어간 유리선)
        ia = a - n * RECESS
        ib = b - n * RECESS
        f = bm.faces.new([bm.verts.new(a + Vector((0, 0, LOBBY))), bm.verts.new(b + Vector((0, 0, LOBBY))),
                          bm.verts.new(ib + Vector((0, 0, LOBBY))), bm.verts.new(ia + Vector((0, 0, LOBBY)))])
        f.material_index = MI['stone']
        # 들어간 유리: 양 끝 칸은 흰 석재
        cols = max(2, int(round(ln / COL_STEP)) + 1)
        step = (ln - COL_W) / (cols - 1)
        for k in range(cols - 1):
            s0 = COL_W / 2 + k * step
            s1 = s0 + step
            mat = 'stone' if k in (0, cols - 2) else 'curtain'
            quad(ia + d * s0, ia + d * s1, LOBBY, EAVE, mat, u0=s0)
        # 기둥 앞면은 1층 벽과 겹치지 않게 15cm 앞으로 (판정 차이는 무시할 만큼)
        for k in range(cols):
            c = a + d * (COL_W / 2 + k * step) + n * 0.15
            box(c, d, -n, COL_W, RECESS + 0.15, PLINTH, EAVE, 'stone')
    else:
        # 짧은 면: 바닥선 흰 석재 벽, 창 4줄, 1층 회색 석재
        quad(a, b, LOBBY, EAVE, 'side')
        quad(a, b, PLINTH, LOBBY, 'lobby')


def jbox(b, side, top, z0=0.0, z1=None):
    """판정 상자(지도 x 동·z 남, 가운데 기준) 그대로: 옆면·윗면"""
    z1 = b['top'] if z1 is None else z1
    c = Vector((b['x'], -b['z'], 0))
    d = Vector((b['dx'], -b['dz'], 0)).normalized()
    left = Vector((-d.y, d.x, 0))
    cs = [c - d * b['hl'] - left * b['hw'], c + d * b['hl'] - left * b['hw'], c + d * b['hl'] + left * b['hw'], c - d * b['hl'] + left * b['hw']]
    for k in range(4):
        quad(cs[k], cs[(k + 1) % 4], z0, z1, side)
    if top:
        flat(cs, z1, top)


# 기단 테라스 (판정 첫 상자), 계단 (다음 단들), 화단 둘 (마지막 둘): 판정과 같은 자리·크기
jbox(POD[0], 'plinth', 'pave')
for st in POD[1:-2]:
    jbox(st, 'stone', 'stone')
for pl in POD[-2:]:
    jbox(pl, 'plinth', None, 0, pl['top'] - 0.45)
    jbox(pl, 'hedge', 'hedge', pl['top'] - 0.45, pl['top'])

# 처마: 바깥면(나온 만큼), 윗면, 안쪽면(지붕 위), 밑면(들어간 유리선까지 덮는다)
OUTER = offset_ring(OVER)
INNR = offset_ring(-INNER)
DEEP = offset_ring(-RECESS - 0.05)
u = 0.0
for i in range(N):
    j = (i + 1) % N
    quad(OUTER[i], OUTER[j], EAVE, TOP, 'fascia', u0=u)
    u += (OUTER[j] - OUTER[i]).length
    quad(INNR[j], INNR[i], H, TOP, 'stone')
ring_band(OUTER, INNR, TOP, 'stone')
ring_band(OUTER, DEEP, EAVE, 'soffit', down=True)
# 지붕
flat(INNR, H, 'roof')
# 면 방향은 만들 때 맞춘다 (바닥 다각형을 시계 반대로 돌며 바깥이 앞)
bm.to_mesh(me)
bm.free()

# ---------- 송신탑 (판정 받침 자리에 빨강·흰 격자탑) ----------
tb = DATA['roofBoxes'][0]
tc = Vector((tb['x'], -tb['z'], H))
tall = tb['top'] - H
base_half = tb['hl']
top_half = 0.8
ang = math.atan2(-tb['dz'], tb['dx'])
ax = Vector((math.cos(ang), math.sin(ang), 0))
ay = Vector((-ax.y, ax.x, 0))


def corner(half, z, sx, sy):
    return tc + ax * (half * sx) + ay * (half * sy) + Vector((0, 0, z))


def beam(p0, p1, rad, mat, name):
    v = p1 - p0
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=rad, depth=v.length, location=(p0 + p1) / 2)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = v.to_track_quat('Z', 'Y').to_euler()
    o.data.materials.append(mat)


SEG = 4.0
levels = int(tall // SEG)
for k in range(levels):
    z0 = k * SEG
    z1 = z0 + SEG
    h0 = base_half + (top_half - base_half) * (z0 / tall)
    h1 = base_half + (top_half - base_half) * (z1 / tall)
    mat = M_RED if k % 2 == 0 else M_WHITE
    for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        beam(corner(h0, z0, sx, sy), corner(h1, z1, sx, sy), 0.22, mat, f'tower_leg_{k}')
    # 가로 테·대각 가새
    sides = [((1, 1), (-1, 1)), ((-1, 1), (-1, -1)), ((-1, -1), (1, -1)), ((1, -1), (1, 1))]
    for (s0, s1) in sides:
        beam(corner(h1, z1, *s0), corner(h1, z1, *s1), 0.12, mat, f'tower_ring_{k}')
        beam(corner(h0, z0, *s0), corner(h1, z1, *s1), 0.08, mat, f'tower_brace_{k}')
# 꼭대기 피뢰 기둥
beam(corner(0, levels * SEG, 0, 0), corner(0, tall + 4, 0, 0), 0.15, M_WHITE, 'tower_mast')

# 바닥
bpy.ops.mesh.primitive_plane_add(size=500, location=(0, 0, 0))
ground = bpy.context.active_object
ground.name = 'ground'
ground.data.materials.append(M_GROUND)

# ---------- 빛·하늘·카메라 (확인용 렌더) ----------
world = bpy.data.worlds.new('sky')
scene.world = world
world.use_nodes = True
wn = world.node_tree
SUN_FROM = Vector((-0.55, -0.45, 1.0)).normalized()
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
scene.render.resolution_x = 1200
scene.render.resolution_y = 800
scene.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
# 기단이 붙은 정면의 바깥 방향에서
li = FRONT
mid = (RING[li] + RING[(li + 1) % N]) / 2
nf = outward(li)
dl = (RING[(li + 1) % N] - RING[li]).normalized()
shots = {
    'render_front': (mid + nf * 140 + Vector((0, 0, 12)), mid + Vector((0, 0, 14))),
    'render_45': (mid + nf * 120 + dl * 110 + Vector((0, 0, 30)), Vector((0, 0, 12))),
}
for name, (loc, target) in shots.items():
    cam.location = loc
    look(cam, target)
    scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)

for o in scene.objects:
    o.select_set(o.type == 'MESH' and o.name != 'ground')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'kbs-main.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('exported glb')
