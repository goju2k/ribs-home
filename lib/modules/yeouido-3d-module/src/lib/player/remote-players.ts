import * as THREE from 'three';

import { createPerson, Person } from './person';

import { Remote } from '../net/client';
import { PIXEL_FONT } from '../ui/pixel';

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
  });
  return el;
}

interface Shown {
  person: Person;
  tag: HTMLDivElement;
  name: string;
  /** 이름표를 붙일 머리 위 점 (월드) */
  head: THREE.Vector3;
  on: boolean;
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
   */
  update(list:Remote[], dt:number, visible:(r:Remote) => boolean, big:number) {
    const seen = new Set<number>();
    list.forEach((r) => {
      seen.add(r.id);
      let s = this.shown.get(r.id);
      if (!s || s.name !== r.name) {
        if (s) this.remove(r.id);
        const person = createPerson({ shirt: SHIRTS[r.id % SHIRTS.length], pants: PANTS[r.id % PANTS.length], skin: '#f1c7a0', hair: '#2a1d14' });
        const tag = nameTag(r.name || `#${r.id}`);
        this.scene.add(person.root);
        this.layer.appendChild(tag);
        s = { person, tag, name: r.name, head: new THREE.Vector3(), on: false };
        this.shown.set(r.id, s);
      }
      s.on = visible(r);
      s.person.root.visible = s.on;
      if (!s.on) return;
      s.person.root.position.set(r.x, r.y, r.z);
      s.person.root.rotation.y = r.f;
      s.person.root.scale.setScalar(big);
      s.person.animate(dt, r.a);
      s.head.set(r.x, r.y + 1.72 * big, r.z);
    });
    [ ...this.shown.keys() ].filter((id) => !seen.has(id)).forEach((id) => this.remove(id));
  }

  /** 카메라를 맞춘 뒤: 이름표를 머리 위 화면 위치로 (w, h = 캔버스 CSS 크기) */
  placeTags(camera:THREE.Camera, w:number, h:number) {
    this.shown.forEach((s) => {
      const p = this.v.copy(s.head).project(camera);
      const off = !s.on || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1;
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