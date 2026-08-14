# TRINIA

縦画面対戦型デジタルカードゲーム『TRINIA（トリニア）』のベースコード。

「資金 / 魔力 / エーテル」3リソースによるビルド選択、拠点HPのオークションによる先攻決定、
召喚酔いなしの戦闘、20枚循環デッキを核にした戦略型DCG。

- 作業ルール（Claude Code 用）: [`CLAUDE.md`](CLAUDE.md)
- 仕様書: [`docs/TRINIA_game_spec_v2_1.md`](docs/TRINIA_game_spec_v2_1.md)
- バランス調整記録: [`docs/BALANCE.md`](docs/BALANCE.md)
- オンライン対戦に必要なもの: [`docs/ONLINE.md`](docs/ONLINE.md)

## 動かす

```bash
npm install
npm run dev        # http://localhost:5173 （スマホ実機で見るなら -- --host）
```

ブラウザの開発者ツールで表示をスマートフォン（幅390px前後）にすると想定どおりの見た目になる。

```bash
npm test           # ルール・戦闘・カード効果・対局モードのテスト（70件）
npm run typecheck
npm run build      # dist/ に出力
```

## Cloudflare Pages へデプロイ

```bash
npm run deploy     # npx wrangler pages deploy dist --project-name=trinia
```

GitHub連携でPagesプロジェクトを作る場合のビルド設定:

| 項目 | 値 |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 22 |

ビルド成果物は gzip 後で約 100KB（JS 69KB + アイコン 29KB + CSS 4KB）と背景画像 135KB。

スマホのブラウザで開いて「ホーム画面に追加」すると、
`img/icon.jpg` をアイコンにしたスタンドアロンアプリとして起動する
（`public/manifest.webmanifest`）。

## バランス調整ツール

```bash
npm run sim                        # デッキ総当たり（勝率・平均ターン数・先攻勝率）
npm run sim -- --games 500         # 試合数を増やす
npm run sim -- --cards             # カード別の使用局数と勝率
npm run sim -- --ai hard           # AI難易度を変える
npm run sim -- --ai-a hard --ai normal   # AI強度の比較（先手だけ別難易度）
npm run sim -- --mode quick        # 対局モードを変える
npm run sim -- --hp 40 --fp 3 --bid 17   # ルール数値をその場で振って比較
npm run sim:auction                # 先攻権が拠点HP何点分の価値かを実測
npm run sim:auction -- --mode quick
npm run sim:inspect -- aggro_fund ramp_aether 999   # 1試合のログを表示
```

カードの数値は `data/cards_master.json`、ルールの定数は `src/core/rules.ts` に
すべて集約してある。**バランス調整でコードを書き換える必要はない。**

## 対局モード

対局開始前に選べる。ルールセットは対局ごとに `GameState.rules` として保持されるので、
モードが違う卓を同時に走らせても干渉しない。

| | スタンダード | クイック |
| --- | --- | --- |
| 拠点HP | 50 | 30 |
| 毎ターン付与pt | 2 | 3 |
| オークション上限 | 25 | 14 |
| 平均ターン数 | 約43 | 約27 |

クイックは「HPを削るだけ」ではなく「毎ターンの付与ptを増やして加速する」設計にしてある。
HPだけ削るとアグロ一強（実測75%）になり、施設を建てて戦力を整えるという
本作の骨格が機能しなくなるため。詳細は [`docs/BALANCE.md`](docs/BALANCE.md) §5。

## 構成

```
data/cards_master.json      カード全30種（効果も宣言的に定義）
src/core/                   ルールエンジン（DOM非依存・決定論的）
  types.ts                  型定義
  rules.ts                  ルール定数と対局モード（拠点HP・付与pt・競り上限など）
  rng.ts                    シード付き乱数
  gameState.ts              HP・リソース・手札・場・山札とダメージ処理
  auctionEngine.ts          先攻決定の競り
  effects.ts                カード効果の解決
  mainPhaseEngine.ts        フェイズ進行・戦闘・行動リデューサ
src/cards/                  カード生成ファクトリーとプリセットデッキ
src/ai/                     AI対戦（EASY / NORMAL / HARD）
src/network/                4桁ルームマッチの通信インターフェース
src/ui/                     React製の縦画面UI
tools/                      バランス検証スクリプト
tests/                      自動テスト
```

### 設計上の要点

**ルールエンジンは純粋関数**。`applyAction(state, action)` は状態を複製して返し、
乱数も `GameState.rngState` からしか引かない。
このため「同じシード + 同じ行動列 → 必ず同じ盤面」が成り立ち、

- AIの先読み（そのまま盤面を進めて評価できる）
- リプレイ（シードと行動列だけで再現）
- オンライン対戦（盤面ではなく行動だけを送ればよい）
- サーバ側での不正検証（同じコードを流して突き合わせる）

がすべて同じ仕組みで実現できる。`src/core` はブラウザでも Node でも
Cloudflare Workers でも動く。

**カードはデータ**。効果は `cards_master.json` に宣言的に書かれ、
`src/core/effects.ts` がそれを解決する。
新しいカードを足すときも、既存の効果種別の組み合わせで済むならJSONだけで完結する。

## 画像アセット

| 場所 | 用途 |
| --- | --- |
| `img/bg_home.jpg` | ホーム画面の背景（CSSで暗く重ねて可読性を確保） |
| `img/icon.jpg` | アプリアイコンの元画像 |
| `img/icon-192.jpg` `img/icon-512.jpg` `img/apple-touch-icon.jpg` | ホーム画面追加用（`icon.jpg` から生成） |

再生成の手順は [`img/README.md`](img/README.md)。

## グラフィック

仕様書 3.3 に従い、UIアイコンは [Lucide](https://lucide.dev/)、
カードイラストは [Game-icons.net](https://game-icons.net/)（`react-icons/gi` 経由）を使用。

オリジナルのカードイラストに差し替えるには、`src/assets/cards/` に
`cards_master.json` の `image_path` と同じファイル名で画像を置くだけでよい。
ビルド時に実在するファイルだけを解決しているので、
1枚ずつ差し替えられるし、未配置のカードで無駄なリクエストも発生しない。
詳細は [`src/assets/cards/README.md`](src/assets/cards/README.md)。

## 実装状況

| 機能 | 状態 |
| --- | --- |
| ルールエンジン（仕様書 2章すべて） | 実装済み |
| カード30種（ベース28種 + 魔力ユニット2種） | 実装済み |
| 対局モード（スタンダード / クイック） | 実装済み |
| ソロプレイ（AI 3段階） | 実装済み |
| デッキ編集（20枚 / 同名2枚 / 3スロット） | 実装済み |
| チュートリアル | 実装済み |
| 4桁ルームマッチ | 画面と通信インターフェースのみ（[`docs/ONLINE.md`](docs/ONLINE.md)） |
| カードイラスト | Game-icons.net によるフォールバック表示 |

## ライセンス表記

- UIアイコン: [Lucide](https://lucide.dev/) — ISC License
- カードイラスト（フォールバック）: [Game-icons.net](https://game-icons.net/) — CC BY 3.0
