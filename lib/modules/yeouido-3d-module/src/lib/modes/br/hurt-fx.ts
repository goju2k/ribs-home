/**
 * 맞음 효과 (배틀로얄 모드, 화면만): HUD(React, 초당 4번 갱신)를 거치지 않고 매 장면 바로 그린다 — 맞은 순간 늦지 않게.
 * - 번쩍임: 화면 가장자리부터 붉게, 피해가 클수록 진하고 오래
 * - 방향: 조준선 둘레 붉은 호가 때린 쪽을 가리킨다 (몸을 돌리면 따라 돈다), 1.5초
 * - 체력 낮음(30 이하): 가장자리가 심장 뛰듯 붉게, 색이 조금 빠진다
 */

/** 번쩍임 시간 (ms): 약하게 맞으면 짧게, 세게 맞으면 길게 */
const FLASH_MS = 260;
const FLASH_MORE_MS = 340;
/** 방향 표시가 남는 시간 (ms)·한 번에 최대 개수 */
const DIR_MS = 1500;
const MAX_DIRS = 6;
/** 체력이 이 이하면 경고 */
const LOW_HP = 30;

interface Dir {
  el: HTMLDivElement; at: [number, number]; t: number; power: number;
}

const div = (css:Partial<CSSStyleDeclaration>) => {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'absolute', pointerEvents: 'none', ...css });
  return el;
};

export class HurtFx {

  private root:HTMLDivElement;

  private flash:HTMLDivElement;

  private low:HTMLDivElement;

  private dirs:Dir[] = [];

  private flashAt = -1e9;

  private flashPower = 0;

  constructor(parent:HTMLElement) {
    this.root = div({ inset: '0', overflow: 'hidden' });
    this.low = div({ inset: '0', opacity: '0', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(170,10,10,0.85) 100%)' });
    this.flash = div({ inset: '0', opacity: '0', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(230,25,20,0.9) 100%)' });
    this.root.append(this.low, this.flash);
    parent.appendChild(this.root);
  }

  /** 맞음: 피해 세기(0~1)와 때린 쪽 자리(없으면 방향 표시 없음) */
  hit(now:number, power:number, at?:[number, number]) {
    // 한꺼번에 여러 번 맞으면(산탄 등) 가장 센 것으로
    const recent = now - this.flashAt < 100;
    this.flashAt = now;
    this.flashPower = recent ? Math.max(this.flashPower, power) : power;
    if (!at) return;
    // 같은 쪽에서 계속 맞으면 새로 만들지 않고 시간·세기만 갱신
    const same = this.dirs.find((d) => Math.hypot(d.at[0] - at[0], d.at[1] - at[1]) < 3);
    if (same) {
      same.t = now;
      same.power = Math.max(same.power, power);
      same.at = at;
      return;
    }
    if (this.dirs.length >= MAX_DIRS) this.dirs.shift()!.el.remove();
    // 조준선 둘레 원의 윗부분만 그린 호 — 돌려서 방향을 가리킨다
    const el = div({
      left: '50%',
      top: '50%',
      width: 'min(260px, 56vmin)',
      height: 'min(260px, 56vmin)',
      borderRadius: '50%',
      borderTop: '9px solid rgb(255,48,40)',
      filter: 'drop-shadow(0 0 3px rgba(80,0,0,0.9))',
    });
    this.root.appendChild(el);
    this.dirs.push({ el, at, t: now, power });
  }

  /**
   * 매 장면: 내 자리, 카메라가 보는 방향(yaw — 앞 = (-sin, -cos)), 체력, 살아 있는지
   */
  update(now:number, me:{ x: number; z: number; }, yaw:number, hp:number, alive:boolean) {
    // 번쩍임
    const fl = FLASH_MS + FLASH_MORE_MS * this.flashPower;
    const k = Math.max(0, 1 - (now - this.flashAt) / fl);
    this.flash.style.opacity = String(alive ? k * k * (0.45 + 0.55 * this.flashPower) : 0);
    // 방향: 화면 위 = 카메라 앞. 앞 = (-sin yaw, -cos yaw), 오른쪽 = (cos yaw, -sin yaw)
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    this.dirs = this.dirs.filter((d) => {
      const age = (now - d.t) / DIR_MS;
      if (age >= 1 || !alive) {
        d.el.remove();
        return false;
      }
      const dx = d.at[0] - me.x;
      const dz = d.at[1] - me.z;
      const ang = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
      d.el.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
      // 처음엔 진하게, 끝으로 갈수록 빠르게 옅어진다
      d.el.style.opacity = String((0.55 + 0.45 * d.power) * (1 - age * age));
      return true;
    });
    // 체력 낮음: 낮을수록 진하고 빠르게 뛴다
    if (alive && hp > 0 && hp <= LOW_HP) {
      const s = 1 - hp / LOW_HP;
      const beat = 0.5 + 0.5 * Math.sin(now / (260 - 100 * s));
      this.low.style.opacity = String((0.35 + 0.4 * s) * (0.6 + 0.4 * beat));
      this.low.style.backdropFilter = `saturate(${(1 - 0.5 * s).toFixed(2)})`;
    } else if (this.low.style.opacity !== '0') {
      this.low.style.opacity = '0';
      this.low.style.backdropFilter = '';
    }
  }

  /**
   * 1인칭 시점 밀림 (화면만, 조준은 그대로): 맞은 반대쪽으로 살짝 돌았다가 돌아온다.
   * side: 때린 쪽이 오른쪽이면 +1 (왼쪽으로 밀림)
   */
  static kick(now:number, at:number, power:number, side:number) {
    const k = Math.max(0, 1 - (now - at) / 240);
    if (!k) return null;
    const a = power * 0.03 * k * k * Math.cos((1 - k) * Math.PI * 1.5);
    return { yaw: side * a, pitch: a * 0.6 };
  }

  dispose() {
    this.root.remove();
  }

}