/**
 * TRINIA - ルール定数
 *
 * 仕様書 2.1 のパラメータを一箇所に集約する。
 * バランス調整はここと data/cards_master.json のみを触れば完結する。
 *
 * 値は書き換え可能にしてある（configureRules）。
 * これはバランス検証ツールが「HP40にしたらどうなるか」を
 * コードを書き換えずに測れるようにするため。実行時のゲームは既定値で動く。
 */
export interface RuleSet {
  /** 拠点HP初期値 */
  BASE_HP: number;
  /** 初期手札枚数（引き直しなし） */
  INITIAL_HAND: number;
  /** デッキ枚数 */
  DECK_SIZE: number;
  /** 同名カードの最大採用枚数 */
  MAX_COPIES: number;
  /** ターン終了時の手札上限 */
  HAND_LIMIT: number;
  /** ターン開始時に無条件で付与されるフリーポイント */
  FREE_POINTS: number;
  /** 追加ドロー1枚あたりのポイント消費 */
  DRAW_COST: number;
  /** 前衛ゾーンの最大ユニット数 */
  MAX_UNITS: number;
  /** 施設ゾーンの最大枠数 */
  MAX_FACILITIES: number;
  /**
   * オークションで提示できるHPの上限。
   *
   * 仕様書 2.2 は「0〜10点以上」と表記していたが、実測した先攻権の価値は
   * 拠点HP 20〜22点相当だった（tools/auction.ts）。上限10では曲線の平坦部に
   * 収まってしまい「全員が上限を積んでも先攻が6割勝つ」＝競りが機能しない。
   * 上限を25に広げることで、均衡落札額が範囲の中央付近に来て競りが成立する。
   */
  MAX_BID: number;
  /** 後攻プレイヤーが得る初期リソースpt（仕様書 2.2 の同点ボーナス） */
  SECOND_PLAYER_BONUS: number;
  /**
   * 後攻ボーナスを常時付与するか。
   *
   * false（既定・仕様書どおり）: 同点時のみ付与。先攻の価値はオークションで支払わせる。
   * true: 毎回付与。MAX_BID を10のまま据え置きたい場合の代替案で、
   *       実測では先攻勝率が63%→49%まで下がり、競りをほぼ使わずに手番差が解消する。
   */
  SECOND_PLAYER_BONUS_ALWAYS: boolean;
  /** 後攻プレイヤーが追加で引く初期手札（さらに細かく調整したい場合の予備の摘み） */
  SECOND_PLAYER_BONUS_CARDS: number;
  /** 引き分け判定に使う最大ターン数（無限ループ防止の安全弁） */
  TURN_LIMIT: number;
}

export const DEFAULT_RULES: Readonly<RuleSet> = {
  BASE_HP: 50,
  INITIAL_HAND: 6,
  DECK_SIZE: 20,
  MAX_COPIES: 2,
  HAND_LIMIT: 7,
  FREE_POINTS: 2,
  DRAW_COST: 1,
  MAX_UNITS: 3,
  MAX_FACILITIES: 3,
  MAX_BID: 25,
  SECOND_PLAYER_BONUS: 1,
  SECOND_PLAYER_BONUS_ALWAYS: false,
  SECOND_PLAYER_BONUS_CARDS: 0,
  TURN_LIMIT: 200,
};

export const RULES: RuleSet = { ...DEFAULT_RULES };

/** 検証ツール用。ゲーム本体は既定値のまま動く */
export function configureRules(partial: Partial<RuleSet>): void {
  Object.assign(RULES, partial);
}

export function resetRules(): void {
  Object.assign(RULES, DEFAULT_RULES);
}

/** デッキ構築が正当かどうかを検証する */
export function validateDeck(defIds: string[]): { ok: boolean; error?: string } {
  if (defIds.length !== RULES.DECK_SIZE) {
    return {
      ok: false,
      error: `デッキは${RULES.DECK_SIZE}枚である必要があります（現在${defIds.length}枚）`,
    };
  }
  const counts = new Map<string, number>();
  for (const id of defIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    if (n > RULES.MAX_COPIES) {
      return { ok: false, error: `同名カードは${RULES.MAX_COPIES}枚までです（${id}が${n}枚）` };
    }
  }
  return { ok: true };
}
