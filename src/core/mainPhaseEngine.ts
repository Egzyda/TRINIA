/**
 * TRINIA - フェイズ進行・戦闘エンジン
 *
 * 仕様書 2.4 の1ターン進行フローをそのまま実装する。
 *   1. ドローフェイズ（自動1枚）
 *   2. 分配フェイズ（2ptを リソース or 追加ドロー に振り分け）
 *   3. メインフェイズ（統合：プレイ／攻撃／起動が順不同・回数無制限）
 *   4. エンドフェイズ（手札7枚まで捨てる／リソースは持ち越し）
 *
 * 召喚酔いは存在しないため、場に出た瞬間から攻撃できる。
 *
 * applyAction() は「状態を複製してから変更する」純粋リデューサ。
 * 同じ状態＋同じ行動列は常に同じ結果になるので、
 * AIの先読み・リプレイ・サーバ側再検証にそのまま流用できる。
 */
import { getCard } from '../cards/cardFactory';
import { canPay, costOptions, paidResourceOf } from '../cards/baseCard';
import { bothBidsIn, isValidBid, resolveAuction } from './auctionEngine';
import {
  buildFacility,
  checkWinCondition,
  cleanupDestroyed,
  cloneState,
  damageBase,
  damageFacility,
  damageUnit,
  declareWin,
  discardFromHand,
  drawCard,
  effectiveAttack,
  findFacility,
  findUnit,
  log,
  nextUid,
  opponentOf,
  payResources,
  summonUnit,
  tauntUnits,
} from './gameState';
import {
  legalTargets,
  requiresTarget,
  resolveEffect,
  targetSpecOf,
  type EffectContext,
} from './effects';
import { RULES } from './rules';
import type {
  ActionResult,
  CardDef,
  GameAction,
  GameState,
  PlayerId,
  Resources,
  StackItem,
  TargetRef,
  UnitInstance,
} from './types';

// ---------------------------------------------------------------------------
// 公開エントリポイント
// ---------------------------------------------------------------------------

/**
 * プレイヤー入力を1つ適用する。
 * 不正な入力は状態を変えずに ok:false を返す（UIはそのままエラー表示すればよい）。
 */
export function applyAction(prev: GameState, action: GameAction): ActionResult {
  if (prev.phase === 'gameOver') {
    return { ok: false, error: '対局はすでに終了しています', state: prev };
  }
  const state = cloneState(prev);
  const err = dispatch(state, action);
  if (err) return { ok: false, error: err, state: prev };
  return { ok: true, state };
}

function dispatch(state: GameState, action: GameAction): string | undefined {
  switch (action.type) {
    case 'bid':
      return doBid(state, action.player, action.amount);
    case 'allocate':
      return doAllocate(state, action.fund, action.mana, action.aether, action.draw);
    case 'playCard':
      return doPlayCard(state, action);
    case 'attack':
      return doAttack(state, action.attackerUid, action.target);
    case 'activate':
      return doActivate(state, action);
    case 'respond':
      return doRespond(state, action.uid);
    case 'pass':
      return doPass(state);
    case 'endTurn':
      return doEndTurn(state);
    case 'discard':
      return doDiscard(state, action.uids);
    default:
      return '未知のアクションです';
  }
}

// ---------------------------------------------------------------------------
// オークション
// ---------------------------------------------------------------------------

function doBid(state: GameState, player: PlayerId, amount: number): string | undefined {
  if (state.phase !== 'auction') return 'いまはオークションフェイズではありません';
  if (!isValidBid(amount)) return `提示HPは0〜${RULES.MAX_BID}の整数です`;
  if (state.players[player].bid >= 0) return 'すでに提示済みです';
  state.players[player].bid = amount;
  if (!bothBidsIn(state)) return undefined;

  resolveAuction(state);
  beginTurn(state);
  return undefined;
}

// ---------------------------------------------------------------------------
// ターン開始（ドローフェイズ）
// ---------------------------------------------------------------------------

