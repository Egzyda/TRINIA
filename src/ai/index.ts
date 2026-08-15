/**
 * TRINIA - AI対戦ロジック（仕様書 4.2）
 *
 *  EASY   : ランダム性の高いプレイ。リソース分配は資金一律優先。
 *  NORMAL : 盤面の脅威を優先除去し、コストに合わせた最適なカードプレイ（1手貪欲）。
 *  HARD   : 評価関数でターン全体のプランを複数生成し、相手の最善応手まで読んで選ぶ。
 *
 * どの難易度も「GameState を渡すと GameAction を1つ返す」だけの関数として実装する。
 * ソロプレイ画面もバランスシミュレータも同じ関数を叩く。
 */
import { getCard } from '../cards/cardFactory';
import { applyAction, playableCards } from '../core/mainPhaseEngine';
import { nextInt } from '../core/rng';
import { enumerateAllocations, enumerateMainActions } from './actionEnumerator';
import { evaluate } from './evaluate';
import { RESOURCE_KINDS } from '../core/types';
import type { GameAction, GameState, PlayerId, ResourceKind } from '../core/types';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'EASY',
  normal: 'NORMAL',
  hard: 'HARD',
};

export const DIFFICULTY_DESCRIPTION: Record<Difficulty, string> = {
  easy: 'ランダム性の高いプレイ。リソースは資金優先。',
  normal: '盤面の脅威を優先除去し、コストに合わせて最適に動く。',
  hard: 'ターン全体を組み立て、相手の返しまで読んでから動く。',
};

/** AI が乱数と思考キャッシュを持ち回るための可変コンテキスト */
export interface AiContext {
  difficulty: Difficulty;
  rngState: number;
  /** HARD がターン単位で立てたプラン（同一ターン中は使い回す） */
  plan?: GameAction[];
  planKey?: string;
}

export function makeAi(difficulty: Difficulty, seed: number): AiContext {
  return { difficulty, rngState: seed };
}

function rand(ctx: AiContext, max: number): number {
  const d = nextInt(ctx.rngState, max);
  ctx.rngState = d.state;
  return d.value;
}

function pick<T>(ctx: AiContext, items: T[]): T {
  return items[rand(ctx, items.length)];
}

