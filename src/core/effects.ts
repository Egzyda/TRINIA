/**
 * TRINIA - 効果解決
 *
 * cards_master.json に宣言的に書かれた CardEffect を実際の盤面変化に落とす。
 * 「効果の内容はデータ、解決の仕方はコード」という分離により、
 * バランス調整をJSONの数値変更だけで完結させる。
 */
import { getCard } from '../cards/cardFactory';
import {
  cleanupDestroyed,
  damageBase,
  damageFacility,
  damageUnit,
  destroyFacility,
  drawCard,
  findFacility,
  findUnit,
  log,
  opponentOf,
  summonUnit,
} from './gameState';
import { nextInt } from './rng';
import type {
  CardDef,
  CardEffect,
  GameState,
  PlayerId,
  PlayerState,
  ResourceKind,
  TargetRef,
  TargetSpec,
  UnitInstance,
} from './types';

export interface EffectContext {
  state: GameState;
  controller: PlayerId;
  sourceDefId: string;
  /** effect の並び順に対応した対象。対象不要の効果は消費しない */
  targets: TargetRef[];
  targetCursor: { i: number };
  /** 錬金術・次元の壺で選んだ獲得リソース */
  chosenResource?: ResourceKind;
  /** 実際に支払ったリソース種別 */
  paidResource?: ResourceKind;
  /** スペルによる効果か（【魔法耐性】判定に使う） */
  isSpell: boolean;
}

/**
 * そのカードをプレイしたときに解決される効果。
 * スペルは effects、ユニット・施設は onSummon（召喚時誘発）を使う。
 * 対象指定の検証・UIの対象選択・AIの候補列挙が全部これを見る。
 */
export function entryEffects(def: CardDef): CardEffect[] {
  return def.type === 'spell' ? (def.effects ?? []) : (def.onSummon ?? []);
}

/** 効果が要求する対象種別を取り出す（対象を取らない効果は 'none'） */
export function targetSpecOf(effect: CardEffect): TargetSpec {
  if ('target' in effect && effect.target !== 'opponent') return effect.target;
  return 'none';
}

/** この効果はプレイ時に対象指定を要求するか */
export function requiresTarget(effect: CardEffect): boolean {
  switch (effect.kind) {
    case 'damage':
      return !effect.auto && effect.target !== 'enemyBase' && effect.target !== 'selfBase';
    case 'freeze':
    case 'destroyFacility':
      return true;
    default:
      return false;
  }
}

/**
 * 指定された対象種別に対して、いま合法な対象の一覧を返す。
 * UIの選択肢生成とAIの候補列挙の両方がこれを使う。
 */
export function legalTargets(
  state: GameState,
  controller: PlayerId,
  spec: TargetSpec,
  isSpell: boolean,
): TargetRef[] {
  const me = state.players[controller];
  const foe = state.players[opponentOf(controller)];
  const targetable = (u: UnitInstance) =>
    // 【魔法耐性】: 相手のスペルの対象にならない
    !(isSpell && getCard(u.defId).keywords.includes('magicImmune'));

  switch (spec) {
    case 'anyEnemy':
      return [
        ...foe.units.filter(targetable).map((u) => ({ kind: 'unit', uid: u.uid }) as TargetRef),
        ...foe.facilities.map((f) => ({ kind: 'facility', uid: f.uid }) as TargetRef),
        { kind: 'base', player: foe.id } as TargetRef,
      ];
    case 'enemyUnit':
      return foe.units.filter(targetable).map((u) => ({ kind: 'unit', uid: u.uid }) as TargetRef);
    case 'enemyFacility':
      return foe.facilities.map((f) => ({ kind: 'facility', uid: f.uid }) as TargetRef);
    case 'enemyBase':
      return [{ kind: 'base', player: foe.id }];
    case 'friendlyUnit':
      return me.units.map((u) => ({ kind: 'unit', uid: u.uid }) as TargetRef);
    case 'selfBase':
      return [{ kind: 'base', player: me.id }];
    case 'enemyUnits':
    case 'none':
    default:
      return [];
  }
}

function takeTarget(ctx: EffectContext): TargetRef | undefined {
  const t = ctx.targets[ctx.targetCursor.i];
  ctx.targetCursor.i += 1;
  return t;
}

/** 追撃の魔導士など「自動発動・対象は指定できない」効果向けに、敵ユニットを1体ランダムに選ぶ */
function randomUnitRef(state: GameState, foe: PlayerState): TargetRef | undefined {
  if (foe.units.length === 0) return undefined;
  const picked = nextInt(state.rngState, foe.units.length);
  state.rngState = picked.state;
  return { kind: 'unit', uid: foe.units[picked.value].uid };
}

