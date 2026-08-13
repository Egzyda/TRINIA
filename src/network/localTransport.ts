/**
 * 同一ブラウザ内で対戦を成立させるモック実装。
 *
 * BroadcastChannel を使うので「同じ端末で2タブ開く」だけで
 * 4桁ルームマッチのフローを最後まで通しで確認できる。
 * 本番のFirebase / Workers 実装を入れる前に、
 * 画面側のロジック（席の割り当て・行動の同期・切断）を詰めるためのもの。
 */
import {
  generateRoomCode,
  isValidRoomCode,
  type NetMessage,
  type RoomCode,
  type RoomInfo,
  type Transport,
  type TransportEvents,
} from './transport';
import { seedFromString } from '../core/rng';
import type { GameAction, PlayerId } from '../core/types';

const CHANNEL_PREFIX = 'trinia-room-';

export class LocalTransport implements Transport {
  private channel: BroadcastChannel | null = null;
  private events: TransportEvents | null = null;
  private info: RoomInfo | null = null;
  private seq = 0;

  async createRoom(name: string, deck: string[], events: TransportEvents): Promise<RoomInfo> {
    const code = generateRoomCode();
    return this.open(code, 0, name, deck, events);
  }

  async joinRoom(
    code: RoomCode,
    name: string,
    deck: string[],
    events: TransportEvents,
  ): Promise<RoomInfo> {
    if (!isValidRoomCode(code)) throw new Error('ルーム番号は4桁の数字です');
    return this.open(code, 1, name, deck, events);
  }

  private async open(
    code: RoomCode,
    seat: PlayerId,
    name: string,
    deck: string[],
    events: TransportEvents,
  ): Promise<RoomInfo> {
    this.events = events;
    this.channel = new BroadcastChannel(CHANNEL_PREFIX + code);
    // 同じコードなら両者が同じ卓（同じ初期手札）になる
    this.info = { code, seat, seed: seedFromString(code), opponentReady: false };

    this.channel.onmessage = (e: MessageEvent<NetMessage>) => {
      const msg = e.data;
      if (!this.info || !this.events) return;
      if ('seat' in msg && msg.seat === this.info.seat) return; // 自分の送信は無視

      if (msg.type === 'join') {
        this.info = {
          ...this.info,
          opponentReady: true,
          opponentDeck: msg.deck,
          opponentName: msg.name,
        };
        this.events.onRoomUpdate(this.info);
        // 後から入ってきた相手にも自分の情報を返す
        this.post({ type: 'join', seat: this.info.seat, name, deck });
        return;
      }
      if (msg.type === 'leave') {
        this.info = { ...this.info, opponentReady: false };
        this.events.onRoomUpdate(this.info);
        this.events.onError('相手が退出しました');
        return;
      }
      this.events.onMessage(msg);
    };

    this.post({ type: 'join', seat, name, deck });
    return this.info;
  }

  async send(action: GameAction): Promise<void> {
    if (!this.info) throw new Error('ルームに接続していません');
    this.seq += 1;
    this.post({ type: 'action', seat: this.info.seat, seq: this.seq, action });
  }

  async leave(): Promise<void> {
    if (this.info) this.post({ type: 'leave', seat: this.info.seat });
    this.channel?.close();
    this.channel = null;
    this.info = null;
    this.events = null;
  }

  private post(msg: NetMessage): void {
    this.channel?.postMessage(msg);
  }
}
