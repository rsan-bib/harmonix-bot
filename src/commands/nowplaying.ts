import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';

export const nowplaying: Command = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Muestra el tema que está sonando ahora'),

  async execute({ interaction, engine, state: guildState }) {
    if (!guildState || !guildState.currentTrack) {
      await interaction.reply('❌ No está sonando nada ahora.');
      return;
    }

    const track = guildState.currentTrack;
    const embed = engine.buildPlayingEmbed(track, guildState.radioMode);

    await interaction.reply({ embeds: [embed] });
  },
};
