import type { RuleSet } from './rules';

/**
 * TRINIA - コア型定義
 *
 * このファイルは DOM / React に一切依存しない純粋な型定義のみを持つ。
 * ルールエンジンをブラウザ・Node(シミュレータ)・Cloudflare Workers の
 * どこでも同じコードで動かすための土台。
 */

// ---------------------------------------------------------------------------
// リソース
// ---------------------------------------------------------------------------

/** 3大リソース。資金(fund) / 魔力(mana) / エーテル(aether) */
export type ResourceKind = 'fund' | 'mana' | 'aether';

export const RESOURCE_KINDS: readonly ResourceKind[] = ['fund', 'mana', 'aether'] as const;

export interface Resources {
  fund: number;
  mana: number;
  aether: number;
}

export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  fund: '資金',
  mana: '魔力',
  aether: 'エーテル',
};

/** 各属性のテーマカラー（仕様書 3.3: 資金=黄 / 魔力=青 / エーテル=緑） */
export const FACTION_COLOR: Record<Faction, string> = {
  fund: '#e8b53a',
  mana: '#4a8ff0',
  aether: '#3fbf7f',
  hybrid: '#b07be0',
};

// ---------------------------------------------------------------------------
// カード定義（マスターデータ）
// ---------------------------------------------------------------------------

export type CardType = 'unit' | 'facility' | 'spell';
export type Faction = 'fund' | 'mana' | 'aether' | 'hybrid';

export type Keyword =
  /** 挑発: 相手はこのユニットを優先攻撃しなければならない */
  | 'taunt'
  /** すり抜け: 敵前衛を無視して拠点・施設を攻撃できる */
  | 'evasive'
  /** 攻城: 施設への攻撃ダメージ2倍 */
  | 'siege'
  /** 魔法耐性: 相手スペルの対象にならず、スペルダメージを受けない */
  | 'magicImmune'
  /** 再生: 破壊時にHP1で復活（回数制限あり） */
  | 'regenerate'
  /** 貫通: ユニット撃破時の超過ダメージが敵拠点に貫通 */
  | 'trample'
  /** カウンター: 相手ターンの応答ウィンドウで発動できる */
  | 'counter'
  /** 薙ぎ払い: ユニットを対象に攻撃したとき、それ以外の敵前衛全員にも同じダメージ（反撃は本来の対象からのみ） */
  | 'cleave';

/** 効果対象の指定方法 */
export type TargetSpec =
  | 'anyEnemy' // 敵ユニット / 敵施設 / 敵拠点
  | 'enemyUnit'
  | 'enemyUnits' // 全体
  | 'enemyFacility'
  | 'enemyBase'
  | 'friendlyUnit'
  | 'selfBase'
  | 'none';

export type CardEffect =
  | { kind: 'damage'; amount: number; target: TargetSpec; auto?: boolean }
  | { kind: 'damageAll'; amount: number; target: TargetSpec }
  | { kind: 'freeze'; target: TargetSpec }
  | { kind: 'counterSpell' }
  | { kind: 'draw'; amount: number }
  | { kind: 'heal'; amount: number; target: TargetSpec }
  | { kind: 'destroyFacility'; target: TargetSpec }
  | { kind: 'summonFromDeck'; faction: Faction; maxCostTotal: number; cardType: CardType }
  | { kind: 'buffFriendlyUnits'; attack: number; duration: 'turn' }
  | { kind: 'gainResource'; amount: number; excludePaid?: boolean }
  | { kind: 'skipMainPhase'; turns: number; target: 'opponent' };

export type CardPassive =
  | { kind: 'upkeepResource'; resource: ResourceKind; amount: number }
  | { kind: 'damageReduction'; amount: number; stacks: boolean; scope: 'base' | 'all' }
  | { kind: 'countdownWin'; turns: number };

export type CardActivated =
  | {
      kind: 'buffUnitPermanent';
      cost: Resources;
      attack: number;
      hp?: number;
      target: TargetSpec;
      perTurn: number;
    }
  | { kind: 'convertResource'; cost: Resources; gain: number; perTurn: number }
  | { kind: 'damage'; cost: Resources; amount: number; target: TargetSpec; perTurn: number };

export interface CardTrigger {
  on: 'selfSpellCast';
  effect: CardEffect;
}

/** cards_master.json の 1 エントリ */
export interface CardDef {
  id: string;
  no: number;
  name: string;
  type: CardType;
  faction: Faction;
  cost: Resources;
  /** 錬金術のような「複数の支払い方」を持つカード用 */
  altCosts?: Resources[];
  attack?: number;
  hp?: number;
  keywords: Keyword[];
  text: string;
  /** オリジナル画像への差し替え用パス。未実装時は icon にフォールバック */
  image_path: string;
  /** Game-icons.net 由来のアイコン名 (react-icons/gi) */
  icon: string;
  /** スペルの効果 */
  effects?: CardEffect[];
  /**
   * ユニット・施設が場に出たときの効果（召喚時誘発）。
   * スペルではないので【魔法耐性】を貫通する。
   */
  onSummon?: CardEffect[];
  passives?: CardPassive[];
  activated?: CardActivated;
  triggers?: CardTrigger[];
  regenerateUses?: number;
}

export interface CardsMaster {
  version: string;
  balanceRevision: number;
  cards: CardDef[];
}

// ---------------------------------------------------------------------------
// 盤面上の実体（インスタンス）
// ---------------------------------------------------------------------------

