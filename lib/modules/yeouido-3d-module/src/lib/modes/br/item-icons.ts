import { ItemKind } from 'yeouido-br';

/**
 * 아이템 도트 아이콘 (12×12): # = 아이템 색, k = 짙은 테두리, w = 흰색, g = 회색, b = 나무색, f = 불꽃 주황, y = 불꽃 노랑.
 * 빛기둥 꼭대기 표식·HUD에 같이 쓴다 (멀리서 색만으로는 무엇인지 헷갈려서)
 */
const ART:Record<ItemKind, string[]> = {
  armor: [
    '............',
    '..kk....kk..',
    '.k##k..k##k.',
    '.k###kk###k.',
    '.k########k.',
    '.k##wwww##k.',
    '.k########k.',
    '.k########k.',
    '.k########k.',
    '..k######k..',
    '...kkkkkk...',
    '............',
  ],
  shoes: [
    '............',
    '............',
    '...kkkk.....',
    '...k##k.....',
    '...k##k.....',
    '...k##k.....',
    '...k##kkkk..',
    '..k#######k.',
    '..k########k',
    '..kwwwwwwwwk',
    '...kkkkkkkk.',
    '............',
  ],
  rocket: [
    '.....kk.....',
    '....k##k....',
    '....k##k....',
    '...k#ww#k...',
    '...k####k...',
    '...k####k...',
    '..kk####kk..',
    '.k#k####k#k.',
    '.kkk####kkk.',
    '....kffk....',
    '....fyyf....',
    '.....ff.....',
  ],
  hammer: [
    '............',
    '..kkkkkkk...',
    '.k#######k..',
    '.k#######k..',
    '..kkkbbkk...',
    '.....bb.....',
    '.....bb.....',
    '.....bb.....',
    '.....bb.....',
    '.....bb.....',
    '.....kk.....',
    '............',
  ],
  pistol: [
    '............',
    '............',
    '............',
    '..kkkkkkkk..',
    '..k#######k.',
    '..k#######k.',
    '..kkk##kkk..',
    '....k##k....',
    '....k##k....',
    '....kkkk....',
    '............',
    '............',
  ],
  smg: [
    '............',
    '............',
    '.kkkkkkkkkk.',
    '.k#########k',
    '.k#########k',
    '.kkk#k##kkk.',
    '...k#kk#k...',
    '...kk.k#k...',
    '......k#k...',
    '......kkk...',
    '............',
    '............',
  ],
  rifle: [
    '............',
    '............',
    '............',
    'kkkkkkkkkkk.',
    'k##########k',
    'k##########k',
    'kkk##kk#kkk.',
    '.k##k.k#k...',
    '.kkk..kkk...',
    '............',
    '............',
    '............',
  ],
  shotgun: [
    '............',
    '............',
    '............',
    'kkkkkkkkkkkk',
    'kgggggggg##k',
    'kkkkkkkk###k',
    '......kk##k.',
    '.......k##k.',
    '.......kkkk.',
    '............',
    '............',
    '............',
  ],
  sniper: [
    '............',
    '............',
    '...kkkkk....',
    '...k###k....',
    'kkkkkkkkkkkk',
    'k##########k',
    'kkkk##kkkkk.',
    '...k##k.....',
    '...kkkk.....',
    '............',
    '............',
    '............',
  ],
  crossbow: [
    '............',
    '.k........k.',
    '.#k......k#.',
    '..#k....k#..',
    '...#kkkk#...',
    '.kkk####kkk.',
    '...k####k...',
    '....k##k....',
    '....k##k....',
    '....kkkk....',
    '............',
    '............',
  ],
  heal: [
    '............',
    '..kkkkkkkk..',
    '.k########k.',
    '.k###ww###k.',
    '.k###ww###k.',
    '.k#wwwwww#k.',
    '.k#wwwwww#k.',
    '.k###ww###k.',
    '.k###ww###k.',
    '.k########k.',
    '..kkkkkkkk..',
    '............',
  ],
};

const FIXED:Record<string, string> = { k: '#14141f', w: '#f4f4f8', g: '#8a8f99', b: '#8a5a2e', f: '#ff7a1a', y: '#ffd84a' };

const cache = new Map<string, string>();

/** 아이콘 그림 주소 (data URL, 12×12 — 화면에서는 image-rendering: pixelated 로 키운다) */
export function itemIcon(kind:ItemKind, color:string) {
  const hit = cache.get(kind);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const g = c.getContext('2d')!;
  ART[kind].forEach((row, y) => [ ...row ].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = ch === '#' ? color : FIXED[ch] ?? color;
    g.fillRect(x, y, 1, 1);
  }));
  const url = c.toDataURL();
  cache.set(kind, url);
  return url;
}