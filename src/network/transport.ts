/**
 * TRINIA - 対戦通信の抽象化（仕様書 4.1）
 *
 * 盤面そのものを送らず「行動(GameAction)」だけを送り、
 * 両者が同じルールエンジンで同じ順に適用する（決定論的ロックステップ）。
 * GameState は seed から完全に再現できるので、
 *   - 通信量が小さい
 *   - サーバ側で同じコードを流して結果を検証できる
 * という利点がある。GameState.rngState を共有シードで初期化しているのはこのため。
 *
 * 実装は差し替え可能:
 *   - LocalTransport      : 同一端末デバッグ用（実装済み）
 *   - FirebaseTransport   : 仕様書どおり RTDB を使う場合
 *   - WorkersTransport    : Cloudflare Durable Objects + WebSocket を使う場合
 * いずれも docs/ONLINE.md に必要な準備を記載している。
 */
import type { GameAction, PlayerId } from '../core/types';

/** 4桁ルーム番号 */
export type RoomCode = string;

export interface RoomInfo {
  code: RoomCode;
  /** 自分の席 */
  seat: PlayerId;
  /** 卓の乱数シード（両者で一致させる） */
  seed: number;
  /** 相手が着席済みか */
  opponentReady: boolean;
  /** 相手のデッキ（着席後に確定） */
  opponentDeck?: string[];
  opponentName?: string;
}

/** 送受信されるメッセージ */
export type NetMessage =
  | { type: 'join'; seat: PlayerId; name: string; deck: string[] }
  | { type: 'start'; seed: number }
  /** 行動。seq は適用順を保証するための連番 */
  | { type: 'action'; seat: PlayerId; seq: number; action: GameAction }
  | { type: 'leave'; seat: PlayerId };

export interface TransportEvents {
  onMessage: (msg: NetMessage) => void;
  onRoomUpdate: (info: RoomInfo) => void;
  onError: (message: string) => void;
}

export interface Transport {
  /** ルームを作成し、割り当てられた4桁コードを返す */
  createRoom(name: string, deck: string[], events: TransportEvents): Promise<RoomInfo>;
  /** 既存のルームに参加する */
  joinRoom(code: RoomCode, name: string, deck: string[], events: TransportEvents): Promise<RoomInfo>;
  /** 行動を相手へ送る */
  send(action: GameAction): Promise<void>;
  /** 退出 */
  leave(): Promise<void>;
}

/** 4桁のルーム番号を生成する（0000〜9999） */
export function generateRoomCode(random: () => number = Math.random): RoomCode {
  return String(Math.floor(random() * 10000)).padStart(4, '0');
}

export function isValidRoomCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}
