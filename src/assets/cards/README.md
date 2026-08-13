# カードイラストの差し替え

このディレクトリに `data/cards_master.json` の `image_path` と同じ
ファイル名で画像を置くと、自動的にそのカードのイラストとして使われます。

```
src/assets/cards/fund_light_attacker.png
src/assets/cards/mana_flame_bolt.png
...
```

置かれていないカードは Game-icons.net のSVGアイコンにフォールバックします
（仕様書 3.3）。1枚ずつ差し替えられるので、全部揃うまで待つ必要はありません。

対応拡張子: `.png` / `.webp` / `.jpg` / `.svg`

ビルド時に実在するファイルだけを解決しているため、
未配置のカードで404リクエストが飛ぶことはありません。
