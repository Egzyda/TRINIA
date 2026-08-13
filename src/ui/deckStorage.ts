/**
 * デッキスロットの永続化（仕様書 3.1: 最大3スロット保存）
 *
 * オンライン化したときは Firestore / Workers KV へ同じ形で載せ替えられるよう、
 * 読み書きの入口をここに閉じている。
 */
import { DECK_PRESETS } from '../cards/decks';
import { validateDeck } from '../core/rules';
import { tryGetCard } from '../cards/cardFactory';

export interface DeckSlot {
  id: string;
  name: string;
  cards: string[];
}

export const MAX_SLOTS = 3;
const STORAGE_KEY = 'trinia.decks.v1';

function defaultSlots(): DeckSlot[] {
  return DECK_PRESETS.slice(0, MAX_SLOTS).map((preset, i) => ({
    id: `slot${i + 1}`,
    name: preset.name,
    cards: [...preset.cards],
  }));
}

export function loadSlots(): DeckSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSlots();
    const parsed = JSON.parse(raw) as DeckSlot[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultSlots();
    // マスターデータからカードが消えている場合に備えて未知IDを落とす
    return parsed.slice(0, MAX_SLOTS).map((slot, i) => ({
      id: slot.id ?? `slot${i + 1}`,
      name: typeof slot.name === 'string' ? slot.name : `デッキ${i + 1}`,
      cards: Array.isArray(slot.cards) ? slot.cards.filter((id) => tryGetCard(id)) : [],
    }));
  } catch {
    return defaultSlots();
  }
}

export function saveSlots(slots: DeckSlot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // プライベートブラウジング等で保存できない場合は黙って諦める（対局自体は続行できる）
  }
}

export function slotStatus(slot: DeckSlot): { ok: boolean; message: string } {
  const result = validateDeck(slot.cards);
  return { ok: result.ok, message: result.error ?? '構築OK' };
}
