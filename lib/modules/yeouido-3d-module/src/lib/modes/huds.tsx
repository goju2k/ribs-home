import { MutableRefObject } from 'react';

import type { BrHudState } from './br/br-client';
import { BrHud } from './br/BrHud';

import type { InputState } from '../input';

export interface ModeHudProps {
  state: unknown; inputRef: MutableRefObject<InputState>; touch: boolean;
}

/** 게임 모드 이름 → HUD (모드 화면 상태는 모드 HUD만 뜻을 안다) */
export const MODE_HUDS:Record<string, (p:ModeHudProps) => JSX.Element> = { br: ({ state, inputRef, touch }) => <BrHud state={state as BrHudState} inputRef={inputRef} touch={touch} /> };