/**
 * TRINIA - プリセットデッキ
 *
 * 各20枚 / 同名2枚まで。デッキ編集画面の初期スロット、
 * AI対戦の相手デッキ、バランスシミュレーションの検体を兼ねる。
 */
import { validateDeck } from '../core/rules';

export interface DeckPreset {
  id: string;
  name: string;
  description: string;
  /** 主属性（UIの色分けに使う） */
  faction: 'fund' | 'mana' | 'aether' | 'hybrid';
  cards: string[];
}

/** 同じカードをn枚並べる小道具 */
const x = (id: string, n: number): string[] => Array.from({ length: n }, () => id);

export const DECK_PRESETS: DeckPreset[] = [
  {
    id: 'aggro_fund',
    name: '強襲部隊（アグロ）',
    description: '軽量ユニットを並べて殴り切る。召喚酔いなしを最大限に活かす速攻型。',
    faction: 'fund',
    cards: [
      ...x('fund_light_attacker', 2),
      ...x('fund_archer', 2),
      ...x('fund_siege', 2),
      ...x('fund_heavy_guard', 2),
      ...x('fund_captain', 2),
      ...x('fund_armory', 2),
      ...x('fund_gold_mine', 2),
      ...x('fund_conscription', 2),
      ...x('mana_flame_bolt', 2),
      ...x('hybrid_alchemy', 2),
    ],
  },
  {
    id: 'control_mana',
    name: '魔導統制（コントロール）',
    description: '除去で盤面を捌きつつ壁で受け、追撃の魔導士とバーンで削り切る。',
    faction: 'mana',
    // 魔力属性のユニットは追撃の魔導士1種しかないため、
    // 受けに回るための壁を資金から少量スプラッシュしている。
    cards: [
      ...x('mana_flame_bolt', 2),
      ...x('mana_inferno', 2),
      ...x('mana_freeze', 2),
      ...x('mana_counter', 2),
      ...x('mana_pursuit_mage', 2),
      ...x('mana_great_wisdom', 2),
      ...x('mana_crystal', 2),
      ...x('fund_heavy_guard', 2),
      ...x('hybrid_alchemy', 2),
      ...x('hybrid_sabotage', 2),
    ],
  },
  {
    id: 'ramp_aether',
    name: '古代機構（ランプ）',
    description: '施設で耐えながらエーテルを伸ばし、超大型とタイムストップで蓋をする。',
    faction: 'aether',
    cards: [
      ...x('aether_power_plant', 2),
      ...x('aether_barrier', 2),
      ...x('aether_dimensional_jar', 2),
      ...x('aether_prayer', 2),
      ...x('aether_regen_guardian', 2),
      ...x('aether_immune_beast', 2),
      ...x('aether_time_stop', 2),
      ...x('hybrid_sabotage', 2),
      ...x('mana_flame_bolt', 2),
      ...x('hybrid_alchemy', 2),
    ],
  },
  {
    id: 'hybrid_titan',
    name: '万物創造（ハイブリッド）',
    description: '3色を伸ばして巨神とカウントダウン兵器を狙う欲張り構築。',
    faction: 'hybrid',
    // 施設枠は3つしかないので、生成施設は2種6枚までに抑えて
    // 序盤を支える軽量ユニットと除去に枠を割く。
    cards: [
      ...x('hybrid_alchemy', 2),
      ...x('hybrid_titan', 2),
      ...x('hybrid_countdown', 2),
      ...x('hybrid_sabotage', 2),
      ...x('fund_gold_mine', 2),
      ...x('aether_power_plant', 2),
      ...x('fund_light_attacker', 2),
      ...x('fund_heavy_guard', 2),
      ...x('mana_flame_bolt', 2),
      ...x('aether_barrier', 2),
    ],
  },
];

export function getPreset(id: string): DeckPreset {
  const d = DECK_PRESETS.find((p) => p.id === id);
  if (!d) throw new Error(`未知のデッキプリセット: ${id}`);
  return d;
}

/** 全プリセットが構築ルールを満たしているか（テストから呼ぶ） */
export function validatePresets(): string[] {
  const errors: string[] = [];
  for (const preset of DECK_PRESETS) {
    const r = validateDeck(preset.cards);
    if (!r.ok) errors.push(`${preset.name}: ${r.error}`);
  }
  return errors;
}
