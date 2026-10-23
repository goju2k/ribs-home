/**
 * 블렌더 랜드마크 입력 만들기: 지도 데이터의 바닥 다각형·높이와 공용 판정의 옥상 상자(landmarkRoofBoxes)를 JSON으로.
 * 블렌더 스크립트(build63.py)가 이 값을 그대로 써서 화면 모델과 판정이 어긋나지 않게 한다.
 * 실행: npx esbuild scripts/blender/export-landmark.ts --bundle --platform=node --tsconfig=tsconfig.base.json --outfile=<tmp>.js && node <tmp>.js 63빌딩 scripts/blender/63.json
 * 좌표: 바닥 다각형 점들의 평균을 원점으로 (지도 x 동·z 남)
 */
import { landmarkRoofBoxes, WORLD } from 'yeouido-sim';

import { writeFileSync } from 'fs';

const [ name, out ] = process.argv.slice(2);
const bi = Number(Object.entries(WORLD.buildingNames).find(([ , n ]) => n === name)?.[0]);
const row = WORLD.buildings[bi];
const ring:[number, number][] = [];
for (let k = 4; k + 1 < row.length; k += 2) ring.push([ row[k], row[k + 1] ]);
const cx = ring.reduce((t, p) => t + p[0], 0) / ring.length;
const cz = ring.reduce((t, p) => t + p[1], 0) / ring.length;
const roof = landmarkRoofBoxes(WORLD, name)!;
const r2 = (n:number) => Math.round(n * 1000) / 1000;
const box = (b:{ cx: number; cz: number; dx: number; dz: number; hl: number; hw: number; h: number; }) => ({ x: r2(b.cx - cx), z: r2(b.cz - cz), dx: r2(b.dx), dz: r2(b.dz), hl: r2(b.hl), hw: r2(b.hw), top: r2(b.h) });
writeFileSync(out, JSON.stringify({ name, h: row[0], ring: ring.map(([ x, z ]) => [ r2(x - cx), r2(z - cz) ]), roofBoxes: roof.boxes.map(box), parapet: roof.parapet.map(box) }, null, 1));
console.log(`${name}: ring ${ring.length}, roof boxes ${roof.boxes.length}, parapet ${roof.parapet.length} → ${out}`);