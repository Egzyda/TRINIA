/**
 * 個別カードの効果・スタック（打ち消し）・施設の起動能力の検証。
 */
import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/core/mainPhaseEngine';
import { RULES } from '../src/core/rules';
import { board, facilityUid, handUid, passTurns, unitUid } from './helpers';
import type { PlayerId } from '../src/core/types';

const P0: PlayerId = 0;
const P1: PlayerId = 1;

describe('資金系', () => {
  it('部隊長は自軍前衛全体をこのターン中だけ+1する', () => {
    let s = board({
      hands: { 0: ['fund_captain'] },
      resources: { 0: { fund: 2 } },
      units: { 0: ['fund_light_attacker', 'fund_archer'] },
    });
    s = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'fund_captain') }).state;
    // 軽量兵(攻2)+1=3、弓兵(攻3)+1=4
    expect(s.players[0].units.map((u) => u.attack + u.tempAttack)).toEqual([3, 4]);

    s = applyAction(s, { type: 'endTurn' }).state;
    expect(s.players[0].units.every((u) => u.tempAttack === 0)).toBe(true);
  });

  it('召集令状は山札からコスト2以下の資金ユニットを直接召喚する', () => {
    const s = board({
      hands: { 0: ['fund_conscription'] },
      decks: { 0: ['aether_immune_beast', 'fund_heavy_guard', 'fund_archer'] },
      resources: { 0: { fund: 3 } },
    });
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'fund_conscription') });
    expect(r.ok).toBe(true);
    // 重装ガード(資金3)は対象外。弓兵(資金2)が選ばれる
    expect(r.state.players[0].units.map((u) => u.defId)).toEqual(['fund_archer']);
    expect(r.state.players[0].deck.map((c) => c.defId)).toEqual([
      'aether_immune_beast',
      'fund_heavy_guard',
    ]);
  });

  it('武器庫は資金1で攻撃力とHPを永続+1、ターン1回まで', () => {
    let s = board({
      facilities: { 0: ['fund_armory'] },
      units: { 0: ['fund_light_attacker'] },
      resources: { 0: { fund: 2 } },
    });
    const fid = facilityUid(s, P0, 'fund_armory');
    const uid = unitUid(s, P0, 'fund_light_attacker');
    s = applyAction(s, { type: 'activate', facilityUid: fid, target: { kind: 'unit', uid } }).state;
    expect(s.players[0].units[0].attack).toBe(3);
    expect(s.players[0].units[0].hp).toBe(3);
    expect(s.players[0].units[0].maxHp).toBe(3);

    const second = applyAction(s, { type: 'activate', facilityUid: fid, target: { kind: 'unit', uid } });
    expect(second.ok).toBe(false);
  });
});

describe('魔力系', () => {
  it('単体火炎魔法は敵拠点も撃てる', () => {
    const s = board({ hands: { 0: ['mana_flame_bolt'] }, resources: { 0: { mana: 2 } } });
    const r = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_flame_bolt'),
      targets: [{ kind: 'base', player: P1 }],
    });
    expect(r.state.players[1].baseHp).toBe(46);
  });

  it('全体範囲魔法は敵前衛だけに当たり、自軍には当たらない', () => {
    const s = board({
      hands: { 0: ['mana_inferno'] },
      resources: { 0: { mana: 4 } },
      units: { 0: ['fund_archer'], 1: ['fund_archer', 'fund_heavy_guard'] },
    });
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'mana_inferno') });
    // 弓兵(HP1)は死に、重装兵(HP8)は6残る
    expect(r.state.players[1].units.map((u) => u.defId)).toEqual(['fund_heavy_guard']);
    expect(r.state.players[1].units[0].hp).toBe(6);
    // 自軍の弓兵(HP1)は無傷
    expect(r.state.players[0].units[0].hp).toBe(1);
  });

  it('追撃の魔導士はスペル発動ごとにランダムな敵ユニット1体へ1ダメージ', () => {
    const s = board({
      hands: { 0: ['mana_draw_spell'] },
      resources: { 0: { mana: 2 } },
      units: { 0: ['mana_pursuit_mage', 'mana_pursuit_mage'], 1: ['fund_heavy_guard'] },
    });
    const beforeBaseHp = s.players[1].baseHp;
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'mana_draw_spell') });
    // 敵ユニットが1体しかいないので、2回のトリガーとも必ずそこに命中する（重装兵HP8→6）
    expect(r.state.players[1].units[0].hp).toBe(6);
    // 拠点には当たらなくなった
    expect(r.state.players[1].baseHp).toBe(beforeBaseHp);
  });

  it('追撃の魔導士は敵ユニットがいなければ何も起きない', () => {
    const s = board({
      hands: { 0: ['mana_draw_spell'] },
      resources: { 0: { mana: 2 } },
      units: { 0: ['mana_pursuit_mage'] },
    });
    const beforeBaseHp = s.players[1].baseHp;
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'mana_draw_spell') });
    expect(r.ok).toBe(true);
    expect(r.state.players[1].units).toHaveLength(0);
    expect(r.state.players[1].baseHp).toBe(beforeBaseHp);
  });

  it('ドロー系は指定枚数を引く', () => {
    const s = board({ hands: { 0: ['mana_great_wisdom'] }, resources: { 0: { mana: 3 } } });
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'mana_great_wisdom') });
    expect(r.state.players[0].hand).toHaveLength(3);
  });
});

