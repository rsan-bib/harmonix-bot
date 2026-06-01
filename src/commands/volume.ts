import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';

export const volume: Command = {
  needsVoice: true,
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta el volumen (0–200%, 100 = normal)')
    .addIntegerOption((opt) =>
      opt
        .setName('nivel')
        .setDescription('Porcentaje de 0 a 200 (100 = volumen normal)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(200)
    ),

  async execute({ interaction, state: guildState }) {
    if (!guildState) {
      await interaction.reply('❌ El bot no está conectado a ningún canal.');
      return;
    }

    const nivel = interaction.options.getInteger('nivel', true);
    guildState.volume = nivel / 100;

    // Cambio en vivo sin reiniciar ffmpeg (requiere inlineVolume en el resource).
    // Se persiste en guildState.volume para que el próximo tema arranque igual.
    guildState.currentResource?.volume?.setVolume(guildState.volume);

    await interaction.reply(`🔊 Volumen al **${nivel}%**.`);
  },
};
