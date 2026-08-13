/**
 * カードのイラスト表示。
 *
 * 仕様書 3.3 に従い、CardDef.image_path のオリジナル画像を優先し、
 * 未配置のカードは Game-icons.net のSVGへフォールバックする。
 * 属性テーマカラー（資金=黄 / 魔力=青 / エーテル=緑）を色として与えることで、
 * 画像がなくても属性が一目で分かるようにしている。
 */
import { getCardIcon } from '../cardIcons';
import { resolveCardImage } from '../cardImages';
import { FACTION_COLOR, type CardDef } from '../../core/types';

interface Props {
  def: CardDef;
  size?: number;
  className?: string;
}

export function CardArt({ def, size = 24, className }: Props) {
  const url = resolveCardImage(def.image_path);

  if (url) {
    return (
      <img
        className={className}
        src={url}
        alt={def.name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'block' }}
      />
    );
  }

  const Icon = getCardIcon(def.icon);
  return (
    <Icon
      className={className}
      width={size}
      height={size}
      color={FACTION_COLOR[def.faction]}
      aria-label={def.name}
    />
  );
}
