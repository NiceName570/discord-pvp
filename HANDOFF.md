# Handoff: Blade Rite Brawl

Notes for whoever picks this project up next. For the rules and setup steps, see [README.md](README.md).

## Status

- The bot works. You can play lobbies with 2–8 players and practice games against bots.
- `npm test` passes. It covers every rule and plays out 300 simulated bot games with 2–8 players.
- On average, a game with 4 bots lasts about 12 rounds, which is roughly 5 minutes.
- Secrets live only in `.env`, which git ignores. Use `.env.example` as the template.

## How it works

- **The rules are separate from Discord.** `src/game.js` takes the players and their picks and returns the new state plus the text describing what happened. Any rule change belongs there and should come with a test in `test/game.test.js`.
- **The board is edited through interaction tokens, not channel access.** The first version called `message.edit()`, which failed with `ChannelNotCached` and left the board frozen. `show()` in `src/index.js` now edits through the most recent interaction token from the board. A token expires after 15 minutes. If it is older than 14 minutes, `show()` posts a fresh board with `followUp` from the latest interaction instead.
- **All state is in memory.** If the bot restarts, any running lobbies and games are lost. Only the leaderboard is saved, in `data/brawl-stats.json`.
- **Button IDs** use the format `kind:matchId:...`. The kinds are `join`, `leave`, `bot`, `start`, `mv` (opens the move picker), `go` (locks in a move, and includes the round number so old buttons are rejected), `ff` (forfeit) and `again` (play again). Bot IDs use `-` instead of `:` so they don't break this format.
- **Bots** in `src/bot-ai.js` score every legal move using what they can see: each player's block and attack rates, who can't block this round, who is charged, and who is low on HP. They then pick with some randomness. Difficulty changes how much randomness there is.

## Known limitations and ideas

- There is no persistence for games in progress. Saving match state would let games survive a restart.
- The leaderboard is a single JSON file, so it won't scale to many servers. SQLite would be the next step.
- A player can only be in one lobby or game at a time, across all servers.
- Ideas for later: a ranked mode with Elo ratings, more moves (for example a one-time "Dodge"), cosmetic titles for leaderboard winners, and team mode (2v2).

## Running it

```
npm install
npm run deploy   # only needed when src/commands.js changes
npm start
```

The bot only runs while that process is running. For hosting around the clock, run it on a small VPS or a service like Railway or Fly.io, with `DISCORD_TOKEN` and `CLIENT_ID` set as environment variables.
