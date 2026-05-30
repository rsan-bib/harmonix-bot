import { SlashCommandBuilder } from 'discord.js';
import { AudioPlayerStatus } from '@discordjs/voice';
import type { Command } from '../types';

export const pause: Command = {
  needsVoice: true,
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa la reproducción'),

  async execute({ interaction, state: guildState }) {
    if (!guildState || !guildState.currentTrack) {
      await interaction.reply('❌ No está sonando nada para pausar.');
      return;
    }

    if (guildState.player.state.status === AudioPlayerStatus.Paused) {
      await interaction.reply('⏸️ Ya estaba pausado. Usá `/resume` para retomar.');
      return;
    }

    // pause() deja el player en Paused (no Idle), así que NO dispara onTrackEnd:
    // la cola no avanza durante la pausa.
    guildState.player.pause();
    await interaction.reply(`⏸️ Pausé "${guildState.currentTrack.title}". Usá \`/resume\` para seguir.`);
  },
};
