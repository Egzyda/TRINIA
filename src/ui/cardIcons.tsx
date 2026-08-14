/**
 * カードイラストのフォールバック（仕様書 3.3）
 *
 * オリジナル画像（CardDef.image_path）が用意されるまでの代替として
 * Game-icons.net のSVGを使う。react-icons/gi はその公式SVGを
 * MITライセンスのReactコンポーネントとして同梱したもの。
 *
 * 4000点あるアイコンを名前解決で丸ごと読み込むとバンドルが肥大化するため、
 * 実際に使う28点だけを明示的にimportして表引きする。
 */
import type { ComponentType, SVGProps } from 'react';
import {
  GiAnvilImpact,
  GiBookCover,
  GiBowman,
  GiCannon,
  GiCardDraw,
  GiCatapult,
  GiCrystalCluster,
  GiEnergyShield,
  GiExplosiveMaterials,
  GiFireball,
  GiFireRing,
  GiGiant,
  GiGolemHead,
  GiGoldMine,
  GiIceCube,
  GiMagicPortal,
  GiMagicPotion,
  GiMagicShield,
  GiPowerGenerator,
  GiPrayer,
  GiRegeneration,
  GiRuneStone,
  GiScrollUnfurled,
  GiShieldBash,
  GiSwordman,
  GiSwordsPower,
  GiTimeBomb,
  GiTimeTrap,
  GiWitchFlight,
  GiWizardStaff,
} from 'react-icons/gi';

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const ICONS: Record<string, IconComponent> = {
  GiAnvilImpact,
  GiBookCover,
  GiBowman,
  GiCannon,
  GiCardDraw,
  GiCatapult,
  GiCrystalCluster,
  GiEnergyShield,
  GiExplosiveMaterials,
  GiFireball,
  GiFireRing,
  GiGiant,
  GiGolemHead,
  GiGoldMine,
  GiIceCube,
  GiMagicPortal,
  GiMagicPotion,
  GiMagicShield,
  GiPowerGenerator,
  GiPrayer,
  GiRegeneration,
  GiRuneStone,
  GiScrollUnfurled,
  GiShieldBash,
  GiSwordman,
  GiSwordsPower,
  GiTimeBomb,
  GiTimeTrap,
  GiWitchFlight,
  GiWizardStaff,
};

export function getCardIcon(name: string): IconComponent {
  return ICONS[name] ?? GiSwordman;
}

/** マスターデータのiconが全て解決できるか（テストから呼ぶ） */
export function missingIcons(names: string[]): string[] {
  return names.filter((n) => !(n in ICONS));
}
