/**
 * TRINIA - カードファクトリー
 *
 * data/cards_master.json を読み込んで CardDef の索引を作り、
 * 盤面インスタンス（CardInstance / UnitInstance / FacilityInstance）を生成する。
 */
import master from '../../data/cards_master.json';
import type {
  CardDef,
  CardInstance,
  CardsMaster,
  FacilityInstance,
  PlayerId,
  UnitInstance,
} from '../core/types';

const MASTER = master as unknown as CardsMaster;

export const CARDS_MASTER: CardsMaster = MASTER;
export const ALL_CARDS: CardDef[] = MASTER.cards;

const BY_ID = new Map<string, CardDef>(ALL_CARDS.map((c) => [c.id, c]));
const BY_NO = new Map<number, CardDef>(ALL_CARDS.map((c) => [c.no, c]));

export function getCard(defId: string): CardDef {
  const def = BY_ID.get(defId);
  if (!def) throw new Error(`未知のカードID: ${defId}`);
  return def;
}

export function getCardByNo(no: number): CardDef {
  const def = BY_NO.get(no);
  if (!def) throw new Error(`未知のカード番号: ${no}`);
  return def;
}

export function tryGetCard(defId: string): CardDef | undefined {
  return BY_ID.get(defId);
}

/** uid は GameState.uidCounter から採番するので、生成は常に state 経由で行う */
export function makeCardInstance(uid: string, defId: string, owner: PlayerId): CardInstance {
  getCard(defId); // 存在検証
  return { uid, defId, owner };
}

export function makeUnitInstance(uid: string, defId: string, owner: PlayerId): UnitInstance {
  const def = getCard(defId);
  if (def.type !== 'unit') throw new Error(`${def.name} はユニットではありません`);
  return {
    uid,
    defId,
    owner,
    attack: def.attack ?? 0,
    hp: def.hp ?? 1,
    maxHp: def.hp ?? 1,
    tempAttack: 0,
    hasAttacked: false,
    regenerateLeft: def.keywords.includes('regenerate') ? (def.regenerateUses ?? 1) : 0,
  };
}

export function makeFacilityInstance(uid: string, defId: string, owner: PlayerId): FacilityInstance {
  const def = getCard(defId);
  if (def.type !== 'facility') throw new Error(`${def.name} は施設ではありません`);
  return {
    uid,
    defId,
    owner,
    hp: def.hp ?? 1,
    maxHp: def.hp ?? 1,
    activatedThisTurn: 0,
    counters: 0,
  };
}

/** マスターデータの整合性チェック（テストから呼ぶ） */
export function validateMaster(): string[] {
  const errors: string[] = [];
  const seenNo = new Set<number>();
  const seenId = new Set<string>();
  for (const c of ALL_CARDS) {
    if (seenId.has(c.id)) errors.push(`IDが重複: ${c.id}`);
    if (seenNo.has(c.no)) errors.push(`No.が重複: ${c.no}`);
    seenId.add(c.id);
    seenNo.add(c.no);
    if (c.type !== 'spell' && (c.hp ?? 0) <= 0) errors.push(`${c.name}: HPが未設定`);
    if (c.type === 'unit' && c.attack === undefined) errors.push(`${c.name}: 攻撃力が未設定`);
    if (c.type === 'spell' && !c.effects?.length) errors.push(`${c.name}: スペルに効果がありません`);
    if (!c.image_path) errors.push(`${c.name}: image_pathが未設定`);
    if (!c.icon) errors.push(`${c.name}: iconが未設定`);
  }
  return errors;
}
