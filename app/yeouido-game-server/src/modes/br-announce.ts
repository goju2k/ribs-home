import { CYCLE_MS, dayNight, ESCAPE, MATCH_MS, NIGHT_MS, RESULT_MS, STAGES, ZoneNow } from 'yeouido-br';
import type { SayKind } from 'yeouido-net';

import type { ModePlayer } from '../mode';

/**
 * 배틀로얄 진행 방송 (게임성 측정용 PoC): 판 흐름의 순간마다 한 번씩, "무슨 일이 일어났고 지금 뭘 해야 하는지"를 한 줄로.
 * 말투는 리그 오브 레전드 중계 방송처럼 짧고 정중한 안내(~습니다, ~하세요).
 * 처음 들어온 사람도 방송만 보고 다음 할 일을 알 수 있게. 멘트는 여기에만 둔다.
 */
/** 연속 처치로 셀 간격 (ms), 연속 처치 저지가 되는 쓰러지지 않고 잡은 수, 연속 처치 이름 (2명부터) */
const MULTI_MS = 10_000;
const STREAK_STOP = 3;
const MULTI_NAMES = [ '더블킬', '트리플킬', '쿼드라킬', '펜타킬' ];

export class Announcer {

  private said = new Set<string>();

  /** 처치 중계: 판에서 첫 처치가 나왔는지, 사람마다 쓰러지지 않고 잡은 수·연속 처치(앞 처치에서 MULTI_MS 안) 수와 시각 */
  private firstBlood = false;

  private streak = new Map<number, number>();

  private multi = new Map<number, { n: number; at: number; }>();

  private say:(text:string, kind:SayKind, to?:ModePlayer) => void;

  constructor(say:(text:string, kind:SayKind, to?:ModePlayer) => void) {
    this.say = say;
  }

  /** 새 판: 지난 판에 한 방송을 잊는다 */
  reset() {
    this.said.clear();
    this.firstBlood = false;
    this.streak.clear();
    this.multi.clear();
  }

  /**
   * 사람이 사람을 쓰러뜨림: 첫 처치, 연속 처치(더블킬~펜타킬), 연속 처치 저지(쓰러지지 않고 STREAK_STOP명 이상 잡은 사람을 쓰러뜨림)
   */
  kill(killer:ModePlayer, victim:ModePlayer, now:number) {
    const stopped = this.streak.get(victim.id) ?? 0;
    this.streak.set(killer.id, (this.streak.get(killer.id) ?? 0) + 1);
    const m = this.multi.get(killer.id);
    const n = m && now - m.at <= MULTI_MS ? m.n + 1 : 1;
    this.multi.set(killer.id, { n, at: now });
    if (!this.firstBlood) {
      this.firstBlood = true;
      this.say(`${killer.name} 님이 첫 번째 처치를 기록했습니다!`, 'event');
    } else if (n >= 2) this.say(`${killer.name} 님 ${MULTI_NAMES[Math.min(n, 5) - 2]}!`, 'event');
    if (stopped >= STREAK_STOP) this.say(`${killer.name} 님이 ${victim.name} 님의 연속 처치를 저지했습니다!`, 'event');
  }

  /** 누구에게든 쓰러짐: 쓰러지지 않고 잡은 수를 0으로 */
  died(p:ModePlayer) {
    this.streak.delete(p.id);
    this.multi.delete(p.id);
  }

  private once(key:string, text:string, kind:SayKind) {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.say(text, kind);
  }

  newMatch() {
    this.reset();
    this.once('start', '새 판이 시작되었습니다. 상자를 부수고 무기를 확보하세요!', 'event');
  }

  /** 들어온 사람에게만: 지금 상황과 할 일 */
  welcome(p:ModePlayer, phase:string, elapsed:number) {
    if (phase === 'play') {
      const min = Math.max(1, Math.ceil((MATCH_MS - elapsed) / 60_000));
      this.say('여의도에 오신 것을 환영합니다. 좌클릭으로 줍고 부수며, 우클릭으로 사격합니다.', 'info', p);
      this.say(`약 ${min}분 후 최종 보스가 등장합니다. 보스가 쓰러진 자리의 탈출구에 가장 먼저 닿는 생존자가 승리합니다.`, 'info', p);
    } else if (phase === 'end') this.say('판이 끝났습니다. 곧 새 판이 시작됩니다.', 'info', p);
    else this.say('보스전이 진행 중입니다. 이번 판은 관전하며, 다음 판부터 참여합니다.', 'info', p);
  }

