/**
 * 4桁ルームマッチ画面（仕様書 3.1 / 4.1）
 *
 * 現状の通信実装は同一ブラウザ内の BroadcastChannel モック。
 * 実際にインターネット越しで対戦するには通信基盤の用意が必要で、
 * 何が必要かは docs/ONLINE.md に整理してある。
 */
import { useState } from 'react';
import { ChevronLeft, Delete, DoorOpen, Plus } from 'lucide-react';
import { generateRoomCode, isValidRoomCode } from '../../network/transport';

interface Props {
  onBack: () => void;
}

export function RoomScreen({ onBack }: Props) {
  const [code, setCode] = useState('');
  const [created, setCreated] = useState<string | null>(null);

  const push = (d: string) => setCode((c) => (c.length >= 4 ? c : c + d));
  const pop = () => setCode((c) => c.slice(0, -1));

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="戻る">
          <ChevronLeft size={18} />
        </button>
        <h1>対戦プレイ</h1>
      </div>

      <div className="screen-scroll">
        <div className="room">
          <div className="notice info">
            通信対戦は未接続です。ルーム番号の発行と入室フローのみ動作します。
            実際にオンラインで繋ぐために必要なもの（Firebase もしくは Cloudflare Workers の設定）は
            docs/ONLINE.md にまとめてあります。
          </div>

          <div>
            <div className="prompt-title">ルームを作成する</div>
            <button
              className="btn btn-block"
              onClick={() => setCreated(generateRoomCode())}
            >
              <Plus size={16} /> 新しいルーム番号を発行
            </button>
            {created && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <div className="room-code">
                  {created.split('').map((d, i) => (
                    <div className="room-digit filled" key={i}>
                      {d}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                  この番号を相手に伝えてください
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="prompt-title">ルームに参加する</div>
            <div className="room-code">
              {[0, 1, 2, 3].map((i) => (
                <div className={`room-digit ${code[i] ? 'filled' : ''}`} key={i}>
                  {code[i] ?? ''}
                </div>
              ))}
            </div>
          </div>

          <div className="keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button key={d} onClick={() => push(d)}>
                {d}
              </button>
            ))}
            <button onClick={pop} aria-label="削除">
              <Delete size={18} />
            </button>
            <button onClick={() => push('0')}>0</button>
            <button
              className="btn-primary"
              style={{ background: 'var(--accent)', color: '#04101f' }}
              disabled={!isValidRoomCode(code)}
              aria-label="入室"
            >
              <DoorOpen size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
