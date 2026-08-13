/**
 * 決定論的な擬似乱数（mulberry32）。
 *
 * 状態を GameState.rngState に持たせることで、
 * 「同じシード + 同じ入力列 → 必ず同じ結果」を保証する。
 * これはオンライン対戦の同期検証にもリプレイにも効く。
 */
export interface RngDraw {
  value: number; // [0, 1)
  state: number;
}

export function nextRandom(state: number): RngDraw {
  let t = (state + 0x6d2b79f5) | 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, state: t };
}

/** 0以上max未満の整数を返す */
export function nextInt(state: number, max: number): { value: number; state: number } {
  const d = nextRandom(state);
  return { value: Math.floor(d.value * max), state: d.state };
}

/** Fisher-Yates シャッフル（配列は破壊せず新しい配列を返す） */
export function shuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const out = items.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const d = nextInt(s, i + 1);
    s = d.state;
    const j = d.value;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { items: out, state: s };
}

/** 文字列から32bitシードを作る（ルーム番号などから再現可能な卓を作るのに使う） */
export function seedFromString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
