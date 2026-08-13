/**
 * TRINIA - カード基底ロジック
 *
 * CardDef（不変のマスターデータ）に対する問い合わせ用ヘルパー群。
 * インスタンス生成は cardFactory.ts が担当する。
 */
import type { CardDef, Keyword, Resources, ResourceKind } from '../core/types';
import { RESOURCE_KINDS } from '../core/types';

export const ZERO_COST: Resources = { fund: 0, mana: 0, aether: 0 };

export function makeResources(partial: Partial<Resources> = {}): Resources {
  return { fund: partial.fund ?? 0, mana: partial.mana ?? 0, aether: partial.aether ?? 0 };
}

export function addResources(a: Resources, b: Resources): Resources {
  return { fund: a.fund + b.fund, mana: a.mana + b.mana, aether: a.aether + b.aether };
}

export function subResources(a: Resources, b: Resources): Resources {
  return { fund: a.fund - b.fund, mana: a.mana - b.mana, aether: a.aether - b.aether };
}

/** pool が cost をすべて賄えるか */
export function canPay(pool: Resources, cost: Resources): boolean {
  return pool.fund >= cost.fund && pool.mana >= cost.mana && pool.aether >= cost.aether;
}

/** コストの総量（軽重の目安・AI評価に使う） */
export function totalCost(cost: Resources): number {
  return cost.fund + cost.mana + cost.aether;
}

/** そのカードが取りうる支払い方の一覧（通常は1通り、錬金術のみ2通り） */
export function costOptions(def: CardDef): Resources[] {
  return def.altCosts && def.altCosts.length > 0 ? def.altCosts : [def.cost];
}

export function hasKeyword(def: CardDef, kw: Keyword): boolean {
  return def.keywords.includes(kw);
}

/** cost の中で実際に支払われたリソース種別（錬金術の「別のリソース」判定に使う） */
export function paidResourceOf(cost: Resources): ResourceKind | undefined {
  return RESOURCE_KINDS.find((k) => cost[k] > 0);
}

/** UI表示用のコスト文字列 例: "資3+魔3+エ3" */
export function formatCost(cost: Resources): string {
  const parts: string[] = [];
  if (cost.fund) parts.push(`資${cost.fund}`);
  if (cost.mana) parts.push(`魔${cost.mana}`);
  if (cost.aether) parts.push(`エ${cost.aether}`);
  return parts.length ? parts.join('+') : '0';
}
