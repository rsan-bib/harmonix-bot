import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';

export const skip: Command = {
  needsVoice: true,
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta al siguiente tema'),

  async execute({ interaction, engine, state: guildState }) {
    if (!guildState || !guildState.currentTrack) {
      await interaction.reply('❌ No está sonando nada para saltar.');
      return;
    }

    // Un skip manual ignora loop='track' esta vez (onTrackEnd lo consume y resetea).
    guildState.skipRequested = true;
    engine.killFfmpeg(guildState);
    guildState.player.stop();
    await interaction.reply(`⏭️ Salté "${guildState.currentTrack.title}".`);
  },
};
