/**
 * 戦闘まわりの検証。
 * 召喚酔いなし・挑発・すり抜け・攻城・貫通・凍結など。
 */
import { describe, expect, it } from 'vitest';
import { applyAction, legalAttackTargets } from '../src/core/mainPhaseEngine';
import { board, facilityUid, handUid, unitUid } from './helpers';
import type { PlayerId } from '../src/core/types';

const P0: PlayerId = 0;
const P1: PlayerId = 1;

describe('召喚酔いなし（仕様書 2.4）', () => {
  it('召喚したユニットは同じターンに攻撃できる', () => {
    let s = board({ hands: { 0: ['fund_light_attacker'] }, resources: { 0: { fund: 1 } } });
    s = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'fund_light_attacker') }).state;
    const uid = unitUid(s, P0, 'fund_light_attacker');
    const r = applyAction(s, { type: 'attack', attackerUid: uid, target: { kind: 'base', player: P1 } });
    expect(r.ok).toBe(true);
    expect(r.state.players[1].baseHp).toBe(48);
  });

  it('同じユニットは1ターンに1回しか攻撃できない', () => {
    let s = board({ units: { 0: ['fund_light_attacker'] } });
    const uid = unitUid(s, P0, 'fund_light_attacker');
    s = applyAction(s, { type: 'attack', attackerUid: uid, target: { kind: 'base', player: P1 } }).state;
    const again = applyAction(s, { type: 'attack', attackerUid: uid, target: { kind: 'base', player: P1 } });
    expect(again.ok).toBe(false);
  });
});

