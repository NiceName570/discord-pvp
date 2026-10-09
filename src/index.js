require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  Events,
} = require('discord.js');
const game = require('./game');
const { MAX_HP, STORM_ROUND, MIN_PLAYERS, MAX_PLAYERS } = game;
const { chooseMove } = require('./bot-ai');
const storage = require('./storage');

const ROUND_SECONDS = 25;
const LOBBY_SECONDS = 180;
const AFK_LIMIT = 2;
const TOKEN_MS = 14 * 60 * 1000; // interaction tokens last 15 minutes
const BOT_NAMES = ['Sir Clank', 'Gobbo', 'Big Tony', 'Captain Wobble', 'Rusty', 'Madame Stab', 'Lil Bonk', 'The Intern'];

const RULES_LINE = '⚔️ Attack: 2 dmg (4 if charged) · 🛡️ Block: stops attacks, attacker takes 1, not twice in a row · ⚡ Charge: next attack x2';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const matches = new Map(); // id -> match
const userMatch = new Map(); // user id -> match id (one game at a time)

let nextId = 1;
const newId = () => (nextId++).toString(36) + Date.now().toString(36).slice(-4);

// ---------- showing the board ----------
// The board is edited through interaction tokens instead of the channel, so it
// works even when the bot can't see the channel itself.

function setBoard(match, interaction, messageId = null) {
  match.board = { interaction, messageId };
}

async function show(match, view) {
  const b = match.board;
  if (b && Date.now() - b.interaction.createdTimestamp < TOKEN_MS) {
    try {
      if (b.messageId) await b.interaction.webhook.editMessage(b.messageId, view);
      else await b.interaction.editReply(view);
      return;
    } catch (err) {
      console.error('Board edit failed, posting a new board:', err.message);
    }
  }
  const li = match.lastInteraction;
  if (li && Date.now() - li.createdTimestamp < TOKEN_MS) {
    const msg = await li.followUp(view);
    setBoard(match, li, msg.id);
  }
}

// ---------- rendering ----------

function hpBar(hp) {
  const v = Math.max(0, Math.min(MAX_HP, hp));
  const color = v > 6 ? '🟩' : v > 3 ? '🟨' : '🟥';
  return color.repeat(v) + '⬛'.repeat(MAX_HP - v);
}

function standings(match) {
  const sorted = [...match.players].sort((a, b) => b.alive - a.alive || b.hp - a.hp);
  const alive = sorted.filter((p) => p.alive);
  const leader = alive.length > 1 && alive[0].hp > alive[1].hp ? alive[0] : null;
  return sorted
    .map((p) => {
      if (!p.alive) return `💀 ~~${p.name}~~${p.kills ? ` · ${p.kills} KO` : ''}`;
      const tags = [];
      if (p.charged) tags.push('⚡charged');
      if (!game.canBlock(p)) tags.push('🚫can\'t block');
      if (p.kills) tags.push(`${p.kills} KO`);
      const status = match.state === 'playing' ? (p.pick ? '✅' : '⏳') : '';
      return `${status} ${p === leader ? '👑 ' : ''}**${p.name}**${p.isBot ? ' 🤖' : ''}\n` +
        `${hpBar(p.hp)} **${Math.max(0, p.hp)}**❤️ ${tags.length ? `· ${tags.join(' · ')}` : ''}`;
    })
    .join('\n');
}

