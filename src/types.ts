// Tipos de dominio compartidos entre bot.ts y los comandos.
// Se mantienen acá (no en bot.ts) para que los archivos de comando los importen
// con `import type` sin generar un ciclo de imports en runtime.

import type {
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  VoiceBasedChannel,
  RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import type { AudioPlayer, VoiceConnection, AudioResource } from '@discordjs/voice';
import type { ChildProcess } from 'child_process';

export interface Track {
  title: string;
  url: string;
  duration: string;
  source: 'YouTube' | 'Spotify' | 'SoundCloud';
  // Metadata extra
  thumbnail?: string;
  artist?: string;
  playlist?: string;
}

export type LoopMode = 'off' | 'track' | 'queue';

export interface GuildState {
  player: AudioPlayer;
  connection: VoiceConnection;
  queue: Track[];
  currentTrack: Track | null;
  isTransitioning: boolean;
  textChannel: TextChannel | null;
  ffmpegProcess: ChildProcess | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  voiceChannelId: string | null;
  // Radio mode
  radioMode: boolean;
  basePlaylistTrackQueries: string[];
  // Ducking real: necesitamos saber URL y posición para rearrancar ffmpeg con -ss
  currentMusicUrl: string | null;
  trackStartedAt: number; // ms epoch cuando el player entró en Playing
  commentScheduled: boolean; // 1 comentario con ducking por canción máximo
  lastDjVoice: number; // índice en PIPER_MODELS de la última voz usada (para alternar el dúo)
  // ── Controles nuevos ──────────────────────────────────────────────────────
  volume: number; // 0.0–2.0, default 1.0 (requiere inlineVolume en el resource)
  loopMode: LoopMode; // off | track | queue
  currentResource: AudioResource | null; // ref del resource activo para volumen en vivo
  skipRequested: boolean; // true cuando un /skip manual debe ignorar loop='track' una vez
  // Radio sembrada: tema base para generar la cola de "parecidos"
  seedTrack: Track | null;
}

export interface SpotifyTrackRef {
  name: string;
  artist: string;
  id: string;
}

export interface SpotifyUrlResult {
  tracks: SpotifyTrackRef[];
  isPlaylist: boolean;
  playlistName?: string;
}

export interface TrackMetadata {
  title?: string;
  duration?: string;
  thumbnail?: string;
  artist?: string;
}

export type AnnouncementType = 'intro' | 'next' | 'joke' | 'comment';

// El motor (audio, búsqueda, TTS, estado) vive en bot.ts y se expone a los
// comandos a través de este contrato. Los comandos NO importan bot.ts: reciben
// el motor en runtime vía CommandContext.engine.
export interface Engine {
  estados: Map<string, GuildState>;
  BOT_NAME: string;
  CHISTES: string[];
  // Búsqueda / resolución
  searchYouTube(query: string): Promise<Track | null>;
  searchSpotify(query: string): Promise<SpotifyTrackRef | null>;
  searchSoundCloud(query: string): Promise<Track | null>;
  resolveSpotifyUrl(url: string): Promise<SpotifyUrlResult | null>;
  getTrackMetadata(url: string): Promise<TrackMetadata | null>;
  detectarFuente(url: string): 'YouTube' | 'Spotify' | 'SoundCloud';
  getRadioPlaylistTracks(): Promise<string[]>;
  // Presentación
  buildPlayingEmbed(track: Track, isRadio: boolean): EmbedBuilder;
  // DJ / radio
  playDjAnnouncement(guildId: string, tipo: AnnouncementType, track?: Track): Promise<void>;
  refillRadioQueue(guildId: string): Promise<void>;
  // Playback / estado
  ensureGuild(
    guildId: string,
    voiceChannel: VoiceBasedChannel,
    textChannel: TextChannel
  ): Promise<GuildState>;
  playNextFromQueue(guildId: string): Promise<void>;
  killFfmpeg(estado: GuildState): void;
  limpiarEstado(guildId: string): void;
}

// Contrato mínimo que bot.ts necesita del builder de slash command:
// el nombre (para el dispatch) y toJSON (para el registro). Tiparlo así evita
// las incompatibilidades de los builders encadenados (addStringOption, etc.).
export interface SlashCommandLike {
  name: string;
  toJSON(): RESTPostAPIApplicationCommandsJSONBody;
}

export interface CommandContext {
  interaction: ChatInputCommandInteraction;
  guildId: string;
  member: GuildMember;
  state: GuildState | undefined;
  engine: Engine;
}

export interface Command {
  data: SlashCommandLike;
  needsVoice?: boolean;
  execute(ctx: CommandContext): Promise<void>;
}
