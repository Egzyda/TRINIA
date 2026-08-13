/**
 * UI層のうち、ロジックとして検証できる部分。
 * 画面描画そのものではなく「マスターデータとUIの対応が取れているか」を見る。
 */
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../src/cards/cardFactory';
import { missingIcons } from '../src/ui/cardIcons';
import { generateRoomCode, isValidRoomCode } from '../src/network/transport';

describe('カードアイコン', () => {
  it('全28種のフォールバックアイコンが解決できる', () => {
    expect(missingIcons(ALL_CARDS.map((c) => c.icon))).toEqual([]);
  });
});

describe('ルーム番号', () => {
  it('4桁の数字を生成する', () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidRoomCode(generateRoomCode())).toBe(true);
    }
  });

  it('0埋めされた番号も有効', () => {
    expect(generateRoomCode(() => 0)).toBe('0000');
    expect(isValidRoomCode('0007')).toBe(true);
    expect(isValidRoomCode('12345')).toBe(false);
    expect(isValidRoomCode('12a4')).toBe(false);
  });
});