/** 手番プレイヤーのターンを開始する: リセット → 施設アップキープ → 1ドロー → 分配待ち */
function beginTurn(state: GameState): void {
  state.turn += 1;
  const p = state.players[state.active];

  for (const u of p.units) {
    u.hasAttacked = false;
    if (u.frozenUntilTurn !== undefined && state.turn > u.frozenUntilTurn) {
      u.frozenUntilTurn = undefined;
    }
  }
  for (const f of p.facilities) f.activatedThisTurn = 0;

  log(state, p.id, `--- ターン${state.turn}: ${p.name} ---`);

  // 施設アップキープ（存在する限り毎ターン永続的にリソースを生む）
  for (const f of p.facilities) {
    const def = getCard(f.defId);
    for (const passive of def.passives ?? []) {
      if (passive.kind === 'upkeepResource') {
        p.resources[passive.resource] += passive.amount;
        log(state, p.id, `${def.name}: ${passive.resource}+${passive.amount}`);
      } else if (passive.kind === 'countdownWin') {
        f.counters += 1;
        log(state, p.id, `${def.name}: カウンター ${f.counters}/${passive.turns}`);
        if (f.counters >= passive.turns) {
          declareWin(state, p.id, `${def.name}のカウントダウン完了による特殊勝利`);
          return;
        }
      }
    }
  }

  drawCard(state, p.id);
  state.phase = 'allocate';
  state.priority = p.id;
}

// ---------------------------------------------------------------------------
// 分配フェイズ
// ---------------------------------------------------------------------------

function doAllocate(
  state: GameState,
  fund: number,
  mana: number,
  aether: number,
  draw: number,
): string | undefined {
  if (state.phase !== 'allocate') return 'いまは分配フェイズではありません';
  const values = [fund, mana, aether, draw];
  if (values.some((v) => !Number.isInteger(v) || v < 0)) return '分配値は0以上の整数です';
  const spent = fund + mana + aether + draw * RULES.DRAW_COST;
  if (spent !== RULES.FREE_POINTS) {
    return `フリーポイント${RULES.FREE_POINTS}ptをちょうど使い切ってください（現在${spent}pt）`;
  }

  const p = state.players[state.active];
  p.resources.fund += fund;
  p.resources.mana += mana;
  p.resources.aether += aether;
  for (let i = 0; i < draw; i++) drawCard(state, p.id);
  log(
    state,
    p.id,
    `分配: 資金+${fund} 魔力+${mana} エーテル+${aether} ドロー${draw}枚`,
  );

  // タイムストップ等でメインフェイズをスキップする場合
  if (p.skipMainPhases > 0) {
    p.skipMainPhases -= 1;
    state.mainSkipped = true;
    log(state, p.id, 'メインフェイズはスキップされた。');
    finishTurnOrDiscard(state);
    return undefined;
  }

  state.mainSkipped = false;
  state.phase = 'main';
  return undefined;
}

// ---------------------------------------------------------------------------
// メインフェイズ: カードをプレイする
// ---------------------------------------------------------------------------

interface PlayCardAction {
  type: 'playCard';
  uid: string;
  targets?: TargetRef[];
  costOption?: number;
  chosenResource?: import('./types').ResourceKind;
}

function doPlayCard(state: GameState, action: PlayCardAction): string | undefined {
  if (state.phase !== 'main') return 'いまはメインフェイズではありません';
  const p = state.players[state.active];
  const idx = p.hand.findIndex((c) => c.uid === action.uid);
  if (idx < 0) return '手札にそのカードがありません';
  const card = p.hand[idx];
  const def = getCard(card.defId);

  const options = costOptions(def);
  const optIdx = action.costOption ?? 0;
  const cost = options[optIdx];
  if (!cost) return '不正なコスト選択です';
  if (!canPay(p.resources, cost)) return 'リソースが足りません';

  if (def.type === 'unit' && p.units.length >= RULES.MAX_UNITS) {
    return `前衛は最大${RULES.MAX_UNITS}体までです`;
  }
  if (def.type === 'facility' && p.facilities.length >= RULES.MAX_FACILITIES) {
    return `施設は最大${RULES.MAX_FACILITIES}枠までです`;
  }

  const targetError = validateTargets(state, state.active, def, action.targets ?? []);
  if (targetError) return targetError;

  if (def.type === 'spell' && def.effects?.some((e) => e.kind === 'gainResource')) {
    const paid = paidResourceOf(cost);
    if (!action.chosenResource) return '獲得するリソースを選んでください';
    if (action.chosenResource === paid) return '支払ったものとは別のリソースを選んでください';
  }

  payResources(p, cost);
  p.hand.splice(idx, 1);

  if (def.type === 'unit') {
    summonUnit(state, state.active, def.id);
    log(state, state.active, `${def.name} を召喚した（召喚酔いなし）。`);
    checkWinCondition(state);
    return undefined;
  }

  if (def.type === 'facility') {
    buildFacility(state, state.active, def.id);
    log(state, state.active, `${def.name} を建設した。`);
    return undefined;
  }

  // スペル: スタックに積み、相手に応答（打ち消し）の機会を与える
  const item: StackItem = {
    uid: card.uid,
    defId: def.id,
    controller: state.active,
    targets: action.targets ?? [],
    paidResource: paidResourceOf(cost),
    chosenResource: action.chosenResource,
    countered: false,
  };
  state.stack.push(item);
  log(state, state.active, `${def.name} を発動した。`);
  fireSpellCastTriggers(state, state.active);
  checkWinCondition(state);
  if (state.winner !== null) return undefined;

  openResponseWindowOrResolve(state, opponentOf(state.active));
  return undefined;
}

