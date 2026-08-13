/**
 * オリジナルのカードイラスト解決（仕様書 3.3）
 *
 * src/assets/cards/ に置かれた画像だけをビルド時に列挙する。
 * 「とりあえず image_path を <img> に入れて失敗したらアイコンに切り替える」方式だと
 * 未配置のカードぶんだけ404リクエストが飛ぶので、実在するものだけを引けるようにしている。
 */
const MODULES = import.meta.glob('../assets/cards/*.{png,webp,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const BY_BASENAME = new Map<string, string>();
for (const [path, url] of Object.entries(MODULES)) {
  const file = path.split('/').pop();
  if (!file) continue;
  BY_BASENAME.set(file.replace(/\.[^.]+$/, ''), url);
}

/** image_path に対応する実ファイルがあればそのURLを返す。なければ undefined */
export function resolveCardImage(imagePath: string): string | undefined {
  const file = imagePath.split('/').pop();
  if (!file) return undefined;
  return BY_BASENAME.get(file.replace(/\.[^.]+$/, ''));
}
