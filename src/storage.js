// Tiny JSON-file leaderboard. Only games with at least 2 real people count.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'brawl-stats.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(stats) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(stats, null, 2));
}

function recordGame(humans, winnerId) {
  const stats = load();
  for (const p of humans) {
    const s = (stats[p.id] ??= { name: p.name, wins: 0, games: 0, kills: 0 });
    s.name = p.name;
    s.games++;
    s.kills += p.kills;
    if (p.id === winnerId) s.wins++;
  }
  save(stats);
}

function top(n = 10) {
  return Object.values(load())
    .sort((a, b) => b.wins - a.wins || b.kills - a.kills || a.games - b.games)
    .slice(0, n);
}

module.exports = { recordGame, top };
