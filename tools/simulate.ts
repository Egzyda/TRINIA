/**
 * TRINIA - バランス調整用シミュレータ
 *
 * 使い方:
 *   npm run sim                          全デッキ総当たり(各200戦)
 *   npm run sim -- --games 500           試合数を変える
 *   npm run sim -- --ai normal           AI難易度を変える
 *   npm run sim -- --cards               カード別の使用率・勝率も出す
 *   npm run sim -- --deck aggro_fund     特定デッキだけ集計
 *
 * 見るべき指標:
 *   - 勝率が 40〜60% に収まっているか（デッキ間の壊れ検出）
 *   - 平均ターン数（短すぎ＝アグロ過剰、長すぎ＝決着手段不足）
 *   - 先攻勝率（オークションが機能していれば 50% 近辺に寄る）
 */
import { DECK_PRESETS } from '../src/cards/decks';
import { playMatch } from '../src/ai/autoplay';
import { getCard } from '../src/cards/cardFactory';
import type { Difficulty } from '../src/ai';
import { rulesForMode, type MatchModeId, type RuleSet } from '../src/core/rules';
import type { PlayerId } from '../src/core/types';

interface Args {
  games: number;
  ai: Difficulty;
  /** 先手側だけ別の難易度にする（AI強度の比較用） */
  aiA?: Difficulty;
  cards: boolean;
  deck?: string;
  seed: number;
  mode: MatchModeId;
  /** モードの値を一時的に上書きして比較検証する */
  overrides: Partial<RuleSet>;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { games: 200, ai: 'normal', cards: false, seed: 12345, mode: 'standard', overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') args.games = Number(argv[++i]);
    else if (a === '--ai') args.ai = argv[++i] as Difficulty;
    else if (a === '--ai-a') args.aiA = argv[++i] as Difficulty;
    else if (a === '--cards') args.cards = true;
    else if (a === '--deck') args.deck = argv[++i];
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--mode') args.mode = argv[++i] as MatchModeId;
    else if (a === '--hp') args.overrides.BASE_HP = Number(argv[++i]);
    else if (a === '--fp') args.overrides.FREE_POINTS = Number(argv[++i]);
    else if (a === '--bid') args.overrides.MAX_BID = Number(argv[++i]);
  }
  return args;
}

interface Tally {
  games: number;
  winsA: number;
  turnsTotal: number;
  firstWins: number;
  countdownWins: number;
  timeouts: number;
  hpTotal: number;
  bidTotal: number;
}

function emptyTally(): Tally {
  return {
    games: 0,
    winsA: 0,
    turnsTotal: 0,
    firstWins: 0,
    countdownWins: 0,
    timeouts: 0,
    hpTotal: 0,
    bidTotal: 0,
  };
}

