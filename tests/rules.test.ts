/**
 * 仕様書 2.1〜2.4 の基本ルールが実装どおり動くかの検証。
 */
import { describe, expect, it } from 'vitest';
import { createGame, opponentOf } from '../src/core/gameState';
import { applyAction } from '../src/core/mainPhaseEngine';
import { configureRules, resetRules, RULES, rulesForMode, validateDeck } from '../src/core/rules';
import { DECK_PRESETS, validatePresets } from '../src/cards/decks';
import { ALL_CARDS, validateMaster } from '../src/cards/cardFactory';
import type { GameState } from '../src/core/types';

/** 両者とも引き直しなしでマリガンを終える（先攻決定〜分配フェイズ以降の検証に集中するため） */
function skipMulligan(s: GameState): GameState {
  s = applyAction(s, { type: 'mulligan', player: 0, uids: [] }).state;
  s = applyAction(s, { type: 'mulligan', player: 1, uids: [] }).state;
  return s;
}

/** マリガンを終えて対局が始まった状態を作る（先攻はコイントスで決まる） */
function startedGame(seed = 42): GameState {
  const [a, b] = DECK_PRESETS;
  const s = createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, seed);
  return skipMulligan(s);
}

describe('マスターデータ', () => {
  it('ベース28種 + 追加の魔力ユニット2種 + 上位カード6種 + 次元の番人がそろっている', () => {
    expect(ALL_CARDS).toHaveLength(37);
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
    expect(s.phase).toBe('mulligan');
  });

  it('同じシードなら同じ初期手札になる（決定論）', () => {
    const [a, b] = DECK_PRESETS;
    const mk = () => createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 777);
    expect(mk().players[0].hand.map((c) => c.defId)).toEqual(mk().players[0].hand.map((c) => c.defId));
  });
});

describe('マリガン', () => {
  it('指定した枚数だけ山札から引き直す。戻したカードは山札に混ぜる', () => {
    const [a, b] = DECK_PRESETS;
    const s = createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 9);
    const before = s.players[0].hand.map((c) => c.uid);
    const returned = before.slice(0, 2);

    const r = applyAction(s, { type: 'mulligan', player: 0, uids: returned });
    expect(r.ok).toBe(true);
    const hand = r.state.players[0].hand;
    expect(hand).toHaveLength(RULES.INITIAL_HAND);
    // 戻した2枚は手札から消え、新しい2枚に入れ替わっている
    expect(hand.some((c) => returned.includes(c.uid))).toBe(false);
    // 戻したカードは山札（引いた分を引いた残り）に混ざっている
    expect(r.state.players[0].deck).toHaveLength(RULES.DECK_SIZE - RULES.INITIAL_HAND);
    const deckUids = r.state.players[0].deck.map((c) => c.uid);
    for (const uid of returned) expect(deckUids).toContain(uid);
    // 相手はまだ終えていないので次のフェイズへは進まない
    expect(r.state.phase).toBe('mulligan');
  });

  it('0枚指定（引き直しなし）も選べる', () => {
    const [a, b] = DECK_PRESETS;
    const s = createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 9);
    const before = s.players[0].hand.map((c) => c.uid);
    const r = applyAction(s, { type: 'mulligan', player: 0, uids: [] });
    expect(r.ok).toBe(true);
    expect(r.state.players[0].hand.map((c) => c.uid)).toEqual(before);
  });

  it('二重に確定はできない', () => {
    const [a, b] = DECK_PRESETS;
    let s = createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 9);
    s = applyAction(s, { type: 'mulligan', player: 0, uids: [] }).state;
    const r = applyAction(s, { type: 'mulligan', player: 0, uids: [] });
    expect(r.ok).toBe(false);
  });

  it('両者が終えると先攻/後攻が決まり分配フェイズへ進む', () => {
    const [a, b] = DECK_PRESETS;
    const s = skipMulligan(
      createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 9),
    );
    expect(s.phase).toBe('allocate');
    expect(s.firstPlayer).not.toBeNull();
    expect(s.active).toBe(s.firstPlayer);
  });

  it('マリガン中は分配の入力を受け付けない', () => {
    const [a, b] = DECK_PRESETS;
    const s = createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 9);
    expect(applyAction(s, { type: 'allocate', fund: 0, mana: 0, aether: 0, draw: 0 }).ok).toBe(false);
  });
});