describe('魔力ユニット（召喚時誘発）', () => {
  it('符術の守り手は召喚時に1枚引く', () => {
    const s = board({
      hands: { 0: ['mana_rune_warden'] },
      resources: { 0: { mana: 2 } },
    });
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'mana_rune_warden') });
    expect(r.ok).toBe(true);
    expect(r.state.players[0].units.map((u) => u.defId)).toEqual(['mana_rune_warden']);
    // 手札から1枚出して1枚引くので、差し引き0枚
    expect(r.state.players[0].hand).toHaveLength(1);
  });

  it('幻影の使い手は召喚時に敵ユニットを凍結する', () => {
    const s = board({
      hands: { 0: ['mana_illusionist'] },
      resources: { 0: { mana: 4 } },
      units: { 1: ['fund_light_attacker'] },
    });
    const target = unitUid(s, P1, 'fund_light_attacker');
    const r = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_illusionist'),
      targets: [{ kind: 'unit', uid: target }],
    });
    expect(r.ok).toBe(true);
    expect(r.state.players[1].units[0].frozenUntilTurn).toBe(s.turn + 1);
  });

  it('召喚時誘発はスペルではないので【魔法耐性】を貫通する', () => {
    const s = board({
      hands: { 0: ['mana_illusionist'] },
      resources: { 0: { mana: 4 } },
      units: { 1: ['aether_immune_beast'] },
    });
    const r = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_illusionist'),
      targets: [{ kind: 'unit', uid: unitUid(s, P1, 'aether_immune_beast') }],
    });
    expect(r.ok).toBe(true);
    expect(r.state.players[1].units[0].frozenUntilTurn).toBe(s.turn + 1);
  });

  it('対象がいない場合は幻影の使い手を出せない', () => {
    const s = board({ hands: { 0: ['mana_illusionist'] }, resources: { 0: { mana: 4 } } });
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'mana_illusionist') });
    expect(r.ok).toBe(false);
  });
});