function lobbyView(match) {
  const list = match.players.map((p, i) => `${i + 1}. ${p.name}${p.isBot ? ' 🤖' : ''}${p.id === match.hostId ? ' 👑 host' : ''}`).join('\n');
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🏟️ Brawl lobby: last one standing wins!')
    .setDescription(
      `**Players (${match.players.length}/${MAX_PLAYERS})**\n${list}\n\n` +
      `Press **Join** to get in. The host presses **Start** when ready (${MIN_PLAYERS}+ players).\n` +
      `Lobby closes <t:${Math.floor(match.lobbyExpires / 1000)}:R>. New? Type \`/howtoplay\`.`,
    )
    .setFooter({ text: RULES_LINE });
  const full = match.players.length >= MAX_PLAYERS;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${match.id}`).setLabel('Join').setEmoji('🙋').setStyle(ButtonStyle.Success).setDisabled(full),
    new ButtonBuilder().setCustomId(`leave:${match.id}`).setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bot:${match.id}`).setLabel('Add bot').setEmoji('🤖').setStyle(ButtonStyle.Secondary).setDisabled(full),
    new ButtonBuilder().setCustomId(`start:${match.id}`).setLabel('Start').setEmoji('⚔️').setStyle(ButtonStyle.Primary).setDisabled(match.players.length < MIN_PLAYERS),
  );
  return { content: '', embeds: [embed], components: [row] };
}

function gameView(match) {
  const storm = match.round >= STORM_ROUND;
  const parts = [];
  if (match.lastReveal) parts.push(match.lastReveal);
  parts.push(`__**Standings**__\n${standings(match)}`);
  if (match.round === STORM_ROUND - 1) parts.push('🌪️ *The storm arrives next round: everyone loses 1❤️ per round.*');
  parts.push(`🎯 Press **Choose your move** and pick in secret. Round ends <t:${Math.floor(match.deadline / 1000)}:R>.`);
  const embed = new EmbedBuilder()
    .setColor(storm ? 0x8e44ad : 0x5865f2)
    .setTitle(`⚔️ Brawl · Round ${match.round}${storm ? ' · 🌪️ STORM' : ''}`)
    .setDescription(parts.join('\n\n'))
    .setFooter({ text: `${RULES_LINE} · KO someone = +3❤️` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mv:${match.id}`).setLabel('Choose your move').setEmoji('🎯').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ff:${match.id}`).setLabel('Forfeit').setEmoji('🏳️').setStyle(ButtonStyle.Secondary),
  );
  return { content: '', embeds: [embed], components: [row] };
}

function endView(match, headline) {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(headline)
    .setDescription(`${match.lastReveal ? `${match.lastReveal}\n\n` : ''}__**Final standings**__\n${standings(match)}\n\nLasted ${match.round} round${match.round === 1 ? '' : 's'}.`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`again:${match.id}`).setLabel('Play again').setEmoji('🔁').setStyle(ButtonStyle.Success),
  );
  return { content: '', embeds: [embed], components: [row] };
}

function pickerView(match, me) {
  const foes = match.players.filter((p) => p.alive && p.id !== me.id);
  const power = me.charged ? game.CHARGED_HIT : game.HIT;
  const attackButtons = foes.map((f) =>
    new ButtonBuilder()
      .setCustomId(`go:${match.id}:${match.round}:a:${f.id}`)
      .setLabel(`Attack ${f.name.slice(0, 20)} (${f.hp}❤️)${f.charged ? ' ⚡' : ''}${game.canBlock(f) ? '' : ' 🚫🛡️'}`)
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Danger),
  );
  const rows = [];
  for (let i = 0; i < attackButtons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(attackButtons.slice(i, i + 5)));
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`go:${match.id}:${match.round}:b`)
        .setLabel(game.canBlock(me) ? 'Block' : 'Block (used last round)')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!game.canBlock(me)),
      new ButtonBuilder()
        .setCustomId(`go:${match.id}:${match.round}:c`)
        .setLabel(game.canCharge(me) ? 'Charge' : 'Already charged')
        .setEmoji('⚡')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!game.canCharge(me)),
    ),
  );
  return {
    content:
      `**Round ${match.round}** · You have **${me.hp}❤️**${me.charged ? ' and are **⚡charged**' : ''}. Your attack deals **${power}**.\n` +
      `🚫🛡️ = can't block this round (free hit!) · ⚡ = charged, hits for 4`,
    components: rows,
    flags: MessageFlags.Ephemeral,
  };
}

function rulesEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📖 How to play Brawl')
    .setDescription(
      'Everyone has **10❤️**. Each round, **everyone secretly picks one move at the same time**. Then all moves are revealed together.\n\n' +
      '⚔️ **Attack** a player: deals **2** (or **4** if you are charged).\n' +
      '🛡️ **Block**: stops every attack on you, and each attacker takes **1**. You **can\'t block two rounds in a row**.\n' +
      '⚡ **Charge**: your next attack deals double.\n\n' +
      '**Attack beats Charge · Block beats Attack · Charge beats Block**\n\n' +
      '💀 Knock someone out and you heal **+3❤️**.\n' +
      `🌪️ From round ${STORM_ROUND} the storm hits everyone for 1 each round.\n` +
      '🏆 Last one standing wins.\n\n' +
      '**Tips**\n' +
      '• Someone with 🚫 just blocked, so they **can\'t block now**. Free hit!\n' +
      '• Someone ⚡charged is about to hit hard. Block if you think they\'re coming for you.\n' +
      '• Low HP players will want to block. Charge while they hide, then hit them next round.',
    )
    .addFields({ name: 'Commands', value: '`/brawl` open a lobby · `/practice` fight bots now · `/leaderboard`' });
}

// ---------- game flow ----------

function newMatch(host, difficulty) {
  const match = {
    id: newId(),
    hostId: host.id,
    difficulty,
    state: 'lobby',
    players: [],
    round: 0,
    deadline: 0,
    timer: null,
    board: null,
    lastInteraction: null,
    lastReveal: '',
    resolving: false,
    botCount: 0,
  };
  matches.set(match.id, match);
  addHuman(match, host);
  return match;
}

function addHuman(match, user) {
  match.players.push(game.createPlayer(user));
  userMatch.set(user.id, match.id);
}

