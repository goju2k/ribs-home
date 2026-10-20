# yeouido-3d-module

여의도 3D (PoC). OSM 데이터를 `tools/bake-yeouido-3d.mjs`로 미터 단위 벡터 묶음(`src/lib/data/yeouido-3d.json`)으로 굽고, three.js로 낮은 해상도 렌더 → 확대해서 도트 느낌을 낸다. 실제 비율(사람 1.72m).

```bash
node lib/modules/yeouido-map-module/tools/bake-yeouido.mjs --fetch   # OSM 캐시 갱신(선택)
node lib/modules/yeouido-3d-module/tools/bake-yeouido-3d.mjs
```

- 주소 옵션: `?pix=1~8` 도트 크기(CSS px)
- 조작: WASD/방향키, Shift 달리기, Q/E 회전, 휠/+/- 확대 · 터치는 가상 조이스틱

지도 데이터 © OpenStreetMap contributors (ODbL)
