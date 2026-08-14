/**
 * 仕様書 2.1〜2.4 の基本ルールが実装どおり動くかの検証。
 */
import { describe, expect, it } from 'vitest';
import { createGame, opponentOf } from '../src/core/gameState';
import { applyAction } from '../src/core/mainPhaseEngine';
import {
  configureRules,
  MATCH_MODES,
  resetRules,
  RULES,
  rulesForMode,
  validateDeck,
} from '../src/core/rules';
import { DECK_PRESETS, validatePresets } from '../src/cards/decks';
import { ALL_CARDS, validateMaster } from '../src/cards/cardFactory';
import type { GameState } from '../src/core/types';

function startedGame(bid0 = 3, bid1 = 1, seed = 42): GameState {
  const [a, b] = DECK_PRESETS;
  let s = createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, seed);
  s = applyAction(s, { type: 'bid', player: 0, amount: bid0 }).state;
  s = applyAction(s, { type: 'bid', player: 1, amount: bid1 }).state;
  return s;
}

describe('マスターデータ', () => {
  it('ベース28種 + 追加の魔力ユニット2種がそろっている', () => {
    expect(ALL_CARDS).toHaveLength(30);
    // 魔力属性が盤面を作れるよう、ユニットを3種まで増やしてある（docs/BALANCE.md §5.2）
    const manaUnits = ALL_CARDS.filter((c) => c.faction === 'mana' && c.type === 'unit');
    expect(manaUnits.map((c) => c.id)).toEqual([
      'mana_pursuit_mage',
      'mana_rune_warden',
      'mana_illusionist',
    ]);
  });

  it('整合性エラーがない', () => {
    expect(validateMaster()).toEqual([]);
  });

  it('全カードに image_path とフォールバックアイコンが定義されている', () => {
    for (const c of ALL_CARDS) {
      expect(c.image_path).toMatch(/^assets\/cards\/.+\.png$/);
      expect(c.icon).toMatch(/^Gi[A-Za-z]+$/);
    }
  });

  it('プリセットデッキは全て構築ルールを満たす', () => {
    expect(validatePresets()).toEqual([]);
  });

  it('デッキ検証は枚数と同名上限を弾く', () => {
    expect(validateDeck(Array(19).fill('fund_light_attacker')).ok).toBe(false);
    expect(validateDeck(Array(20).fill('fund_light_attacker')).ok).toBe(false);
  });
});

describe('初期状態', () => {
  it('拠点HP50・初期手札6枚・デッキ20枚から始まる', () => {
    const [a, b] = DECK_PRESETS;
    const s = createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 1);
    for (const p of s.players) {
      expect(p.baseHp).toBe(RULES.BASE_HP);
      expect(p.hand).toHaveLength(RULES.INITIAL_HAND);
      expect(p.deck).toHaveLength(RULES.DECK_SIZE - RULES.INITIAL_HAND);
      expect(p.resources).toEqual({ fund: 0, mana: 0, aether: 0 });
    }
    expect(s.phase).toBe('auction');
  });

  it('同じシードなら同じ初期手札になる（決定論）', () => {
    const [a, b] = DECK_PRESETS;
    const mk = () => createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 777);
    expect(mk().players[0].hand.map((c) => c.defId)).toEqual(mk().players[0].hand.map((c) => c.defId));
  });
});

describe('オークション（仕様書 2.2）', () => {
  it('高く提示した側が先攻になり、提示分だけHPを失う', () => {
    const s = startedGame(8, 2);
    expect(s.active).toBe(0);
    expect(s.players[0].baseHp).toBe(RULES.BASE_HP - 8);
    expect(s.players[1].baseHp).toBe(RULES.BASE_HP);
  });

  it('後攻側は提示していてもHPを支払わない', () => {
    const s = startedGame(1, 7);
    expect(s.active).toBe(1);
    expect(s.players[1].baseHp).toBe(RULES.BASE_HP - 7);
    expect(s.players[0].baseHp).toBe(RULES.BASE_HP);
  });

  it('同点なら両者満タンで、後攻側だけ初期リソースボーナスを得る', () => {
    const s = startedGame(4, 4);
    const second = opponentOf(s.active);
    expect(s.players[0].baseHp).toBe(RULES.BASE_HP);
    expect(s.players[1].baseHp).toBe(RULES.BASE_HP);
    const total = (p: (typeof s.players)[number]) =>
      p.resources.fund + p.resources.mana + p.resources.aether;
    expect(total(s.players[second])).toBe(RULES.SECOND_PLAYER_BONUS);
    expect(total(s.players[s.active])).toBe(0);
  });

  it('提示に差がある場合は後攻ボーナスがつかない（既定＝仕様書どおり同点時のみ）', () => {
    const s = startedGame(6, 1);
    const total = (p: (typeof s.players)[number]) =>
      p.resources.fund + p.resources.mana + p.resources.aether;
    expect(s.active).toBe(0);
    expect(total(s.players[1])).toBe(0);
    expect(total(s.players[0])).toBe(0);
  });

  it('SECOND_PLAYER_BONUS_ALWAYS を有効にすると常時付与に切り替わる', () => {
    configureRules({ SECOND_PLAYER_BONUS_ALWAYS: true });
    try {
      const s = startedGame(6, 1);
      const total = (p: (typeof s.players)[number]) =>
        p.resources.fund + p.resources.mana + p.resources.aether;
      expect(total(s.players[1])).toBe(RULES.SECOND_PLAYER_BONUS);
    } finally {
      resetRules();
    }
  });

  it('上限を超える提示は拒否される', () => {
    const [a, b] = DECK_PRESETS;
    const s = createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 5);
    const r = applyAction(s, { type: 'bid', player: 0, amount: RULES.MAX_BID + 1 });
    expect(r.ok).toBe(false);
    expect(s.players[0].bid).toBe(-1);
  });
});