function addBot(match) {
  const used = new Set(match.players.map((p) => p.name));
  const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${match.botCount + 1}`;
  match.botCount++;
  match.players.push(game.createPlayer({ id: `bot-${match.id}-${match.botCount}`, name, isBot: true }));
}

function closeMatch(match) {
  clearTimeout(match.timer);
  matches.delete(match.id);
  for (const p of match.players) if (userMatch.get(p.id) === match.id) userMatch.delete(p.id);
}

function startGame(match) {
  match.state = 'playing';
  match.round = 1;
  beginRound(match);
}

function beginRound(match) {
  // Only bots left? Play it out quickly so the humans can watch.
  const ms = match.players.some((p) => p.alive && !p.isBot) ? ROUND_SECONDS * 1000 : 3000;
  match.deadline = Date.now() + ms;
  clearTimeout(match.timer);
  match.timer = setTimeout(() => onTimeout(match).catch(console.error), ms);
  for (const p of match.players) {
    if (p.alive && p.isBot) p.pick = chooseMove(p, match.players, match.difficulty);
  }
}

async function onTimeout(match) {
  if (match.state !== 'playing' || match.resolving) return;
  for (const p of match.players) {
    if (p.alive && !p.pick) {
      p.pick = { type: 'idle' };
      p.afk++;
    }
  }
  await resolve(match);
}

async function resolve(match) {
  if (match.resolving || match.state !== 'playing') return;
  match.resolving = true;
  clearTimeout(match.timer);

  const result = game.resolveRound(match.players, match.round);
  for (const p of match.players) {
    if (p.alive && p.afk >= AFK_LIMIT) {
      p.alive = false;
      p.hp = 0;
      result.deaths.push(p);
      result.lines.push(`🏃 **${p.name}** wandered off and is out.`);
    }
  }

  const hurt = [...result.dmg].filter(([, d]) => d > 0).map(([id, d]) => `${match.players.find((p) => p.id === id).name} -${d}`);
  match.lastReveal = `__**Round ${match.round} results**__\n${result.lines.join('\n')}` + (hurt.length ? `\n**Damage:** ${hurt.join(' · ')}` : '');

  const outcome = game.checkWinner(match.players, result.deaths);
  match.resolving = false;
  if (outcome) return endGame(match, outcome);

  match.round++;
  beginRound(match);
  await show(match, gameView(match));
}

async function endGame(match, outcome) {
  match.state = 'over';
  closeMatch(match);
  const headline = outcome.winner
    ? `🏆 ${outcome.winner.name} wins the brawl!`
    : `🤝 Draw between ${outcome.draw.map((p) => p.name).join(' & ')}!`;
  const humans = match.players.filter((p) => !p.isBot);
  if (humans.length >= 2) storage.recordGame(humans, outcome.winner?.id);
  finished.set(match.id, { botCount: match.players.filter((p) => p.isBot).length, difficulty: match.difficulty });
  setTimeout(() => finished.delete(match.id), 15 * 60 * 1000);
  await show(match, endView(match, headline));
}

const finished = new Map(); // match id -> settings for "Play again"

// ---------- helpers ----------

function userInfo(interaction) {
  const u = interaction.user;
  const name = (interaction.member?.displayName ?? u.globalName ?? u.username).slice(0, 24);
  return { id: u.id, name };
}

function ephemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
}

function busyMessage(interaction) {
  const m = matches.get(userMatch.get(interaction.user.id));
  if (!m) return null;
  return m.state === 'lobby' ? "You're already in a lobby. Leave it first." : "You're already in a brawl.";
}

async function openLobby(interaction, bots, difficulty) {
  const busy = busyMessage(interaction);
  if (busy) return ephemeral(interaction, busy);
  const match = newMatch(userInfo(interaction), difficulty);
  for (let i = 0; i < bots; i++) addBot(match);
  match.lobbyExpires = Date.now() + LOBBY_SECONDS * 1000;
  match.timer = setTimeout(() => {
    if (match.state !== 'lobby') return;
    closeMatch(match);
    show(match, { content: '', embeds: [new EmbedBuilder().setColor(0x99aab5).setDescription('⌛ The lobby closed before the fight started.')], components: [] }).catch(console.error);
  }, LOBBY_SECONDS * 1000);
  await interaction.reply(lobbyView(match));
  setBoard(match, interaction);
  match.lastInteraction = interaction;
}

async function startPractice(interaction, bots, difficulty) {
  const busy = busyMessage(interaction);
  if (busy) return ephemeral(interaction, busy);
  const match = newMatch(userInfo(interaction), difficulty);
  for (let i = 0; i < bots; i++) addBot(match);
  startGame(match);
  await interaction.reply(gameView(match));
  setBoard(match, interaction);
  match.lastInteraction = interaction;
}

// ---------- interactions ----------

async function handleCommand(interaction) {
  const difficulty = interaction.options.getString('difficulty') ?? 'normal';
  switch (interaction.commandName) {
    case 'brawl':
      return openLobby(interaction, interaction.options.getInteger('bots') ?? 0, difficulty);
    case 'practice':
      return startPractice(interaction, interaction.options.getInteger('bots') ?? 2, difficulty);
    case 'howtoplay':
      return interaction.reply({ embeds: [rulesEmbed()], flags: MessageFlags.Ephemeral });
    case 'leaderboard': {
      const rows = storage.top(10);
      const medals = ['🥇', '🥈', '🥉'];
      const body = rows.length
        ? rows.map((r, i) => `${medals[i] ?? `**${i + 1}.**`} **${r.name}** · ${r.wins} wins · ${r.kills} KOs · ${r.games} games`).join('\n')
        : 'No brawls with 2+ people yet. Start one with `/brawl`!';
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('🏆 Brawl Leaderboard').setDescription(body)] });
    }
  }
}

async function handleButton(interaction) {
  const [kind, id, ...rest] = interaction.customId.split(':');
  const userId = interaction.user.id;

  if (kind === 'again') {
    const prev = finished.get(id);
    if (!prev) return ephemeral(interaction, 'Start a new one with `/brawl`.');
    return openLobby(interaction, prev.botCount, prev.difficulty);
  }

  const match = matches.get(id);
  if (!match) return ephemeral(interaction, 'This game is over. Start a new one with `/brawl`.');
  match.lastInteraction = interaction;
  const me = match.players.find((p) => p.id === userId);

  // ----- lobby -----
  if (match.state === 'lobby') {
    if (kind === 'join') {
      if (me) return ephemeral(interaction, "You're already in.");
      const busy = busyMessage(interaction);
      if (busy) return ephemeral(interaction, busy);
      if (match.players.length >= MAX_PLAYERS) return ephemeral(interaction, 'Lobby is full.');
      addHuman(match, userInfo(interaction));
    } else if (kind === 'leave') {
      if (!me) return ephemeral(interaction, "You're not in this lobby.");
      if (userId === match.hostId) {
        closeMatch(match);
        return interaction.update({ content: '', embeds: [new EmbedBuilder().setColor(0x99aab5).setDescription('🚪 The host closed the lobby.')], components: [] });
      }
      match.players = match.players.filter((p) => p !== me);
      userMatch.delete(userId);
    } else if (kind === 'bot') {
      if (!me) return ephemeral(interaction, 'Join the lobby first.');
      if (match.players.length >= MAX_PLAYERS) return ephemeral(interaction, 'Lobby is full.');
      addBot(match);
    } else if (kind === 'start') {
      if (userId !== match.hostId) return ephemeral(interaction, 'Only the host can start.');
      if (match.players.length < MIN_PLAYERS) return ephemeral(interaction, `Need at least ${MIN_PLAYERS} players. Add a bot!`);
      startGame(match);
      await interaction.update(gameView(match));
      return setBoard(match, interaction);
    }
    await interaction.update(lobbyView(match));
    return setBoard(match, interaction);
  }

  // ----- in game -----
  if (!me) return ephemeral(interaction, "You're not in this brawl. Grab some popcorn 🍿");
  if (!me.alive) return ephemeral(interaction, "You're knocked out 💀. Watch the rest!");

  if (kind === 'ff') {
    me.alive = false;
    me.hp = 0;
    me.pick = null;
    await interaction.deferUpdate();
    setBoard(match, interaction);
    const alive = match.players.filter((p) => p.alive);
    if (alive.length === 1) {
      match.lastReveal = `🏳️ **${me.name}** gives up.`;
      return endGame(match, { winner: alive[0] });
    }
    match.lastReveal = `🏳️ **${me.name}** gives up and leaves the arena.`;
    if (alive.every((p) => p.pick)) return resolve(match);
    return show(match, gameView(match));
  }

  if (kind === 'mv') {
    if (me.pick) return ephemeral(interaction, `You're locked in: **${describe(match, me.pick)}**. Waiting for the others...`);
    return interaction.reply(pickerView(match, me));
  }

  if (kind === 'go') {
    const [round, type, target] = rest;
    if (Number(round) !== match.round) return interaction.update({ content: '⌛ That round is over. Press **Choose your move** again.', components: [] });
    if (me.pick) return interaction.update({ content: `Already locked in: **${describe(match, me.pick)}**`, components: [] });
    const pick = { a: { type: 'attack', target }, b: { type: 'block' }, c: { type: 'charge' } }[type];
    if (!game.validPick(match.players, me, pick)) return interaction.update({ content: "That move isn't allowed right now. Press **Choose your move** again.", components: [] });

    me.pick = pick;
    me.afk = 0;
    await interaction.update({ content: `🔒 Locked in: **${describe(match, pick)}**. No take-backs!`, components: [] });

    if (match.players.every((p) => !p.alive || p.pick)) return resolve(match);
    await show(match, gameView(match));
  }
}

function describe(match, pick) {
  if (pick.type === 'attack') return `⚔️ Attack ${match.players.find((p) => p.id === pick.target)?.name}`;
  return { block: '🛡️ Block', charge: '⚡ Charge', idle: '💤 Nothing' }[pick.type];
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton()) await handleButton(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) ephemeral(interaction, 'Something went wrong.').catch(() => {});
  }
});

client.once(Events.ClientReady, (c) => console.log(`⚔️  Blade Rite Brawl is live as ${c.user.tag}`));

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
