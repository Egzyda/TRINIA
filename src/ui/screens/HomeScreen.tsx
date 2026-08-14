/**
 * ホーム画面（仕様書 3.1）
 * ソロプレイ / 対戦プレイ / デッキ編集 / チュートリアル
 */
import { BookOpen, Bot, Layers, Users } from 'lucide-react';
import bgHome from '../../../img/bg_home.jpg';

export type Screen = 'home' | 'solo' | 'battle' | 'room' | 'deck' | 'tutorial';

interface Props {
  onNavigate: (screen: Screen) => void;
}

const MENU: Array<{ screen: Screen; title: string; desc: string; icon: React.ReactNode }> = [
  {
    screen: 'solo',
    title: 'ソロプレイ',
    desc: 'AIと対戦する（Easy / Normal / Hard）',
    icon: <Bot size={20} color="#5aa9ff" />,
  },
  {
    screen: 'room',
    title: '対戦プレイ',
    desc: '4桁のルーム番号でフレンドと対戦',
    icon: <Users size={20} color="#3fd68a" />,
  },
  {
    screen: 'deck',
    title: 'デッキ編集',
    desc: '20枚のデッキを構築（最大3スロット）',
    icon: <Layers size={20} color="#e8b53a" />,
  },
  {
    screen: 'tutorial',
    title: 'チュートリアル',
    desc: '基本ルールの案内',
    icon: <BookOpen size={20} color="#b07be0" />,
  },
];

export function HomeScreen({ onNavigate }: Props) {
  return (
    <div className="screen home-screen">
      {/* 背景イラスト。読みやすさのため上から暗いグラデーションを重ねる */}
      <div className="home-bg" style={{ backgroundImage: `url(${bgHome})` }} aria-hidden="true" />
      <div className="home-bg-veil" aria-hidden="true" />
      <div className="screen-scroll">
        <div className="home">
          <div className="home-title">
            <div className="logo">TRINIA</div>
            <div className="sub">TRINITY OF FUND / MANA / AETHER</div>
          </div>

          {MENU.map((item) => (
            <button key={item.screen} className="menu-card" onClick={() => onNavigate(item.screen)}>
              <span className="mc-icon">{item.icon}</span>
              <span className="mc-body">
                <span className="mc-title">{item.title}</span>
                <br />
                <span className="mc-desc">{item.desc}</span>
              </span>
            </button>
          ))}

          <div style={{ marginTop: 'auto', paddingTop: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              カードイラストのフォールバックに Game-icons.net (CC BY 3.0) 、
              <br />
              UIアイコンに Lucide (ISC) を使用しています。
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
