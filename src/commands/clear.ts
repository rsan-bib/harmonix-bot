import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';

export const clear: Command = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Vacía la cola (deja sonando el tema actual)'),

  async execute({ interaction, state: guildState }) {
    if (!guildState || guildState.queue.length <= 1) {
      await interaction.reply('📭 La cola ya está vacía.');
      return;
    }

    const quitados = guildState.queue.length - 1;
    // Dejamos solo queue[0] (el tema sonando).
    guildState.queue = guildState.queue.slice(0, 1);

    await interaction.reply(`🧹 Limpié la cola (${quitados} temas eliminados). Sigue sonando el tema actual.`);
  },
};
