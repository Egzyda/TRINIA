/**
 * ホーム画面（仕様書 3.1）
 * ソロプレイ / 対戦プレイ / デッキ編集 / チュートリアル
 */
import { useState } from 'react';
import { BookOpen, Bot, Check, Layers, Pencil, Users } from 'lucide-react';
import bgHome from '../../../img/bg_home.jpg';
import { MAX_PLAYER_NAME, normalizePlayerName } from '../playerStorage';

export type Screen = 'home' | 'solo' | 'battle' | 'room' | 'deck' | 'tutorial';

interface Props {
  onNavigate: (screen: Screen) => void;
  playerName: string;
  onChangePlayerName: (name: string) => void;
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

export function HomeScreen({ onNavigate, playerName, onChangePlayerName }: Props) {
  // null のあいだは編集していない。文字列を入れるとリネームシートが開く
  const [editing, setEditing] = useState<string | null>(null);

  const commit = () => {
    if (editing !== null) onChangePlayerName(normalizePlayerName(editing));
    setEditing(null);
  };

  return (
    <div className="screen home-screen">
      {/* 背景イラスト。読みやすさのため上から暗いグラデーションを重ねる */}
      <div className="home-bg" style={{ backgroundImage: `url(${bgHome})` }} aria-hidden="true" />
      <div className="home-bg-veil" aria-hidden="true" />
      {/* スクロールさせず、1画面に収まるレイアウトにする */}
      <div className="home">
        <div className="home-title">
          <div className="logo">TRINIA</div>
          <div className="sub">TRINITY OF FUND / MANA / AETHER</div>
        </div>

        {/* 対局中の表示名。勝敗理由やログにこの名前が出る */}
        <button className="player-row" onClick={() => setEditing(playerName)}>
          <span className="player-label">プレイヤー名</span>
          <span className="player-value">{playerName}</span>
          <Pencil size={13} />
        </button>

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

        <div className="home-credit">
          Game-icons.net (CC BY 3.0) / Lucide (ISC)
        </div>
      </div>

      {editing !== null && (
        <div className="sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title" style={{ marginBottom: 10 }}>
              プレイヤー名を変更
            </div>
            <input
              className="rename-input"
              value={editing}
              autoFocus
              maxLength={MAX_PLAYER_NAME}
              onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
              }}
            />
            <div className="prompt-actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setEditing(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={commit}>
                <Check size={15} /> 決定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
