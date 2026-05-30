import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';
import { LOOP_TAG } from './labels';

export const queue: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Muestra los temas en cola'),

  async execute({ interaction, state: guildState }) {
    if (!guildState || guildState.queue.length === 0) {
      await interaction.reply('📭 La cola está vacía. Usá `/play` para agregar temas.');
      return;
    }

    const canciones = guildState.queue
      .map((t, i) => `**${i + 1}.** ${t.title} [${t.duration}] — ${t.source}`)
      .join('\n');

    const modoRadio = guildState.radioMode ? '\n\n🔥 **Modo Radio: ON** (el DJ te acompaña!)' : '';
    const loop = LOOP_TAG[guildState.loopMode] || '';

    await interaction.reply({
      content: `📋 **Cola de reproducción:**\n${canciones}${modoRadio}${loop}`,
    });
  },
};