/** 【追撃の魔導士】など「自分がスペルを発動するたび」トリガー */
function fireSpellCastTriggers(state: GameState, controller: PlayerId): void {
  const p = state.players[controller];
  for (const unit of p.units.slice()) {
    const def = getCard(unit.defId);
    for (const trigger of def.triggers ?? []) {
      if (trigger.on !== 'selfSpellCast') continue;
      const ctx: EffectContext = {
        state,
        controller,
        sourceDefId: def.id,
        targets: [],
        targetCursor: { i: 0 },
        isSpell: false, // トリガー由来のダメージはスペルダメージ扱いにしない
      };
      resolveEffect(ctx, trigger.effect);
    }
  }
  cleanupDestroyed(state);
}

/** カードが要求する対象がすべて正しく指定されているか検証する */
function validateTargets(
  state: GameState,
  controller: PlayerId,
  def: CardDef,
  targets: TargetRef[],
): string | undefined {
  const needed = (def.effects ?? []).filter(requiresTarget);
  if (needed.length === 0) return undefined;
  if (targets.length < needed.length) return '対象を指定してください';
  for (let i = 0; i < needed.length; i++) {
    const legal = legalTargets(state, controller, targetSpecOf(needed[i]), def.type === 'spell');
    const t = targets[i];
    const ok = legal.some((l) => sameTarget(l, t));
    if (!ok) return '対象が不正です';
  }
  return undefined;
}

function sameTarget(a: TargetRef, b: TargetRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'base' && b.kind === 'base') return a.player === b.player;
  if ((a.kind === 'unit' || a.kind === 'facility') && 'uid' in b) return a.uid === b.uid;
  return true;
}

// ---------------------------------------------------------------------------
// 応答フェイズ（打ち消し）
// ---------------------------------------------------------------------------

/** responder が打ち消しを持っていれば応答フェイズへ、いなければ即解決する */
function openResponseWindowOrResolve(state: GameState, responder: PlayerId): void {
  if (canRespond(state, responder)) {
    state.resumePhase = state.resumePhase ?? 'main';
    state.phase = 'respond';
    state.priority = responder;
    return;
  }
  resolveStack(state);
}

/** そのプレイヤーが打ち消しを構えられるか */
export function canRespond(state: GameState, player: PlayerId): boolean {
  if (state.stack.length === 0) return false;
  const top = state.stack[state.stack.length - 1];
  if (top.controller === player) return false; // 自分のスペルは自分で打ち消さない
  const p = state.players[player];
  return p.hand.some((c) => {
    const def = getCard(c.defId);
    return def.keywords.includes('counter') && canPay(p.resources, def.cost);
  });
}