describe('スタックと打ち消し', () => {
  it('相手が打ち消しを構えているとスペルは応答フェイズに入る', () => {
    const s = board({
      hands: { 0: ['mana_flame_bolt'], 1: ['mana_counter'] },
      resources: { 0: { mana: 2 }, 1: { mana: 3 } },
    });
    const r = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_flame_bolt'),
      targets: [{ kind: 'base', player: P1 }],
    });
    expect(r.state.phase).toBe('respond');
    expect(r.state.priority).toBe(P1);
    expect(r.state.players[1].baseHp).toBe(50); // まだ解決していない
  });

  it('打ち消しを撃つと効果が無効化される', () => {
    let s = board({
      hands: { 0: ['mana_flame_bolt'], 1: ['mana_counter'] },
      resources: { 0: { mana: 2 }, 1: { mana: 3 } },
    });
    s = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_flame_bolt'),
      targets: [{ kind: 'base', player: P1 }],
    }).state;
    s = applyAction(s, { type: 'respond', uid: handUid(s, P1, 'mana_counter') }).state;
    expect(s.players[1].baseHp).toBe(50);
    expect(s.phase).toBe('main');
    expect(s.active).toBe(P0);
    expect(s.stack).toHaveLength(0);
  });

  it('パスすればスペルは通る', () => {
    let s = board({
      hands: { 0: ['mana_flame_bolt'], 1: ['mana_counter'] },
      resources: { 0: { mana: 2 }, 1: { mana: 3 } },
    });
    s = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_flame_bolt'),
      targets: [{ kind: 'base', player: P1 }],
    }).state;
    s = applyAction(s, { type: 'pass' }).state;
    expect(s.players[1].baseHp).toBe(46);
  });

  it('打ち消しを打ち消せる（元のスペルが通る）', () => {
    let s = board({
      hands: { 0: ['mana_flame_bolt', 'mana_counter'], 1: ['mana_counter'] },
      resources: { 0: { mana: 5 }, 1: { mana: 3 } },
    });
    s = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_flame_bolt'),
      targets: [{ kind: 'base', player: P1 }],
    }).state;
    s = applyAction(s, { type: 'respond', uid: handUid(s, P1, 'mana_counter') }).state;
    expect(s.priority).toBe(P0);
    s = applyAction(s, { type: 'respond', uid: handUid(s, P0, 'mana_counter') }).state;
    expect(s.players[1].baseHp).toBe(46);
  });

  it('相手にリソースがなければ応答フェイズに入らず即解決する', () => {
    const s = board({
      hands: { 0: ['mana_flame_bolt'], 1: ['mana_counter'] },
      resources: { 0: { mana: 2 }, 1: { mana: 2 } },
    });
    const r = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_flame_bolt'),
      targets: [{ kind: 'base', player: P1 }],
    });
    expect(r.state.phase).toBe('main');
    expect(r.state.players[1].baseHp).toBe(46);
  });
});

describe('エーテル系', () => {
  it('聖なる祈りは上限50を超えて回復しない', () => {
    const s = board({
      hands: { 0: ['aether_prayer', 'aether_prayer'] },
      resources: { 0: { aether: 4 } },
      baseHp: { 0: 47 },
    });
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'aether_prayer') });
    expect(r.state.players[0].baseHp).toBe(50);
  });

  it('タイムストップは相手のメインフェイズだけを飛ばす', () => {
    let s = board({ hands: { 0: ['aether_time_stop'] }, resources: { 0: { aether: 8 } } });
    s = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'aether_time_stop') }).state;
    expect(s.players[1].skipMainPhases).toBe(1);

    const handBefore = s.players[1].hand.length;
    s = applyAction(s, { type: 'endTurn' }).state;
    expect(s.active).toBe(P1);
    // ドローフェイズと分配フェイズは通常どおり行える
    expect(s.phase).toBe('allocate');
    expect(s.players[1].hand.length).toBe(handBefore + 1);
    s = applyAction(s, { type: 'allocate', fund: 2, mana: 0, aether: 0, draw: 0 }).state;
    expect(s.players[1].resources.fund).toBe(2);
    // メインフェイズを踏まずにP0のターンへ戻る
    expect(s.mainSkipped).toBe(true);
    expect(s.active).toBe(P0);
    expect(s.players[1].skipMainPhases).toBe(0);
  });

  it('次元の壺はエーテルを他リソースへ変換する（ターン1回）', () => {
    let s = board({
      facilities: { 0: ['aether_dimensional_jar'] },
      resources: { 0: { aether: 3 } },
    });
    const fid = facilityUid(s, P0, 'aether_dimensional_jar');
    s = applyAction(s, { type: 'activate', facilityUid: fid, chosenResource: 'fund' }).state;
    expect(s.players[0].resources).toEqual({ fund: 1, mana: 0, aether: 2 });
    expect(applyAction(s, { type: 'activate', facilityUid: fid, chosenResource: 'fund' }).ok).toBe(false);
  });
});

