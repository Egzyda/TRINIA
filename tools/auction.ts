/**
 * TRINIA - オークション均衡点の測定
 *
 * 「先攻を取ることは拠点HP何点分の価値があるか」を実測する。
 * 先攻側だけがHPを支払うので、
 *   支払いHP < 先攻の価値  → 先攻側の勝率が50%超
 * となる。勝率がちょうど50%になる支払いHPが、そのマッチアップにおける
 * 先攻権の理論価格＝オークションの均衡落札額。
 *
 * 使い方: npm run sim:auction   （tsx tools/auction.ts --games 300）
 */
import { createGame } from '../src/core/gameState';
import { applyAction } from '../src/core/mainPhaseEngine';
import { advanceAi } from '../src/ai/autoplay';
import { makeAi, type AiContext, type Difficulty } from '../src/ai';
import { DECK_PRESETS, getPreset } from '../src/cards/decks';
import { configureRules, RULES } from '../src/core/rules';
import type { PlayerId } from '../src/core/types';

interface Args {
  games: number;
  ai: Difficulty;
  seed: number;
  /** 後攻ボーナス(pt)を上書きして検証する */
  secondBonus?: number;
  secondCards?: number;
  /** 測定する支払いHPの上限 */
  maxHp: number;
  step: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { games: 200, ai: 'normal', seed: 31337, maxHp: 10, step: 2 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--games') args.games = Number(argv[++i]);
    else if (argv[i] === '--ai') args.ai = argv[++i] as Difficulty;
    else if (argv[i] === '--seed') args.seed = Number(argv[++i]);
    else if (argv[i] === '--second-bonus') args.secondBonus = Number(argv[++i]);
    else if (argv[i] === '--second-cards') args.secondCards = Number(argv[++i]);
    else if (argv[i] === '--max-hp') args.maxHp = Number(argv[++i]);
    else if (argv[i] === '--step') args.step = Number(argv[++i]);
  }
  return args;
}

/**
 * 先攻/後攻とHP支払い額を固定して1試合回す。
 * オークションを迂回するため、bidを直接与えて決着させている。
 */
function playFixed(
  deckA: string,
  deckB: string,
  firstPlayer: PlayerId,
  paidHp: number,
  ai: Difficulty,
  seed: number,
): PlayerId | null {
  const a = getPreset(deckA);
  const b = getPreset(deckB);
  let state = createGame({ name: 'P1', deck: a.cards }, { name: 'P2', deck: b.cards }, seed);

  // 先攻/後攻を確実に固定するため、同点にならない提示（paidHp+1 vs 1）で解決させてから、
  // 実際に検証したい支払い額になるよう拠点HPを補正する。
  // ※ MAX_BID は main() 側で測定レンジまで引き上げてある
  const second: PlayerId = firstPlayer === 0 ? 1 : 0;
  state = applyAction(state, { type: 'bid', player: firstPlayer, amount: paidHp + 1 }).state;
  state = applyAction(state, { type: 'bid', player: second, amount: 0 }).state;
  if (state.active !== firstPlayer) throw new Error('先攻の固定に失敗した');
  state.players[firstPlayer].baseHp = RULES.BASE_HP - paidHp;

  const ais: Record<PlayerId, AiContext> = {
    0: makeAi(ai, seed ^ 0x9e3779b9),
    1: makeAi(ai, seed ^ 0x85ebca6b),
  };
  state = advanceAi(state, ais, 5000);
  return state.winner;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  // 測定レンジ全体を提示できるように、検証中だけ上限を外す
  configureRules({ MAX_BID: args.maxHp + 2 });
  if (args.secondBonus !== undefined) configureRules({ SECOND_PLAYER_BONUS: args.secondBonus });
  if (args.secondCards !== undefined) configureRules({ SECOND_PLAYER_BONUS_CARDS: args.secondCards });
  console.log(
    `\n=== 先攻権の価値測定 (AI: ${args.ai} / 各条件 ${args.games} 戦 / 後攻ボーナス ${RULES.SECOND_PLAYER_BONUS}pt+${RULES.SECOND_PLAYER_BONUS_CARDS}枚) ===`,
  );
  console.log('支払いHPごとの「先攻側の勝率」。50%を割る手前が均衡落札額。\n');

  const header = ['支払HP', ...DECK_PRESETS.map((d) => d.name.replace(/（.*/, '').padEnd(10))];
  console.log(header.map((h) => String(h).padEnd(12)).join(''));

  const overallByHp = new Map<number, { wins: number; games: number }>();

  for (let paid = 0; paid <= args.maxHp; paid += args.step) {
    const row: string[] = [`${paid}`];
    for (const deck of DECK_PRESETS) {
      let wins = 0;
      let games = 0;
      // 同じデッキ同士（ミラー）で測ると、デッキ差ではなく手番差だけが出る
      for (let g = 0; g < args.games; g++) {
        const seed = (args.seed + g * 6151) | 0;
        // 先攻をP0/P1で半々にして、席順バイアスを打ち消す
        const first: PlayerId = g % 2 === 0 ? 0 : 1;
        const winner = playFixed(deck.id, deck.id, first, paid, args.ai, seed);
        if (winner !== null) {
          games += 1;
          if (winner === first) wins += 1;
        }
      }
      row.push(`${((wins / games) * 100).toFixed(1)}%`);
      const acc = overallByHp.get(paid) ?? { wins: 0, games: 0 };
      acc.wins += wins;
      acc.games += games;
      overallByHp.set(paid, acc);
    }
    console.log(row.map((c) => c.padEnd(12)).join(''));
  }

  console.log('\n--- 全デッキ平均 ---');
  let equilibrium: number | null = null;
  for (const [paid, acc] of [...overallByHp.entries()].sort((a, b) => a[0] - b[0])) {
    const rate = acc.wins / acc.games;
    console.log(`支払${String(paid).padStart(2)}HP: 先攻勝率 ${(rate * 100).toFixed(1)}%`);
    if (equilibrium === null && rate < 0.5) equilibrium = paid;
  }
  console.log(
    equilibrium === null
      ? `\n均衡点は${args.maxHp}HPを超えている（＝先攻が強すぎる。MAX_BIDの引き上げか後攻補正が必要）`
      : `\n均衡落札額はおよそ ${equilibrium - args.step}〜${equilibrium} HP`,
  );
  console.log('');
}

main();
