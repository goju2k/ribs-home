import { BrClient } from './br/br-client';
import { ModeClientFactory } from './mode-client';

export * from './mode-client';

/**
 * 서버가 알려 준 게임 모드 이름 → 클라이언트 모드 화면.
 * 배틀로얄은 게임성 측정용 PoC — 다른 게임을 만들면 여기에 새 모드를 더하거나 바꾼다.
 */
export const MODE_CLIENTS:Record<string, ModeClientFactory> = { br: (host) => new BrClient(host) };