# TRINIA - Claude Code 作業ルール

このファイルは Claude Code がセッション開始時に自動で読み込む。
このリポジトリで作業するときは以下に従うこと。

## Git 運用（毎回必ず行う）

**作業が完了したら、確認を待たずに main へマージ・プッシュまで済ませること。**

ユーザーからの明示的な指示（2026-08-14）:
> 自動的にメインにマージかプッシュしてください。毎回そうするようにどこかに記載しておいてください。

毎回の手順:

1. 作業ブランチ（既定は `claude/game-base-code-k26jfr`）で実装・コミットする
2. 検証を通す（下記「完了の定義」）
3. 作業ブランチを push する
4. **`main` に取り込んで push する**

```bash
git push -u origin <branch>
git fetch origin main
git checkout main && git merge --no-ff <branch> -m "..." && git push origin main
git checkout <branch>   # 作業ブランチへ戻る
```

補足:

- PR の作成やレビュー待ちは不要。マージまで自動で進めてよい
- `main` が進んでいる場合は、マージ前に `git pull origin main` で取り込む
- 作業ブランチの PR が既にマージ済みなら、`main` から作り直してから続きを実装する
  （`git fetch origin main && git checkout -B <branch> origin/main`）
- 破壊的な操作（履歴の書き換え、force push、ファイルの大量削除）は従来どおり事前に確認する

## 完了の定義

コミット前に必ず全部通すこと。1つでも落ちていたら完了ではない。

```bash
npx tsc --noEmit     # 型チェック
npx vitest run       # テスト
npm run build        # 本番ビルド
```

UI を変更したときは、ブラウザでの実表示も確認する（`npm run preview` + Playwright）。
`/opt/pw-browsers/chromium` に Chromium が入っている。

## このプロジェクトの設計上の約束

- **ルールエンジン（`src/core`）は DOM 非依存かつ決定論的に保つ。**
  乱数は必ず `GameState.rngState` から引く。`Math.random()` を core で使わない。
  「同じシード + 同じ行動列 → 必ず同じ盤面」が、AIの先読み・リプレイ・
  オンライン同期・サーバ側検証のすべての前提になっている。
- **対局中のルール参照は `state.rules`。** グローバルの `RULES` は
  デッキ編集など「特定の対局に属さない」場面専用。
  ここを間違えると対局モードごとの値が効かなくなる。
- **カードの効果とバランス数値は `data/cards_master.json` に置く。**
  調整でコードを書き換えないで済む形を維持する。
- **バランスを変えたら実測する。** 推測で数値をいじらない。
  `npm run sim` / `npm run sim:bonus` を回し、根拠を `docs/BALANCE.md` に残す。
- 絵文字は UI に使わない。UIアイコンは Lucide、カードは Game-icons.net。

## ドキュメント

| ファイル | 内容 |
| --- | --- |
| `docs/TRINIA_game_spec_v2_1.md` | 元の仕様書 |
| `docs/BALANCE.md` | バランス変更の理由と実測データ（変更したら必ず追記） |
| `docs/ONLINE.md` | オンライン対戦に必要な準備 |
| `README.md` | 動かし方・構成・調整ツールの使い方 |
