import dotenv from 'dotenv';
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  VoiceBasedChannel,
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
import { GoogleGenAI } from '@google/genai';

// Tipos de dominio + contrato del motor (compartidos con los comandos).
import type { Track, GuildState, Engine } from './types';
// Registro de comandos (un archivo por comando en ./commands).
import { commands, commandMap } from './commands';

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
// ─── TTS Config ────────────────────────────────────────────────────────────────
// Lenguaje para gTTS (fallback de red).
const TTS_LANG = process.env.TTS_LANG || 'es';

// Piper: TTS neural LOCAL (offline, gratis, ilimitado, sin cuenta).
// Voz por defecto: es_AR (Daniela, argentino). Override de rutas/voz via .env.
const PIPER_EXE = process.env.PIPER_EXE || 'C:\\Users\\Roko\\piper\\piper\\piper.exe';
const PIPER_MODEL = process.env.PIPER_MODEL || 'C:\\Users\\Roko\\piper\\models\\es_AR-daniela-high.onnx';
// Segundo comentador (dúo): voz distinta. Si existe, se habilita el modo dúo.
const PIPER_MODEL_2 = process.env.PIPER_MODEL_2 || 'C:\\Users\\Roko\\piper\\models\\es_MX-ald-medium.onnx';
const PIPER_AVAILABLE = existsSync(PIPER_EXE) && existsSync(PIPER_MODEL);
// Lista de voces de DJ disponibles (1 o 2). Con 2 se activan diálogos y turnos entre comentadores.
const PIPER_MODELS = [PIPER_MODEL, PIPER_MODEL_2].filter((m) => existsSync(m));
// Dúo (dos voces alternando) DESACTIVADO por defecto: el DJ habla con una sola voz.
// Se puede reactivar con DJ_DUO=1 en el .env.
const DUO_ENABLED = PIPER_AVAILABLE && PIPER_MODELS.length >= 2 && process.env.DJ_DUO === '1';

// Gemini: descripciones cortas reales de cada canción + TTS (key gratis en ai.google.dev).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
// Gemini TTS: voz femenina chilena (misma key gratis).
// Voces femeninas disponibles: Kore, Leda, Aoede, Zephyr, Autonoe, Callirrhoe.
const GEMINI_TTS_DISABLED = process.env.GEMINI_TTS_DISABLED === '1';
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';

// ─── Tipos ────────────────────────────────────────────────────────────────────
// Track y GuildState ahora viven en ./types (compartidos con los comandos).

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

// Palabras que delatan "edits" (versiones alteradas) que NO queremos al pedir el
// tema original. Solo penalizan si NO están en el query (si pediste un remix, vale).
const BAD_EDIT_KEYWORDS = [
  'sped up', 'spedup', 'speed up', 'nightcore', 'slowed', 'reverb',
  '8d audio', '8d', 'bass boost', 'bassboost', 'tiktok', 'mashup',
  '1 hour', '1hour', 'one hour', '10 hours', 'karaoke', 'instrumental',
  'cover', 'remix', 'acapella', 'a capella', 'parody', 'loop',
];

function scoreYouTubeCandidate(video: any, query: string, rank: number): number {
  const title = (video.title || '').toLowerCase();
  const q = query.toLowerCase();
  let score = -rank * 2; // leve preferencia al orden original de YouTube

  for (const kw of BAD_EDIT_KEYWORDS) {
    if (title.includes(kw) && !q.includes(kw)) score -= 100; // edit no pedida
  }
  if (title.includes('official audio') || title.includes('audio oficial')) score += 30;
  else if (title.includes('official') || title.includes('oficial')) score += 20;
  else if (title.includes('audio')) score += 10;

  // Canal tipo artista (VEVO / "Artista - Topic") suele ser la versión correcta.
  const author = (video.author?.name || '').toLowerCase();
  const authorBase = author.replace(/\s*-\s*topic$/, '').trim();
  if (author.includes('vevo') || (authorBase && q.includes(authorBase))) score += 15;

  // Duración: castigar loops/compilaciones largas y clips muy cortos (sped up).
  const secs = video.seconds || 0;
  if (secs > 900) score -= 50;
  if (secs > 0 && secs < 45) score -= 30;

  return score;
}

// Elige el mejor video del top 10 según el score (filtra edits, prefiere oficial).
function pickBestVideo(videos: any[], query: string): any {
  let best = videos[0];
  let bestScore = -Infinity;
  videos.slice(0, 10).forEach((v, i) => {
    const s = scoreYouTubeCandidate(v, query, i);
    if (s > bestScore) { bestScore = s; best = v; }
  });
  return best;
}