describe('先攻・後攻（コイントス）', () => {
  it('拠点HPは両者とも満タンで始まる（先攻権の支払いは無い）', () => {
    const s = startedGame();
    expect(s.players[0].baseHp).toBe(RULES.BASE_HP);
    expect(s.players[1].baseHp).toBe(RULES.BASE_HP);
  });

  it('後攻は毎回、初期リソース+SECOND_PLAYER_BONUSptを得る', () => {
    const s = startedGame();
    const second = opponentOf(s.active);
    const total = (p: (typeof s.players)[number]) =>
      p.resources.fund + p.resources.mana + p.resources.aether;
    expect(total(s.players[second])).toBe(RULES.SECOND_PLAYER_BONUS);
    expect(total(s.players[s.active])).toBe(0);
  });

  it('後攻ボーナスの大きさはルールで調整できる', () => {
    configureRules({ SECOND_PLAYER_BONUS: 3 });
    try {
      const s = startedGame();
      const second = opponentOf(s.active);
      const total = (p: (typeof s.players)[number]) =>
        p.resources.fund + p.resources.mana + p.resources.aether;
      expect(total(s.players[second])).toBe(3);
    } finally {
      resetRules();
    }
  });
});

describe('対局モード', () => {
  it('スタンダードは拠点HP40・毎ターン2ptを使う', () => {
    const r = rulesForMode('standard');
    expect(r.BASE_HP).toBe(40);
    expect(r.FREE_POINTS).toBe(2);
  });

  it('モードのルールは対局状態に取り込まれ、engineがそれを参照する', () => {
    const [a, b] = DECK_PRESETS;
    const s = skipMulligan(
      createGame({ name: 'A', deck: a.cards }, { name: 'B', deck: b.cards }, 1, rulesForMode('standard')),
    );
    expect(s.rules.BASE_HP).toBe(rulesForMode('standard').BASE_HP);
    expect(s.players[0].baseHp).toBe(rulesForMode('standard').BASE_HP);
    expect(s.players[1].baseHp).toBe(rulesForMode('standard').BASE_HP);
  });
});

describe('ターン進行（仕様書 2.4）', () => {
  it('マリガン後、先攻はドローを済ませて分配フェイズに入る', () => {
    const s = startedGame();
    expect(s.phase).toBe('allocate');
    expect(s.turn).toBe(1);
    expect(s.players[s.active].hand).toHaveLength(RULES.INITIAL_HAND + 1);
  });

  it('分配は合計2ptをちょうど使い切る必要がある', () => {
    const s = startedGame();
    expect(applyAction(s, { type: 'allocate', fund: 1, mana: 0, aether: 0, draw: 0 }).ok).toBe(false);
    expect(applyAction(s, { type: 'allocate', fund: 2, mana: 1, aether: 0, draw: 0 }).ok).toBe(false);
    expect(applyAction(s, { type: 'allocate', fund: 1, mana: 1, aether: 0, draw: 0 }).ok).toBe(true);
  });

  it('分配のドローは1ptにつき1枚', () => {
    const s = startedGame();
    const before = s.players[s.active].hand.length;
    const r = applyAction(s, { type: 'allocate', fund: 0, mana: 0, aether: 0, draw: 2 });
    expect(r.ok).toBe(true);
    expect(r.state.players[s.active].hand).toHaveLength(before + 2);
    expect(r.state.phase).toBe('main');
  });

  it('未使用リソースは次のターンへ持ち越される（上限なし）', () => {
    let s = startedGame();
    const p0 = s.active;
    s = applyAction(s, { type: 'allocate', fund: 2, mana: 0, aether: 0, draw: 0 }).state;
    s = applyAction(s, { type: 'endTurn' }).state;
    s = applyAction(s, { type: 'allocate', fund: 0, mana: 2, aether: 0, draw: 0 }).state;
    s = applyAction(s, { type: 'endTurn' }).state;
    // p0の2ターン目。1ターン目の資金2が残っている
    expect(s.players[p0].resources.fund).toBeGreaterThanOrEqual(2);
  });
});