describe('前衛と拠点への攻撃制限', () => {
  it('敵前衛がいると拠点を直接攻撃できない', () => {
    const s = board({ units: { 0: ['fund_light_attacker'], 1: ['fund_light_attacker'] } });
    const uid = unitUid(s, P0, 'fund_light_attacker');
    const r = applyAction(s, { type: 'attack', attackerUid: uid, target: { kind: 'base', player: P1 } });
    expect(r.ok).toBe(false);
  });

  it('敵前衛がいなければ拠点と施設を選べる', () => {
    const s = board({ units: { 0: ['fund_light_attacker'] }, facilities: { 1: ['fund_gold_mine'] } });
    const targets = legalAttackTargets(s, s.players[0].units[0]);
    expect(targets).toContainEqual({ kind: 'base', player: P1 });
    expect(targets.some((t) => t.kind === 'facility')).toBe(true);
  });

  it('【挑発】がいる場合は挑発ユニットしか殴れない', () => {
    const s = board({
      units: { 0: ['fund_light_attacker'], 1: ['fund_heavy_guard', 'fund_archer'] },
    });
    const targets = legalAttackTargets(s, s.players[0].units[0]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({ kind: 'unit', uid: unitUid(s, P1, 'fund_heavy_guard') });
  });

  it('【すり抜け】は敵前衛を無視して拠点を攻撃できる', () => {
    const s = board({ units: { 0: ['fund_archer'], 1: ['fund_heavy_guard'] } });
    const uid = unitUid(s, P0, 'fund_archer');
    const r = applyAction(s, { type: 'attack', attackerUid: uid, target: { kind: 'base', player: P1 } });
    expect(r.ok).toBe(true);
    // 弓兵は攻3
    expect(r.state.players[1].baseHp).toBe(47);
  });
});

describe('ダメージ計算', () => {
  it('前衛同士は相互にダメージを受ける', () => {
    const s = board({ units: { 0: ['fund_light_attacker'], 1: ['fund_heavy_guard'] } });
    const r = applyAction(s, {
      type: 'attack',
      attackerUid: unitUid(s, P0, 'fund_light_attacker'),
      target: { kind: 'unit', uid: unitUid(s, P1, 'fund_heavy_guard') },
    });
    expect(r.ok).toBe(true);
    // 軽量兵2/2 vs 重装兵0/8（攻撃力0なので反撃なし）
    expect(r.state.players[1].units[0].hp).toBe(6);
    expect(r.state.players[0].units[0].hp).toBe(2);
  });

  it('【攻城】は施設へのダメージが2倍になる', () => {
    const s = board({ units: { 0: ['fund_siege'] }, facilities: { 1: ['fund_gold_mine'] } });
    const r = applyAction(s, {
      type: 'attack',
      attackerUid: unitUid(s, P0, 'fund_siege'),
      target: { kind: 'facility', uid: facilityUid(s, P1, 'fund_gold_mine') },
    });
    // 攻2 × 2倍 = 4ダメージ。金鉱山HP6 → 2
    expect(r.state.players[1].facilities[0].hp).toBe(2);
  });

  it('【貫通】は撃破時の超過ダメージが拠点へ抜ける', () => {
    const s = board({ units: { 0: ['hybrid_titan'], 1: ['fund_light_attacker'] } });
    const r = applyAction(s, {
      type: 'attack',
      attackerUid: unitUid(s, P0, 'hybrid_titan'),
      target: { kind: 'unit', uid: unitUid(s, P1, 'fund_light_attacker') },
    });
    // 攻9 - HP2 = 7が貫通
    expect(r.state.players[1].units).toHaveLength(0);
    expect(r.state.players[1].baseHp).toBe(43);
  });

  it('【薙ぎ払い】対象以外の敵前衛全員にも同じダメージが入るが、反撃は本来の対象からのみ', () => {
    const s = board({
      units: {
        0: ['fund_berserker'],
        1: ['fund_light_attacker', 'fund_heavy_guard', 'fund_archer'],
      },
    });
    const r = applyAction(s, {
      type: 'attack',
      attackerUid: unitUid(s, P0, 'fund_berserker'),
      target: { kind: 'unit', uid: unitUid(s, P1, 'fund_heavy_guard') },
    });
    expect(r.ok).toBe(true);
    const byId = (id: string) => r.state.players[1].units.find((u) => u.defId === id);
    // 乱撃兵(攻3)が全員に3ダメージ。軽量兵(HP2)と弓兵(HP1)は撃破、重装兵(HP8)は5残る
    expect(byId('fund_light_attacker')).toBeUndefined();
    expect(byId('fund_archer')).toBeUndefined();
    expect(byId('fund_heavy_guard')?.hp).toBe(5);
    // 反撃は本来の対象（重装兵、攻0）からのみだが、攻撃力0のため反撃なし
    expect(r.state.players[0].units[0].hp).toBe(3);
  });

  it('貫通でないユニットは超過ダメージが拠点に抜けない', () => {
    const s = board({ units: { 0: ['aether_immune_beast'], 1: ['fund_light_attacker'] } });
    const r = applyAction(s, {
      type: 'attack',
      attackerUid: unitUid(s, P0, 'aether_immune_beast'),
      target: { kind: 'unit', uid: unitUid(s, P1, 'fund_light_attacker') },
    });
    expect(r.state.players[1].baseHp).toBe(50);
  });
});

describe('キーワード能力', () => {
  it('【再生】は1度だけHP1で復活する', () => {
    let s = board({
      units: { 0: ['hybrid_titan'], 1: ['aether_regen_guardian'] },
    });
    const guardian = unitUid(s, P1, 'aether_regen_guardian');
    s = applyAction(s, {
      type: 'attack',
      attackerUid: unitUid(s, P0, 'hybrid_titan'),
      target: { kind: 'unit', uid: guardian },
    }).state;
    expect(s.players[1].units).toHaveLength(1);
    expect(s.players[1].units[0].hp).toBe(1);
    expect(s.players[1].units[0].regenerateLeft).toBe(0);

    // 2度目の破壊では復活しない
    s.players[0].units[0].hasAttacked = false;
    s = applyAction(s, {
      type: 'attack',
      attackerUid: unitUid(s, P0, 'hybrid_titan'),
      target: { kind: 'unit', uid: guardian },
    }).state;
    expect(s.players[1].units).toHaveLength(0);
  });

  it('【魔法耐性】はスペルの対象にならない', () => {
    const s = board({
      hands: { 0: ['mana_flame_bolt'] },
      resources: { 0: { mana: 2 } },
      units: { 1: ['aether_immune_beast'] },
    });
    const r = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_flame_bolt'),
      targets: [{ kind: 'unit', uid: unitUid(s, P1, 'aether_immune_beast') }],
    });
    expect(r.ok).toBe(false);
  });

  it('【魔法耐性】でも対象を取らない全体魔法は通る', () => {
    const s = board({
      hands: { 0: ['mana_inferno'] },
      resources: { 0: { mana: 4 } },
      units: { 1: ['aether_immune_beast'] },
    });
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'mana_inferno') });
    expect(r.ok).toBe(true);
    expect(r.state.players[1].units[0].hp).toBe(6);
  });

  it('【魔法耐性】でも施設の起動能力（魔導砲）は通る', () => {
    const s = board({
      facilities: { 0: ['hybrid_arcane_cannon'] },
      resources: { 0: { mana: 1 } },
      units: { 1: ['aether_immune_beast'] },
    });
    const r = applyAction(s, {
      type: 'activate',
      facilityUid: facilityUid(s, P0, 'hybrid_arcane_cannon'),
      target: { kind: 'unit', uid: unitUid(s, P1, 'aether_immune_beast') },
    });
    expect(r.ok).toBe(true);
    expect(r.state.players[1].units[0].hp).toBe(6);
  });

  it('【防壁発生装置】はダメージを1軽減し、2枚でも重複しない', () => {
    const one = board({
      units: { 0: ['fund_light_attacker'] },
      facilities: { 1: ['aether_barrier'] },
    });
    const r1 = applyAction(one, {
      type: 'attack',
      attackerUid: unitUid(one, P0, 'fund_light_attacker'),
      target: { kind: 'base', player: P1 },
    });
    expect(r1.state.players[1].baseHp).toBe(49);

    const two = board({
      units: { 0: ['fund_light_attacker'] },
      facilities: { 1: ['aether_barrier', 'aether_barrier'] },
    });
    const r2 = applyAction(two, {
      type: 'attack',
      attackerUid: unitUid(two, P0, 'fund_light_attacker'),
      target: { kind: 'base', player: P1 },
    });
    expect(r2.state.players[1].baseHp).toBe(49);
  });
});