function doRespond(state: GameState, uid: string): string | undefined {
  if (state.phase !== 'respond') return 'いまは応答フェイズではありません';
  const responder = state.priority;
  const p = state.players[responder];
  const idx = p.hand.findIndex((c) => c.uid === uid);
  if (idx < 0) return '手札にそのカードがありません';
  const card = p.hand[idx];
  const def = getCard(card.defId);
  if (!def.keywords.includes('counter')) return 'そのカードは応答できません';
  if (!canPay(p.resources, def.cost)) return 'リソースが足りません';

  payResources(p, def.cost);
  p.hand.splice(idx, 1);
  state.stack.push({
    uid: card.uid,
    defId: def.id,
    controller: responder,
    targets: [],
    countered: false,
  });
  log(state, responder, `${def.name} を発動した。`);
  fireSpellCastTriggers(state, responder);

  // 打ち消しに対する打ち消しも認める
  openResponseWindowOrResolve(state, opponentOf(responder));
  return undefined;
}

function doPass(state: GameState): string | undefined {
  if (state.phase !== 'respond') return 'いまは応答フェイズではありません';
  resolveStack(state);
  return undefined;
}

/** スタックを上から順に解決する。打ち消しは1つ下の項目を無効化する */
function resolveStack(state: GameState): void {
  while (state.stack.length > 0) {
    const item = state.stack.pop()!;
    const def = getCard(item.defId);
    const owner = state.players[item.controller];

    if (item.countered) {
      owner.graveyard.push({ uid: item.uid, defId: item.defId, owner: item.controller });
      log(state, item.controller, `${def.name} は打ち消された。`);
      continue;
    }

    const ctx: EffectContext = {
      state,
      controller: item.controller,
      sourceDefId: def.id,
      targets: item.targets,
      targetCursor: { i: 0 },
      chosenResource: item.chosenResource,
      paidResource: item.paidResource,
      isSpell: true,
    };

    for (const effect of def.effects ?? []) {
      if (effect.kind === 'counterSpell') {
        const below = state.stack[state.stack.length - 1];
        if (below) below.countered = true;
        continue;
      }
      resolveEffect(ctx, effect);
    }

    owner.graveyard.push({ uid: item.uid, defId: item.defId, owner: item.controller });
    cleanupDestroyed(state);
    checkWinCondition(state);
    if (state.winner !== null) return;
  }

  state.phase = state.resumePhase ?? 'main';
  state.resumePhase = null;
  state.priority = state.active;
}

// ---------------------------------------------------------------------------
// メインフェイズ: 攻撃
// ---------------------------------------------------------------------------

export function canAttack(state: GameState, unit: UnitInstance): boolean {
  if (unit.hasAttacked) return false;
  if (unit.frozenUntilTurn !== undefined && state.turn <= unit.frozenUntilTurn) return false;
  return effectiveAttack(unit) > 0;
}

/**
 * その攻撃ユニットが選べる対象の一覧。
 * 敵前衛がいる場合、【すり抜け】以外は前衛としか戦えない。
 * 敵前衛に【挑発】がいる場合、それを優先しなければならない。
 */
export function legalAttackTargets(state: GameState, unit: UnitInstance): TargetRef[] {
  const foeId = opponentOf(unit.owner);
  const foe = state.players[foeId];
  const def = getCard(unit.defId);
  const evasive = def.keywords.includes('evasive');

  const taunts = tauntUnits(foe);
  const unitTargets: TargetRef[] = (taunts.length > 0 ? taunts : foe.units).map((u) => ({
    kind: 'unit',
    uid: u.uid,
  }));

  const backline: TargetRef[] = [
    ...foe.facilities.map((f) => ({ kind: 'facility', uid: f.uid }) as TargetRef),
    { kind: 'base', player: foeId } as TargetRef,
  ];

  if (foe.units.length === 0) return backline;
  // すり抜けは前衛を無視できるが、前衛と戦うことも選べる
  return evasive ? [...unitTargets, ...backline] : unitTargets;
}

