/** 1試合の進行ログを覗くデバッグ用スクリプト */
import { playMatch } from '../src/ai/autoplay';
import { getCard } from '../src/cards/cardFactory';

const [deckA = 'aggro_fund', deckB = 'ramp_aether', seedArg = '999'] = process.argv.slice(2);
const r = playMatch({ deckA, deckB, aiA: 'normal', aiB: 'normal', seed: Number(seedArg) });

console.log(r.state.log.map((l) => `T${l.turn} ${l.text}`).join('\n'));
console.log('\n=== 結果 ===');
console.log('勝者:', r.winner, r.reason, '| ターン:', r.turns, '| HP:', r.finalHp, '| 先攻:', r.first);
for (const p of r.state.players) {
  console.log(
    `${p.name}: 場=${p.units.map((u) => getCard(u.defId).name).join(',')} ` +
      `施設=${p.facilities.map((f) => getCard(f.defId).name).join(',')} ` +
      `res=${JSON.stringify(p.resources)} 手札=${p.hand.length}`,
  );
}