/** 単一の効果を解決する */
export function resolveEffect(ctx: EffectContext, effect: CardEffect): void {
  const { state, controller } = ctx;
  const me = state.players[controller];
  const foeId = opponentOf(controller);
  const foe = state.players[foeId];
  const sourceName = getCard(ctx.sourceDefId).name;

  switch (effect.kind) {
    case 'damage': {
      const ref =
        effect.target === 'enemyBase'
          ? ({ kind: 'base', player: foeId } as TargetRef)
          : effect.target === 'selfBase'
            ? ({ kind: 'base', player: controller } as TargetRef)
            : effect.auto && effect.target === 'enemyUnit'
              ? randomUnitRef(state, foe)
              : takeTarget(ctx);
      applyDamage(ctx, ref, effect.amount, sourceName);
      break;
    }

    case 'damageAll': {
      const victims = effect.target === 'enemyUnits' ? foe.units.slice() : me.units.slice();
      for (const unit of victims) {
        const dealt = damageUnit(state, unit, effect.amount, { isSpell: ctx.isSpell });
        if (dealt > 0) {
          log(state, controller, `${sourceName} が ${getCard(unit.defId).name} に${dealt}ダメージ。`);
        }
      }
      break;
    }

    case 'freeze': {
      const ref = takeTarget(ctx);
      if (ref?.kind !== 'unit') break;
      const found = findUnit(state, ref.uid);
      if (!found) break;
      // 対象指定は legalTargets で検証済み（【魔法耐性】はここに来ない）
      // 「そのコントローラーの次のターン終了時まで」= 次の相手ターンいっぱい
      found.unit.frozenUntilTurn = state.turn + 1;
      log(state, controller, `${getCard(found.unit.defId).name} を凍結した。`);
      break;
    }

    case 'draw': {
      for (let i = 0; i < effect.amount; i++) drawCard(state, controller);
      log(state, controller, `${sourceName} でカードを${effect.amount}枚引いた。`);
      break;
    }

    case 'heal': {
      const target = effect.target === 'selfBase' ? me : foe;
      const before = target.baseHp;
      target.baseHp = Math.min(target.maxBaseHp, target.baseHp + effect.amount);
      log(state, controller, `${sourceName} で拠点HPを${target.baseHp - before}回復した。`);
      break;
    }

    case 'destroyFacility': {
      const ref = takeTarget(ctx);
      if (ref?.kind !== 'facility') break;
      const found = findFacility(state, ref.uid);
      if (!found) break;
      log(state, controller, `${sourceName} で ${getCard(found.facility.defId).name} を破壊した。`);
      destroyFacility(state, found.facility);
      break;
    }

    case 'summonFromDeck': {
      if (me.units.length >= state.rules.MAX_UNITS) {
        log(state, controller, `${sourceName}: 前衛が満杯のため召喚できなかった。`);
        break;
      }
      const idx = me.deck.findIndex((c) => {
        const d = getCard(c.defId);
        const total = d.cost.fund + d.cost.mana + d.cost.aether;
        return d.faction === effect.faction && d.type === effect.cardType && total <= effect.maxCostTotal;
      });
      if (idx < 0) {
        log(state, controller, `${sourceName}: 条件に合うユニットが山札になかった。`);
        break;
      }
      const [card] = me.deck.splice(idx, 1);
      summonUnit(state, controller, card.defId);
      log(state, controller, `${sourceName} で ${getCard(card.defId).name} を山札から直接召喚した。`);
      break;
    }

    case 'buffFriendlyUnits': {
      for (const unit of me.units) unit.tempAttack += effect.attack;
      log(state, controller, `${sourceName}: 自軍前衛全体の攻撃力が+${effect.attack}（このターン中）。`);
      break;
    }

    case 'gainResource': {
      const gain = ctx.chosenResource;
      if (!gain) break;
      if (effect.excludePaid && gain === ctx.paidResource) break;
      me.resources[gain] += effect.amount;
      log(state, controller, `${sourceName}: リソースを${effect.amount}得た。`);
      break;
    }

    case 'skipMainPhase': {
      foe.skipMainPhases += effect.turns;
      log(state, controller, `${sourceName}: 相手の次のメインフェイズをスキップさせた。`);
      break;
    }

    case 'counterSpell':
      // スタック解決側で処理する（resolveStack を参照）
      break;
  }

  cleanupDestroyed(state);
}

/** 対象参照に対してダメージを飛ばす共通処理 */
export function applyDamage(
  ctx: EffectContext,
  ref: TargetRef | undefined,
  amount: number,
  sourceName: string,
): number {
  const { state, controller } = ctx;
  if (!ref) return 0;
  const opts = { isSpell: ctx.isSpell };

  if (ref.kind === 'base') {
    const dealt = damageBase(state, ref.player, amount, opts);
    if (dealt > 0) {
      log(state, controller, `${sourceName} が ${state.players[ref.player].name} の拠点に${dealt}ダメージ。`);
    }
    return dealt;
  }
  if (ref.kind === 'unit') {
    const found = findUnit(state, ref.uid);
    if (!found) return 0;
    const dealt = damageUnit(state, found.unit, amount, opts);
    if (dealt > 0) {
      log(state, controller, `${sourceName} が ${getCard(found.unit.defId).name} に${dealt}ダメージ。`);
    }
    return dealt;
  }
  if (ref.kind === 'facility') {
    const found = findFacility(state, ref.uid);
    if (!found) return 0;
    const dealt = damageFacility(state, found.facility, amount, opts);
    if (dealt > 0) {
      log(state, controller, `${sourceName} が ${getCard(found.facility.defId).name} に${dealt}ダメージ。`);
    }
    return dealt;
  }
  return 0;
}