function doAttack(state: GameState, attackerUid: string, target: TargetRef): string | undefined {
  if (state.phase !== 'main') return 'いまはメインフェイズではありません';
  const found = findUnit(state, attackerUid);
  if (!found || found.owner !== state.active) return '自軍の前衛ユニットを指定してください';
  const attacker = found.unit;
  if (attacker.hasAttacked) return 'そのユニットはすでに攻撃済みです';
  if (attacker.frozenUntilTurn !== undefined && state.turn <= attacker.frozenUntilTurn) {
    return 'そのユニットは凍結されています';
  }

  const legal = legalAttackTargets(state, attacker);
  if (!legal.some((l) => sameTarget(l, target))) return 'その対象は攻撃できません';

  const attackerDef = getCard(attacker.defId);
  const power = effectiveAttack(attacker);
  attacker.hasAttacked = true;

  if (target.kind === 'base') {
    const dealt = damageBase(state, target.player, power);
    log(state, state.active, `${attackerDef.name} が敵拠点に${dealt}ダメージ。`);
  } else if (target.kind === 'facility') {
    const t = findFacility(state, target.uid);
    if (!t) return '対象の施設が存在しません';
    // 【攻城】施設へのダメージは2倍
    const raw = attackerDef.keywords.includes('siege') ? power * 2 : power;
    const dealt = damageFacility(state, t.facility, raw);
    log(state, state.active, `${attackerDef.name} が ${getCard(t.facility.defId).name} に${dealt}ダメージ。`);
  } else if (target.kind === 'unit') {
    const t = findUnit(state, target.uid);
    if (!t) return '対象のユニットが存在しません';
    const defender = t.unit;
    const defenderDef = getCard(defender.defId);
    const defenderHpBefore = defender.hp;
    const counterPower = effectiveAttack(defender);

    // 前衛同士の戦闘は相互ダメージ
    const dealt = damageUnit(state, defender, power);
    const taken = damageUnit(state, attacker, counterPower);
    log(
      state,
      state.active,
      `${attackerDef.name}(${power}) と ${defenderDef.name}(${counterPower}) が交戦。` +
        `${defenderDef.name}に${dealt}、${attackerDef.name}に${taken}ダメージ。`,
    );

    // 【貫通】撃破時の超過ダメージが拠点へ抜ける
    if (attackerDef.keywords.includes('trample') && dealt > defenderHpBefore) {
      const overflow = dealt - defenderHpBefore;
      const through = damageBase(state, defender.owner, overflow, { ignoreReduction: true });
      if (through > 0) log(state, state.active, `【貫通】超過${through}ダメージが敵拠点へ抜けた。`);
    }
  }

  cleanupDestroyed(state);
  checkWinCondition(state);
  return undefined;
}

// ---------------------------------------------------------------------------
// メインフェイズ: 施設の起動スキル
// ---------------------------------------------------------------------------

interface ActivateAction {
  type: 'activate';
  facilityUid: string;
  target?: TargetRef;
  chosenResource?: import('./types').ResourceKind;
}

function doActivate(state: GameState, action: ActivateAction): string | undefined {
  if (state.phase !== 'main') return 'いまはメインフェイズではありません';
  const found = findFacility(state, action.facilityUid);
  if (!found || found.owner !== state.active) return '自軍の施設を指定してください';
  const facility = found.facility;
  const def = getCard(facility.defId);
  const ability = def.activated;
  if (!ability) return 'その施設に起動スキルはありません';
  if (facility.activatedThisTurn >= ability.perTurn) return 'この施設は今ターンすでに起動しました';

  const p = state.players[state.active];
  if (!canPay(p.resources, ability.cost)) return 'リソースが足りません';

  switch (ability.kind) {
    case 'buffUnitPermanent': {
      if (action.target?.kind !== 'unit') return '対象の自軍ユニットを指定してください';
      const t = findUnit(state, action.target.uid);
      if (!t || t.owner !== state.active) return '対象の自軍ユニットを指定してください';
      payResources(p, ability.cost);
      t.unit.attack += ability.attack;
      log(state, state.active, `${def.name}: ${getCard(t.unit.defId).name} の攻撃力が永続+${ability.attack}。`);
      break;
    }
    case 'convertResource': {
      const gain = action.chosenResource;
      if (!gain) return '獲得するリソースを選んでください';
      payResources(p, ability.cost);
      p.resources[gain] += ability.gain;
      log(state, state.active, `${def.name}: リソースを変換した。`);
      break;
    }
    case 'damage': {
      if (!action.target) return '対象を指定してください';
      const legal = legalTargets(state, state.active, ability.target, false);
      if (!legal.some((l) => sameTarget(l, action.target!))) return '対象が不正です';
      payResources(p, ability.cost);
      const ctx: EffectContext = {
        state,
        controller: state.active,
        sourceDefId: def.id,
        targets: [action.target],
        targetCursor: { i: 0 },
        isSpell: false, // 施設の起動能力はスペルではない（魔法耐性を貫通する）
      };
      resolveEffect(ctx, { kind: 'damage', amount: ability.amount, target: ability.target });
      break;
    }
  }

  facility.activatedThisTurn += 1;
  cleanupDestroyed(state);
  checkWinCondition(state);
  return undefined;
}