async function searchYouTube(query: string): Promise<Track | null> {
  try {
    const r = await ytSearch(query);
    if (r.videos.length === 0) return null;

    const v = pickBestVideo(r.videos, query);
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

// Ducking suave: durante el comentario del DJ la música baja a este nivel (0.0-1.0).
// 0.6 = se escucha la música y la voz a la vez; subilo a ~0.8 para música más fuerte.
const DUCK_VOLUME = 0.6;

// Serializa los anuncios por guild para evitar que dos TTS se pisen
const announcementLocks = new Map<string, Promise<void>>();

// ─── Descripción de canción por IA (Gemini) ──────────────────────────────────
// Genera una descripción corta y real de cada tema. Cacheada por URL para no
// llamar dos veces el mismo tema. Si no hay key o falla, devuelve null y el
// llamador cae a las plantillas genéricas.
const songDescCache = new Map<string, string>();
let genaiClient: GoogleGenAI | null = null;

async function generateSongDescription(track: Track): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const cached = songDescCache.get(track.url);
  if (cached) return cached;

  try {
    if (!genaiClient) genaiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt =
      `Sos el DJ de una radio. En UNA sola frase corta (máximo 22 palabras), ` +
      `en español neutro-chileno informal y con onda, presentá esta canción con ` +
      `un dato real e interesante (año, género, de qué trata, o por qué es buena). ` +
      `No uses comillas, emojis ni hashtags. Si no conocés el tema, hacé una ` +
      `presentación entusiasta sin inventar datos.\n` +
      `Canción: "${track.title}"${track.artist ? ` de ${track.artist}` : ''}.`;

    const res = await genaiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    const text = (res.text || '').trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ');
    if (!text) return null;

    songDescCache.set(track.url, text);
    console.log(`🤖 Descripción IA: "${text.slice(0, 70)}..."`);
    return text;
  } catch (err: any) {
    console.warn(`⚠️  Gemini descripción falló: ${err?.message || err}`);
    return null;
  }
}

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

  let texto = buildAnnouncementText(tipo, estado, track);
  // Comentario de inicio: pedimos a la IA una descripción real del tema.
  // Si no hay key o falla, queda la plantilla genérica de buildAnnouncementText.
  if (tipo === 'comment' && track) {
    const desc = await generateSongDescription(track);
    if (desc) texto = desc;
  }
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



// ─── Gemini TTS
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function generateWithGemini(outFile: string, texto: string, voice: string = GEMINI_TTS_VOICE): Promise<void> {
  if (!GEMINI_API_KEY) throw new Error('sin GEMINI_API_KEY');
  if (!genaiClient) genaiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const res = await genaiClient.models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: `Decí esto como locutora de radio chilena, con onda y acento chileno natural: ${texto}`,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    } as any,
  });

  const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error('Gemini TTS sin audio');
  await writeFile(outFile, pcmToWav(Buffer.from(data, 'base64')));
}

