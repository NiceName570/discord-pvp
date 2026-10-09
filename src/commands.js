const { SlashCommandBuilder } = require('discord.js');

const difficulty = (o) =>
  o.setName('difficulty').setDescription('How sharp the bots are').addChoices(
    { name: 'Easy', value: 'easy' },
    { name: 'Normal', value: 'normal' },
    { name: 'Hard', value: 'hard' },
  );

module.exports = [
  new SlashCommandBuilder()
    .setName('brawl')
    .setDescription('Open a free-for-all lobby (2-8 players). Last one standing wins!')
    .addIntegerOption((o) => o.setName('bots').setDescription('Bots to add (0-7)').setMinValue(0).setMaxValue(7))
    .addStringOption(difficulty),
  new SlashCommandBuilder()
    .setName('practice')
    .setDescription('Jump straight into a fight against bots')
    .addIntegerOption((o) => o.setName('bots').setDescription('How many bots (1-7, default 2)').setMinValue(1).setMaxValue(7))
    .addStringOption(difficulty),
  new SlashCommandBuilder().setName('howtoplay').setDescription('Learn the rules (30 seconds)'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top brawlers'),
].map((c) => c.toJSON());