// ---------------------------------------------------------------------------
// エンドフェイズ
// ---------------------------------------------------------------------------

function doEndTurn(state: GameState): string | undefined {
  if (state.phase !== 'main') return 'いまはメインフェイズではありません';
  finishTurnOrDiscard(state);
  return undefined;
}

/** 手札が上限を超えていれば捨て札待ちへ、そうでなければ次のターンへ */
function finishTurnOrDiscard(state: GameState): void {
  const p = state.players[state.active];
  if (p.hand.length > RULES.HAND_LIMIT) {
    state.phase = 'discard';
    state.priority = p.id;
    return;
  }
  endTurn(state);
}

function doDiscard(state: GameState, uids: string[]): string | undefined {
  if (state.phase !== 'discard') return 'いまは捨て札フェイズではありません';
  const p = state.players[state.active];
  const need = p.hand.length - RULES.HAND_LIMIT;
  if (uids.length !== need) return `ちょうど${need}枚捨ててください`;
  if (new Set(uids).size !== uids.length) return '同じカードを重複指定しています';
  for (const uid of uids) {
    if (!discardFromHand(state, p.id, uid)) return '手札にないカードが含まれています';
  }
  log(state, p.id, `手札上限のため${need}枚捨てた。`);
  endTurn(state);
  return undefined;
}

function endTurn(state: GameState): void {
  // このターン限りの強化を全て解除（リソースは持ち越し）
  for (const p of state.players) {
    for (const u of p.units) u.tempAttack = 0;
  }
  cleanupDestroyed(state);
  checkWinCondition(state);
  if (state.winner !== null) return;

  if (state.turn >= RULES.TURN_LIMIT) {
    // 安全弁: 拠点HPが多い側の勝ち
    const [a, b] = state.players;
    if (a.baseHp === b.baseHp) {
      declareWin(state, state.active, 'ターン上限到達（同HPのため手番側の勝利）');
    } else {
      declareWin(state, a.baseHp > b.baseHp ? 0 : 1, 'ターン上限到達（拠点HP優位）');
    }
    return;
  }

  state.active = opponentOf(state.active);
  beginTurn(state);
}

// ---------------------------------------------------------------------------
// 補助: 現在プレイ可能なカードの判定（UI・AI共用）
// ---------------------------------------------------------------------------

export interface PlayableInfo {
  uid: string;
  defId: string;
  costOption: number;
  cost: Resources;
}

/** いまメインフェイズでプレイできる手札の一覧 */
export function playableCards(state: GameState, playerId: PlayerId): PlayableInfo[] {
  const p = state.players[playerId];
  const out: PlayableInfo[] = [];
  for (const card of p.hand) {
    const def = getCard(card.defId);
    if (def.type === 'unit' && p.units.length >= RULES.MAX_UNITS) continue;
    if (def.type === 'facility' && p.facilities.length >= RULES.MAX_FACILITIES) continue;
    // 打ち消しは能動的にプレイしても意味がないので、メインフェイズの候補から外す
    if (def.keywords.includes('counter')) continue;
    const options = costOptions(def);
    for (let i = 0; i < options.length; i++) {
      if (!canPay(p.resources, options[i])) continue;
      // 対象が必要なのに対象が存在しないカードは打てない
      const needsTarget = (def.effects ?? []).filter(requiresTarget);
      const hasAllTargets = needsTarget.every(
        (e) => legalTargets(state, playerId, targetSpecOf(e), def.type === 'spell').length > 0,
      );
      if (!hasAllTargets) continue;
      out.push({ uid: card.uid, defId: card.defId, costOption: i, cost: options[i] });
    }
  }
  return out;
}

export { nextUid };
