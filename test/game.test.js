// Run with: npm test
const assert = require('assert');
const game = require('../src/game');
const { chooseMove } = require('../src/bot-ai');

const H = game.MAX_HP;

function setup(n) {
  return Array.from({ length: n }, (_, i) => game.createPlayer({ id: `p${i}`, name: `P${i}` }));
}
function play(players, picks, round = 1) {
  players.forEach((p, i) => { if (p.alive) p.pick = picks[i]; });
  return game.resolveRound(players, round);
}
const atk = (i) => ({ type: 'attack', target: `p${i}` });
const BLOCK = { type: 'block' };
const CHARGE = { type: 'charge' };

let ps = setup(2);
play(ps, [atk(1), atk(0)]);
assert.deepStrictEqual([ps[0].hp, ps[1].hp], [H - 2, H - 2], 'trade hits');

ps = setup(2);
play(ps, [atk(1), BLOCK]);
assert.deepStrictEqual([ps[0].hp, ps[1].hp], [H - 1, H], 'block counters');
assert.ok(!game.canBlock(ps[1]), 'cannot block twice in a row');
assert.ok(!game.validPick(ps, ps[1], BLOCK));

ps = setup(2);
play(ps, [CHARGE, BLOCK]);
assert.ok(ps[0].charged);
play(ps, [atk(1), CHARGE]);
assert.strictEqual(ps[1].hp, H - 4, 'charged attack deals 4');
assert.ok(!ps[0].charged, 'charge is spent');

ps = setup(3);
play(ps, [atk(2), atk(2), BLOCK]);
assert.deepStrictEqual(ps.map((p) => p.hp), [H - 1, H - 1, H], 'block counters every attacker');

ps = setup(3);
ps[2].hp = 2;
ps[0].hp = 5;
const r = play(ps, [atk(2), CHARGE, CHARGE]);
assert.ok(!ps[2].alive, 'KO');
assert.strictEqual(ps[0].hp, 5 + game.KO_HEAL, 'KO heals the finisher');
assert.strictEqual(ps[0].kills, 1);
assert.strictEqual(game.checkWinner(ps, r.deaths), null, 'two left, keep going');

ps = setup(2);
play(ps, [CHARGE, CHARGE], game.STORM_ROUND);
assert.deepStrictEqual([ps[0].hp, ps[1].hp], [H - 1, H - 1], 'storm');

ps = setup(2);
ps.forEach((p) => (p.hp = 2));
const r2 = play(ps, [atk(1), atk(0)]);
assert.ok(game.checkWinner(ps, r2.deaths).draw, 'double KO with equal hp is a draw');

// Attack on someone who forfeited mid-round whiffs instead of crashing.
ps = setup(3);
ps[0].pick = atk(1);
ps[1].alive = false;
ps[2].pick = CHARGE;
game.resolveRound(ps, 1);
assert.strictEqual(ps[0].hp, H);

// Bots only pick legal moves, and hit people who can't block.
ps = setup(3);
ps[0].isBot = true;
ps[1].blockedLast = true;
ps[2].history = Array(6).fill('block');
const counts = {};
for (let i = 0; i < 400; i++) {
  const pick = chooseMove(ps[0], ps, 'hard');
  assert.ok(game.validPick(ps, ps[0], pick), JSON.stringify(pick));
  const k = pick.type === 'attack' ? pick.target : pick.type;
  counts[k] = (counts[k] ?? 0) + 1;
}
assert.ok((counts.p1 ?? 0) > (counts.p2 ?? 0), `bot should prefer the target that can't block: ${JSON.stringify(counts)}`);

// Full bot games with 2-8 players always finish.
for (let g = 0; g < 300; g++) {
  const n = 2 + (g % 7);
  const players = setup(n);
  players.forEach((p) => (p.isBot = true));
  let round = 1;
  let outcome = null;
  while (!outcome) {
    for (const p of players) if (p.alive) p.pick = chooseMove(p, players, 'normal');
    const res = game.resolveRound(players, round);
    outcome = game.checkWinner(players, res.deaths);
    round++;
    assert.ok(round < 40, 'game should end');
  }
}

console.log('All Brawl tests passed ✅');
