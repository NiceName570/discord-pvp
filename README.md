# ⚔️ Blade Rite: Brawl

A free-for-all battle game for 2–8 players that runs inside Discord. Every round, everyone **secretly picks a move at the same time**, then all moves are revealed together. It takes a minute to learn. To win, you have to read the other players: who is about to block, who is charged, and who is an easy target.

## How to play

Everyone starts with **10❤️**. Each round you pick one move:

| Move | What it does |
|---|---|
| ⚔️ **Attack** a player | Deals 2 damage, or **4** if you're charged |
| 🛡️ **Block** | Stops every attack on you, and each attacker takes 1. **You can't block two rounds in a row** |
| ⚡ **Charge** | Your next attack deals double |

**Attack beats Charge · Block beats Attack · Charge beats Block**

- 💀 Knock someone out and you heal **+3❤️**.
- 🌪️ From round 10, the storm hits everyone for 1 damage each round, so games can't stall.
- You have 25 seconds per round. If you don't pick, you do nothing. Miss 2 rounds in a row and you're out.
- The last player standing wins.

The board updates after every round with what everyone did, the damage dealt, the current leader 👑, and who is ⚡ charged or 🚫 can't block.

## Commands

| Command | What it does |
|---|---|
| `/brawl [bots] [difficulty]` | Opens a lobby. Players click **Join**, anyone can click **Add bot**, and the host clicks **Start** |
| `/practice [bots] [difficulty]` | Starts a fight against bots right away |
| `/howtoplay` | Shows the rules (only you can see them) |
| `/leaderboard` | Shows wins and KOs. Only games with 2 or more real people count |

The bots watch your habits, such as how often you block and who you target, and punish predictable play.

## Setup

You need [Node.js](https://nodejs.org) 18 or newer.

1. **Create the bot.** Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**. Copy the **Application ID**. Then go to **Bot**, click **Reset Token**, and copy the token.
2. **Invite the bot.** Go to **OAuth2 → URL Generator**. Tick the scopes `bot` and `applications.commands`, and the permissions **View Channels**, **Send Messages** and **Embed Links**. Open the generated URL and add the bot to your server.
3. **Configure it.** Copy `.env.example` to `.env` and fill it in:
   ```
   DISCORD_TOKEN=your-bot-token
   CLIENT_ID=your-application-id
   GUILD_ID=optional-server-id   # makes commands appear instantly in that server
   ```
4. **Install, register and run:**
   ```
   npm install
   npm run deploy
   npm start
   ```

Run `npm test` to check the game rules and play out simulated bot games.

## Project layout

```
src/
  index.js            Discord bot: lobbies, the board, buttons, timers
  game.js             Game rules only (no Discord code)
  bot-ai.js           Bot opponents
  commands.js         Slash command definitions
  deploy-commands.js  Registers the slash commands with Discord
  storage.js          Leaderboard (data/brawl-stats.json)
test/game.test.js     Rule tests and bot game simulations
```
