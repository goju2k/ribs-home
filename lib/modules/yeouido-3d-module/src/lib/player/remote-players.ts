import * as THREE from 'three';

import { createPerson, Person } from './person';

import { Appearance, Look, PLAIN_LOOK } from '../modes/mode-client';
import { Remote } from '../net/client';
import { PIXEL_FONT } from '../ui/pixel';

const barColor = (v:number) => {
  if (v > 0.5) return '#5fd35f';
  return v > 0.25 ? '#ffd84a' : '#ff5a4a';
};

const SHIRTS = [ '#3f8fd2', '#43a56b', '#d9a13b', '#8a5cc7', '#2fb3b0', '#c75c8f', '#6d7f3a', '#e07a3f' ];
const PANTS = [ '#2f3a4a', '#4a3a2f', '#33473a', '#3d3550' ];

/**
 * 이름표는 저해상도 3D 화면에 그리면 글자가 뭉개져서, 화면 위 HTML 글자로 띄우고 매 프레임 머리 위로 옮긴다
 */
function nameTag(name:string) {
  const el = document.createElement('div');
  el.textContent = name;
  Object.assign(el.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    padding: '1px 5px',
    font: `11px ${PIXEL_FONT}`,
    lineHeight: '14px',
    color: '#f4f4f8',
    background: 'rgba(11,14,34,0.7)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    willChange: 'transform',
    textAlign: 'center',
  });
  // 이름표 아래 막대 (게임 모드가 정함 — 예: 체력)
  const bar = document.createElement('div');
  Object.assign(bar.style, { height: '3px', marginTop: '1px', background: '#0b0e22', display: 'none' });
  const fill = document.createElement('div');
  Object.assign(fill.style, { height: '100%', width: '100%', background: '#5fd35f' });
  bar.appendChild(fill);
  el.appendChild(bar);
  return { el, bar, fill };
}

interface Shown {
  person: Person;
  tag: HTMLDivElement;
  bar: HTMLDivElement;
  fill: HTMLDivElement;
  /** 지금 막대 값 (바뀔 때만 DOM을 고친다) */
  barV: number | null;
  /** 모습 종류 (바뀌면 다시 만든다) */
  k: number;
  name: string;
  /** 이름표를 붙일 머리 위 점 (월드) */
  head: THREE.Vector3;
  on: boolean;
  /** 날 때 기울기용: 지난 위치와 부드럽게 잰 수평 속도 */
  lx: number;
  lz: number;
  speed: number;
}

/** 서버에서 받은 다른 사람들을 장면에 그린다 */
export class RemotePlayers {

  private shown = new Map<number, Shown>();

  private scene:THREE.Scene;

  private layer:HTMLElement;

  private v = new THREE.Vector3();

  /** layer: 캔버스 위에 겹친 요소 (이름표를 넣는다) */
  constructor(scene:THREE.Scene, layer:HTMLElement) {
    this.scene = scene;
    this.layer = layer;
  }

  get size() {
    return this.shown.size;
  }

  /**
   * @param list 보간된 다른 사람들
   * @param visible 지금 내 위치에서 보이는 사람인지 (실내 층 구분)
   * @param big 캐릭터 확대 배율
   * @param flying 날고 있는 사람인지 (날면 진행 방향으로 몸을 기울여 그린다)
   * @param look 게임 모드가 정한 모습 (숨김·동작·막대)
   * @param appearance 모습 종류(k) → NPC 모습 (null이면 사람)
   */
  update(list:Remote[], dt:number, visible:(r:Remote) => boolean, big:number, flying:(r:Remote) => boolean, look:(r:Remote) => Look = () => PLAIN_LOOK, appearance:(k:number) => Appearance | null = () => null) {
    const seen = new Set<number>();
    list.forEach((r) => {
      seen.add(r.id);
      let s = this.shown.get(r.id);
      if (!s || s.name !== r.name || s.k !== r.k) {
        if (s) this.remove(r.id);
        const app = r.k ? appearance(r.k) : null;
        const person = createPerson(app?.look ?? { shirt: SHIRTS[r.id % SHIRTS.length], pants: PANTS[r.id % PANTS.length], skin: '#f1c7a0', hair: '#2a1d14' });
        const { el: tag, bar, fill } = nameTag(r.name || (r.k ? '' : `#${r.id}`));
        // NPC는 이름표 대신 막대만 (모드가 이름표를 원하면 이름 칸을 쓴다)
        if (app && !app.tag) tag.firstChild!.textContent = '';
        this.scene.add(person.root);
        this.layer.appendChild(tag);
        s = { person, tag, bar, fill, barV: null, k: r.k, name: r.name, head: new THREE.Vector3(), on: false, lx: r.x, lz: r.z, speed: 0 };
        this.shown.set(r.id, s);
      }
      const lk = look(r);
      s.on = visible(r) && !lk.hidden;
      s.person.root.visible = s.on;
      if (!s.on) return;
      const bare = !s.tag.firstChild?.textContent;
      s.tag.style.padding = bare ? '0' : '1px 5px';
      s.tag.style.background = bare ? 'transparent' : 'rgba(11,14,34,0.7)';
      s.tag.style.minWidth = bare ? '24px' : '';
      if (lk.bar !== s.barV) {
        s.barV = lk.bar;
        s.bar.style.display = lk.bar === null ? 'none' : 'block';
        if (lk.bar !== null) {
          s.fill.style.width = `${Math.round(lk.bar * 100)}%`;
          s.fill.style.background = barColor(lk.bar);
        }
      }
      s.person.root.position.set(r.x, r.y, r.z);
      s.person.root.rotation.y = r.f;
      s.person.root.scale.setScalar(big);
      const v = dt > 0 ? Math.hypot(r.x - s.lx, r.z - s.lz) / dt : 0;
      s.speed += (Math.min(60, v) - s.speed) * (1 - Math.exp(-dt * 8));
      s.lx = r.x;
      s.lz = r.z;
      s.person.animate(dt, r.a, flying(r) ? Math.min(1, s.speed / 12) : 0);
      s.person.pose(lk);
      s.head.set(r.x, r.y + 1.72 * big, r.z);
    });
    [ ...this.shown.keys() ].filter((id) => !seen.has(id)).forEach((id) => this.remove(id));
  }

  /** 카메라를 맞춘 뒤: 이름표를 머리 위 화면 위치로 (w, h = 캔버스 CSS 크기) */
  placeTags(camera:THREE.Camera, w:number, h:number) {
    this.shown.forEach((s) => {
      const p = this.v.copy(s.head).project(camera);
      // 화면 밖이거나 원근 카메라 뒤쪽(z > 1)이면 숨김
      const off = !s.on || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1 || p.z > 1 || p.z < -1;
      s.tag.style.display = off ? 'none' : 'block';
      if (off) return;
      const x = ((p.x + 1) / 2) * w;
      const y = ((1 - p.y) / 2) * h;
      s.tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -120%)`;
    });
  }

  private remove(id:number) {
    const s = this.shown.get(id);
    if (!s) return;
    this.scene.remove(s.person.root);
    s.person.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    s.tag.remove();
    this.shown.delete(id);
  }

  dispose() {
    [ ...this.shown.keys() ].forEach((id) => this.remove(id));
  }

}