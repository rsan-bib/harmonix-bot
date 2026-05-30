import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';

export const shuffle: Command = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Mezcla la cola (sin tocar el tema que está sonando)'),

  async execute({ interaction, state: guildState }) {
    if (!guildState || guildState.queue.length <= 2) {
      await interaction.reply('🔀 No hay temas suficientes en la cola para mezclar.');
      return;
    }

    // queue[0] es el tema sonando: lo dejamos fijo y barajamos del 1 en adelante (Fisher-Yates).
    const rest = guildState.queue.slice(1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    guildState.queue = [guildState.queue[0], ...rest];

    await interaction.reply(`🔀 Mezclé la cola (${rest.length} temas reordenados).`);
  },
};
