import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';

export const stop: Command = {
  needsVoice: true,
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la música y desconecta el bot'),

  async execute({ interaction, guildId, engine, state: guildState }) {
    if (!guildState) {
      await interaction.reply('❌ El bot no está conectado a ningún canal.');
      return;
    }

    engine.limpiarEstado(guildId);
    await interaction.reply(`🛑 **${engine.BOT_NAME}** se desconectó. Nos escuchamos.`);
  },
};
