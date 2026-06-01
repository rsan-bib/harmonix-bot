# 🎵 Harmonix — JS RADIO

Bot de música para Discord con DJ virtual por TTS. Reproduce desde YouTube, Spotify y SoundCloud, con modo radio que auto-llena la cola y un locutor que presenta cada tema.

```
Node.js 22  ·  TypeScript  ·  discord.js v14  ·  Gemini TTS (voz IA gratis)
```

---

## ⚡ Quick Start

```powershell
git clone https://github.com/rsan-bib/harmonix-bot.git
cd harmonix-bot
npm install
# crear .env (ver sección Config)
npx tsc
.\iniciar.bat
```

---

## 🔧 Configuración

Creá un archivo `.env` en la raíz del proyecto:

```env
# ─── Obligatorio ─────────────────────────────────────────────────────────────
DISCORD_TOKEN=tu_token_de_bot

# ─── Opcional — mejora la experiencia ───────────────────────────────────────
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_CLIENT_SECRET=tu_client_secret

# ─── TTS del DJ (cascada: Gemini → Piper → gTTS) ────────────────────────────
GEMINI_API_KEY=                    # gratis en ai.google.dev (sin tarjeta)
GEMINI_TTS_DISABLED=0             # 1 para desactivar Gemini TTS
GEMINI_TTS_VOICE=Kore              # Kore, Leda, Aoede, Zephyr, Autonoe, Callirrhoe

# Piper: TTS neural local (offline, sin cuenta). Si no está, se salta.
# PIPER_EXE=C:\Users\Roko\piper\piper\piper.exe
# PIPER_MODEL=C:\Users\Roko\piper\models\es_AR-daniela-high.onnx
```

> **Sin GEMINI_API_KEY** el DJ sigue funcionando con Piper (local) o gTTS (red).

---

## 🎙️ Cascada TTS

```
Gemini TTS  →  Piper (local)  →  gTTS (Google Translate)
   💰 gratis       🖥️ offline       🌐 red
```

| Motor | Costo | Offline | Calidad |
|---|---|---|---|
| **Gemini TTS** | Gratis (key en ai.google.dev) | ❌ | ⭐⭐⭐⭐⭐ voz IA natural |
| **Piper** | Gratis (binario local) | ✅ | ⭐⭐⭐ metálico pero funcional |
| **gTTS** | Gratis (requiere red) | ❌ | ⭐⭐ robotic |

---

## 🎮 Comandos

| Comando | Descripción |
|---|---|
| `/play` | Reproduce o agrega a la cola. Acepta búsqueda o URL directa. |
| `/radio on` | Activa modo radio: DJ + auto-cola desde playlist de Spotify. |
| `/radio off` | Desactiva modo radio. |
| `/radio joke` | Cuenta un chiste en el momento. |
| `/skip` | Salta al siguiente tema. |
| `/stop` | Detiene todo y desconecta el bot. |
| `/queue` | Muestra la cola de reproducción. |
| `/nowplaying` | Info del tema actual (carátula, duración, fuente). |
| `/volume 0-100` | Ajusta el volumen (0 = mute, 100 = máximo). |
| `/loop track` | Repite el tema actual. |
| `/loop queue` | Repite toda la cola. |
| `/shuffle` | Mezcla la cola al azar. |
| `/remove #` | Quita un tema de la cola por número. |
| `/clear` | Vacía la cola. |
| `/help` | Muestra esta ayuda. |

### Fuentes de `/play`

- `auto` — busca en Spotify → YouTube → SoundCloud.
- `yt` — solo YouTube.
- `sp` — Spotify (metadata) → YouTube (audio).
- `scld` — solo SoundCloud.

URLs directas se detectan automáticamente.

---

## 📻 Modo Radio

Al activar con `/radio on`:

1. Carga la **playlist base** (cableada en `src/bot.ts:51`).
2. Llena la cola automáticamente (shuffle, hasta 10 temas).
3. El **DJ** presenta cada tema con voz IA.
4. Entre canciones puede contar chistes (40% de probabilidad).
5. La música **no se corta** — el DJ habla con ducking (música baja, voz se escucha).

---

## 🏗️ Arquitectura

```
src/
├── bot.ts          (~1800 líneas) — lógica principal, TTS, audio pipeline
├── types.ts        — tipos compartidos (Track, GuildState, Engine)
└── commands/       — 16 archivos, uno por comando
```

- **Estado por guild:** `Map<guildId, GuildState>` con player, cola, modo radio, etc.
- **Audio pipeline:** `yt-dlp` → `ffmpeg` (Opus 128kbps) → `@discordjs/voice`
- **Cache de URLs:** 30 min TTL para evitar llamados repetidos a yt-dlp.

---

## 🛠️ Troubleshooting

### La música no suena / para antes de tiempo

1. Recompilá: `npx tsc` y reiniciá.
2. Actualizá yt-dlp:
   ```powershell
   C:\Users\Roko\yt-dlp\yt-dlp.exe -U
   ```

### "spawn ENOENT" o "command not found"

Las rutas de `YTDLP` y `FFMPEG` están cableadas en `src/bot.ts`. Verificá:
```powershell
C:\Users\Roko\ffmpeg\ffmpeg.exe -version
C:\Users\Roko\yt-dlp\yt-dlp.exe --version
```

### "El bot se desconecta solo"

Es intencional: tras 30s sin nadie en el canal de voz, se desconecta solo.

### "/play no encuentra nada"

Probá `/play` con `fuente: yt` para descartar problemas con Spotify.

### Sin sonido (pero conectado)

Reinstalá dependencias limpias:
```powershell
rm -r node_modules
npm install
```

---

## ✅ Hecho

- ✅ `/volume`, `/loop`, `/shuffle`, `/remove`, `/clear`
- ✅ Ducking (música baja + voz a la vez)
- ✅ Descripciones IA de canciones (Gemini)
- ✅ Gemini TTS (voz femenina chilena, gratis)
- ✅ Portabilidad a Android/Termux

## 🔜 Por hacer

- [ ] Mover rutas `YTDLP`/`FFMPEG` a `.env`
- [ ] Tests unitarios
- [ ] Persistir cola entre reinicios