describe('ハイブリッド系', () => {
  it('錬金術は支払ったものとは別のリソースを2得る', () => {
    const s = board({ hands: { 0: ['hybrid_alchemy'] }, resources: { 0: { fund: 1 } } });
    const ok = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'hybrid_alchemy'),
      costOption: 0,
      chosenResource: 'aether',
    });
    expect(ok.ok).toBe(true);
    expect(ok.state.players[0].resources).toEqual({ fund: 0, mana: 0, aether: 2 });

    const ng = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'hybrid_alchemy'),
      costOption: 0,
      chosenResource: 'fund',
    });
    expect(ng.ok).toBe(false);
  });

  it('施設破壊工作は施設を即破壊する', () => {
    const s = board({
      hands: { 0: ['hybrid_sabotage'] },
      resources: { 0: { mana: 1, aether: 1 } },
      facilities: { 1: ['hybrid_countdown'] },
    });
    const r = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'hybrid_sabotage'),
      targets: [{ kind: 'facility', uid: facilityUid(s, P1, 'hybrid_countdown') }],
    });
    expect(r.state.players[1].facilities).toHaveLength(0);
  });

  it('カウントダウン兵器は自分のターン開始5回で特殊勝利する', () => {
    // 建設したターンは数えず、自分のターン開始5回で決着する
    const eight = passTurns(board({ facilities: { 0: ['hybrid_countdown'] } }), 8);
    expect(eight.winner).toBeNull();

    const ten = passTurns(board({ facilities: { 0: ['hybrid_countdown'] } }), 12);
    expect(ten.winner).toBe(P0);
    expect(ten.winReason).toContain('特殊勝利');
  });
});

describe('施設アップキープ', () => {
  it('資源施設は毎ターン開始時にリソースを生む', () => {
    // board() はメインフェイズ開始なので、ここから2ターン進めるとP0の手番が2回来る
    const s = passTurns(board({ facilities: { 0: ['fund_gold_mine', 'mana_crystal'] } }), 4);
    expect(s.active).toBe(P0);
    // P0のターンが2回開始した = アップキープ2回 + 分配で資金全振り2回
    expect(s.players[0].resources.fund).toBe(2 + 2 * 2);
    expect(s.players[0].resources.mana).toBe(2);
  });
});

describe('エンドフェイズの手札制限（仕様書 2.1）', () => {
  it('8枚以上あるとターンを終われず、7枚になるよう捨てる', () => {
    const hand = Array(9).fill('fund_light_attacker');
    let s = board({ hands: { 0: hand } });
    s = applyAction(s, { type: 'endTurn' }).state;
    expect(s.phase).toBe('discard');

    const wrong = applyAction(s, { type: 'discard', uids: [s.players[0].hand[0].uid] });
    expect(wrong.ok).toBe(false);

    const uids = s.players[0].hand.slice(0, 2).map((c) => c.uid);
    const r = applyAction(s, { type: 'discard', uids });
    expect(r.ok).toBe(true);
    expect(r.state.players[0].hand).toHaveLength(RULES.HAND_LIMIT);
    expect(r.state.players[0].graveyard).toHaveLength(2);
    expect(r.state.active).toBe(P1);
  });

  it('7枚以下ならそのままターンが移る', () => {
    const s = board({ hands: { 0: Array(7).fill('fund_light_attacker') } });
    const r = applyAction(s, { type: 'endTurn' });
    expect(r.state.phase).toBe('allocate');
    expect(r.state.active).toBe(P1);
  });
});

describe('山札切れ', () => {
  it('山札が0枚なら墓地をシャッフルして再生成しペナルティはない', () => {
    const s = board({ hands: { 0: ['mana_draw_spell'] }, resources: { 0: { mana: 2 } } });
    s.players[0].deck = [];
    s.players[0].graveyard = [
      { uid: 'g1', defId: 'fund_light_attacker', owner: P0 },
      { uid: 'g2', defId: 'fund_archer', owner: P0 },
      { uid: 'g3', defId: 'fund_siege', owner: P0 },
    ];
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'mana_draw_spell') });
    expect(r.ok).toBe(true);
    expect(r.state.players[0].hand).toHaveLength(2);
    expect(r.state.winner).toBeNull();
  });
});
