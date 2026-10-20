# yeouido-map-module

여의도 픽셀맵 (PoC). OpenStreetMap 데이터를 `tools/bake-yeouido.mjs`로 도트 그리드로 구워 `src/lib/data/yeouido-baked.ts`에 넣고, 브라우저에서는 그 그리드를 2.5D로 칠하기만 한다.

## 데이터 다시 굽기

```bash
node lib/modules/yeouido-map-module/tools/bake-yeouido.mjs --fetch   # Overpass에서 다시 받기
node lib/modules/yeouido-map-module/tools/bake-yeouido.mjs           # 캐시(tools/.cache/osm.json)로 굽기
```

지도 데이터 © OpenStreetMap contributors (ODbL)
