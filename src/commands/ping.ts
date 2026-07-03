import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types/command';

export const ping: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Shows the bot WebSocket and API latency'),
  async execute(interaction: ChatInputCommandInteraction) {
    const wsPing = interaction.client.ws.ping;
    const sent = await interaction.reply({ content: 'Measuring...', fetchReply: true });
    const apiPing = sent.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply(`🏓 Pong!\n> **WebSocket:** ${wsPing}ms\n> **API Round-trip:** ${apiPing}ms`);
  },
};
