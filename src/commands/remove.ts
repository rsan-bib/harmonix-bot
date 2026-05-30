import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';

export const remove: Command = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Saca un tema de la cola por su posición')
    .addIntegerOption((opt) =>
      opt
        .setName('posicion')
        .setDescription('Número del tema en /queue (2 o mayor)')
        .setRequired(true)
        .setMinValue(2)
    ),

  async execute({ interaction, state: guildState }) {
    if (!guildState || guildState.queue.length === 0) {
      await interaction.reply('📭 La cola está vacía.');
      return;
    }

    const posicion = interaction.options.getInteger('posicion', true);

    // La posición 1 es el tema sonando: para sacarlo se usa /skip.
    if (posicion === 1) {
      await interaction.reply('❌ Ese es el tema actual. Usá `/skip` para saltarlo.');
      return;
    }

    if (posicion > guildState.queue.length) {
      await interaction.reply(`❌ La cola tiene ${guildState.queue.length} temas. No existe la posición ${posicion}.`);
      return;
    }

    const [eliminado] = guildState.queue.splice(posicion - 1, 1);
    await interaction.reply(`🗑️ Saqué "${eliminado.title}" de la cola.`);
  },
};
