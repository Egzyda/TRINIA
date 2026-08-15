/**
 * TRINIA - ゲーム状態
 *
 * HP・リソース・手札・場・山札の管理と、それらに対する低レベル操作
 * （ドロー / ダメージ / 破壊 / 墓地送り）を提供する。
 * フェイズ進行そのものは mainPhaseEngine.ts が担当する。
 */
import { RULES, type RuleSet } from './rules';
import { shuffle } from './rng';
import { getCard, makeCardInstance, makeFacilityInstance, makeUnitInstance } from '../cards/cardFactory';
import type {
  CardInstance,
  FacilityInstance,
  GameState,
  PlayerId,
  PlayerState,
  Resources,
  UnitInstance,
} from './types';

export function opponentOf(p: PlayerId): PlayerId {
  return (p === 0 ? 1 : 0) as PlayerId;
}

export function nextUid(state: GameState, prefix: string): string {
  state.uidCounter += 1;
  return `${prefix}${state.uidCounter}`;
}

/** UIが表示するのは直近のみ。AIの探索で状態を複製し続けても膨らまないよう上限を設ける */
const LOG_LIMIT = 120;

export function log(
  state: GameState,
  player: PlayerId | null,
  text: string,
  kind?: 'attack',
): void {
  state.log.push({ turn: state.turn, player, text, kind });
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------

export interface PlayerSetup {
  name: string;
  /** 20枚のカードdefId配列 */
  deck: string[];
}

/**
 * 対局を生成し、オークションフェイズの状態を返す。
 * 初期手札6枚は「引き直しなし」で配りきる（仕様書 2.1）。
 */
export function createGame(
  p0: PlayerSetup,
  p1: PlayerSetup,
  seed: number,
  rules: RuleSet = RULES,
): GameState {
  const state: GameState = {
    rules,
    phase: 'mulligan',
    active: 0,
    priority: 0,
    turn: 0,
    players: [makePlayer(0, p0, rules), makePlayer(1, p1, rules)],
    stack: [],
    rngState: seed,
    winner: null,
    winReason: null,
    log: [],
    mainSkipped: false,
    resumePhase: null,
    uidCounter: 0,
  };

  for (const player of state.players) {
    const setup = player.id === 0 ? p0 : p1;
    player.deck = setup.deck.map((defId) => makeCardInstance(nextUid(state, 'c'), defId, player.id));
    const sh = shuffle(player.deck, state.rngState);
    player.deck = sh.items;
    state.rngState = sh.state;
  }

  for (const player of state.players) {
    for (let i = 0; i < rules.INITIAL_HAND; i++) drawCard(state, player.id);
  }

  log(state, null, '対局開始。初期手札を引き直しますか？（マリガン）');
  return state;
}

function makePlayer(id: PlayerId, setup: PlayerSetup, rules: RuleSet): PlayerState {
  return {
    id,
    name: setup.name,
    baseHp: rules.BASE_HP,
    maxBaseHp: rules.BASE_HP,
    resources: { fund: 0, mana: 0, aether: 0 },
    hand: [],
    deck: [],
    graveyard: [],
    units: [],
    facilities: [],
    bid: -1,
    skipMainPhases: 0,
    mulliganDone: false,
  };
}

// ---------------------------------------------------------------------------
// 山札・手札
// ---------------------------------------------------------------------------

/**
 * 1枚ドローする。
 * 山札が0枚なら墓地を全シャッフルして山札を再生成する（デッキ切れ負けなし・ペナルティなし）。
 */
export function drawCard(state: GameState, playerId: PlayerId): CardInstance | null {
  const p = state.players[playerId];
  if (p.deck.length === 0) {
    if (p.graveyard.length === 0) return null; // 理論上到達しないが安全弁
    const sh = shuffle(p.graveyard, state.rngState);
    p.deck = sh.items;
    state.rngState = sh.state;
    p.graveyard = [];
    log(state, playerId, '山札が尽きたため墓地をシャッフルして再生成した。');
  }
  const card = p.deck.shift()!;
  p.hand.push(card);
  return card;
}

export function discardFromHand(state: GameState, playerId: PlayerId, uid: string): boolean {
  const p = state.players[playerId];
  const idx = p.hand.findIndex((c) => c.uid === uid);
  if (idx < 0) return false;
  const [card] = p.hand.splice(idx, 1);
  p.graveyard.push(card);
  return true;
}

export function moveHandToGraveyard(state: GameState, playerId: PlayerId, uid: string): void {
  discardFromHand(state, playerId, uid);
}

// ---------------------------------------------------------------------------
// リソース
// ---------------------------------------------------------------------------

export function payResources(p: PlayerState, cost: Resources): boolean {
  if (p.resources.fund < cost.fund || p.resources.mana < cost.mana || p.resources.aether < cost.aether) {
    return false;
  }
  p.resources.fund -= cost.fund;
  p.resources.mana -= cost.mana;
  p.resources.aether -= cost.aether;
  return true;
}

export function gainResource(p: PlayerState, kind: keyof Resources, amount: number): void {
  // 持ち越し上限なし（仕様書 2.3）
  p.resources[kind] += amount;
}

// ---------------------------------------------------------------------------
// 盤面参照
// ---------------------------------------------------------------------------

export function findUnit(state: GameState, uid: string): { unit: UnitInstance; owner: PlayerId } | null {
  for (const p of state.players) {
    const unit = p.units.find((u) => u.uid === uid);
    if (unit) return { unit, owner: p.id };
  }
  return null;
}

export function findFacility(
  state: GameState,
  uid: string,
): { facility: FacilityInstance; owner: PlayerId } | null {
  for (const p of state.players) {
    const facility = p.facilities.find((f) => f.uid === uid);
    if (facility) return { facility, owner: p.id };
  }
  return null;
}

/** 攻撃力の実効値（永続値 + このターン限りの上昇） */
export function effectiveAttack(unit: UnitInstance): number {
  return Math.max(0, unit.attack + unit.tempAttack);
}

/** そのプレイヤーの前衛に【挑発】が存在するか */
export function tauntUnits(p: PlayerState): UnitInstance[] {
  return p.units.filter((u) => getCard(u.defId).keywords.includes('taunt'));
}

/**
 * そのプレイヤーが受けるダメージの軽減量。
 *
 * scope='base' の軽減は拠点にしか乗らない。
 * 【防壁発生装置】を全ダメージ軽減にすると攻撃力2のユニットが軒並み実質1になり、
 * 前衛戦闘の計算が壊れるため、拠点限定に絞ってある（docs/BALANCE.md 参照）。
 * また重複もしない（複数枚で完全ロックするのを防ぐ）。
 */
export function damageReductionOf(p: PlayerState, scope: 'base' | 'unit' | 'facility'): number {
  let flat = 0;
  let stackable = 0;
  for (const f of p.facilities) {
    for (const passive of getCard(f.defId).passives ?? []) {
      if (passive.kind !== 'damageReduction') continue;
      if (passive.scope === 'base' && scope !== 'base') continue;
      if (passive.stacks) stackable += passive.amount;
      else flat = Math.max(flat, passive.amount);
    }
  }
  return flat + stackable;
}

// ---------------------------------------------------------------------------
// ダメージ処理
// ---------------------------------------------------------------------------

export interface DamageOptions {
  /** スペルによるダメージか */
  isSpell?: boolean;
  /** 軽減を無視する */
  ignoreReduction?: boolean;
}

/** 拠点へのダメージ。実際に与えたダメージ量を返す */
export function damageBase(
  state: GameState,
  target: PlayerId,
  amount: number,
  opts: DamageOptions = {},
): number {
  const p = state.players[target];
  const reduced = opts.ignoreReduction ? amount : Math.max(0, amount - damageReductionOf(p, 'base'));
  if (reduced <= 0) return 0;
  p.baseHp = Math.max(0, p.baseHp - reduced);
  return reduced;
}

/** ユニットへのダメージ。破壊された場合は destroyUnit を呼ぶ */
/**
 * ユニットへのダメージ。
 *
 * 【魔法耐性】は「相手スペルの対象にならない」であって「無敵」ではない。
 * 対象を取らない全体効果（全体範囲魔法など）は通る。
 * 対象指定の可否は legalTargets() 側で弾いている。
 */
export function damageUnit(
  state: GameState,
  unit: UnitInstance,
  amount: number,
  opts: DamageOptions = {},
): number {
  const owner = state.players[unit.owner];
  const reduced = opts.ignoreReduction ? amount : Math.max(0, amount - damageReductionOf(owner, 'unit'));
  if (reduced <= 0) return 0;
  unit.hp -= reduced;
  return reduced;
}

export function damageFacility(
  state: GameState,
  facility: FacilityInstance,
  amount: number,
  opts: DamageOptions = {},
): number {
  const owner = state.players[facility.owner];
  const reduced = opts.ignoreReduction
    ? amount
    : Math.max(0, amount - damageReductionOf(owner, 'facility'));
  if (reduced <= 0) return 0;
  facility.hp -= reduced;
  return reduced;
}

/**
 * HPが0以下になったユニット・施設を場から取り除く。
 * 【再生】持ちはHP1で復活し、墓地には行かない。
 */
export function cleanupDestroyed(state: GameState): void {
  for (const p of state.players) {
    const survivors: UnitInstance[] = [];
    for (const unit of p.units) {
      if (unit.hp > 0) {
        survivors.push(unit);
        continue;
      }
      const def = getCard(unit.defId);
      if (def.keywords.includes('regenerate') && unit.regenerateLeft > 0) {
        unit.regenerateLeft -= 1;
        unit.hp = 1;
        unit.tempAttack = 0;
        survivors.push(unit);
        log(state, p.id, `【再生】${def.name} がHP1で復活した。`);
        continue;
      }
      p.graveyard.push({ uid: unit.uid, defId: unit.defId, owner: unit.owner });
      log(state, p.id, `${def.name} が破壊された。`);
    }
    p.units = survivors;

    const remaining: FacilityInstance[] = [];
    for (const facility of p.facilities) {
      if (facility.hp > 0) {
        remaining.push(facility);
        continue;
      }
      p.graveyard.push({ uid: facility.uid, defId: facility.defId, owner: facility.owner });
      log(state, p.id, `${getCard(facility.defId).name} が破壊された。`);
    }
    p.facilities = remaining;
  }
}

/** 施設を（ダメージを介さず）破壊する */
export function destroyFacility(state: GameState, facility: FacilityInstance): void {
  facility.hp = 0;
  cleanupDestroyed(state);
}

// ---------------------------------------------------------------------------
// 場に出す
// ---------------------------------------------------------------------------

export function summonUnit(state: GameState, playerId: PlayerId, defId: string): UnitInstance | null {
  const p = state.players[playerId];
  if (p.units.length >= state.rules.MAX_UNITS) return null;
  const unit = makeUnitInstance(nextUid(state, 'u'), defId, playerId);
  p.units.push(unit);
  return unit;
}

export function buildFacility(
  state: GameState,
  playerId: PlayerId,
  defId: string,
): FacilityInstance | null {
  const p = state.players[playerId];
  if (p.facilities.length >= state.rules.MAX_FACILITIES) return null;
  const facility = makeFacilityInstance(nextUid(state, 'f'), defId, playerId);
  p.facilities.push(facility);
  return facility;
}

// ---------------------------------------------------------------------------
// 勝敗
// ---------------------------------------------------------------------------

export function checkWinCondition(state: GameState): void {
  if (state.winner !== null) return;
  const dead = state.players.filter((p) => p.baseHp <= 0);
  if (dead.length === 2) {
    // 相討ちはターンプレイヤーの勝利とする（貫通ダメージ等の同時発生対策）
    state.winner = state.active;
    state.winReason = '相討ち（手番側の勝利）';
    state.phase = 'gameOver';
    return;
  }
  if (dead.length === 1) {
    state.winner = opponentOf(dead[0].id);
    state.winReason = `${dead[0].name} の拠点HPが0になった`;
    state.phase = 'gameOver';
  }
}

export function declareWin(state: GameState, winner: PlayerId, reason: string): void {
  if (state.winner !== null) return;
  state.winner = winner;
  state.winReason = reason;
  state.phase = 'gameOver';
  log(state, winner, `勝利: ${reason}`);
}

/**
 * 状態のディープコピー（AIの先読みとリデューサの純粋性に使う）。
 *
 * structuredClone より一桁速い手書き版。AIは1手の評価ごとに複製するため、
 * ここの速度がそのまま思考時間になる。
 * ログエントリとカード実体は生成後に書き換えないので参照コピーで足りる。
 */
export function cloneState(state: GameState): GameState {
  return {
    // ルールセットは対局中に変化しないので参照コピーで足りる
    rules: state.rules,
    phase: state.phase,
    active: state.active,
    priority: state.priority,
    turn: state.turn,
    players: [clonePlayer(state.players[0]), clonePlayer(state.players[1])],
    stack: state.stack.map((s) => ({ ...s, targets: s.targets.slice() })),
    rngState: state.rngState,
    winner: state.winner,
    winReason: state.winReason,
    log: state.log.slice(),
    mainSkipped: state.mainSkipped,
    resumePhase: state.resumePhase,
    uidCounter: state.uidCounter,
  };
}

function clonePlayer(p: PlayerState): PlayerState {
  return {
    id: p.id,
    name: p.name,
    baseHp: p.baseHp,
    maxBaseHp: p.maxBaseHp,
    resources: { fund: p.resources.fund, mana: p.resources.mana, aether: p.resources.aether },
    // CardInstance は不変なので配列だけ複製すればよい
    hand: p.hand.slice(),
    deck: p.deck.slice(),
    graveyard: p.graveyard.slice(),
    units: p.units.map((u) => ({ ...u })),
    facilities: p.facilities.map((f) => ({ ...f })),
    bid: p.bid,
    skipMainPhases: p.skipMainPhases,
    mulliganDone: p.mulliganDone,
  };
}
