// Bot brain. It watches how often each player blocks/attacks, who is charged,
// who can't block this round, and who is low on HP, then scores every option.
// A bit of randomness keeps it beatable. Be unpredictable and you will win.
const { HIT, CHARGED_HIT, COUNTER, KO_HEAL, canBlock, canCharge } = require('./game');

const TEMPERATURE = { easy: 2.2, normal: 0.8, hard: 0.3 };

function rate(p, type) {
  const n = p.history.filter((m) => m === type).length;
  return (n + 1) / (p.history.length + 3);
}

function blockChance(t, threatened) {
  if (!canBlock(t)) return 0;
  let p = rate(t, 'block');
  if (t.hp <= 4) p += 0.15;
  if (threatened) p += 0.15;
  return Math.max(0.05, Math.min(0.85, p));
}

function chooseMove(me, players, difficulty = 'normal') {
  const foes = players.filter((p) => p.alive && p.id !== me.id);
  const lowest = Math.min(...players.filter((p) => p.alive).map((p) => p.hp));

  // How much damage is probably coming my way?
  let incoming = 0;
  let incomingAttackers = 0;
  for (const f of foes) {
    let share = 1 / foes.length;
    if (f.lastTarget === me.id) share *= 2;
    if (me.hp === lowest) share *= 1.5;
    const p = Math.min(1, rate(f, 'attack') * share * (foes.length > 1 ? 1.4 : 1.2));
    incoming += p * (f.charged ? CHARGED_HIT : HIT);
    incomingAttackers += p;
  }

  const options = [];
  if (canBlock(me)) options.push({ pick: { type: 'block' }, ev: incomingAttackers * COUNTER - 0.6 });
  if (canCharge(me)) options.push({ pick: { type: 'charge' }, ev: 1.6 - incoming });
  const power = me.charged ? CHARGED_HIT : HIT;
  for (const t of foes) {
    const pb = blockChance(t, me.charged);
    const ko = t.hp <= power ? KO_HEAL + 3 : 0;
    const ev = (1 - pb) * (power + ko + (t.charged ? 1 : 0)) - pb * (COUNTER + (me.charged ? 1.5 : 0)) - incoming;
    options.push({ pick: { type: 'attack', target: t.id }, ev });
  }

  const temp = TEMPERATURE[difficulty] ?? 1;
  const max = Math.max(...options.map((o) => o.ev));
  const w = options.map((o) => Math.exp((o.ev - max) / temp));
  let r = Math.random() * w.reduce((s, x) => s + x, 0);
  for (let i = 0; i < options.length; i++) {
    r -= w[i];
    if (r <= 0) return options[i].pick;
  }
  return options[options.length - 1].pick;
}

module.exports = { chooseMove };
