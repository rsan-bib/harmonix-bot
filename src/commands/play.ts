import { SlashCommandBuilder, TextChannel } from 'discord.js';
import type { VoiceBasedChannel } from 'discord.js';
import type { Command, Track } from '../types';

export const play: Command = {
  needsVoice: true,
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce música')
    .addStringOption((opt) =>
      opt.setName('cancion').setDescription('Nombre del tema o URL').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('fuente')
        .setDescription('auto, yt, sp o scld')
        .setRequired(false)
        .addChoices(
          { name: 'auto — Spotify, YouTube, SoundCloud', value: 'auto' },
          { name: 'yt — solo YouTube', value: 'yt' },
          { name: 'sp — solo Spotify', value: 'sp' },
          { name: 'scld — solo SoundCloud', value: 'scld' }
        )
    ),

  async execute({ interaction, guildId, member, engine }) {
    await interaction.deferReply();
    const query = interaction.options.getString('cancion', true);
    const fuente = interaction.options.getString('fuente') || 'auto';
    const voiceChannel = member.voice?.channel as VoiceBasedChannel;
    const textChannel = interaction.channel as TextChannel;

    try {
      const esUrl = /^https?:\/\//.test(query);
      let tracksToQueue: { track: Track; fuenteHallazgo: string }[] = [];

      if (esUrl) {
        const urlFuente = engine.detectarFuente(query);

        if (urlFuente === 'Spotify') {
          const info = await engine.resolveSpotifyUrl(query);
          if (info && info.tracks.length > 0) {
            for (const t of info.tracks) {
              const ytQuery = `${t.artist} - ${t.name}`;
              const ytTrack = await engine.searchYouTube(ytQuery);
              if (ytTrack) {
                tracksToQueue.push({
                  track: { ...ytTrack, source: 'Spotify' },
                  fuenteHallazgo: info.isPlaylist
                    ? `Spotify Playlist → YouTube (${t.name})`
                    : `Spotify → YouTube (${t.name} — ${t.artist})`,
                });
              }
            }
          }
        } else if (urlFuente === 'SoundCloud') {
          const scTrack = await engine.searchSoundCloud(query);
          if (scTrack) {
            tracksToQueue.push({
              track: scTrack,
              fuenteHallazgo: 'SoundCloud (URL directa)',
            });
          }
        } else {
          // YouTube URL: obtener metadata completa
          const meta = await engine.getTrackMetadata(query);
          tracksToQueue.push({
            track: {
              title: meta?.title || query,
              url: query,
              duration: meta?.duration || '?',
              source: 'YouTube',
              thumbnail: meta?.thumbnail,
              artist: meta?.artist,
            },
            fuenteHallazgo: 'YouTube (URL directa)',
          });
        }
      } else {
        // Búsqueda por texto
        if (fuente === 'yt') {
          const track = await engine.searchYouTube(query);
          if (track) tracksToQueue.push({ track, fuenteHallazgo: 'YouTube' });
        } else if (fuente === 'sp') {
          const s = await engine.searchSpotify(query);
          if (s) {
            const yt = await engine.searchYouTube(`${s.artist} - ${s.name}`);
            if (yt) {
              tracksToQueue.push({
                track: { ...yt, source: 'Spotify' },
                fuenteHallazgo: `Spotify → YouTube (${s.name} — ${s.artist})`,
              });
            }
          }
        } else if (fuente === 'scld') {
          const track = await engine.searchSoundCloud(query);
          if (track) tracksToQueue.push({ track, fuenteHallazgo: 'SoundCloud' });
        } else {
          // auto: 3 fuentes en paralelo
          const [spotify, ytResult, scResult] = await Promise.all([
            engine.searchSpotify(query).then(async (s) => {
              if (!s) return null;
              const yt = await engine.searchYouTube(`${s.artist} - ${s.name}`);
              if (!yt) return null;
              return { track: { ...yt, source: 'Spotify' as const }, fuente: `Spotify → YouTube (${s.name} — ${s.artist})` };
            }),
            engine.searchYouTube(query).then((yt) => {
              if (!yt) return null;
              return { track: yt, fuente: 'YouTube' };
            }),
            engine.searchSoundCloud(query).then((sc) => {
              if (!sc) return null;
              return { track: sc, fuente: 'SoundCloud' };
            }),
          ]);
          const ganador = spotify || ytResult || scResult;
          if (ganador) tracksToQueue.push({ track: ganador.track, fuenteHallazgo: ganador.fuente });
        }
      }

      if (tracksToQueue.length === 0) {
        await interaction.editReply(`❌ No encontré "${query}" en ninguna plataforma.`);
        return;
      }

      // ── Obtener o crear estado del guild ───────────────────────────────
      const estado = await engine.ensureGuild(guildId, voiceChannel, textChannel);

      // Agregar tracks a la cola
      const firstTrack = tracksToQueue[0].track;
      const newTracks = tracksToQueue.map((t) => t.track);

      if (estado.radioMode && estado.currentTrack) {
        // En modo radio, los pedidos del usuario van JUSTO DESPUÉS de la actual,
        // por encima de los temas auto-rellenados de la playlist base.
        // queue[0] es la track actual sonando; insertamos en queue[1].
        const insertAt = estado.queue[0] === estado.currentTrack ? 1 : 0;
        estado.queue.splice(insertAt, 0, ...newTracks);
      } else {
        estado.queue.push(...newTracks);
      }

      // El último tema pedido por el usuario es la semilla de la radio sembrada.
      estado.seedTrack = firstTrack;

      if (estado.currentTrack === null && !estado.isTransitioning) {
        await engine.playNextFromQueue(guildId);
      }

      // Mensaje de confirmación con embed
      const embed = engine.buildPlayingEmbed(firstTrack, estado.radioMode);

      if (tracksToQueue.length === 1) {
        await interaction.editReply({
          content: `🎵 **${engine.BOT_NAME}** — ${tracksToQueue[0].fuenteHallazgo}`,
          embeds: [embed],
        });
      } else {
        await interaction.editReply({
          content: `🎵 **${engine.BOT_NAME}**: "${firstTrack.title}" + ${tracksToQueue.length - 1} temas más agregados a la cola.`,
          embeds: [embed],
        });
      }
    } catch (err: any) {
      console.error('Error en /play:', err);
      await interaction.editReply(`❌ Error al reproducir: ${err.message || 'Error desconocido'}`);
    }
  },
};
