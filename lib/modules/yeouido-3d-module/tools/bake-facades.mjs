/* eslint-disable no-console -- 일회성 굽기 스크립트 */
// 건물 외벽 종류 굽기: OSM 태그·층수·높이로 건물마다 외벽 종류 한 글자 (화면 전용 — 판정과 무관)
//   node lib/modules/yeouido-3d-module/tools/bake-facades.mjs
// 입력: yeouido-sim 의 yeouido-3d.json (buildings·buildingMeta 순서) + yeouido-map-module/tools/.cache/osm.json (태그)
// 출력: src/lib/world/facade-classes.json  { classes: "AAOR…" } — buildings 와 같은 순서
// 종류 (facade-kit.ts 의 사진 기반 외벽):
//   A 중층 아파트(구축)  N 고층 아파트  O 중고층 오피스  T 초고층 유리 오피스  R 저층 상가·근린
//   C 교회(벽돌)  S 학교  P 저층 공공·기관  X 부속(정자·차고 등, 창 없음)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', '..', 'yeouido-map-module', 'tools', '.cache', 'osm.json');
const WORLD = path.join(HERE, '..', '..', 'yeouido-sim', 'src', 'data', 'yeouido-3d.json');
const OUT = path.join(HERE, '..', 'src', 'lib', 'world', 'facade-classes.json');

const ANNEX = new Set([ 'roof', 'garage', 'garages', 'shed', 'kiosk', 'hut', 'toilets', 'service', 'transformer_tower', 'carport' ]);
const HOME = new Set([ 'apartments', 'residential', 'house', 'detached', 'terrace' ]);
const CHURCH = new Set([ 'church', 'religious', 'cathedral', 'chapel', 'temple' ]);
const SCHOOL = new Set([ 'school', 'university', 'college', 'kindergarten' ]);
const PUBLIC = new Set([ 'public', 'civic', 'government', 'hospital', 'train_station', 'mice', 'parkingbuilding' ]);

const { elements } = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const world = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
const tags = new Map(elements.filter((e) => e.tags?.building).map((e) => [ `${e.type === 'relation' ? 'r' : 'w'}${e.id}`, e.tags ]));

function area(row) {
  let a = 0;
  for (let k = 4; k + 1 < row.length; k += 2) {
    // 다음 점 (마지막 점 다음은 첫 점)
    const n = k + 2 < row.length ? k + 2 : 4;
    a += row[k] * row[n + 1] - row[n] * row[k + 1];
  }
  return Math.abs(a) / 2;
}

function classify(t, h, levels, row) {
  const b = t.building || 'yes';
  const floors = levels || Math.round(h / 3.2);
  if (ANNEX.has(b) || (h < 6 && area(row) < 300)) return 'X';
  if (HOME.has(b)) return floors >= 20 ? 'N' : 'A';
  if (b === 'officetel') return h >= 60 ? 'N' : 'O';
  if (CHURCH.has(b) || t.amenity === 'place_of_worship') return 'C';
  if (SCHOOL.has(b) || [ 'school', 'university', 'college', 'kindergarten' ].includes(t.amenity)) return 'S';
  if (PUBLIC.has(b)) return h >= 40 ? 'O' : 'P';
  if (h >= 90) return 'T';
  if (h >= 35) return 'O';
  return 'R';
}

let classes = '';
const count = {};
world.buildings.forEach((row, i) => {
  const [ rel, id, levels ] = world.buildingMeta[i];
  const t = tags.get(`${rel ? 'r' : 'w'}${id}`) || {};
  const c = classify(t, row[0], levels, row);
  classes += c;
  count[c] = (count[c] || 0) + 1;
});
fs.writeFileSync(OUT, `${JSON.stringify({ classes })}\n`);
console.log(`facade classes → ${path.relative(process.cwd(), OUT)}`, count);