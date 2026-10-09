// Pure game rules for Blade Rite: Brawl. No Discord code in here, so it is easy to test.
//
// Every round, everyone secretly picks one move at the same time:
//   ⚔️ Attack someone: 2 dmg (4 if you are charged)
//   🛡️ Block: stops every attack on you, and each attacker takes 1. You can't block twice in a row.
//   ⚡ Charge: your next attack deals double
// Attack beats Charge, Block beats Attack, Charge beats Block.
// Knocking someone out heals you 3. From round 10 the storm hits everyone for 1 per round.

const MAX_HP = 10;
const HIT = 2;
const CHARGED_HIT = 4;
const COUNTER = 1;
const KO_HEAL = 3;
const STORM_ROUND = 10;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

function createPlayer({ id, name, isBot = false }) {
  return {
    id,
    name,
    isBot,
    hp: MAX_HP,
    alive: true,
    charged: false,
    blockedLast: false,
    history: [], // 'attack' | 'block' | 'charge' | 'idle'
    lastTarget: null,
    pick: null, // { type, target }
    afk: 0,
    kills: 0,
  };
}

function canBlock(p) {
  return !p.blockedLast;
}

function canCharge(p) {
  return !p.charged;
}

function validPick(players, p, pick) {
  if (!p.alive || !pick) return false;
  if (pick.type === 'block') return canBlock(p);
  if (pick.type === 'charge') return canCharge(p);
  if (pick.type === 'attack') {
    const t = players.find((x) => x.id === pick.target);
    return Boolean(t && t.alive && t.id !== p.id);
  }
  return pick.type === 'idle';
}

// Resolves one round in place. Every alive player must have a `pick`.
function resolveRound(players, round) {
  const alive = players.filter((p) => p.alive);
  const byId = new Map(players.map((p) => [p.id, p]));
  const dmg = new Map(alive.map((p) => [p.id, 0]));
  const hitters = new Map(alive.map((p) => [p.id, []]));
  const attackedBy = new Map(alive.map((p) => [p.id, []]));
  const lines = [];

  for (const p of alive) {
    if (p.pick.type === 'attack') attackedBy.get(p.pick.target)?.push(p);
  }

  for (const p of alive) {
    const { type, target } = p.pick;
    const t = byId.get(target);
    if (type === 'attack' && !t?.alive) {
      lines.push(`💨 **${p.name}** swings at empty air.`); // target left mid-round
    } else if (type === 'attack') {
      const power = p.charged ? CHARGED_HIT : HIT;
      const bolt = p.charged ? ' ⚡' : '';
      p.charged = false;
      p.lastTarget = t.id;
      if (t.pick.type === 'block') {
        dmg.set(p.id, dmg.get(p.id) + COUNTER);
        lines.push(`🛡️ **${t.name}** blocks **${p.name}**'s attack${bolt}! ${p.name} takes ${COUNTER}.`);
      } else {
        dmg.set(t.id, dmg.get(t.id) + power);
        hitters.get(t.id).push(p);
        const flavor = t.pick.type === 'charge' ? ' mid-charge!' : '.';
        lines.push(`⚔️ **${p.name}** hits **${t.name}** for **${power}**${bolt}${flavor}`);
      }
    } else if (type === 'charge') {
      p.charged = true;
      lines.push(`⚡ **${p.name}** charges up.`);
    } else if (type === 'block') {
      if (attackedBy.get(p.id).length === 0) lines.push(`🛡️ **${p.name}** blocks... nothing.`);
    } else {
      lines.push(`💤 **${p.name}** hesitates.`);
    }
  }

  for (const p of alive) p.hp -= dmg.get(p.id);

  const storm = round >= STORM_ROUND;
  if (storm) {
    for (const p of alive) p.hp -= 1;
    lines.push('🌪️ The storm hits everyone for 1.');
  }

  // Knockouts, then heal the survivors who landed a hit on them.
  const deaths = alive.filter((p) => p.hp <= 0);
  for (const d of deaths) d.alive = false;
  for (const d of deaths) {
    const killers = [...new Set(hitters.get(d.id))];
    const living = killers.filter((k) => k.alive);
    for (const k of killers) k.kills++;
    for (const k of living) k.hp = Math.min(MAX_HP, k.hp + KO_HEAL);
    const credit = living.length ? ` by ${living.map((k) => `**${k.name}**`).join(' & ')} (+${KO_HEAL}❤️)` : '';
    lines.push(`💀 **${d.name}** is knocked out${credit}!`);
  }

  for (const p of alive) {
    p.blockedLast = p.pick.type === 'block';
    p.history.push(p.pick.type);
    p.pick = null;
  }

  return { lines, dmg, deaths, storm };
}

// Returns { winner } | { draw: [players] } | null while the fight goes on.
function checkWinner(players, deaths) {
  const alive = players.filter((p) => p.alive);
  if (alive.length === 1) return { winner: alive[0] };
  if (alive.length === 0) {
    const best = Math.max(...deaths.map((p) => p.hp));
    const top = deaths.filter((p) => p.hp === best);
    return top.length === 1 ? { winner: top[0] } : { draw: top };
  }
  return null;
}

module.exports = {
  MAX_HP,
  HIT,
  CHARGED_HIT,
  COUNTER,
  KO_HEAL,
  STORM_ROUND,
  MIN_PLAYERS,
  MAX_PLAYERS,
  createPlayer,
  canBlock,
  canCharge,
  validPick,
  resolveRound,
  checkWinner,
};