describe('対局モード', () => {
  it('スタンダードは仕様書の拠点HP50・毎ターン2ptを使う', () => {
    const r = rulesForMode('standard');
    expect(r.BASE_HP).toBe(50);
    expect(r.FREE_POINTS).toBe(2);
  });

  it('クイックは拠点HPを下げ、毎ターンの付与ptを増やして加速する', () => {
    const q = rulesForMode('quick');
    const s = rulesForMode('standard');
    expect(q.BASE_HP).toBeLessThan(s.BASE_HP);
    // HPを削るだけだとアグロ一強になるため、付与ptを増やして展開も速くしている
    expect(q.FREE_POINTS).toBeGreaterThan(s.FREE_POINTS);
  });

  it('競り上限は拠点HPに連動する（先攻権の価値がHPに比例するため）', () => {
    for (const mode of MATCH_MODES) {
      const r = rulesForMode(mode.id);
      // 実測した均衡落札額は拠点HPの約4割。上限はそれをやや上回る位置に置く
      expect(r.MAX_BID).toBeGreaterThan(r.BASE_HP * 0.4);
      expect(r.MAX_BID).toBeLessThan(r.BASE_HP * 0.6);
    }
  });

  it('モードのルールは対局状態に取り込まれ、engineがそれを参照する', () => {
    const [a, b] = DECK_PRESETS;
    const quick = createGame(
      { name: 'A', deck: a.cards },
      { name: 'B', deck: b.cards },
      1,
      rulesForMode('quick'),
    );
    expect(quick.rules.BASE_HP).toBe(rulesForMode('quick').BASE_HP);
    expect(quick.players[0].baseHp).toBe(rulesForMode('quick').BASE_HP);

    // 上限を超える提示はモードの上限で弾かれる
    expect(applyAction(quick, { type: 'bid', player: 0, amount: quick.rules.MAX_BID + 1 }).ok).toBe(
      false,
    );
    expect(applyAction(quick, { type: 'bid', player: 0, amount: quick.rules.MAX_BID }).ok).toBe(true);
  });

  it('クイックの分配はそのモードのpt数をちょうど使い切る必要がある', () => {
    const [a, b] = DECK_PRESETS;
    let s = createGame(
      { name: 'A', deck: a.cards },
      { name: 'B', deck: b.cards },
      7,
      rulesForMode('quick'),
    );
    s = applyAction(s, { type: 'bid', player: 0, amount: 5 }).state;
    s = applyAction(s, { type: 'bid', player: 1, amount: 1 }).state;
    expect(s.phase).toBe('allocate');
    // スタンダードの2ptでは足りない
    expect(applyAction(s, { type: 'allocate', fund: 2, mana: 0, aether: 0, draw: 0 }).ok).toBe(false);
    const r = applyAction(s, { type: 'allocate', fund: 3, mana: 0, aether: 0, draw: 0 });
    expect(r.ok).toBe(true);
    expect(r.state.players[0].resources.fund).toBe(3);
  });
});

describe('ターン進行（仕様書 2.4）', () => {
  it('オークション後、先攻はドローを済ませて分配フェイズに入る', () => {
    const s = startedGame(5, 0);
    expect(s.phase).toBe('allocate');
    expect(s.turn).toBe(1);
    expect(s.players[0].hand).toHaveLength(RULES.INITIAL_HAND + 1);
  });

  it('分配は合計2ptをちょうど使い切る必要がある', () => {
    const s = startedGame(5, 0);
    expect(applyAction(s, { type: 'allocate', fund: 1, mana: 0, aether: 0, draw: 0 }).ok).toBe(false);
    expect(applyAction(s, { type: 'allocate', fund: 2, mana: 1, aether: 0, draw: 0 }).ok).toBe(false);
    expect(applyAction(s, { type: 'allocate', fund: 1, mana: 1, aether: 0, draw: 0 }).ok).toBe(true);
  });

  it('分配のドローは1ptにつき1枚', () => {
    const s = startedGame(5, 0);
    const before = s.players[0].hand.length;
    const r = applyAction(s, { type: 'allocate', fund: 0, mana: 0, aether: 0, draw: 2 });
    expect(r.ok).toBe(true);
    expect(r.state.players[0].hand).toHaveLength(before + 2);
    expect(r.state.phase).toBe('main');
  });

  it('未使用リソースは次のターンへ持ち越される（上限なし）', () => {
    let s = startedGame(5, 0);
    s = applyAction(s, { type: 'allocate', fund: 2, mana: 0, aether: 0, draw: 0 }).state;
    s = applyAction(s, { type: 'endTurn' }).state;
    s = applyAction(s, { type: 'allocate', fund: 0, mana: 2, aether: 0, draw: 0 }).state;
    s = applyAction(s, { type: 'endTurn' }).state;
    // プレイヤー0の2ターン目。1ターン目の資金2が残っている
    expect(s.players[0].resources.fund).toBeGreaterThanOrEqual(2);
  });
});
