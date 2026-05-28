import dotenv from 'dotenv';
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
  EmbedBuilder,
} from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  AudioPlayer,
  VoiceConnection,
} from '@discordjs/voice';
import ytSearch from 'yt-search';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

// ─── Config ───────────────────────────────────────────────────────────────────
const BOT_NAME = 'JS RADIO';
// Rutas de binarios externos. En Windows apuntan a los .exe locales; en
// cualquier otra plataforma (ej. Termux/Android) se resuelven desde el PATH.
// Override explícito vía .env (YTDLP / FFMPEG / FFPROBE) tiene prioridad.
const IS_WIN = process.platform === 'win32';
const YTDLP = process.env.YTDLP || (IS_WIN ? 'C:\\Users\\Roko\\yt-dlp\\yt-dlp.exe' : 'yt-dlp');
const FFMPEG = process.env.FFMPEG || (IS_WIN ? 'C:\\Users\\Roko\\ffmpeg\\ffmpeg.exe' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE || (IS_WIN ? 'C:\\Users\\Roko\\ffmpeg\\ffprobe.exe' : 'ffprobe');
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const RADIO_PLAYLIST_ID = '5HoC05C0PLSxNlxiJ3QABu';
// TTS en cascada: Azure Neural (principal, voz orgánica es-CL) → Google Translate TTS → SAPI offline.
// Azure necesita AZURE_SPEECH_KEY + AZURE_SPEECH_REGION en .env; si faltan, arranca directo en gTTS.
// El endpoint WSS gratuito de Edge TTS quedó devolviendo 403 server-side, por eso ya no se usa.
// Voces chilenas: es-CL-CatalinaNeural (femenina) o es-CL-LorenzoNeural (masculina).
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || '';
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || '';
const AZURE_TTS_VOICE = process.env.AZURE_TTS_VOICE || 'es-CL-CatalinaNeural';
// Piper: TTS neural LOCAL (offline, gratis, ilimitado, sin cuenta). Motor principal efectivo.
// Voz por defecto: es_MX (mexicano neutro, no argentino). Override de rutas/voz via .env.
const PIPER_EXE = process.env.PIPER_EXE || 'C:\\Users\\Roko\\piper\\piper\\piper.exe';
const PIPER_MODEL = process.env.PIPER_MODEL || 'C:\\Users\\Roko\\piper\\models\\es_MX-claude-high.onnx';
// Segundo comentador (dúo): voz distinta. Si existe, se habilita el modo dúo.
const PIPER_MODEL_2 = process.env.PIPER_MODEL_2 || 'C:\\Users\\Roko\\piper\\models\\es_MX-ald-medium.onnx';
const PIPER_AVAILABLE = existsSync(PIPER_EXE) && existsSync(PIPER_MODEL);
// Lista de voces de DJ disponibles (1 o 2). Con 2 se activan diálogos y turnos entre comentadores.
const PIPER_MODELS = [PIPER_MODEL, PIPER_MODEL_2].filter((m) => existsSync(m));
const DUO_ENABLED = PIPER_AVAILABLE && PIPER_MODELS.length >= 2;
// Override via .env: TTS_LANG=es (es, es-419, etc.) y SAPI_VOICE='Microsoft Sabina Desktop'.
const TTS_LANG = process.env.TTS_LANG || 'es';
const SAPI_VOICE = process.env.SAPI_VOICE || 'Microsoft Sabina Desktop';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Track {
  title: string;
  url: string;
  duration: string;
  source: 'YouTube' | 'Spotify' | 'SoundCloud';
  // Metadata extra
  thumbnail?: string;
  artist?: string;
  playlist?: string;
}

interface GuildState {
  player: AudioPlayer;
  connection: VoiceConnection;
  queue: Track[];
  currentTrack: Track | null;
  isTransitioning: boolean;
  textChannel: TextChannel | null;
  ffmpegProcess: ReturnType<typeof spawn> | null;
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
}

// ─── Estado ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const estados = new Map<string, GuildState>();

const audioUrlCache = new Map<string, { audioUrl: string; resolvedAt: number }>();
const CACHE_TTL = 30 * 60 * 1000;

let spotifyToken: string | null = null;
let spotifyTokenExpires = 0;

// ─── Sistema de chistes ───────────────────────────────────────────────────────
const CHISTES = [
  '¿Por qué los peces no usan redes WiFi? Porque se conectan desde el mar.',
  'Mi jugador favorito es Ctrl+C y Ctrl+V.',
  '¿Qué le dijo un emoji al otro? No sé, yo no miento.',
  'El DJ más fuerte del mundo es Ctrl+Alt+Del.',
  'Le pregunté a Spotify qué era el amor. Me dijo: Error 404, canción no encontrada.',
  '¿Por qué el DJ nunca pierde? Porque siempre tiene el control.',
  'Mi playlist de motivación tiene 0 canciones. Solo tiene archivos vacíos.',
  'El único que puede manejar dosmil canciones a la vez soy yo. Bueno, el bot.',
  '¿Qué hace un DJ en el gimnasio? Bicep-peats.',
  'Me compré unos auriculares nuevos. Ahora escucho el doble. No mejor, el doble.',
  'En JS RADIO no hay pausa para el café. Solo hay pausa para el bajo.',
  'El bass es tan fuerte que hasta los vecinos cambiaron de canción.',
  '¿Cuál es el animal más musical? El cerdito. Porque hace oink sound.',
  'Le dije a mi canción: no me dejes. Me dijo: estás en repeat.',
  'En esta radio el único que se repite soy yo. Ah no, eso también.',
  '¿Cómo se llama el DJ más grande del universo? DJ Dj universo.',
  'Le pregunté a la bocina qué era el volumen. Me dijo: yo no soy sorda, subile.',
  'El subwoofer me dijo que tiene problemas de confianza. Le falta auto-estima.',
  '¿Qué hace un配bajo en una fiesta? Hace reVERB.',
  'Le dije al beat: ponete las pilas. Me dijo: estoy en standby desde el measure uno.',
  '¿Por qué los DJs no envejecen? Porque siempre están en el loop.',
  'JS RADIO tiene la mejor señal. Si no la escuchás, es tu playlist la que está mal.',
];

// ─── Templates de comentarios del DJ (contextuales por canción) ───────────────
type TemplateCtx = { title: string; artist: string };
type Template = (ctx: TemplateCtx) => string;

// Antes de la próxima canción (entre temas, sin música sonando)
const NEXT_TEMPLATES: Template[] = [
  ({ title, artist }) => `Y ahora les traemos ${title}, de ${artist}, en JS RADIO!`,
  ({ title, artist }) => `Le metemos ${artist} con ${title}. ¡Qué tema!`,
  ({ title, artist }) => `Acá viene ${title}. ${artist} no falla nunca, eh.`,
  ({ title, artist }) => `Lo que sigue: ${title}, por ${artist}. Quédense conmigo.`,
  ({ title, artist }) => `Atención, que arranca ${title}, ${artist} la rompe en JS RADIO!`,
  ({ title, artist }) => `Tema imperdible: ${title} de ${artist}. ¡Subí el volumen!`,
  ({ title, artist }) => `${artist} se pone serio. Ahí va ${title}.`,
  ({ title, artist }) => `Y dale con ${title}! ${artist}, para variar.`,
  ({ title, artist }) => `Suena en JS RADIO: ${title}, de ${artist}. Disfrutá.`,
  ({ title, artist }) => `Vamos con ${artist}, ${title}. Otro clásico.`,
];

// Comentarios sueltos durante la canción (con ducking — música baja, DJ habla, música vuelve)
const COMMENT_TEMPLATES: Template[] = [
  ({ title }) => `Qué tremendo este pedazo de ${title}, ¿no?`,
  ({ artist }) => `${artist} siempre con buen material, en JS RADIO.`,
  ({ title, artist }) => `Esto es ${artist}, con ${title}. ¡Pegada de tema!`,
  ({ artist }) => `Le ponemos onda a ${artist}, qué laburo.`,
  () => `Quédense conmigo en JS RADIO, que esto recién empieza.`,
  ({ title }) => `${title}... un temazo, sin vueltas.`,
  ({ artist }) => `Si te gusta ${artist}, esta es tu radio.`,
  () => `JS RADIO, la mejor música sin parar. ¡A toda hora!`,
  ({ title, artist }) => `Sonando: ${title} de ${artist}. Y vienen más.`,
];

// Intro al activar /radio on
const INTRO_TEMPLATES: string[] = [
  '¡Bienvenidos a JS RADIO! La mejor música, sin parar.',
  '¡Arrancamos en JS RADIO! Pongan el volumen donde tiene que estar.',
  'JS RADIO está en el aire. Quédense con nosotros, va a estar bueno.',
  '¡Empezó la fiesta en JS RADIO! Vamos con todo.',
];

function pickTemplate(list: Template[], ctx: TemplateCtx): string {
  if (list.length === 0) return '';
  const fn = list[Math.floor(Math.random() * list.length)];
  return fn(ctx);
}

function pickIntro(): string {
  return INTRO_TEMPLATES[Math.floor(Math.random() * INTRO_TEMPLATES.length)];
}

// ─── Diálogos del dúo (DJ1 ↔ DJ2) ──────────────────────────────────────────────
// Cada función devuelve líneas alternadas: índice par = DJ1, índice impar = DJ2.

// Banter antes de la próxima canción.
const NEXT_DIALOGUES: ((ctx: TemplateCtx) => string[])[] = [
  ({ title, artist }) => [
    `¿Sabés qué se viene ahora?`,
    `Sorprendeme.`,
    `${title}, de ${artist}.`,
    `¡Uy, tremendo tema! Dale que va.`,
  ],
  ({ title, artist }) => [
    `Preparate que esto se pone bueno.`,
    `¿Qué tenés ahí?`,
    `${artist}, con ${title}.`,
    `¡En JS RADIO no se falla nunca!`,
  ],
  ({ title }) => [
    `Va una que nos encanta.`,
    `¿Cuál, cuál?`,
    `${title}. Subile al volumen.`,
    `¡Eso! Que se escuche en todo el barrio.`,
  ],
  ({ title, artist }) => [
    `Pedido especial para la audiencia.`,
    `Contales qué suena.`,
    `${title}, de ${artist}, ahí va.`,
    `¡Aguante JS RADIO!`,
  ],
];

// Banter de apertura al activar /radio on.
const INTRO_DIALOGUES: (() => string[])[] = [
  () => [
    `¡Bienvenidos a JS RADIO!`,
    `¿Cómo andan, escuchas?`,
    `Arrancamos con todo, quédense con nosotros.`,
    `¡La mejor música, sin parar!`,
  ],
  () => [
    `JS RADIO está en el aire.`,
    `Y nosotros dos, para acompañarlos.`,
    `Pongan el volumen donde tiene que estar.`,
    `¡Vamos que esto recién empieza!`,
  ],
];

// Elige y alterna la voz del DJ (índice en PIPER_MODELS). Con una sola voz devuelve siempre esa.
function nextDjModel(estado: GuildState): string {
  if (!DUO_ENABLED) return PIPER_MODEL;
  estado.lastDjVoice = estado.lastDjVoice === 0 ? 1 : 0;
  return PIPER_MODELS[estado.lastDjVoice];
}

// Construye los turnos de un diálogo (texto + voz alternada) para 'next' o 'intro'. null si no aplica.
function buildDialogueTurns(
  tipo: AnnouncementType,
  estado: GuildState,
  track?: Track
): { texto: string; model: string }[] | null {
  if (!DUO_ENABLED) return null;
  let lines: string[] = [];
  if (tipo === 'next') {
    const next = track || estado.queue[0];
    if (!next) return null;
    const fn = NEXT_DIALOGUES[Math.floor(Math.random() * NEXT_DIALOGUES.length)];
    lines = fn({ title: next.title, artist: next.artist || 'el artista' });
  } else if (tipo === 'intro') {
    const fn = INTRO_DIALOGUES[Math.floor(Math.random() * INTRO_DIALOGUES.length)];
    lines = fn();
  }
  if (!lines.length) return null;
  // Alterna voces empezando por DJ1.
  return lines.map((texto, i) => ({ texto, model: PIPER_MODELS[i % 2] }));
}

// ─── Spotify API ──────────────────────────────────────────────────────────────

async function getSpotifyToken(): Promise<string | null> {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;

  const now = Date.now();
  if (spotifyToken && now < spotifyTokenExpires) return spotifyToken;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) return null;

    const data: any = await res.json();
    spotifyToken = data.access_token;
    spotifyTokenExpires = now + (data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch {
    return null;
  }
}

async function searchSpotify(
  query: string
): Promise<{ name: string; artist: string; id: string } | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return null;

    const data: any = await res.json();
    if (data.tracks?.items?.length > 0) {
      const t = data.tracks.items[0];
      return { name: t.name, artist: t.artists[0].name, id: t.id };
    }
    return null;
  } catch {
    return null;
  }
}

