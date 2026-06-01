import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types';

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra todos los comandos disponibles'),

  async execute({ interaction, engine }) {
    const msg = [
      `**${engine.BOT_NAME} — Comandos**`,
      '',
      '🎵 **/play** `cancion:` [título/URL] `fuente:` auto|yt|sp|scld',
      '   › *auto*: busca en Spotify→YouTube, YouTube y SoundCloud',
      '   › *yt*: solo YouTube · *sp*: solo Spotify · *scld*: solo SoundCloud',
      '🔥 **/radio** `accion:` on|off|joke',
      '   › *on*: activa el DJ y arma una cola de temas PARECIDOS al actual',
      '   › *off*: desactiva el DJ · *joke*: chiste del DJ',
      '',
      '**Reproducción**',
      '⏸️ **/pause** — pausa · ▶️ **/resume** — reanuda',
      '⏭️ **/skip** — salta al siguiente tema',
      '🔊 **/volume** `nivel:` 0–200 — ajusta el volumen (100 = normal)',
      '🔁 **/loop** `modo:` off|track|queue — repite el tema o la cola',
      '🛑 **/stop** — detiene la música y desconecta el bot',
      '',
      '**Cola**',
      '📋 **/queue** — muestra los temas en cola',
      '🎶 **/nowplaying** — el tema actual con embed',
      '🔀 **/shuffle** — mezcla la cola (sin tocar el actual)',
      '🗑️ **/remove** `posicion:` — saca un tema de la cola',
      '🧹 **/clear** — vacía la cola (deja sonando el actual)',
      '',
      '❓ **/help** — muestra esta ayuda',
    ].join('\n');

    await interaction.reply({ content: msg, ephemeral: true });
  },
};
