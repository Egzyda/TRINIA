/**
 * TRINIA - 後攻ボーナスの調整点測定
 *
 * 先攻/後攻はコイントスで決まる。後攻には SECOND_PLAYER_BONUS ptの
 * 初期リソースボーナスを与えているが、この値をいくつにすれば
 * 先攻勝率が50%に近づくかを実測する。
 *
 * 以前は「先攻権を拠点HPのオークションで競らせる」方式だったが、
 * AIの入札ヒューリスティックの精度に結果が依存してしまい、
 * 実測では何もしないより悪い先攻勝率になっていた（docs/BALANCE.md §13-14）。
 * コイントス＋固定ボーナスに切り替え、このツールでボーナスの大きさだけを測る。
 *
 * 使い方: npm run sim:bonus   （tsx tools/secondBonus.ts --games 300）
 */
import { createGame } from '../src/core/gameState';
import { applyAction } from '../src/core/mainPhaseEngine';
import { advanceAi } from '../src/ai/autoplay';
import { makeAi, type AiContext, type Difficulty } from '../src/ai';
import { DECK_PRESETS, getPreset } from '../src/cards/decks';
import { rulesForMode, type MatchModeId, type RuleSet } from '../src/core/rules';
import type { PlayerId } from '../src/core/types';

interface Args {
  games: number;
  ai: Difficulty;
  seed: number;
  minBonus: number;
  maxBonus: number;
  mode: MatchModeId;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { games: 200, ai: 'normal', seed: 31337, minBonus: 0, maxBonus: 6, mode: 'standard' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--games') args.games = Number(argv[++i]);
    else if (argv[i] === '--ai') args.ai = argv[++i] as Difficulty;
    else if (argv[i] === '--seed') args.seed = Number(argv[++i]);
    else if (argv[i] === '--min-bonus') args.minBonus = Number(argv[++i]);
    else if (argv[i] === '--max-bonus') args.maxBonus = Number(argv[++i]);
    else if (argv[i] === '--mode') args.mode = argv[++i] as MatchModeId;
  }
  return args;
}

/** 1試合フルプレイして、勝者が先攻だったかを返す（コイントスの結果はrngに任せる） */
function playFixed(
  deckA: string,
  deckB: string,
  seed: number,
  ai: Difficulty,
  rules: RuleSet,
): { winner: PlayerId | null; first: PlayerId } {
  const a = getPreset(deckA);
  const b = getPreset(deckB);
  let state = createGame({ name: 'P1', deck: a.cards }, { name: 'P2', deck: b.cards }, seed, rules);

  state = applyAction(state, { type: 'mulligan', player: 0, uids: [] }).state;
  state = applyAction(state, { type: 'mulligan', player: 1, uids: [] }).state;
  const first = state.firstPlayer ?? state.active;

  const ais: Record<PlayerId, AiContext> = {
    0: makeAi(ai, seed ^ 0x9e3779b9),
    1: makeAi(ai, seed ^ 0x85ebca6b),
  };
  state = advanceAi(state, ais, 5000);
  return { winner: state.winner, first };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `\n=== 後攻ボーナスの調整点測定 (AI: ${args.ai} / 各条件 ${args.games} 戦 / モード=${args.mode}) ===`,
  );
  console.log('後攻ボーナス(pt)ごとの「先攻側の勝率」。50%に最も近い値が調整点。\n');

  const header = ['後攻+pt', ...DECK_PRESETS.map((d) => d.name.replace(/（.*/, '').padEnd(10))];
  console.log(header.map((h) => String(h).padEnd(12)).join(''));

  const overallByBonus = new Map<number, { wins: number; games: number }>();

  for (let bonus = args.minBonus; bonus <= args.maxBonus; bonus++) {
    const rules: RuleSet = { ...rulesForMode(args.mode), SECOND_PLAYER_BONUS: bonus };
    const row: string[] = [`${bonus}`];
    for (const deck of DECK_PRESETS) {
      let wins = 0;
      let games = 0;
      for (let g = 0; g < args.games; g++) {
        const seed = (args.seed + g * 6151) | 0;
        const { winner, first } = playFixed(deck.id, deck.id, seed, args.ai, rules);
        if (winner !== null) {
          games += 1;
          if (winner === first) wins += 1;
        }
      }
      row.push(`${((wins / games) * 100).toFixed(1)}%`);
      const acc = overallByBonus.get(bonus) ?? { wins: 0, games: 0 };
      acc.wins += wins;
      acc.games += games;
      overallByBonus.set(bonus, acc);
    }
    console.log(row.map((c) => c.padEnd(12)).join(''));
  }

  console.log('\n--- 全デッキ平均 ---');
  let best: { bonus: number; diff: number } | null = null;
  for (const [bonus, acc] of [...overallByBonus.entries()].sort((a, b) => a[0] - b[0])) {
    const rate = acc.wins / acc.games;
    console.log(`後攻+${String(bonus).padStart(2)}pt: 先攻勝率 ${(rate * 100).toFixed(1)}%`);
    const diff = Math.abs(rate - 0.5);
    if (best === null || diff < best.diff) best = { bonus, diff };
  }
  console.log(best ? `\n50%に最も近いのは 後攻+${best.bonus}pt` : '');
  console.log('');
}

main();