// FIX: Resuelve playlists, albums y tracks
async function resolveSpotifyUrl(url: string): Promise<{
  tracks: { name: string; artist: string; id: string }[];
  isPlaylist: boolean;
  playlistName?: string;
} | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const trackMatch = url.match(/track\/([a-zA-Z0-9]+)/);
  const playlistMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);
  const albumMatch = url.match(/album\/([a-zA-Z0-9]+)/);

  try {
    if (playlistMatch) {
      const res = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistMatch[1]}/tracks?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      const data: any = await res.json();
      const playlistRes = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistMatch[1]}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const playlistData: any = playlistRes.ok ? await playlistRes.json() : {};
      return {
        tracks: data.items
          .filter((item: any) => item.track)
          .map((item: any) => ({
            name: item.track.name,
            artist: item.track.artists[0]?.name || 'Unknown',
            id: item.track.id,
          })),
        isPlaylist: true,
        playlistName: playlistData.name,
      };
    } else if (albumMatch) {
      const res = await fetch(
        `https://api.spotify.com/v1/albums/${albumMatch[1]}/tracks`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      const data: any = await res.json();
      return {
        tracks: data.items.map((t: any) => ({
          name: t.name,
          artist: t.artists[0]?.name || 'Unknown',
          id: t.id,
        })),
        isPlaylist: false,
      };
    } else if (trackMatch) {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${trackMatch[1]}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return {
        tracks: [{ name: data.name, artist: data.artists[0]?.name || 'Unknown', id: data.id }],
        isPlaylist: false,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Radio: obtener tracks de la playlist base ─────────────────────────────────
async function getRadioPlaylistTracks(): Promise<string[]> {
  const token = await getSpotifyToken();
  if (!token) return [];

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${RADIO_PLAYLIST_ID}/tracks?limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];

    const data: any = await res.json();
    return data.items
      .filter((item: any) => item.track)
      .map((item: any) => `${item.track.name} ${item.track.artists[0]?.name || ''}`);
  } catch {
    return [];
  }
}

// ─── YouTube con metadata rica via yt-dlp ─────────────────────────────────────
interface YtMetadata {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  artist: string;
  playlist?: string;
}

async function searchYouTube(query: string): Promise<Track | null> {
  try {
    const r = await ytSearch(query);
    if (r.videos.length === 0) return null;

    const v = r.videos[0];
    const mins = Math.floor(v.seconds / 60);
    const secs = v.seconds % 60;

    return {
      title: v.title,
      url: v.url,
      duration: `${mins}:${String(secs).padStart(2, '0')}`,
      source: 'YouTube',
      thumbnail: v.thumbnail,
      artist: v.author.name,
    };
  } catch {
    return null;
  }
}

// Obtener metadata completa con thumbnail y duracion precisa
async function getTrackMetadata(videoUrl: string): Promise<YtMetadata | null> {
  try {
    const { stdout } = await execAsync(
      `"${YTDLP}" --print "%(title)s\t%(uploader)s\t%(duration)s\t%(thumbnail)s\t%(playlist_title)s" -j --no-warnings "${videoUrl}"`,
      { timeout: 15000 }
    );

    const line = stdout.trim();
    if (!line || line.startsWith('ERROR') || line.startsWith('WARNING')) return null;

    const parts = line.split('\t');
    if (parts.length < 3) return null;

    const durationSecs = parseInt(parts[2]) || 0;
    const mins = Math.floor(durationSecs / 60);
    const secs = durationSecs % 60;

    return {
      title: parts[0] || 'Unknown',
      url: videoUrl,
      artist: parts[1] || 'Unknown',
      duration: `${mins}:${String(secs).padStart(2, '0')}`,
      thumbnail: parts[3] || '',
      playlist: parts[4] || '',
    };
  } catch {
    return null;
  }
}

// ─── SoundCloud ───────────────────────────────────────────────────────────────

async function searchSoundCloud(query: string): Promise<Track | null> {
  try {
    const { stdout } = await execAsync(
      `"${YTDLP}" --print "%(title)s\t%(webpage_url)s\t%(duration)s\t%(thumbnail)s" --no-warnings "scsearch1:${query}"`,
      { timeout: 15000 }
    );

    const line = stdout.trim();
    if (!line || line.startsWith('ERROR')) return null;

    const parts = line.split('\t');
    if (parts.length < 2) return null;

    const dur = parseInt(parts[2]) || 0;
    return {
      title: parts[0],
      url: parts[1],
      duration: `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`,
      source: 'SoundCloud',
      thumbnail: parts[3] || '',
    };
  } catch {
    return null;
  }
}

// ─── Detectar fuente por URL ──────────────────────────────────────────────────

function detectarFuente(url: string): 'YouTube' | 'Spotify' | 'SoundCloud' {
  if (url.includes('spotify.com')) return 'Spotify';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('soundcloud.com')) return 'SoundCloud';
  return 'YouTube';
}