  /** 다시 시작한 사람에게만 */
  respawn(p:ModePlayer) {
    this.say('부활했습니다. 장비는 쓰러진 자리의 시체에 남아 있습니다.', 'info', p);
  }

  /** 파밍 단계 (틱마다): 전장 축소·밤낮·보스 예고 */
  play(elapsed:number, dayOffset:number, zone:ZoneNow) {
    if (zone.shrinking && zone.stage <= STAGES) this.once(`shrink${zone.stage}`, `전장이 줄어듭니다! (${zone.stage}/${STAGES}) 노란 원 안으로 이동하세요.`, 'warn');
    const t = elapsed + dayOffset;
    const cycle = Math.floor(t / CYCLE_MS);
    const d = dayNight(t);
    if (!d.night && d.remain <= 15_000) this.once(`dusk${cycle}`, '15초 후 밤이 찾아옵니다. 총소리는 좀비를 불러들입니다.', 'warn');
    if (d.night && d.remain > NIGHT_MS - 3000) this.once(`night${cycle}`, '밤이 되었습니다. 좀비가 출몰합니다!', 'info');
    const toBoss = MATCH_MS - elapsed;
    if (toBoss <= 60_000) this.once('boss60', '1분 후 최종 보스가 등장합니다. 이후로는 부활할 수 없습니다.', 'warn');
    if (toBoss <= 10_000) this.once('boss10', '10초 후 최종 보스가 등장합니다!', 'warn');
  }

  bossAppear() {
    this.once('boss', '최종 보스가 등장했습니다! 휴전이 시작됩니다. 생존자끼리는 피해를 입지 않습니다.', 'event');
  }

  /** 보스전 (틱마다): 체력 단계·남은 시간 */
  boss(ratio:number, remainMs:number) {
    if (ratio <= 0.5) this.once('boss50', '최종 보스의 체력이 절반 남았습니다.', 'info');
    if (ratio <= 0.2) this.once('boss20', '최종 보스가 쓰러지기 직전입니다! 곧 휴전이 끝납니다.', 'warn');
    if (remainMs <= 60_000) this.once('bossTime', '보스전 종료까지 1분 남았습니다.', 'warn');
  }

  bossDown(killer:string | null) {
    this.once('down', `${killer ? `${killer} 님이 ` : ''}최종 보스를 처치했습니다! ${ESCAPE.truceMs / 1000}초 후 휴전이 끝나고 탈출구가 열립니다.`, 'event');
  }

  /** 탈출전 (틱마다): 열림·남은 시간 */
  escape(sinceOpen:number) {
    if (sinceOpen >= 0) this.once('open', '탈출구가 열렸습니다! 가장 먼저 닿는 생존자가 승리합니다.', 'event');
    if (sinceOpen >= ESCAPE.limitMs - 30_000) this.once('escape30', '탈출구가 30초 후 닫힙니다!', 'warn');
  }

  /** 판 끝 */
  end(result:'win' | 'lose', why:string | undefined, chicken:string | null) {
    const next = `${Math.round(RESULT_MS / 1000)}초 후 새 판이 시작됩니다.`;
    if (chicken) this.once('end', `${chicken} 님이 탈출했습니다! 치킨 획득! ${next}`, 'event');
    else if (why === 'wiped') this.once('end', `모든 생존자가 쓰러졌습니다. 패배! ${next}`, 'warn');
    else if (why === 'time') this.once('end', `최종 보스를 처치하지 못했습니다. 패배! ${next}`, 'warn');
    else if (why === 'noescape') this.once('end', `탈출구가 닫혔습니다. 아무도 탈출하지 못했습니다. ${next}`, 'warn');
    else if (result === 'win') this.once('end', `판이 끝났습니다. ${next}`, 'event');
  }

}