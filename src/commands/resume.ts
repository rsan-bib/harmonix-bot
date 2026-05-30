import { SlashCommandBuilder } from 'discord.js';
import { AudioPlayerStatus } from '@discordjs/voice';
import type { Command } from '../types';

export const resume: Command = {
  needsVoice: true,
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Reanuda la reproducción pausada'),

  async execute({ interaction, state: guildState }) {
    if (!guildState || !guildState.currentTrack) {
      await interaction.reply('❌ No hay nada para reanudar.');
      return;
    }

    if (guildState.player.state.status !== AudioPlayerStatus.Paused) {
      await interaction.reply('▶️ No estaba pausado.');
      return;
    }

    guildState.player.unpause();
    await interaction.reply(`▶️ Retomando "${guildState.currentTrack.title}".`);
  },
};