// ─── Edge TTS + Ducking ───────────────────────────────────────────────────────

// Kill-switch del TTS. Cuando true, ningún anuncio del DJ se reproduce.
// TTS_DISABLED=1 en .env apaga por completo al DJ (música pura). Útil en
// Android/Termux, donde no hay Piper ni SAPI y solo se quiere música.
const TTS_DISABLED = process.env.TTS_DISABLED === '1';

// Volumen de la música mientras habla el DJ (0.0 - 1.0). 0.18 = ~18%
const DUCK_VOLUME = 0.18;

// Serializa los anuncios por guild para evitar que dos TTS se pisen
const announcementLocks = new Map<string, Promise<void>>();

type AnnouncementType = 'intro' | 'next' | 'joke' | 'comment';

function buildAnnouncementText(
  tipo: AnnouncementType,
  estado: GuildState,
  track?: Track
): string {
  switch (tipo) {
    case 'intro':
      return pickIntro();
    case 'joke':
      return CHISTES[Math.floor(Math.random() * CHISTES.length)];
    case 'next': {
      // El "next" se llama justo antes de arrancar la próxima — tomamos queue[0] o el track pasado.
      const next = track || estado.queue[0];
      if (!next) return '';
      return pickTemplate(NEXT_TEMPLATES, {
        title: next.title,
        artist: next.artist || 'el artista',
      });
    }
    case 'comment': {
      if (!track) return '';
      return pickTemplate(COMMENT_TEMPLATES, {
        title: track.title,
        artist: track.artist || 'el artista',
      });
    }
  }
}

async function playDjAnnouncement(
  guildId: string,
  tipo: AnnouncementType,
  track?: Track
) {
  if (TTS_DISABLED) {
    console.log(`🔇 TTS deshabilitado, saltando '${tipo}'`);
    return;
  }
  const estado = estados.get(guildId);
  if (!estado || !estado.radioMode) return;

  const texto = buildAnnouncementText(tipo, estado, track);
  if (!texto) return;

  // Lock por guild: anuncios serializados, nunca se pisan
  const prev = announcementLocks.get(guildId) || Promise.resolve();
  const run = prev.then(async () => {
    const e = estados.get(guildId);
    if (!e || !e.radioMode) return;

    const isMusicPlaying =
      e.player.state.status === AudioPlayerStatus.Playing &&
      !!e.currentMusicUrl &&
      !!e.ffmpegProcess;

    if (isMusicPlaying) {
      // Sobre la música (ducking): un solo comentador, alternando la voz.
      console.log(`🎙️  DJ habla con ducking (${tipo}): "${texto.slice(0, 60)}..."`);
      await speakWithDucking(guildId, texto, nextDjModel(e));
    } else if (DUO_ENABLED && (tipo === 'next' || tipo === 'intro') && Math.random() < 0.5) {
      // Entre canciones: 50% de las veces los dos comentadores dialogan.
      const turns = buildDialogueTurns(tipo, e, track);
      if (turns && turns.length) {
        console.log(`🎙️🎙️  Diálogo dúo (${tipo}), ${turns.length} turnos`);
        await speakDialogueSolo(guildId, turns);
      } else {
        await speakSolo(guildId, texto, nextDjModel(e));
      }
    } else {
      // Resto: un comentador solo, alternando la voz.
      console.log(`🎙️  DJ habla solo (${tipo}): "${texto.slice(0, 60)}..."`);
      await speakSolo(guildId, texto, nextDjModel(e));
    }
  });
  announcementLocks.set(guildId, run);
  try {
    await run;
  } finally {
    // Si no hay más anuncios encolados, limpiar el lock
    if (announcementLocks.get(guildId) === run) announcementLocks.delete(guildId);
  }
}

// Google Translate TTS limita a ~200 chars por request: partimos en frases sin cortar palabras.
function chunkText(texto: string, max = 180): string[] {
  const palabras = texto.trim().split(/\s+/);
  const chunks: string[] = [];
  let actual = '';
  for (const w of palabras) {
    const tentativo = actual ? `${actual} ${w}` : w;
    if (tentativo.length > max) {
      if (actual) chunks.push(actual);
      actual = w;
    } else {
      actual = tentativo;
    }
  }
  if (actual) chunks.push(actual);
  return chunks.length ? chunks : [texto];
}

// Principal: Piper (TTS neural local). Escribe WAV; ffmpeg lo lee por contenido aunque el archivo sea .mp3.
// El texto va por stdin para evitar problemas de comillas/acentos. cwd = carpeta del exe (busca sus DLLs y espeak-ng-data ahí).
function generateWithPiper(outFile: string, texto: string, model: string = PIPER_MODEL): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PIPER_EXE, ['--model', model, '--output_file', outFile], {
      cwd: dirname(PIPER_EXE),
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let err = '';
    proc.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && existsSync(outFile)) resolve();
      else reject(new Error(`piper exit ${code}: ${err.slice(0, 150)}`));
    });
    proc.stdin?.write(texto, 'utf8');
    proc.stdin?.end();
  });
}

