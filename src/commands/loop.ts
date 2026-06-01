import { SlashCommandBuilder } from 'discord.js';
import type { Command, LoopMode } from '../types';
import { LOOP_DESCRIPTION } from './labels';

export const loop: Command = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Repite el tema actual, toda la cola, o desactiva el loop')
    .addStringOption((opt) =>
      opt
        .setName('modo')
        .setDescription('off, track o queue')
        .setRequired(true)
        .addChoices(
          { name: 'off — sin repetición', value: 'off' },
          { name: 'track — repite el tema actual', value: 'track' },
          { name: 'queue — repite toda la cola', value: 'queue' }
        )
    ),

  async execute({ interaction, state: guildState }) {
    if (!guildState) {
      await interaction.reply('❌ El bot no está conectado a ningún canal.');
      return;
    }

    const modo = interaction.options.getString('modo', true) as LoopMode;
    guildState.loopMode = modo;

    const nota = guildState.radioMode && modo !== 'off'
      ? '\n\n⚠️ Ojo: con el **modo radio activo** el auto-relleno manda y el loop se ignora.'
      : '';

    await interaction.reply(`${LOOP_DESCRIPTION[modo]}${nota}`);
  },
};