function other(p: PlayerId): PlayerId {
  return (p === 0 ? 1 : 0) as PlayerId;
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

/**
 * 現在のフェイズに応じて AI の次の一手を返す。
 * 手番でない・入力を求められていない場合は null。
 */
export function decideAction(state: GameState, me: PlayerId, ctx: AiContext): GameAction | null {
  switch (state.phase) {
    case 'auction':
      return state.players[me].bid >= 0
        ? null
        : { type: 'bid', player: me, amount: decideBid(state, me, ctx) };
    case 'allocate':
      return state.active === me ? decideAllocation(state, me, ctx) : null;
    case 'main':
      return state.active === me ? decideMainAction(state, me, ctx) : null;
    case 'respond':
      return state.priority === me ? decideResponse(state, me, ctx) : null;
    case 'discard':
      return state.active === me ? decideDiscard(state, me, ctx) : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// オークション
// ---------------------------------------------------------------------------

/**
 * 先攻の価値はデッキの速度に比例する。
 * 平均コストが軽いデッキほど「1ターン早く殴れる」価値が高いので高く積む。
 */
export function decideBid(state: GameState, me: PlayerId, ctx: AiContext): number {
  const p = state.players[me];
  const all = [...p.hand, ...p.deck];
  const avgCost =
    all.reduce((sum, c) => {
      const cost = getCard(c.defId).cost;
      return sum + cost.fund + cost.mana + cost.aether;
    }, 0) / Math.max(1, all.length);

  if (ctx.difficulty === 'easy') return rand(ctx, Math.floor(state.rules.MAX_BID / 2) + 1);

  // 前衛を並べて殴るデッキほど先攻の価値が高い。
  // 実測した均衡落札額は速攻寄りで上限付近、受け寄りで数点だった（tools/auction.ts）。
  const units = all.filter((c) => getCard(c.defId).type === 'unit').length;
  const unitRatio = units / Math.max(1, all.length);
  const speed = Math.max(0, Math.min(1, unitRatio * 1.6 + (3.2 - avgCost) * 0.25));

  const base = Math.round(state.rules.MAX_BID * (0.15 + speed * 0.7));
  const spread = ctx.difficulty === 'hard' ? 3 : 7;
  const jitter = rand(ctx, spread * 2 + 1) - spread;
  return Math.max(0, Math.min(state.rules.MAX_BID, base + jitter));
}

// ---------------------------------------------------------------------------
// 分配フェイズ
// ---------------------------------------------------------------------------

export function decideAllocation(state: GameState, me: PlayerId, ctx: AiContext): GameAction {
  if (ctx.difficulty === 'easy') return easyAllocation(state, me);

  const options = enumerateAllocations(state.rules.FREE_POINTS, state.rules.DRAW_COST);

  // 一次スクリーニング: 「その分配で何枚プレイできるようになるか」で粗く絞る
  const screened = options
    .map((option) => {
      const applied = applyAction(state, option);
      if (!applied.ok) return null;
      return { option, next: applied.state, quick: quickAllocationScore(applied.state, me, option) };
    })
    .filter((x): x is { option: GameAction; next: GameState; quick: number } => x !== null)
    .sort((a, b) => b.quick - a.quick);

  if (screened.length === 0) {
    return { type: 'allocate', fund: state.rules.FREE_POINTS, mana: 0, aether: 0, draw: 0 };
  }

  // 上位だけをターン最後まで回して本評価する
  const depth = ctx.difficulty === 'hard' ? 5 : 3;
  let best = screened[0].option;
  let bestScore = -Infinity;
  for (const cand of screened.slice(0, depth)) {
    const folded = playGreedyTurn(cand.next, me);
    const score = evaluate(folded, me) + allocationBias(state, cand.option);
    if (score > bestScore) {
      bestScore = score;
      best = cand.option;
    }
  }
  return best;
}

/**
 * EASY: 資金優先を基本にしつつ、手札が資金以外中心のデッキでも
 * 詰まないよう最低限の必要色だけは見る（先読みはしない素朴な実装）。
 *
 * 「資金一律優先」（仕様書 4.2）を文字どおり実装すると、
 * 魔力・エーテル中心のデッキと当たったときに手札が一切支払えないまま、
 * 何ターンも資金だけ貯め続けて「相手が何もしてこない」状態になってしまう
 * バグがあった。手札全体で最も不足している色に振るだけの最小限の調整で回避する。
 */
function easyAllocation(state: GameState, me: PlayerId): GameAction {
  const p = state.players[me];
  const deficit: Record<ResourceKind, number> = { fund: 0, mana: 0, aether: 0 };
  for (const card of p.hand) {
    const def = getCard(card.defId);
    deficit.fund += Math.max(0, def.cost.fund - p.resources.fund);
    deficit.mana += Math.max(0, def.cost.mana - p.resources.mana);
    deficit.aether += Math.max(0, def.cost.aether - p.resources.aether);
  }
  // 同点なら資金を優先する（仕様書どおりの既定挙動）
  let best: ResourceKind = 'fund';
  for (const k of RESOURCE_KINDS) if (deficit[k] > deficit[best]) best = k;

  const alloc: Record<ResourceKind, number> = { fund: 0, mana: 0, aether: 0 };
  alloc[best] = state.rules.FREE_POINTS;
  return { type: 'allocate', ...alloc, draw: 0 };
}

/**
 * 分配直後の「プレイできる手札の枚数と重さ」を粗く測る。
 *
 * 即座に打てるカードが増えない分配同士でも優劣がつくよう、
 * 手札全体の不足リソース量（＝あと何pt貯めれば打てるか）も見る。
 * これがないと、何も打てないターンに使い道のない色へ延々と積んでしまう。
 */
function quickAllocationScore(state: GameState, me: PlayerId, option: GameAction): number {
  const seen = new Set<string>();
  let value = 0;
  for (const p of playableCards(state, me)) {
    if (seen.has(p.uid)) continue;
    seen.add(p.uid);
    value += 1 + (p.cost.fund + p.cost.mana + p.cost.aether) * 0.4;
  }
  return value - handDeficit(state, me) * 0.25 + allocationBias(state, option);
}

/** 手札のカードを打つために、あと何ptのリソースが足りないかの合計 */
function handDeficit(state: GameState, me: PlayerId): number {
  const p = state.players[me];
  let total = 0;
  for (const card of p.hand) {
    const def = getCard(card.defId);
    total +=
      Math.max(0, def.cost.fund - p.resources.fund) +
      Math.max(0, def.cost.mana - p.resources.mana) +
      Math.max(0, def.cost.aether - p.resources.aether);
  }
  return total;
}

/** 手札が薄いときはドローに寄せ、溢れそうなときは避ける */
function allocationBias(state: GameState, action: GameAction): number {
  if (action.type !== 'allocate') return 0;
  const hand = state.players[state.active].hand.length;
  if (hand <= 2) return action.draw * 1.5;
  if (hand >= state.rules.HAND_LIMIT) return -action.draw * 2.0;
  return 0;
}

// ---------------------------------------------------------------------------
// メインフェイズ
// ---------------------------------------------------------------------------

interface ScoredAction {
  action: GameAction;
  score: number;
}

/**
 * 評価関数だけでは拾いきれない意図を補正する。
 *  - 拠点を殴る攻撃は「相手HP-n」でしか効かないので少し押す
 *  - リソースを腐らせるよりカードを使い切るほうが良い
 */
function tempoBonus(action: GameAction): number {
  if (action.type === 'attack' && action.target.kind === 'base') return 0.6;
  if (action.type === 'playCard') return 0.3;
  return 0;
}

/** 1手だけ進めたときに最も評価値が上がる行動を返す（改善しないなら null＝ターンを畳む） */
function bestGreedyStep(state: GameState, me: PlayerId): ScoredAction | null {
  const baseline = evaluate(state, me);
  let best: ScoredAction | null = null;

  for (const action of enumerateMainActions(state, me)) {
    const applied = applyAction(state, action);
    if (!applied.ok) continue;
    const score = evaluate(applied.state, me) + tempoBonus(action);
    if (!best || score > best.score) best = { action, score };
  }

  if (!best) return null;
  if (best.score < baseline - 0.001) return null;
  if (best.score <= baseline && best.action.type !== 'attack') return null;
  return best;
}

/** 探索中に割り込んだ応答フェイズを機械的に処理する */
function resolveInterrupts(state: GameState): GameState | null {
  if (state.phase !== 'respond') return null;
  const applied = applyAction(state, { type: 'pass' });
  return applied.ok ? applied.state : null;
}

/**
 * 指定プレイヤーのターンを貪欲に最後まで進める（探索用の簡易ロールアウト）。
 * ターンが相手に渡るか対局が終わったところで止まる。
 */
function playGreedyTurn(state: GameState, player: PlayerId, maxSteps = 60): GameState {
  let cur = state;
  for (let i = 0; i < maxSteps; i++) {
    if (cur.winner !== null) break;

    const interrupted = resolveInterrupts(cur);
    if (interrupted) {
      cur = interrupted;
      continue;
    }
    if (cur.active !== player) break;

    if (cur.phase === 'allocate') {
      const applied = applyAction(cur, greedyAllocation(cur, player));
      if (!applied.ok) break;
      cur = applied.state;
      continue;
    }
    if (cur.phase === 'main') {
      const step = bestGreedyStep(cur, player);
      const applied = applyAction(cur, step ? step.action : { type: 'endTurn' });
      if (!applied.ok) break;
      cur = applied.state;
      continue;
    }
    if (cur.phase === 'discard') {
      const applied = applyAction(cur, simpleDiscard(cur, player));
      if (!applied.ok) break;
      cur = applied.state;
      continue;
    }
    break;
  }
  return cur;
}

/** ロールアウト内で使う軽量な分配（本探索は decideAllocation が担当） */
function greedyAllocation(state: GameState, me: PlayerId): GameAction {
  const options = enumerateAllocations(state.rules.FREE_POINTS, state.rules.DRAW_COST);
  let best = options[0];
  let bestScore = -Infinity;
  for (const option of options) {
    const applied = applyAction(state, option);
    if (!applied.ok) continue;
    const score = quickAllocationScore(applied.state, me, option);
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}

export function decideMainAction(state: GameState, me: PlayerId, ctx: AiContext): GameAction {
  if (ctx.difficulty === 'easy') return decideMainEasy(state, me, ctx);
  if (ctx.difficulty === 'normal') {
    const step = bestGreedyStep(state, me);
    return step ? step.action : { type: 'endTurn' };
  }
  return decideMainHard(state, me, ctx);
}

/**
 * HARD: ターン単位のプランニング。
 *
 * 「初手を変えた複数のプラン」を作り、それぞれについて
 * 自分のターンを畳んだあと相手に1ターン最善で返させ、その結果で選ぶ。
 * 1ターンにつき1回だけ思考すればよいので、1手ごとに深読みするより速く強い。
 */
function decideMainHard(state: GameState, me: PlayerId, ctx: AiContext): GameAction {
  const key = `${state.turn}:${me}`;

  if (ctx.planKey === key && ctx.plan && ctx.plan.length > 0) {
    const next = ctx.plan[0];
    if (applyAction(state, next).ok) {
      ctx.plan.shift();
      return next;
    }
    ctx.plan = undefined; // 盤面がずれたら作り直す
  }

  const plans = buildCandidatePlans(state, me);
  let bestPlan: GameAction[] = [];
  let bestScore = -Infinity;

  for (const plan of plans) {
    const end = applyPlan(state, plan);
    if (end.winner === me) {
      bestPlan = plan;
      break;
    }
    const afterFold = playGreedyTurn(end, me);
    if (afterFold.winner === me) {
      bestPlan = plan;
      break;
    }
    const score = evaluate(afterFold, me) * 0.6 + opponentReplyScore(afterFold, me) * 0.4;
    if (score > bestScore) {
      bestScore = score;
      bestPlan = plan;
    }
  }

  ctx.plan = bestPlan.slice();
  ctx.planKey = key;
  if (ctx.plan.length === 0) return { type: 'endTurn' };
  return ctx.plan.shift()!;
}

/** 初手を上位候補それぞれに固定した貪欲プランを作る */
function buildCandidatePlans(state: GameState, me: PlayerId, width = 4): GameAction[][] {
  const firsts = enumerateMainActions(state, me)
    .map((action) => {
      const applied = applyAction(state, action);
      return applied.ok ? { action, score: evaluate(applied.state, me) + tempoBonus(action) } : null;
    })
    .filter((x): x is ScoredAction => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, width);

  const plans: GameAction[][] = [greedyPlan(state, me)];
  for (const first of firsts) {
    const applied = applyAction(state, first.action);
    if (!applied.ok) continue;
    plans.push([first.action, ...greedyPlan(applied.state, me)]);
  }
  return plans;
}

/** 貪欲に選び続けたときの行動列（メインフェイズ内のみ） */
function greedyPlan(state: GameState, me: PlayerId, maxSteps = 20): GameAction[] {
  const actions: GameAction[] = [];
  let cur = state;
  for (let i = 0; i < maxSteps; i++) {
    if (cur.winner !== null) break;
    const interrupted = resolveInterrupts(cur);
    if (interrupted) {
      cur = interrupted;
      continue;
    }
    if (cur.phase !== 'main' || cur.active !== me) break;
    const step = bestGreedyStep(cur, me);
    if (!step) break;
    const applied = applyAction(cur, step.action);
    if (!applied.ok) break;
    actions.push(step.action);
    cur = applied.state;
  }
  return actions;
}

function applyPlan(state: GameState, plan: GameAction[]): GameState {
  let cur = state;
  for (const action of plan) {
    const interrupted = resolveInterrupts(cur);
    if (interrupted) cur = interrupted;
    const applied = applyAction(cur, action);
    if (!applied.ok) break;
    cur = applied.state;
  }
  return cur;
}

/** 相手に1ターン最善で返させたときの、自分視点の評価値 */
function opponentReplyScore(state: GameState, me: PlayerId): number {
  if (state.winner !== null) return evaluate(state, me);
  const foe = other(me);
  if (state.active !== foe) return evaluate(state, me);
  return evaluate(playGreedyTurn(state, foe), me);
}

function decideMainEasy(state: GameState, me: PlayerId, ctx: AiContext): GameAction {
  const candidates = enumerateMainActions(state, me);
  if (candidates.length === 0) return { type: 'endTurn' };
  // 攻撃だけは必ず行う（放置すると殴り合いにすらならないため）
  const attacks = candidates.filter((a) => a.type === 'attack');
  if (attacks.length > 0) return pick(ctx, attacks);
  // 3回に1回はターンを畳む雑さを持たせる
  if (rand(ctx, 3) === 0) return { type: 'endTurn' };
  return pick(ctx, candidates);
}

// ---------------------------------------------------------------------------
// 応答フェイズ（打ち消し）
// ---------------------------------------------------------------------------

export function decideResponse(state: GameState, me: PlayerId, ctx: AiContext): GameAction {
  const top = state.stack[state.stack.length - 1];
  if (!top) return { type: 'pass' };

  const p = state.players[me];
  const counter = p.hand.find((c) => {
    const def = getCard(c.defId);
    return (
      def.keywords.includes('counter') &&
      p.resources.fund >= def.cost.fund &&
      p.resources.mana >= def.cost.mana &&
      p.resources.aether >= def.cost.aether
    );
  });
  if (!counter) return { type: 'pass' };

  if (ctx.difficulty === 'easy') {
    return rand(ctx, 2) === 0 ? { type: 'respond', uid: counter.uid } : { type: 'pass' };
  }

  // 「通した場合」と「打ち消した場合」を実際に解決して比べる
  const passed = applyAction(state, { type: 'pass' });
  const countered = applyAction(state, { type: 'respond', uid: counter.uid });
  if (!passed.ok) return { type: 'respond', uid: counter.uid };
  if (!countered.ok) return { type: 'pass' };

  const passScore = evaluate(passed.state, me);
  // 打ち消しはカード1枚+魔力3の損なので、その分の閾値を設ける
  const counterScore = evaluate(countered.state, me) - 2.0;
  return counterScore > passScore ? { type: 'respond', uid: counter.uid } : { type: 'pass' };
}

// ---------------------------------------------------------------------------
// 捨て札
// ---------------------------------------------------------------------------

export function decideDiscard(state: GameState, me: PlayerId, ctx: AiContext): GameAction {
  const p = state.players[me];
  const need = p.hand.length - state.rules.HAND_LIMIT;
  if (need <= 0) return { type: 'discard', uids: [] };
  if (ctx.difficulty === 'easy') {
    return { type: 'discard', uids: p.hand.slice(0, need).map((c) => c.uid) };
  }
  return simpleDiscard(state, me);
}

/** 手持ちリソースから最も遠い（＝当分打てない）カードから捨てる */
function simpleDiscard(state: GameState, me: PlayerId): GameAction {
  const p = state.players[me];
  const need = Math.max(0, p.hand.length - state.rules.HAND_LIMIT);
  const scored = p.hand.map((card) => {
    const def = getCard(card.defId);
    const deficit =
      Math.max(0, def.cost.fund - p.resources.fund) +
      Math.max(0, def.cost.mana - p.resources.mana) +
      Math.max(0, def.cost.aether - p.resources.aether);
    const colors = [def.cost.fund, def.cost.mana, def.cost.aether].filter((v) => v > 0).length;
    return { uid: card.uid, waste: deficit * 2 + colors };
  });
  scored.sort((a, b) => b.waste - a.waste);
  return { type: 'discard', uids: scored.slice(0, need).map((s) => s.uid) };
}
