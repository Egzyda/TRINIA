/**
 * プレイヤー名の永続化。
 *
 * 対局中の表示名（ステータスバー・対局ログ・勝敗理由）に使う。
 * 以前はデッキ名をそのまま表示名にしていたため、
 * 勝敗表示が「『デッキ名』の拠点HPが0になった」と読みづらかった。
 *
 * デッキスロットと同様、オンライン化したときに保存先だけ差し替えられるよう
 * 読み書きの入口をここに閉じている。
 */
const STORAGE_KEY = 'trinia.player.v1';

export const DEFAULT_PLAYER_NAME = 'あなた';
export const MAX_PLAYER_NAME = 12;

/** 前後の空白を落とし、長すぎる名前は切り詰める。空なら既定値に戻す */
export function normalizePlayerName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_PLAYER_NAME);
  return trimmed.length > 0 ? trimmed : DEFAULT_PLAYER_NAME;
}

export function loadPlayerName(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizePlayerName(raw) : DEFAULT_PLAYER_NAME;
  } catch {
    return DEFAULT_PLAYER_NAME;
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, normalizePlayerName(name));
  } catch {
    // プライベートブラウジング等で保存できない場合は黙って諦める
  }
}
