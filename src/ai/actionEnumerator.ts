/**
 * TRINIA - 合法手の列挙
 *
 * AI が「いま取りうる行動」を全部並べるための機能。
 * UI 側のヒント表示（プレイ可能なカードの光らせ方）にも流用できる。
 */
import { getCard } from '../cards/cardFactory';
import { costOptions, paidResourceOf } from '../cards/baseCard';
import { legalAttackTargets, playableCards } from '../core/mainPhaseEngine';
import { canAttack } from '../core/mainPhaseEngine';
import { entryEffects, legalTargets, requiresTarget, targetSpecOf } from '../core/effects';
import { RESOURCE_KINDS } from '../core/types';
import type { GameAction, GameState, PlayerId, ResourceKind, TargetRef } from '../core/types';

/** 対象を要求する効果が複数ある場合の対象組み合わせを列挙する（上限つき） */
function targetCombinations(
  state: GameState,
  playerId: PlayerId,
  specs: ReturnType<typeof targetSpecOf>[],
  isSpell: boolean,
  limit = 24,
): TargetRef[][] {
  let combos: TargetRef[][] = [[]];
  for (const spec of specs) {
    const options = legalTargets(state, playerId, spec, isSpell);
    if (options.length === 0) return [];
    const next: TargetRef[][] = [];
    for (const c of combos) {
      for (const o of options) {
        next.push([...c, o]);
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    combos = next;
  }
  return combos;
}

/** メインフェイズで取りうる行動をすべて列挙する（endTurn は含まない） */
export function enumerateMainActions(state: GameState, playerId: PlayerId): GameAction[] {
  const actions: GameAction[] = [];
  const p = state.players[playerId];

  // --- カードをプレイする ---
  for (const playable of playableCards(state, playerId)) {
    const def = getCard(playable.defId);
    const needsTargets = entryEffects(def).filter(requiresTarget).map(targetSpecOf);
    const combos = needsTargets.length
      ? targetCombinations(state, playerId, needsTargets, def.type === 'spell')
      : [[]];

    // 錬金術のように獲得リソースを選ぶカード
    const needsChoice = entryEffects(def).some((e) => e.kind === 'gainResource');
    const paid = paidResourceOf(costOptions(def)[playable.costOption]);
    const choices: (ResourceKind | undefined)[] = needsChoice
      ? RESOURCE_KINDS.filter((r) => r !== paid)
      : [undefined];

    for (const targets of combos) {
      for (const chosenResource of choices) {
        actions.push({
          type: 'playCard',
          uid: playable.uid,
          costOption: playable.costOption,
          targets,
          chosenResource,
        });
      }
    }
  }

  // --- 施設の起動スキル ---
  for (const facility of p.facilities) {
    const def = getCard(facility.defId);
    const ability = def.activated;
    if (!ability) continue;
    if (facility.activatedThisTurn >= ability.perTurn) continue;
    const cost = ability.cost;
    if (p.resources.fund < cost.fund || p.resources.mana < cost.mana || p.resources.aether < cost.aether) {
      continue;
    }
    if (ability.kind === 'convertResource') {
      const paid = paidResourceOf(cost);
      for (const r of RESOURCE_KINDS) {
        if (r === paid) continue;
        actions.push({ type: 'activate', facilityUid: facility.uid, chosenResource: r });
      }
    } else {
      for (const target of legalTargets(state, playerId, ability.target, false)) {
        actions.push({ type: 'activate', facilityUid: facility.uid, target });
      }
    }
  }

  // --- 攻撃 ---
  for (const unit of p.units) {
    if (!canAttack(state, unit)) continue;
    for (const target of legalAttackTargets(state, unit)) {
      actions.push({ type: 'attack', attackerUid: unit.uid, target });
    }
  }

  return actions;
}

/** 分配フェイズの全パターン（合計がちょうど2ptになる組み合わせ） */
export function enumerateAllocations(freePoints: number, drawCost: number): GameAction[] {
  const out: GameAction[] = [];
  for (let fund = 0; fund <= freePoints; fund++) {
    for (let mana = 0; mana + fund <= freePoints; mana++) {
      for (let aether = 0; aether + mana + fund <= freePoints; aether++) {
        const rest = freePoints - fund - mana - aether;
        if (rest % drawCost !== 0) continue;
        out.push({ type: 'allocate', fund, mana, aether, draw: rest / drawCost });
      }
    }
  }
  return out;
}
