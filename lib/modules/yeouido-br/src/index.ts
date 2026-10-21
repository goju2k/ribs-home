// 배틀로얄 게임 모드 (게임성 측정용 PoC — 확정 아님). 엔진(yeouido-sim·yeouido-net) 위에 얹는 규칙만 둔다.
// 다른 게임을 만들면 이 모듈을 통째로 바꾼다 (서버 app/yeouido-game-server/src/modes, 클라이언트 yeouido-3d-module/src/lib/modes 도 같이).
export * from './match';
export * from './rules';
export * from './items';
export * from './props';
export * from './zombies';
export * from './boss';
export * from './msgs';