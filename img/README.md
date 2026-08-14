# 画像アセット

| ファイル | 用途 |
| --- | --- |
| `bg_home.jpg` | ホーム画面の背景。CSSで暗いグラデーションを重ねて文字が読めるようにしている |
| `icon.jpg` | アプリアイコンの元画像 |
| `icon-192.jpg` / `icon-512.jpg` | PWAマニフェスト用（ホーム画面に追加したときのアイコン） |
| `apple-touch-icon.jpg` | iOS Safari でホーム画面に追加したときのアイコン |

`icon-*.jpg` と `apple-touch-icon.jpg` は `icon.jpg` から生成したもの。
元画像を差し替えたら、以下で再生成する:

```bash
npm i -D sharp
node -e "
const sharp=require('sharp');
(async()=>{
  for (const s of [192,512]) await sharp('img/icon.jpg').resize(s,s,{fit:'cover'}).jpeg({quality:88,mozjpeg:true}).toFile('img/icon-'+s+'.jpg');
  await sharp('img/icon.jpg').resize(180,180,{fit:'cover'}).jpeg({quality:88,mozjpeg:true}).toFile('img/apple-touch-icon.jpg');
})();"
```

背景画像はホーム画面いっぱいに敷くため、表示サイズに対して十分な解像度
（幅700px程度以上）があれば足りる。容量は品質74のJPEGで130KB前後に収めてある。
