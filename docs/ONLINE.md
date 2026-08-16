# オンライン対戦を有効にするために必要なもの

現状、4桁ルームマッチは**画面と通信インターフェースだけ**が実装済みで、
実際の通信は繋がっていない。ここでは何を用意すれば繋がるかを整理する。

## 設計方針: 盤面ではなく「行動」を送る

`src/network/transport.ts` の `Transport` インターフェースは、
盤面（GameState）ではなく行動（GameAction）だけを送る前提で設計してある。

これができるのは、ルールエンジンが**決定論的**だから:

- シャッフルもランダム判定も `GameState.rngState` からしか乱数を引かない
- `applyAction()` は状態を複製して返す純粋関数

したがって「同じシード + 同じ行動列 → 必ず同じ盤面」が保証される。利点:

- 通信量が小さい（1手あたり数十バイト）
- チートを検出できる（サーバで同じコードを流して結果を突き合わせる）
- リプレイがシード + 行動列だけで保存できる

4桁ルーム番号からシードを作っている（`seedFromString`）ので、
両者は同じ番号を知っているだけで同じ卓に着ける。

## 選択肢A: Cloudflare Workers + Durable Objects（推奨）

すでに Cloudflare Pages に載せる前提なので、同じアカウントで完結する。

**必要なもの**

1. Cloudflare の有料プラン（Durable Objects は Workers Paid $5/月 が必要）
2. Worker の作成と `wrangler.toml` へのバインディング追加
3. `src/network/workersTransport.ts` の実装（`Transport` を実装するだけ）

**サーバ側の役割**
Durable Object を「1ルーム＝1インスタンス」として使う。
4桁コードを `idFromName(code)` に渡せば、同じコードの2人が同じ部屋に入る。
やることは WebSocket の中継と、席（0/1）の割り当てだけ。

```
クライアントA ──WebSocket──┐
                          ├─ Durable Object (room-1234) ─ 行動を相手へ中継
クライアントB ──WebSocket──┘
```

**判定をサーバでやりたい場合**
`src/core` は DOM に依存していないので Worker 上でそのまま動く。
`applyAction()` を Worker 側でも回して盤面を突き合わせれば、
仕様書 4.1 の「Cloud Functions によるサーバルール処理」と同じ検証ができる。

## 選択肢B: Firebase（仕様書どおりの構成）

仕様書 4.1 の構成。Cloudflare Pages でホストしつつ Firebase を使うことも問題なくできる。

**必要なもの**

1. Firebase プロジェクトの作成
2. Authentication で**匿名ログイン**を有効化
3. Realtime Database の作成（リージョンは asia-southeast1 などが近い）
4. `npm i firebase` と、以下の設定値（Firebase コンソール → プロジェクトの設定）

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_APP_ID=
```

これらは `.env.local` に置き、Cloudflare Pages 側にも
「設定 → 環境変数」で同じものを登録する。
（`VITE_` 接頭辞の値はビルド時にバンドルへ埋め込まれる＝公開される。
Firebase の Web APIキーは公開前提のものなので問題ないが、
**アクセス制御は必ずセキュリティルールで行うこと**。）

5. `src/network/firebaseTransport.ts` の実装
6. Realtime Database のセキュリティルール

**データ構造の例**

```
rooms/
  1234/
    createdAt: 1723526400000
    seats/
      0: { uid, name, deck: [...] }
      1: { uid, name, deck: [...] }
    actions/
      0: { seat: 0, seq: 1, action: {...} }
      1: { seat: 1, seq: 2, action: {...} }
```

**セキュリティルールの最低限**

- 匿名認証済みユニットのみ読み書き可
- 自分の席の行動しか書き込めない
- 既存の行動は上書きできない（追記のみ）
- 一定時間経過したルームは掃除する（Cloud Functions のスケジュール実行など）

## いま動かせること

`src/network/localTransport.ts` は BroadcastChannel を使ったモック。
**同じ端末で2つのタブを開けば**、席の割り当てから行動の同期まで
一連の流れをそのまま確認できる。通信基盤を入れる前の画面側の作り込みに使える。

## 実装時に踏みそうな点

- 行動には `seq`（連番）を振ってあるので、順序が入れ替わったら適用を待たせる。
- 切断時は最後に適用済みの `seq` を伝えて差分だけ再送すれば復帰できる。