// Escapa caracteres reservados de XML para meter el texto del DJ dentro del SSML.
function escapeSsml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Principal: Azure Cognitive Services Speech (REST). Voz neural es-AR, orgánica y estable.
// Devuelve MP3; el endpoint acepta hasta ~10 min de audio por request, suficiente para el DJ.
async function generateWithAzure(outFile: string, texto: string): Promise<void> {
  if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
    throw new Error('Azure no configurado (AZURE_SPEECH_KEY/AZURE_SPEECH_REGION)');
  }
  const lang = AZURE_TTS_VOICE.split('-').slice(0, 2).join('-'); // es-AR-ElenaNeural -> es-AR
  const ssml =
    `<speak version='1.0' xml:lang='${lang}'>` +
    `<voice xml:lang='${lang}' name='${AZURE_TTS_VOICE}'>${escapeSsml(texto)}</voice>` +
    `</speak>`;

  const res = await fetch(
    `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'jsradio',
      },
      body: ssml,
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Azure TTS HTTP ${res.status} ${detail.slice(0, 120)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error('Azure devolvió audio vacío');
  await writeFile(outFile, buf);
}

// Baja un chunk de audio MP3 desde Google Translate TTS.
async function fetchGoogleTtsChunk(texto: string): Promise<Buffer> {
  const url =
    `https://translate.google.com/translate_tts?ie=UTF-8` +
    `&q=${encodeURIComponent(texto)}&tl=${encodeURIComponent(TTS_LANG)}&client=tw-ob`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`gTTS HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('audio')) throw new Error(`gTTS content-type inesperado: ${ct}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error('gTTS devolvió audio vacío');
  return buf;
}

// Primario: concatena los chunks MP3 de gTTS en un solo archivo (ffmpeg los decodifica seguidos).
async function generateWithGoogle(outFile: string, texto: string): Promise<void> {
  const chunks = chunkText(texto);
  const buffers: Buffer[] = [];
  for (const c of chunks) {
    buffers.push(await fetchGoogleTtsChunk(c));
    await new Promise((r) => setTimeout(r, 120)); // gentil con el endpoint
  }
  await writeFile(outFile, Buffer.concat(buffers));
}

// Fallback offline: SAPI de Windows (System.Speech). Escribe WAV; ffmpeg lo lee igual.
// Pasamos texto y script por archivos temporales para evitar el infierno de comillas en PowerShell.
async function generateWithSapi(outFile: string, texto: string): Promise<void> {
  const txtFile = outFile.replace(/\.[^.]+$/, '.txt');
  const ps1File = outFile.replace(/\.[^.]+$/, '.ps1');
  await writeFile(txtFile, texto, 'utf8');

  const script = [
    `Add-Type -AssemblyName System.Speech`,
    `$text = Get-Content -Raw -Encoding UTF8 '${txtFile}'`,
    `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer`,
    `try { $s.SelectVoice('${SAPI_VOICE}') } catch {}`,
    `$s.SetOutputToWaveFile('${outFile}')`,
    `$s.Speak($text)`,
    `$s.Dispose()`,
  ].join('\n');
  await writeFile(ps1File, script, 'utf8');

  try {
    await execAsync(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ps1File}"`,
      { timeout: 20000 }
    );
  } finally {
    setTimeout(() => {
      unlink(txtFile).catch(() => {});
      unlink(ps1File).catch(() => {});
    }, 5000);
  }
}

