import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';

export const radio: Command = {
  needsVoice: true,
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Activa o desactiva el modo radio JS RADIO')
    .addStringOption((opt) =>
      opt.setName('accion').setDescription('on, off o joke').setRequired(false)
        .addChoices(
          { name: 'on — activa el DJ', value: 'on' },
          { name: 'off — desactiva el DJ', value: 'off' },
          { name: 'joke — chiste del DJ', value: 'joke' }
        )
    ),

  async execute({ interaction, guildId, engine, state: guildState }) {
    await interaction.deferReply();
    const accion = interaction.options.getString('accion') || 'toggle';

    if (accion === 'joke') {
      const chiste = engine.CHISTES[Math.floor(Math.random() * engine.CHISTES.length)];
      if (guildState?.textChannel) {
        guildState.textChannel.send(`🎙️ **JS RADIO DJ:** ${chiste}`).catch(() => {});
        // También reproducir como audio
        engine.playDjAnnouncement(guildId, 'joke');
      }
      await interaction.editReply(`🎙️ DJ dice: "${chiste}"`);
      return;
    }

    let nuevoEstado = true;

    if (accion === 'off') {
      nuevoEstado = false;
    } else if (accion === 'on') {
      nuevoEstado = true;
    } else {
      nuevoEstado = !guildState?.radioMode;
    }

    if (!guildState) {
      await interaction.editReply(
        '❌ Primero usá `/play` para conectar el bot a un canal de voz.'
      );
      return;
    }

    guildState.radioMode = nuevoEstado;

    if (nuevoEstado) {
      // La playlist base ya se cargó al conectar (ensureGuild); solo recargamos si quedó vacía.
      if (guildState.basePlaylistTrackQueries.length === 0) {
        guildState.basePlaylistTrackQueries = await engine.getRadioPlaylistTracks();
      }

      // Radio sembrada: si ya hay un tema elegido, armamos la cola de parecidos ya.
      if (guildState.seedTrack) {
        await engine.refillRadioQueue(guildId);
      }

      // Si el bot estaba quieto (sin tema sonando) pero ahora hay cola, arrancá:
      // sin esto, /radio on con el bot idle dejaba una cola llena sonando a nada.
      if (!guildState.currentTrack && !guildState.isTransitioning && guildState.queue.length > 0) {
        await engine.playNextFromQueue(guildId);
      }

      if (guildState.textChannel) {
        await guildState.textChannel.send({
          content: `🔥 **JS RADIO — Modo Radio ACTIVADO** 🔥\n` +
                   `🎙️ El DJ está en la casa! Bass Arena mode: ON\n` +
                   `🎵 La mejor música sin parar.\n` +
                   `📢 Usá \`/radio joke\` para un chiste del DJ.`,
        });
      }

      // DJ intro
      setTimeout(() => engine.playDjAnnouncement(guildId, 'intro'), 2000);

      await interaction.editReply({
        content: `🔥 **JS RADIO modo radio: ON**\n` +
                 `🎙️ El DJ te va a acompañar cada tema con anuncios y más.`,
      });
    } else {
      if (guildState.textChannel) {
        await guildState.textChannel.send({
          content: `🔇 **JS RADIO — Modo Radio DESACTIVADO**\n` +
                   `🎙️ El DJ se va a tomar un break. Siguiente tema: sin anuncios.`,
        });
      }
      await interaction.editReply(`🔇 **JS RADIO modo radio: OFF**`);
    }
  },
};