export type PlayerId = 0 | 1;

/** 手札・山札・墓地に存在するカード実体 */
export interface CardInstance {
  uid: string;
  defId: string;
  owner: PlayerId;
}

/** 前衛ゾーンのユニット実体 */
export interface UnitInstance {
  uid: string;
  defId: string;
  owner: PlayerId;
  /** 永続の攻撃力（武器庫などで恒久的に上昇する） */
  attack: number;
  hp: number;
  maxHp: number;
  /** このターン限りの攻撃力上昇（部隊長など） */
  tempAttack: number;
  /** 攻撃不可が解除されるターン番号（凍結）。undefined なら攻撃可能 */
  frozenUntilTurn?: number;
  /** このターンすでに攻撃したか（1ターン1回攻撃） */
  hasAttacked: boolean;
  /** 【再生】の残り使用回数 */
  regenerateLeft: number;
}

/** 施設ゾーンの施設実体 */
export interface FacilityInstance {
  uid: string;
  defId: string;
  owner: PlayerId;
  hp: number;
  maxHp: number;
  /** このターンすでに起動したか */
  activatedThisTurn: number;
  /** カウントダウン兵器のカウンタ */
  counters: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  baseHp: number;
  maxBaseHp: number;
  resources: Resources;
  hand: CardInstance[];
  deck: CardInstance[];
  graveyard: CardInstance[];
  units: UnitInstance[];
  facilities: FacilityInstance[];
  /** タイムストップ等で次回以降のメインフェイズをスキップする残り回数 */
  skipMainPhases: number;
  /** マリガン（引き直し）を決定済みか */
  mulliganDone: boolean;
}

// ---------------------------------------------------------------------------
// ゲーム進行
// ---------------------------------------------------------------------------

export type Phase =
  /** マリガン（初期手札の引き直し・両者同時入力） */
  | 'mulligan'
  /** 2ptの分配待ち */
  | 'allocate'
  /** メインフェイズ（プレイ・攻撃・起動が順不同） */
  | 'main'
  /** スペルへの応答（打ち消し）待ち */
  | 'respond'
  /** 手札7枚まで捨てる待ち */
  | 'discard'
  | 'gameOver';

/** スタックに積まれた解決待ちのスペル */
export interface StackItem {
  uid: string;
  defId: string;
  controller: PlayerId;
  targets: TargetRef[];
  /** 錬金術など、支払ったコストに依存する効果のための情報 */
  paidResource?: ResourceKind;
  chosenResource?: ResourceKind;
  /** 打ち消された場合 true */
  countered: boolean;
}

export type TargetRef =
  | { kind: 'unit'; uid: string }
  | { kind: 'facility'; uid: string }
  | { kind: 'base'; player: PlayerId }
  | { kind: 'none' };

export interface GameState {
  /** この対局に適用されるルールセット（対局モードで変わる） */
  rules: RuleSet;
  phase: Phase;
  /** 手番プレイヤー */
  active: PlayerId;
  /** 応答フェイズで入力を求められているプレイヤー */
  priority: PlayerId;
  /** 1から始まる通算ターン数（両者の手番を個別にカウント） */
  turn: number;
  players: [PlayerState, PlayerState];
  stack: StackItem[];
  /** コイントスで決まった先攻。マリガン完了前は null */
  firstPlayer: PlayerId | null;
  /** 乱数シード状態 */
  rngState: number;
  winner: PlayerId | null;
  winReason: string | null;
  log: LogEntry[];
  /** メインフェイズがスキップされた事による自動終了待ちフラグ */
  mainSkipped: boolean;
  /** 応答フェイズ前のフェイズ（応答終了後に戻る） */
  resumePhase: Phase | null;
  uidCounter: number;
}

export interface LogEntry {
  turn: number;
  player: PlayerId | null;
  text: string;
  /** UI側の演出振り分け用（例: 攻撃は専用エフェクトがあるのでトースト表示を省く） */
  kind?: 'attack';
}

// ---------------------------------------------------------------------------
// アクション（プレイヤー入力）
// ---------------------------------------------------------------------------

export type GameAction =
  /** マリガン: 引き直したい初期手札を指定する（0枚でもよい） */
  | { type: 'mulligan'; player: PlayerId; uids: string[] }
  /** 2pt分配: 各リソースへのチャージ量とドロー枚数（合計が付与pt） */
  | { type: 'allocate'; fund: number; mana: number; aether: number; draw: number }
  /** カードのプレイ */
  | {
      type: 'playCard';
      uid: string;
      targets?: TargetRef[];
      /** 錬金術の支払いリソース選択 */
      costOption?: number;
      /** 錬金術・次元の壺で獲得するリソース */
      chosenResource?: ResourceKind;
    }
  /** ユニットによる攻撃 */
  | { type: 'attack'; attackerUid: string; target: TargetRef }
  /** 施設の起動スキル */
  | {
      type: 'activate';
      facilityUid: string;
      target?: TargetRef;
      chosenResource?: ResourceKind;
    }
  /** 応答フェイズでの打ち消し発動 */
  | { type: 'respond'; uid: string }
  /** 応答フェイズでのパス */
  | { type: 'pass' }
  /** ターン終了宣言 */
  | { type: 'endTurn' }
  /** 手札上限処理のための捨て札 */
  | { type: 'discard'; uids: string[] };

/** ルール上ありえない入力を弾いた結果 */
export interface ActionResult {
  ok: boolean;
  error?: string;
  state: GameState;
}