function pct(n: number, d: number): string {
  return d === 0 ? ' -- ' : `${((n / d) * 100).toFixed(1)}%`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const decks = args.deck ? DECK_PRESETS.filter((d) => d.id === args.deck) : DECK_PRESETS;
  const opponents = DECK_PRESETS;

  console.log(`\n=== TRINIA バランスシミュレーション ===`);
  console.log(
    `AI: 先手=${args.aiA ?? args.ai} / 後手=${args.ai} / モード=${args.mode} / 各組み合わせ ${args.games} 戦 / seed ${args.seed}\n`,
  );

  const overall = emptyTally();
  const perDeck = new Map<string, Tally>();
  const cardPlays = new Map<string, number>();
  const cardWins = new Map<string, number>();
  const matrix: string[][] = [];

  for (const a of decks) {
    const row: string[] = [];
    for (const b of opponents) {
      const t = emptyTally();
      for (let g = 0; g < args.games; g++) {
        const seed = (args.seed + g * 7919) | 0;
        const r = playMatch({
          deckA: a.id,
          deckB: b.id,
          aiA: args.aiA ?? args.ai,
          aiB: args.ai,
          seed,
          mode: args.mode,
          rules: { ...rulesForMode(args.mode), ...args.overrides },
        });
        t.games += 1;
        t.turnsTotal += r.turns;
        t.hpTotal += Math.max(r.finalHp[0], r.finalHp[1]);
        t.bidTotal += Math.max(r.bids[0], r.bids[1]);
        if (r.winner === 0) t.winsA += 1;
        if (r.winner !== null && r.winner === r.first) t.firstWins += 1;
        if (r.reason?.includes('カウントダウン')) t.countdownWins += 1;
        if (r.reason?.includes('ターン上限')) t.timeouts += 1;

        if (args.cards) {
          // 墓地 + 場に出ているものを「使われたカード」とみなす
          for (const pid of [0, 1] as PlayerId[]) {
            const p = r.state.players[pid];
            const used = new Set<string>([
              ...p.graveyard.map((c) => c.defId),
              ...p.units.map((u) => u.defId),
              ...p.facilities.map((f) => f.defId),
            ]);
            for (const defId of used) {
              cardPlays.set(defId, (cardPlays.get(defId) ?? 0) + 1);
              if (r.winner === pid) cardWins.set(defId, (cardWins.get(defId) ?? 0) + 1);
            }
          }
        }
      }
      row.push(pct(t.winsA, t.games));
      mergeInto(overall, t);
      mergeInto(getOrCreate(perDeck, a.id), t);
      // 相手側から見た勝率も per-deck に積む
      const mirrored = { ...t, winsA: t.games - t.winsA };
      mergeInto(getOrCreate(perDeck, b.id), mirrored);
    }
    matrix.push(row);
  }

  // --- 対戦表 ---
  const header = ['先手\\後手', ...opponents.map((d) => shortName(d.name))];
  console.log(header.map((h) => h.padEnd(14)).join(''));
  decks.forEach((d, i) => {
    console.log([shortName(d.name), ...matrix[i]].map((c) => c.padEnd(14)).join(''));
  });

  // --- デッキ別サマリ ---
  console.log(`\n--- デッキ別 総合勝率 ---`);
  for (const d of DECK_PRESETS) {
    const t = perDeck.get(d.id);
    if (!t) continue;
    console.log(
      `${shortName(d.name).padEnd(14)} 勝率 ${pct(t.winsA, t.games).padStart(6)}  ` +
        `平均${(t.turnsTotal / t.games).toFixed(1)}ターン`,
    );
  }

  console.log(`\n--- 全体 ---`);
  console.log(`総試合数        : ${overall.games}`);
  console.log(`平均ターン数    : ${(overall.turnsTotal / overall.games).toFixed(1)}`);
  console.log(`先攻勝率        : ${pct(overall.firstWins, overall.games)}`);
  console.log(`平均落札額(HP)  : ${(overall.bidTotal / overall.games).toFixed(2)}`);
  console.log(`勝者の残HP平均  : ${(overall.hpTotal / overall.games).toFixed(1)}`);
  console.log(`特殊勝利率      : ${pct(overall.countdownWins, overall.games)}`);
  console.log(`ターン上限決着率: ${pct(overall.timeouts, overall.games)}`);

  if (args.cards) {
    console.log(`\n--- カード別 (使用局数 / 使用側勝率) ---`);
    const rows = [...cardPlays.entries()]
      .map(([defId, plays]) => ({
        name: getCard(defId).name,
        plays,
        winRate: (cardWins.get(defId) ?? 0) / plays,
      }))
      .sort((x, y) => y.winRate - x.winRate);
    for (const r of rows) {
      console.log(`${r.name.padEnd(20)} ${String(r.plays).padStart(6)}  ${(r.winRate * 100).toFixed(1)}%`);
    }
  }
  console.log('');
}

function shortName(name: string): string {
  return name.replace(/（.*/, '');
}

function getOrCreate(map: Map<string, Tally>, key: string): Tally {
  let t = map.get(key);
  if (!t) {
    t = emptyTally();
    map.set(key, t);
  }
  return t;
}

function mergeInto(dst: Tally, src: Tally): void {
  dst.games += src.games;
  dst.winsA += src.winsA;
  dst.turnsTotal += src.turnsTotal;
  dst.firstWins += src.firstWins;
  dst.countdownWins += src.countdownWins;
  dst.timeouts += src.timeouts;
  dst.hpTotal += src.hpTotal;
  dst.bidTotal += src.bidTotal;
}

main();