// Genera un archivo de audio del DJ en cascada: Gemini → Piper → gTTS.
// El archivo siempre se nombra .mp3 por compatibilidad con el resto del pipeline,
// pero ffmpeg detecta el formato real por contenido (MP3 de Gemini/gTTS o WAV de SAPI).
async function generateTtsMp3(
  guildId: string,
  texto: string,
  attempts = 2,
  voiceModel?: string
): Promise<string> {
  const outFile = join(tmpdir(), `jsradio_${guildId}_${Date.now()}.mp3`);

  // 1) Gemini TTS (voz femenina chilena) — primaria si hay GEMINI_API_KEY.
  if (!GEMINI_TTS_DISABLED && GEMINI_API_KEY) {
    for (let i = 0; i < attempts; i++) {
      try {
        await generateWithGemini(outFile, texto);
        return outFile;
      } catch (err: any) {
        console.warn(`⚠️  Gemini TTS intento ${i + 1}/${attempts} falló: ${err?.message || err}`);
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    console.log('🔁 Gemini TTS no disponible, cayendo a Piper');
  }

  // 2) Piper (neural local, offline e ilimitado) — funciona sin red ni cuenta.
  if (PIPER_AVAILABLE) {
    try {
      await generateWithPiper(outFile, texto, voiceModel || PIPER_MODEL);
      return outFile;
    } catch (err: any) {
      console.warn(`⚠️  Piper falló: ${err?.message || err}`);
    }
  }

  // 3) Google Translate TTS (último recurso, depende de red).
  for (let i = 0; i < attempts; i++) {
    try {
      await generateWithGoogle(outFile, texto);
      return outFile;
    } catch (err: any) {
      console.warn(`⚠️  gTTS intento ${i + 1}/${attempts} falló: ${err?.message || err}`);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }

  throw new Error(`TTS falló en todos los motores (Gemini + Piper + gTTS)`);
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
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_on_network_error', '1',
      '-reconnect_delay_max', '10',
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

    const resource = createAudioResource(ff.stdout!, {
      inputType: StreamType.OggOpus,
      inlineVolume: true,
    });
    // Tras el ducking re-aplicamos el volumen del guild: si no, el tema vuelve a
    // sonar al 100% y /volume quedaría apuntando a un resource muerto.
    estado.currentResource = resource;
    resource.volume?.setVolume(estado.volume ?? 1.0);
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

// ─── Motor expuesto a los comandos ────────────────────────────────────────────
// Los archivos de ./commands reciben este objeto vía CommandContext.engine.
// Centraliza el acceso al estado y a la lógica de audio/búsqueda/TTS sin que los
// comandos importen bot.ts (evita ciclos de import).
const engine: Engine = {
  estados,
  BOT_NAME,
  CHISTES,
  searchYouTube,
  searchSpotify,
  searchSoundCloud,
  resolveSpotifyUrl,
  getTrackMetadata,
  detectarFuente,
  getRadioPlaylistTracks,
  buildPlayingEmbed,
  playDjAnnouncement,
  refillRadioQueue,
  ensureGuild,
  playNextFromQueue,
  killFfmpeg,
  limpiarEstado,
};

// ─── Cliente Discord ─────────────────────────────────────────────────────────

client.on('clientReady', async () => {
  console.log(`⚡ ${BOT_NAME} conectado como ${client.user?.tag}`);

  await client.application?.commands.set(commands.map((c) => c.data.toJSON()));
  console.log(`✅ ${commands.length} comandos slash registrados`);
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

    const command = commandMap.get(commandName);
    if (!command) return;

    if (command.needsVoice && !voiceChannel) {
      await interaction.reply({
        content: '❌ Tenés que estar en un canal de voz para usar este comando.',
        ephemeral: true,
      });
      return;
    }

    await command.execute({
      interaction,
      guildId,
      member,
      state: estados.get(guildId),
      engine,
    });
  } catch (err: any) {
    console.error('❌ Error en interactionCreate:', err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('❌ Ocurrió un error interno.').catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Ocurrió un error interno.', ephemeral: true }).catch(() => {});
      }
    } catch {
      // Interaction expiró, imposible responder
    }
  }
});

// ─── Crear/obtener estado del guild ───────────────────────────────────────────
// Los comandos (en ./commands) no arman GuildState a mano: delegan acá para que
// la forma del estado y los listeners del player vivan en un solo lugar.
async function ensureGuild(
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  textChannel: TextChannel
): Promise<GuildState> {
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
      // Controles nuevos
      volume: 1.0,
      loopMode: 'off',
      currentResource: null,
      skipRequested: false,
      seedTrack: null,
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

  return estado;
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
    // User-Agent de navegador: YouTube resetea (WSAECONNRESET / -10054) conexiones
    // que no parecen un browser. Con esto baja mucho el throttling del CDN.
    '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_on_network_error', '1',
    '-reconnect_delay_max', '10',
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

// ─── Radio sembrada: temas parecidos al seed ──────────────────────────────────

function formatDuration(raw?: string): string {
  const s = parseInt(raw || '', 10);
  if (!Number.isFinite(s) || s <= 0) return '?';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|\/watch\?.*v=)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function resolveYouTubeVideoId(seed: Track): Promise<string | null> {
  const direct = extractYouTubeId(seed.url);
  if (direct) return direct;
  // Seed no-YouTube (Spotify/SoundCloud): lo buscamos en YouTube para tener videoId.
  const q = seed.artist ? `${seed.artist} - ${seed.title}` : seed.title;
  const yt = await searchYouTube(q);
  return yt ? extractYouTubeId(yt.url) : null;
}

// Cascada: Spotify Recommendations (elección del usuario) → fallback YouTube Mix.
// Spotify deprecó /v1/recommendations (27-nov-2024) para apps sin acceso extendido;
// si responde 404/vacío caemos solo a YouTube Mix (radio RD<videoId> vía yt-dlp).
async function getSimilarTracks(seed: Track): Promise<Track[]> {
  // 1) Spotify Recommendations
  try {
    const token = await getSpotifyToken();
    if (token) {
      const sp = await searchSpotify(seed.artist ? `${seed.artist} - ${seed.title}` : seed.title);
      if (sp) {
        const res = await fetch(
          `https://api.spotify.com/v1/recommendations?seed_tracks=${sp.id}&limit=10`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data: any = await res.json();
          const recs: any[] = data.tracks || [];
          const tracks: Track[] = [];
          for (const r of recs) {
            const yt = await searchYouTube(`${r.artists?.[0]?.name || ''} - ${r.name}`);
            if (yt) tracks.push({ ...yt, source: 'Spotify' });
          }
          if (tracks.length > 0) {
            console.log(`🎯 Similares vía Spotify Recommendations: ${tracks.length}`);
            return tracks;
          }
        } else {
          console.warn(`⚠️ Spotify Recommendations no disponible (HTTP ${res.status}); uso YouTube Mix.`);
        }
      }
    }
  } catch (err: any) {
    console.warn(`⚠️ Spotify Recommendations falló: ${err.message}; uso YouTube Mix.`);
  }

  // 2) Fallback: YouTube Mix (radio RD<videoId>)
  try {
    const videoId = await resolveYouTubeVideoId(seed);
    if (!videoId) return [];
    // id y duration primero (sin tabs); el título va último porque puede contener tabs.
    const { stdout } = await execAsync(
      `"${YTDLP}" --flat-playlist --no-warnings --print "%(id)s\t%(duration)s\t%(title)s" "https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}"`,
      { timeout: 30000 }
    );
    const lines = stdout.trim().split('\n').filter((l: string) => l.trim().length > 0);
    const tracks: Track[] = [];
    for (const line of lines.slice(0, 12)) {
      const tab1 = line.indexOf('\t');
      const tab2 = line.indexOf('\t', tab1 + 1);
      if (tab1 === -1 || tab2 === -1) continue;
      const id = line.slice(0, tab1);
      const dur = line.slice(tab1 + 1, tab2);
      const title = line.slice(tab2 + 1);
      if (!id) continue;
      // El primer item del mix suele ser el seed mismo → lo saltamos.
      if (id === videoId) continue;
      tracks.push({
        title: title || 'Tema',
        url: `https://www.youtube.com/watch?v=${id}`,
        duration: formatDuration(dur),
        source: 'YouTube',
      });
    }
    if (tracks.length > 0) console.log(`🎯 Similares vía YouTube Mix: ${tracks.length}`);
    return tracks;
  } catch (err: any) {
    console.warn(`⚠️ YouTube Mix falló: ${err.message}`);
    return [];
  }
}

async function refillRadioQueue(guildId: string) {
  const estado = estados.get(guildId);
  if (!estado) return;

  let added = 0;

  // Radio sembrada: si hay un tema semilla, rellenamos con PARECIDOS a ese tema.
  if (estado.seedTrack) {
    const similares = await getSimilarTracks(estado.seedTrack);
    for (const track of similares) {
      if (estado.queue.length >= 10) break;
      if (!estado.queue.find((t) => t.url === track.url)) {
        estado.queue.push(track);
        added++;
      }
    }
    if (added > 0) {
      console.log(`📻 Auto-rellenado (sembrado): ${added} tracks [${guildId}]`);
      return;
    }
    // Si no salieron similares, caemos a la playlist base de abajo.
  }

  // Fallback final: playlist hardcodeada (comportamiento original).
  const baseTracks = estado.basePlaylistTrackQueries;
  if (baseTracks.length === 0) return;

  // Copia antes de mezclar: .sort() muta in-place y baseTracks es estado persistente
  // (compartido entre rellenos), no se debe reordenar la fuente original.
  const shuffled = [...baseTracks].sort(() => Math.random() - 0.5);

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
      inlineVolume: true,
    });
    // Guardamos el resource y aplicamos el volumen del guild para que /volume
    // pueda ajustarlo en vivo y el nivel persista entre temas.
    estado.currentResource = resource;
    resource.volume?.setVolume(estado.volume ?? 1.0);

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

    // DJ: descripción corta del tema al INICIO, con ducking suave (se escucha música + voz).
    // Una sola vez por canción, siempre que esté en modo radio.
    if (estado.radioMode && !estado.commentScheduled) {
      estado.commentScheduled = true;
      const trackSnapshot = track;
      setTimeout(() => {
        const e = estados.get(guildId);
        // Solo si la canción sigue sonando (no cambió entremedio)
        if (e && e.radioMode && e.currentTrack?.url === trackSnapshot.url) {
          playDjAnnouncement(guildId, 'comment', trackSnapshot).catch(() => {});
        }
      }, 3000); // ~3s después de arrancar la canción
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

  // ── Loop ────────────────────────────────────────────────────────────────────
  // El modo radio tiene prioridad: el auto-relleno manda y el loop se ignora.
  const skipForzado = estado.skipRequested;
  estado.skipRequested = false;

  // loop=track: repetir el mismo tema, salvo que el fin haya sido un /skip manual.
  if (estado.loopMode === 'track' && !skipForzado && !estado.radioMode && estado.currentTrack) {
    await playCurrentTrack(guildId);
    return;
  }

  // Sacar la track actual de la queue (o rotarla al final si loop=queue)
  if (estado.currentTrack) {
    const idx = estado.queue.findIndex((t) => t.url === estado.currentTrack!.url);
    if (idx !== -1) {
      const [terminado] = estado.queue.splice(idx, 1);
      // loop=queue: el tema terminado vuelve al final para repetir la cola entera.
      if (estado.loopMode === 'queue' && !estado.radioMode && terminado) {
        estado.queue.push(terminado);
      }
    }
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