// Genera un archivo de audio del DJ en cascada: Azure (voz orgánica) → gTTS → SAPI offline.
// El archivo siempre se nombra .mp3 por compatibilidad con el resto del pipeline,
// pero ffmpeg detecta el formato real por contenido (MP3 de Azure/gTTS o WAV de SAPI).
async function generateTtsMp3(
  guildId: string,
  texto: string,
  attempts = 2,
  voiceModel?: string
): Promise<string> {
  const outFile = join(tmpdir(), `jsradio_${guildId}_${Date.now()}.mp3`);

  // 1) Azure Neural (principal) — solo si hay credenciales configuradas.
  if (AZURE_SPEECH_KEY && AZURE_SPEECH_REGION) {
    for (let i = 0; i < attempts; i++) {
      try {
        await generateWithAzure(outFile, texto);
        return outFile;
      } catch (err: any) {
        console.warn(`⚠️  Azure TTS intento ${i + 1}/${attempts} falló: ${err?.message || err}`);
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    console.log('🔁 Azure no disponible, cayendo a Piper');
  }

  // 2) Piper (neural local, offline e ilimitado) — primario efectivo si está instalado.
  if (PIPER_AVAILABLE) {
    try {
      await generateWithPiper(outFile, texto, voiceModel || PIPER_MODEL);
      return outFile;
    } catch (err: any) {
      console.warn(`⚠️  Piper falló: ${err?.message || err}`);
    }
  }

  // 3) Google Translate TTS (fallback de red).
  for (let i = 0; i < attempts; i++) {
    try {
      await generateWithGoogle(outFile, texto);
      return outFile;
    } catch (err: any) {
      console.warn(`⚠️  gTTS intento ${i + 1}/${attempts} falló: ${err?.message || err}`);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }

  // 4) SAPI offline (último recurso, nunca depende de red).
  try {
    console.log('🔁 gTTS no disponible, usando SAPI offline');
    await generateWithSapi(outFile, texto);
    return outFile;
  } catch (err: any) {
    throw new Error(`TTS falló (Azure + Piper + gTTS + SAPI): ${err?.message || err}`);
  }
}

// Devuelve la duración (segundos) de un archivo de audio usando ffprobe.
async function getAudioDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `"${FFPROBE}" -i "${file}" -show_entries format=duration -v quiet -of csv="p=0"`,
      { timeout: 5000 }
    );
    const d = parseFloat(stdout.trim());
    return isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}

// TTS sin música de fondo: pausa player principal, reproduce TTS, lo re-suscribe.
// Se usa entre canciones, cuando no hay nada sonando todavía.
// Reproduce un archivo de audio ya generado en modo solo: pausa la música, lo suena, restaura.
async function playFileSolo(guildId: string, audioFile: string): Promise<void> {
  const estado = estados.get(guildId);
  if (!estado) return;

  const ff = spawn(FFMPEG, [
    '-i', audioFile,
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-ar', '48000',
    '-ac', '2',
    '-f', 'ogg',
    '-loglevel', 'error',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ff.stderr?.on('data', (d: Buffer) => {
    const s = d.toString().trim();
    if (s) console.warn(`ffmpeg(tts-solo): ${s}`);
  });

  const announcePlayer = createAudioPlayer();
  const resource = createAudioResource(ff.stdout!, { inputType: StreamType.OggOpus });

  const wasPlaying = estado.player.state.status === AudioPlayerStatus.Playing;
  if (wasPlaying) estado.player.pause(true);
  estado.connection.subscribe(announcePlayer);

  announcePlayer.play(resource);

  await new Promise<void>((resolve) => {
    let done = false;
    const restore = () => {
      if (done) return;
      done = true;
      try { ff.kill('SIGKILL'); } catch { /* ignore */ }
      try {
        estado.connection.subscribe(estado.player);
        if (wasPlaying) estado.player.unpause();
      } catch (e) {
        console.warn('No se pudo restaurar player principal:', e);
      }
      resolve();
    };
    announcePlayer.once(AudioPlayerStatus.Idle, restore);
    announcePlayer.once('error', (err) => {
      console.error('Announce solo error:', err.message);
      restore();
    });
    setTimeout(restore, 30000);
  });
}

// TTS sin música de fondo (entre canciones). voiceModel elige la voz Piper (dúo).
async function speakSolo(guildId: string, texto: string, voiceModel?: string): Promise<void> {
  const estado = estados.get(guildId);
  if (!estado) return;

  let tempFile = '';
  try {
    tempFile = await generateTtsMp3(guildId, texto, 2, voiceModel);
    await playFileSolo(guildId, tempFile);
  } catch (err) {
    console.error('speakSolo error:', err);
    estado.textChannel?.send(`🎙️ **DJ:** ${texto}`).catch(() => {});
  } finally {
    if (tempFile) setTimeout(() => unlink(tempFile).catch(() => {}), 5000);
  }
}

// Genera UN archivo con varios turnos (cada uno con su voz Piper) concatenados con ffmpeg.
// Normaliza cada turno a 48k/stereo antes del concat por si las voces tienen sample rates distintos.
async function generateDialogueWav(
  guildId: string,
  turns: { texto: string; model: string }[]
): Promise<string> {
  const outFile = join(tmpdir(), `jsradio_${guildId}_${Date.now()}_dlg.wav`);
  const parts: string[] = [];
  try {
    for (let i = 0; i < turns.length; i++) {
      const part = join(tmpdir(), `jsradio_${guildId}_${Date.now()}_p${i}.wav`);
      await generateWithPiper(part, turns[i].texto, turns[i].model);
      parts.push(part);
    }
    const inputArgs = parts.map((p) => `-i "${p}"`).join(' ');
    const pre = parts
      .map((_, i) => `[${i}:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[a${i}]`)
      .join(';');
    const concat = parts.map((_, i) => `[a${i}]`).join('') + `concat=n=${parts.length}:v=0:a=1[out]`;
    await execAsync(
      `"${FFMPEG}" -y ${inputArgs} -filter_complex "${pre};${concat}" -map "[out]" "${outFile}"`,
      { timeout: 30000 }
    );
    return outFile;
  } finally {
    for (const p of parts) setTimeout(() => unlink(p).catch(() => {}), 5000);
  }
}

// Diálogo entre los dos comentadores en modo solo (entre canciones, sin música).
async function speakDialogueSolo(
  guildId: string,
  turns: { texto: string; model: string }[]
): Promise<void> {
  const estado = estados.get(guildId);
  if (!estado) return;

  let dlgFile = '';
  try {
    dlgFile = await generateDialogueWav(guildId, turns);
    await playFileSolo(guildId, dlgFile);
  } catch (err) {
    console.error('speakDialogueSolo error:', err);
    estado.textChannel?.send(`🎙️ ${turns.map((t) => t.texto).join('  —  ')}`).catch(() => {});
  } finally {
    if (dlgFile) setTimeout(() => unlink(dlgFile).catch(() => {}), 8000);
  }
}

// TTS con ducking real: mezcla música ducked + voz en un único pipeline ffmpeg.
// Estrategia: matar ffmpeg actual, calcular elapsed, rearrancar con -ss + amix.
// La música sigue sonando todo el tiempo, solo baja de volumen mientras habla el DJ.
async function speakWithDucking(guildId: string, texto: string, voiceModel?: string): Promise<void> {
  const estado = estados.get(guildId);
  if (!estado || !estado.currentMusicUrl) return;

  let mp3File = '';
  let oggFile = '';

  try {
    mp3File = await generateTtsMp3(guildId, texto, 2, voiceModel);
    oggFile = mp3File.replace(/\.mp3$/, '.ogg');

    // Convertir TTS a OGG Opus 48k stereo para que amix lo procese homogéneo
    await execAsync(
      `"${FFMPEG}" -y -i "${mp3File}" -c:a libopus -b:a 128k -ar 48000 -ac 2 "${oggFile}"`,
      { timeout: 20000 }
    );

    const ttsDuration = await getAudioDuration(oggFile);
    if (ttsDuration <= 0) throw new Error('No pude obtener duración del TTS');

    const elapsed = Math.max(0, (Date.now() - estado.trackStartedAt) / 1000);
    console.log(`🎚️  ducking: elapsed=${elapsed.toFixed(2)}s, tts=${ttsDuration.toFixed(2)}s`);

    // Matar el ffmpeg actual y arrancar uno nuevo con la mezcla
    killFfmpeg(estado);

    const musicUrl = estado.currentMusicUrl;
    // Filter: bajar música a DUCK_VOLUME desde t=0.3s hasta t=ttsDuration+0.5s, resto a 1.0.
    // Voz con adelay de 300ms para que el dip de música anteceda a la voz un toque.
    const fadeStart = 0.3;
    const fadeEnd = ttsDuration + 0.5;
    const filterComplex =
      `[0:a]volume=enable='between(t,${fadeStart},${fadeEnd})':volume=${DUCK_VOLUME}[bg];` +
      `[1:a]adelay=300|300,volume=1.2[voice];` +
      `[bg][voice]amix=inputs=2:duration=first:dropout_transition=0.5:normalize=0`;

    const ff = spawn(FFMPEG, [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-ss', String(elapsed),
      '-i', musicUrl,
      '-i', oggFile,
      '-filter_complex', filterComplex,
      '-c:a', 'libopus',
      '-b:a', '160k',
      '-vbr', 'on',
      '-compression_level', '10',
      '-application', 'audio',
      '-ar', '48000',
      '-ac', '2',
      '-f', 'ogg',
      '-loglevel', 'warning',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    estado.ffmpegProcess = ff;

    ff.stderr?.on('data', (d: Buffer) => {
      const s = d.toString().trim();
      if (s) console.warn(`ffmpeg(duck): ${s}`);
    });
    ff.on('close', (code) => {
      console.log(`🏁 ffmpeg(duck) close code=${code} [${guildId}]`);
    });
    ff.on('error', (err) => {
      console.error(`❌ ffmpeg(duck) error [${guildId}]:`, err.message);
    });

    const resource = createAudioResource(ff.stdout!, { inputType: StreamType.OggOpus });
    estado.player.play(resource);

    // Mantener trackStartedAt coherente: la música arrancó hace `elapsed` segundos lógicamente.
    estado.trackStartedAt = Date.now() - elapsed * 1000;

    // Esperar a que termine la parte hablada (no la canción): ttsDuration + buffer
    await new Promise<void>((r) => setTimeout(r, (ttsDuration + 0.8) * 1000));
  } catch (err) {
    console.error('speakWithDucking error:', err);
    estado.textChannel?.send(`🎙️ **DJ:** ${texto}`).catch(() => {});
  } finally {
    if (mp3File) setTimeout(() => unlink(mp3File).catch(() => {}), 10000);
    if (oggFile) setTimeout(() => unlink(oggFile).catch(() => {}), 60000);
  }
}

// ─── Embed: Mensaje de reproducción con carátula ──────────────────────────────

function buildPlayingEmbed(track: Track, isRadio: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🎵 ${track.title}`)
    .setURL(track.url)
    .addFields(
      { name: '⏱️ Duración', value: track.duration, inline: true },
      { name: '📡 Fuente', value: track.source, inline: true }
    )
    .setFooter({ text: isRadio ? '🔥 JS RADIO — Modo Radio' : '🎶 JS RADIO' });

  if (track.artist) {
    embed.spliceFields(1, 0, { name: '🎤 Artista', value: track.artist, inline: true });
  }

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  return embed;
}

function buildNowPlayingMessage(track: Track, isRadio: boolean): string {
  const radioTag = isRadio ? ' 🔥' : '';
  return `🎵 **Sonando ahora:** ${track.title} [${track.duration}]${radioTag}`;
}

// ─── Cliente Discord ─────────────────────────────────────────────────────────

client.on('clientReady', async () => {
  console.log(`⚡ ${BOT_NAME} conectado como ${client.user?.tag}`);

  const comandos = [
    new SlashCommandBuilder()
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
    new SlashCommandBuilder()
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
    new SlashCommandBuilder()
      .setName('skip')
      .setDescription('Salta al siguiente tema'),
    new SlashCommandBuilder()
      .setName('stop')
      .setDescription('Detiene la música y desconecta el bot'),
    new SlashCommandBuilder()
      .setName('queue')
      .setDescription('Muestra los temas en cola'),
    new SlashCommandBuilder()
      .setName('nowplaying')
      .setDescription('Muestra el tema que está sonando ahora'),
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Muestra todos los comandos disponibles'),
  ];

  await client.application?.commands.set(comandos.map((c) => c.toJSON()));
  console.log(`✅ Comandos slash registrados`);
});

// ─── Auto-desconectar si no hay nadie ─────────────────────────────────────────

client.on('voiceStateUpdate', (oldState, newState) => {
  const guildId = oldState.guild?.id || newState.guild?.id;
  if (!guildId) return;

  const estado = estados.get(guildId);
  if (!estado) return;

  if (oldState.member?.id === client.user?.id || newState.member?.id === client.user?.id) return;

  const channel = client.channels.cache.get(estado.voiceChannelId!) as any;
  if (!channel) return;

  const miembros = channel.members.filter((m: any) => !m.user.bot);
  const solo = miembros.size === 0;

  if (solo && !estado.disconnectTimer) {
    console.log(`⏳ Sin oyentes en ${guildId}, desconectando en 30s...`);
    estado.disconnectTimer = setTimeout(() => {
      console.log(`🛑 Canal vacío, desconectando ${guildId}`);
      limpiarEstado(guildId);
    }, 30000);
  } else if (!solo && estado.disconnectTimer) {
    console.log(`👋 Alguien volvió, cancelando auto-desconexión en ${guildId}`);
    clearTimeout(estado.disconnectTimer);
    estado.disconnectTimer = null;
  }
});

// ─── Manejar interacciones ────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guildId } = interaction;
    if (!guildId) {
      await interaction.reply({
        content: '❌ Este comando solo funciona en un servidor.',
        ephemeral: true,
      });
      return;
    }

    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice?.channel;

    const necesitaVoz = ['play', 'skip', 'stop', 'radio'];
    if (necesitaVoz.includes(commandName) && !voiceChannel) {
      await interaction.reply({
        content: '❌ Tenés que estar en un canal de voz para usar este comando.',
        ephemeral: true,
      });
      return;
    }

    const guildState = estados.get(guildId);

    switch (commandName) {
      case 'play':
        await handlePlay(interaction, guildId, member);
        break;
      case 'radio':
        await handleRadio(interaction, guildId, member, guildState);
        break;
      case 'skip':
        await handleSkip(interaction, guildId, guildState);
        break;
      case 'stop':
        await handleStop(interaction, guildId, guildState);
        break;
      case 'queue':
        await handleQueue(interaction, guildState);
        break;
      case 'nowplaying':
        await handleNowPlaying(interaction, guildState);
        break;
      case 'help':
        await handleHelp(interaction);
        break;
    }
  } catch (err: any) {
    console.error('❌ Error en interactionCreate:', err);
    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply('❌ Ocurrió un error interno.');
        } else {
          await interaction.reply({ content: '❌ Ocurrió un error interno.', ephemeral: true });
        }
      }
    } catch {
      // No se pudo responder
    }
  }
});

// ─── Comando /play ────────────────────────────────────────────────────────────

async function handlePlay(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  member: GuildMember
) {
  await interaction.deferReply();
  const query = interaction.options.getString('cancion', true);
  const fuente = interaction.options.getString('fuente') || 'auto';
  const voiceChannel = member.voice?.channel!;
  const textChannel = interaction.channel as TextChannel;

  try {
    const esUrl = /^https?:\/\//.test(query);
    let tracksToQueue: { track: Track; fuenteHallazgo: string }[] = [];

    if (esUrl) {
      const urlFuente = detectarFuente(query);

      if (urlFuente === 'Spotify') {
        const info = await resolveSpotifyUrl(query);
        if (info && info.tracks.length > 0) {
          for (const t of info.tracks) {
            const ytQuery = `${t.artist} - ${t.name}`;
            const ytTrack = await searchYouTube(ytQuery);
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
        const scTrack = await searchSoundCloud(query);
        if (scTrack) {
          tracksToQueue.push({
            track: scTrack,
            fuenteHallazgo: 'SoundCloud (URL directa)',
          });
        }
      } else {
        // YouTube URL: obtener metadata completa
        const meta = await getTrackMetadata(query);
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
        const track = await searchYouTube(query);
        if (track) tracksToQueue.push({ track, fuenteHallazgo: 'YouTube' });
      } else if (fuente === 'sp') {
        const s = await searchSpotify(query);
        if (s) {
          const yt = await searchYouTube(`${s.artist} - ${s.name}`);
          if (yt) {
            tracksToQueue.push({
              track: { ...yt, source: 'Spotify' },
              fuenteHallazgo: `Spotify → YouTube (${s.name} — ${s.artist})`,
            });
          }
        }
      } else if (fuente === 'scld') {
        const track = await searchSoundCloud(query);
        if (track) tracksToQueue.push({ track, fuenteHallazgo: 'SoundCloud' });
      } else {
        // auto: 3 fuentes en paralelo
        const [spotify, ytResult, scResult] = await Promise.all([
          searchSpotify(query).then(async (s) => {
            if (!s) return null;
            const yt = await searchYouTube(`${s.artist} - ${s.name}`);
            if (!yt) return null;
            return { track: { ...yt, source: 'Spotify' as const }, fuente: `Spotify → YouTube (${s.name} — ${s.artist})` };
          }),
          searchYouTube(query).then((yt) => {
            if (!yt) return null;
            return { track: yt, fuente: 'YouTube' };
          }),
          searchSoundCloud(query).then((sc) => {
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
    let estado = estados.get(guildId);

    if (!estado) {
      console.log(`🔊 Conectando a canal de voz: ${voiceChannel.name} [${voiceChannel.id}]`);
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      const player = createAudioPlayer();
      connection.subscribe(player);

      const playlistTracks = await getRadioPlaylistTracks();

      estado = {
        player,
        connection,
        queue: [],
        currentTrack: null,
        isTransitioning: false,
        textChannel,
        ffmpegProcess: null,
        disconnectTimer: null,
        voiceChannelId: voiceChannel.id,
        radioMode: false,
        basePlaylistTrackQueries: playlistTracks,
        currentMusicUrl: null,
        trackStartedAt: 0,
        commentScheduled: false,
        lastDjVoice: 0,
      };
      estados.set(guildId, estado);

      player.on(AudioPlayerStatus.Idle, () => {
        const e = estados.get(guildId);
        if (!e) return;
        onTrackEnd(guildId);
      });
      player.on('error', (err) => {
        console.error(`❌ Error en player [${guildId}]:`, err.message);
        onTrackEnd(guildId);
      });
    } else {
      estado.textChannel = textChannel;
    }

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

    if (estado.currentTrack === null && !estado.isTransitioning) {
      await playNextFromQueue(guildId);
    }

    // Mensaje de confirmación con embed
    const embed = buildPlayingEmbed(firstTrack, estado.radioMode);

    if (tracksToQueue.length === 1) {
      await interaction.editReply({
        content: `🎵 **${BOT_NAME}** — ${tracksToQueue[0].fuenteHallazgo}`,
        embeds: [embed],
      });
    } else {
      await interaction.editReply({
        content: `🎵 **${BOT_NAME}**: "${firstTrack.title}" + ${tracksToQueue.length - 1} temas más agregados a la cola.`,
        embeds: [embed],
      });
    }
  } catch (err: any) {
    console.error('Error en /play:', err);
    await interaction.editReply(`❌ Error al reproducir: ${err.message || 'Error desconocido'}`);
  }
}

// ─── Comando /radio ───────────────────────────────────────────────────────────

async function handleRadio(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  member: GuildMember,
  guildState: GuildState | undefined
) {
  await interaction.deferReply();
  const accion = interaction.options.getString('accion') || 'toggle';

  if (accion === 'joke') {
    const chiste = CHISTES[Math.floor(Math.random() * CHISTES.length)];
    if (guildState?.textChannel) {
      guildState.textChannel.send(`🎙️ **JS RADIO DJ:** ${chiste}`).catch(() => {});
      // También reproducir como audio
      playDjAnnouncement(guildId, 'joke');
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
    guildState.basePlaylistTrackQueries = await getRadioPlaylistTracks();

    if (guildState.textChannel) {
      await guildState.textChannel.send({
        content: `🔥 **JS RADIO — Modo Radio ACTIVADO** 🔥\n` +
                 `🎙️ El DJ está en la casa! Bass Arena mode: ON\n` +
                 `🎵 La mejor música sin parar.\n` +
                 `📢 Usá \`/radio joke\` para un chiste del DJ.`,
      });
    }

    // DJ intro
    setTimeout(() => playDjAnnouncement(guildId, 'intro'), 2000);

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
}

// ─── Comando /skip ────────────────────────────────────────────────────────────

async function handleSkip(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  guildState: GuildState | undefined
) {
  if (!guildState || !guildState.currentTrack) {
    await interaction.reply('❌ No está sonando nada para saltar.');
    return;
  }

  killFfmpeg(guildState);
  guildState.player.stop();
  await interaction.reply(`⏭️ Salté "${guildState.currentTrack.title}".`);
}

// ─── Comando /stop ────────────────────────────────────────────────────────────

async function handleStop(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  guildState: GuildState | undefined
) {
  if (!guildState) {
    await interaction.reply('❌ El bot no está conectado a ningún canal.');
    return;
  }

  limpiarEstado(guildId);
  await interaction.reply(`🛑 **${BOT_NAME}** se desconectó. Nos escuchamos.`);
}

// ─── Comando /queue ───────────────────────────────────────────────────────────

async function handleQueue(
  interaction: ChatInputCommandInteraction,
  guildState: GuildState | undefined
) {
  if (!guildState || guildState.queue.length === 0) {
    await interaction.reply('📭 La cola está vacía. Usá `/play` para agregar temas.');
    return;
  }

  const canciones = guildState.queue
    .map((t, i) => `**${i + 1}.** ${t.title} [${t.duration}] — ${t.source}`)
    .join('\n');

  const modoRadio = guildState.radioMode ? '\n\n🔥 **Modo Radio: ON** (el DJ te acompaña!)' : '';

  await interaction.reply({
    content: `📋 **Cola de reproducción:**\n${canciones}${modoRadio}`,
  });
}

// ─── Comando /nowplaying ──────────────────────────────────────────────────────

async function handleNowPlaying(
  interaction: ChatInputCommandInteraction,
  guildState: GuildState | undefined
) {
  if (!guildState || !guildState.currentTrack) {
    await interaction.reply('❌ No está sonando nada ahora.');
    return;
  }

  const track = guildState.currentTrack;
  const embed = buildPlayingEmbed(track, guildState.radioMode);

  await interaction.reply({ embeds: [embed] });
}

// ─── Comando /help ─────────────────────────────────────────────────────────────

async function handleHelp(interaction: ChatInputCommandInteraction) {
  const msg = [
    `**${BOT_NAME} — Comandos**`,
    '',
    '🎵 **/play** `cancion:` [título/URL] `fuente:` auto|yt|sp|scld',
    '   › *auto*: busca en Spotify→YouTube, YouTube y SoundCloud',
    '   › *yt*: solo YouTube',
    '   › *sp*: solo Spotify → YouTube',
    '   › *scld*: solo SoundCloud',
    '🔥 **/radio** `accion:` on|off|joke|toggle',
    '   › *on*: activa el modo radio con DJ',
    '   › *off*: desactiva el modo radio',
    '   › *joke*: el DJ cuenta un chiste ahora',
    '   › *toggle*: activa/desactiva (sin argumentos)',
    '⏭️ **/skip** — salta al siguiente tema',
    '🛑 **/stop** — detiene la música y desconecta el bot',
    '📋 **/queue** — muestra los temas en cola',
    '🎶 **/nowplaying** — muestra el tema actual con embed',
    '❓ **/help** — muestra esta ayuda',
  ].join('\n');

  await interaction.reply({ content: msg, ephemeral: true });
}

// ─── Lógica de reproducción ───────────────────────────────────────────────────

function killFfmpeg(estado: GuildState) {
  if (estado.ffmpegProcess) {
    try {
      estado.ffmpegProcess.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    estado.ffmpegProcess = null;
  }
}

// Retry en resolveTrackAudio
async function resolveTrackAudio(trackUrl: string, track?: Track, retries = 2): Promise<string> {
  const cached = audioUrlCache.get(trackUrl);
  if (cached && Date.now() - cached.resolvedAt < CACHE_TTL) {
    return cached.audioUrl;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await execAsync(
        // Preferimos Opus (webm) si está disponible: ffmpeg lo remuxea sin recodificar → cero pérdida.
        // Solo caemos a m4a (AAC) si no hay Opus disponible.
        `"${YTDLP}" -f "bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best" -g --no-warnings -- "${trackUrl}"`,
        { timeout: 30000 }
      );
      const stdout = result.stdout;

      const lines = stdout.trim().split('\n').filter((l: string) => l.trim().length > 0);
      let audioUrl = '';

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('http')) {
          audioUrl = line;
          break;
        }
      }

      if (!audioUrl) {
        console.error(`yt-dlp output (${attempt + 1}): [${stdout.substring(0, 300)}]`);
        throw new Error('URL de audio vacía');
      }

      // Actualizar metadata del track si se resolvió correctamente
      if (track) {
        try {
          const metaResult = await execAsync(
            `"${YTDLP}" --print "%(title)s" --no-warnings -j -- "${trackUrl}"`,
            { timeout: 15000 }
          );
          const metaLine = metaResult.stdout.trim();
          if (metaLine && metaLine.startsWith('{')) {
            const meta = JSON.parse(metaLine);
            if (meta.title) track.title = meta.title;
            if (meta.duration) {
              track.duration = `${Math.floor(meta.duration / 60)}:${String(Math.floor(meta.duration % 60)).padStart(2, '0')}`;
            }
          }
        } catch {
          // Metadata no crítica
        }
      }

      audioUrlCache.set(trackUrl, { audioUrl, resolvedAt: Date.now() });
      return audioUrl;
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ yt-dlp attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw lastError || new Error('yt-dlp failed after retries');
}

function spawnFfmpeg(musicUrl: string) {
  console.log(`🎧 ffmpeg codificando a Opus 160kbps (VBR, application=audio)...`);
  // - `-page_duration` removido (rompía el demuxer Ogg de @discordjs/voice en algunas versiones)
  // - Reconexión activada para sobrevivir cortes transitorios del CDN de YouTube
  // - `-application audio` + `-vbr on` + `-compression_level 10` = mejor calidad música a igual bitrate
  // - 160k es el sweet spot Opus para música; Discord no recomprime más allá del bitrate del canal
  return spawn(FFMPEG, [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', musicUrl,
    '-c:a', 'libopus',
    '-b:a', '160k',
    '-vbr', 'on',
    '-compression_level', '10',
    '-application', 'audio',
    '-ar', '48000',
    '-ac', '2',
    '-f', 'ogg',
    '-loglevel', 'warning',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
}

// ─── Auto-cola en modo radio ─────────────────────────────────────────────────

async function refillRadioQueue(guildId: string) {
  const estado = estados.get(guildId);
  if (!estado) return;

  const baseTracks = estado.basePlaylistTrackQueries;
  if (baseTracks.length === 0) return;

  const shuffled = baseTracks.sort(() => Math.random() - 0.5);
  let added = 0;

  for (const query of shuffled.slice(0, 5)) {
    if (estado.queue.length >= 10) break;

    const track = await searchYouTube(query);
    if (track && !estado.queue.find((t) => t.url === track.url)) {
      estado.queue.push(track);
      added++;
    }
  }

  if (added > 0) {
    console.log(`📻 Auto-rellenado: ${added} tracks [${guildId}]`);
  }
}

// ─── Reproducción principal ───────────────────────────────────────────────────

async function playCurrentTrack(guildId: string): Promise<void> {
  const estado = estados.get(guildId);
  if (!estado || !estado.currentTrack) {
    console.log(`⏭️ playCurrentTrack: sin estado o currentTrack null [${guildId}]`);
    return;
  }

  const track = estado.currentTrack;
  console.log(`▶️ Reproduciendo: "${track.title}" [${track.url}]`);

  try {
    killFfmpeg(estado);

    const url = await resolveTrackAudio(track.url, track);

    // Trackear URL y momento de inicio para el ducking real (-ss elapsed cuando el DJ habla)
    estado.currentMusicUrl = url;
    estado.trackStartedAt = Date.now();
    estado.commentScheduled = false;

    const ff = spawnFfmpeg(url);
    estado.ffmpegProcess = ff;

    let bytesEmitted = 0;
    let firstByteLogged = false;
    ff.stdout?.on('data', (chunk: Buffer) => {
      bytesEmitted += chunk.length;
      if (!firstByteLogged) {
        firstByteLogged = true;
        console.log(`📤 ffmpeg primer chunk de audio (${chunk.length} bytes) [${guildId}]`);
      }
    });

    ff.stderr?.on('data', (data: Buffer) => {
      const s = data.toString().trim();
      if (s) console.warn(`ffmpeg: ${s}`);
    });

    ff.on('error', (err) => {
      console.error(`❌ ffmpeg error [${guildId}]:`, err.message);
      onTrackEnd(guildId);
    });

    ff.on('close', (code) => {
      console.log(`🏁 ffmpeg close code=${code} bytes=${bytesEmitted} [${guildId}]`);
    });

    const resource = createAudioResource(ff.stdout!, {
      inputType: StreamType.OggOpus,
      inlineVolume: false,
    });

    // Logging de transiciones de estado del player para diagnosticar dónde muere
    estado.player.removeAllListeners('stateChange');
    estado.player.on('stateChange', (oldState, newState) => {
      console.log(`🎚️  player ${oldState.status} → ${newState.status} [${guildId}]`);
    });

    estado.player.play(resource);

    // Mensaje de "reproduciendo" con embed
    if (estado.textChannel) {
      const embed = buildPlayingEmbed(track, estado.radioMode);
      const msg = estado.radioMode
        ? `🔥 **JS RADIO** — ¡Arrancó la fiesta!\n${buildNowPlayingMessage(track, true)}`
        : buildNowPlayingMessage(track, false);

      estado.textChannel.send({ content: msg, embeds: [embed] }).catch(() => {});
    }

    // DJ: comentario contextual con ducking en mitad de la canción (1 por canción, 50% chance).
    // No usa setTimeout encadenado a la canción — se programa una sola vez al arrancar.
    if (estado.radioMode && !estado.commentScheduled && Math.random() < 0.5) {
      estado.commentScheduled = true;
      const trackSnapshot = track;
      setTimeout(() => {
        const e = estados.get(guildId);
        // Solo si la canción sigue sonando (no cambió entremedio)
        if (e && e.radioMode && e.currentTrack?.url === trackSnapshot.url) {
          playDjAnnouncement(guildId, 'comment', trackSnapshot).catch(() => {});
        }
      }, 25000); // ~25s adentro de la canción
    }

    console.log(`▶️ Sonando: ${track.title} en ${guildId}`);
  } catch (err: any) {
    console.error(`❌ Error al reproducir en ${guildId}:`, err.message);
    onTrackEnd(guildId);
  }
}

async function onTrackEnd(guildId: string) {
  const estado = estados.get(guildId);
  if (!estado) return;

  killFfmpeg(estado);

  if (estado.isTransitioning) return;

  // Sacar la track actual de la queue
  if (estado.currentTrack) {
    const idx = estado.queue.findIndex((t) => t.url === estado.currentTrack!.url);
    if (idx !== -1) estado.queue.splice(idx, 1);
  }

  estado.currentTrack = null;
  estado.currentMusicUrl = null;
  estado.commentScheduled = false;

  // Si la cola quedó vacía y estamos en radio, rellenar antes de hablar
  if (estado.queue.length === 0 && estado.radioMode) {
    await refillRadioQueue(guildId);
  }

  if (estado.queue.length > 0) {
    estado.isTransitioning = true;

    // DJ habla ENTRE canciones (bloqueante, sin música, voz limpia).
    // Orden: chiste opcional (35%) → anuncio de próximo tema (siempre que esté next).
    if (estado.radioMode) {
      const nextTrack = estado.queue[0];
      if (Math.random() < 0.35) {
        await playDjAnnouncement(guildId, 'joke');
      }
      await playDjAnnouncement(guildId, 'next', nextTrack);
    }

    await playNextFromQueue(guildId);
    estado.isTransitioning = false;
  } else {
    if (estado.radioMode) {
      // Refill falló (sin playlist base?). Reintentar en 10s.
      setTimeout(async () => {
        const e = estados.get(guildId);
        if (e && e.radioMode && e.queue.length === 0) {
          await refillRadioQueue(guildId);
          if (e.queue.length > 0) {
            e.isTransitioning = true;
            await playDjAnnouncement(guildId, 'next', e.queue[0]);
            await playNextFromQueue(guildId);
            e.isTransitioning = false;
          }
        }
      }, 10000);
    } else {
      setTimeout(() => {
        const st = estados.get(guildId);
        if (st && !st.currentTrack && st.queue.length === 0) {
          limpiarEstado(guildId);
        }
      }, 30000);
    }
  }
}

async function playNextFromQueue(guildId: string): Promise<void> {
  const estado = estados.get(guildId);
  if (!estado || estado.queue.length === 0) {
    if (estado) estado.currentTrack = null;
    return;
  }

  estado.currentTrack = estado.queue[0];

  // El intro entre canciones ya se hace en onTrackEnd (bloqueante, sin pisarse con música).
  // Acá solo arrancamos la canción.
  await playCurrentTrack(guildId);
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function limpiarEstado(guildId: string) {
  const estado = estados.get(guildId);
  if (!estado) return;

  if (estado.disconnectTimer) clearTimeout(estado.disconnectTimer);

  try {
    killFfmpeg(estado);
    estado.player.stop();
    estado.connection.destroy();
  } catch {
    /* ignore */
  }

  estados.delete(guildId);
}

// ─── Señal de salida ──────────────────────────────────────────────────────────

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('SIGINT', () => {
  console.log(`\n🛑 Apagando ${BOT_NAME}...`);
  estados.forEach((_, guildId) => limpiarEstado(guildId));
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  estados.forEach((_, guildId) => limpiarEstado(guildId));
  client.destroy();
  process.exit(0);
});

// ─── Iniciar ──────────────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN no está configurado en .env');
  process.exit(1);
}

console.log(`🎙️ Iniciando ${BOT_NAME}...`);
client.login(token).catch((err) => {
  console.error('❌ Error al conectar con Discord:', err.message);
  process.exit(1);
});