describe('凍結', () => {
  it('凍結されたユニットは相手の次ターンに攻撃できず、その次から動ける', () => {
    let s = board({
      hands: { 0: ['mana_freeze'] },
      resources: { 0: { mana: 2 } },
      units: { 1: ['fund_light_attacker'] },
    });
    const frozen = unitUid(s, P1, 'fund_light_attacker');
    s = applyAction(s, {
      type: 'playCard',
      uid: handUid(s, P0, 'mana_freeze'),
      targets: [{ kind: 'unit', uid: frozen }],
    }).state;

    // P0のターンを終了 → P1のターン(turn2)
    s = applyAction(s, { type: 'endTurn' }).state;
    s = applyAction(s, { type: 'allocate', fund: 2, mana: 0, aether: 0, draw: 0 }).state;
    expect(s.active).toBe(P1);
    const blocked = applyAction(s, {
      type: 'attack',
      attackerUid: frozen,
      target: { kind: 'base', player: P0 },
    });
    expect(blocked.ok).toBe(false);

    // P1ターン終了 → P0ターン → P1ターン(turn4)には解除されている
    s = applyAction(s, { type: 'endTurn' }).state;
    s = applyAction(s, { type: 'allocate', fund: 2, mana: 0, aether: 0, draw: 0 }).state;
    s = applyAction(s, { type: 'endTurn' }).state;
    s = applyAction(s, { type: 'allocate', fund: 2, mana: 0, aether: 0, draw: 0 }).state;
    expect(s.active).toBe(P1);
    const freed = applyAction(s, {
      type: 'attack',
      attackerUid: frozen,
      target: { kind: 'base', player: P0 },
    });
    expect(freed.ok).toBe(true);
  });
});

describe('ゾーン上限', () => {
  it('前衛は3体まで', () => {
    const s = board({
      hands: { 0: ['fund_light_attacker'] },
      resources: { 0: { fund: 5 } },
      units: { 0: ['fund_light_attacker', 'fund_light_attacker', 'fund_light_attacker'] },
    });
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'fund_light_attacker') });
    expect(r.ok).toBe(false);
  });

  it('施設は3枠まで', () => {
    const s = board({
      hands: { 0: ['fund_gold_mine'] },
      resources: { 0: { fund: 5 } },
      facilities: { 0: ['fund_gold_mine', 'mana_crystal', 'aether_power_plant'] },
    });
    const r = applyAction(s, { type: 'playCard', uid: handUid(s, P0, 'fund_gold_mine') });
    expect(r.ok).toBe(false);
  });
});

describe('勝敗', () => {
  it('拠点HPが0になった側が敗北する', () => {
    const s = board({ units: { 0: ['hybrid_titan'] }, baseHp: { 1: 5 } });
    const r = applyAction(s, {
      type: 'attack',
      attackerUid: unitUid(s, P0, 'hybrid_titan'),
      target: { kind: 'base', player: P1 },
    });
    expect(r.state.winner).toBe(P0);
    expect(r.state.phase).toBe('gameOver');
  });
});
