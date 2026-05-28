# Harmonix — JS RADIO

Bot de música para Discord (TypeScript + discord.js v14). Reproduce desde YouTube, Spotify y SoundCloud, y opcionalmente activa un "modo radio" con DJ por TTS entre temas.

> Nombre interno del proyecto: `jsradio-bot`. El bot se presenta como **JS RADIO** en Discord.

---

## Requisitos

| Componente | Versión / nota | Usado en este equipo |
|---|---|---|
| Node.js | 20+ (recomendado 22) | `C:\Users\Roko\AppData\Roaming\fnm\node-versions\v22.22.3` |
| ffmpeg | binario suelto, NO empaquetado | `C:\Users\Roko\ffmpeg\ffmpeg.exe` |
| yt-dlp | actualizado mensualmente | `C:\Users\Roko\yt-dlp\yt-dlp.exe` |
| Bot de Discord | con scopes `bot` + `applications.commands` y permisos `Connect`, `Speak`, `Send Messages`, `Use Slash Commands` | — |

Si cambiás de máquina, ajustá las rutas `YTDLP` y `FFMPEG` en `src/bot.ts:35-36`.

### Intents requeridos en el portal de Discord

En el **Discord Developer Portal → Bot → Privileged Gateway Intents**, dejá activado:

- ✅ Message Content Intent

Los otros (`Guilds`, `GuildVoiceStates`, `GuildMessages`) no son privilegiados, ya se piden automáticamente.

---

## Configuración (`.env`)

Creá un archivo `.env` en la raíz del proyecto:

```env
DISCORD_TOKEN=tu_token_de_bot
SPOTIFY_CLIENT_ID=opcional_pero_recomendado
SPOTIFY_CLIENT_SECRET=opcional_pero_recomendado

# Opcional: cambiar voz del DJ. Default: es-AR-ElenaNeural
# Voces es-AR válidas: es-AR-ElenaNeural | es-AR-TomasNeural
# Otras opciones: es-MX-DaliaNeural, es-ES-ElviraNeural, etc.
EDGE_TTS_VOICE=es-AR-ElenaNeural
```

- **Sin** credenciales de Spotify el bot sigue funcionando, pero `/play` con URL/búsqueda de Spotify cae en YouTube y el modo radio no puede llenar la cola desde la playlist base.
- La playlist base del modo radio está cableada en `RADIO_PLAYLIST_ID` (`src/bot.ts:39`). Cambiala si querés otra.

---

## Instalación

```powershell
cd C:\Users\Roko\Desktop\harmonix-bot
npm install
npx tsc
```

`npx tsc` compila `src/bot.ts` → `dist/bot.js` (lo que ejecuta `iniciar.bat`).

> **Importante:** cada vez que toques `src/bot.ts` tenés que recompilar (`npx tsc`) para que `iniciar.bat` use la versión nueva. Si querés modo dev con recarga, usá `npm run dev` (ts-node con watch).

---

## Cómo correr

**Producción (compilado, rápido):**

```powershell
.\iniciar.bat
```

**Dev (sin compilar, ts-node + watch):**

```powershell
npm run dev
```

**Chequeo de tipos sin emitir archivos:**

```powershell
npm run lint
```

---

## Comandos slash

| Comando | Descripción |
|---|---|
| `/play cancion:<query o URL> fuente:<auto\|yt\|sp\|scld>` | Reproduce o agrega a la cola. Default: `auto`. |
| `/radio accion:<on\|off\|joke\|toggle>` | Activa/desactiva DJ + auto-cola con la playlist base. `joke` cuenta un chiste ya mismo. |
| `/skip` | Salta al tema actual. |
| `/stop` | Detiene la música y desconecta el bot. |
| `/queue` | Lista los temas en cola. |
| `/nowplaying` | Embed del tema actual (carátula, artista, duración, fuente). |
| `/help` | Ayuda en el chat. |

### Comportamiento de `fuente` en `/play`

- `auto` — busca en Spotify, YouTube y SoundCloud en paralelo y elige el primer hallazgo (Spotify → YouTube tiene prioridad).
- `yt` — solo YouTube.
- `sp` — Spotify → YouTube (Spotify para metadata, YouTube para audio).
- `scld` — solo SoundCloud.

URLs directas (`https://...`) se detectan automáticamente y la opción `fuente` se ignora.

### Modo radio

Cuando se activa con `/radio on`:

1. Se carga la playlist base (`RADIO_PLAYLIST_ID`) desde Spotify.
2. El bot va llenando la cola automáticamente con esos temas (shuffle, hasta 10 en cola).
3. Entre temas hay anuncios del DJ (intro, "ahora suena", "siguiente tema") y chistes con 40% de probabilidad.
4. Los anuncios pausan la música, hablan, y la música se reanuda automáticamente. **No la cortan.**

---

## Troubleshooting

### "La música no suena" / "para antes de terminar" / "el narrador corta la música"

**Esos tres síntomas eran el mismo bug y ya está arreglado en este código.** Si volvés a verlos:

1. Asegurate de haber **recompilado** (`npx tsc`) y de estar corriendo `dist\bot.js`, no una versión vieja.
2. Verificá que `EDGE_TTS_VOICE` apunte a una voz que exista (las viejas versiones tenían `es-AR-KernelNeural`, que **no existe** en Edge TTS — el TTS fallaba en silencio).
3. Si el problema es solo en una canción puntual, suele ser yt-dlp desactualizado:

```powershell
C:\Users\Roko\yt-dlp\yt-dlp.exe -U
```

### `yt-dlp attempt failed: El sistema no puede encontrar la ruta especificada`

Pasa cuando los comandos a `yt-dlp` se invocaban con `cmd /c "..."` y la línea tenía más de dos comillas dobles. La regla de quote-handling de `cmd /c` mantiene las comillas externas en lugar de quitarlas y termina buscando un archivo cuyo nombre incluye las comillas. **Ya fue removido el `cmd /c` redundante** (`execAsync` ya corre dentro de cmd.exe por default en Windows). Si vuelve a aparecer:

1. Confirmá que `dist/bot.js` está recompilado (`npx tsc`).
2. Verificá que la ruta de `YTDLP` (`src/bot.ts:35`) sea correcta:
   ```powershell
   C:\Users\Roko\yt-dlp\yt-dlp.exe --version
   ```

### "El bot se conecta pero no se escucha nada"

- Falta de codec de audio. El proyecto trae `libsodium-wrappers` y `opusscript`, pero a veces discord.js prefiere un binario nativo. Reinstalá deps limpias:
  ```powershell
  rm -r node_modules
  npm install
  ```
- Verificá que ffmpeg responda:
  ```powershell
  C:\Users\Roko\ffmpeg\ffmpeg.exe -version
  ```

### "`/play` no encuentra nada"

- Probá `fuente: yt` directo para descartar problemas con la API de Spotify.
- Revisá los logs en la consola. Si ves `yt-dlp attempt 1 failed`, es yt-dlp: actualizalo.

### El bot se desconecta solo

Es intencional: tras 30s sin oyentes en el canal de voz (todos bots o nadie), `voiceStateUpdate` programa un disconnect (`src/bot.ts:531`). Volver a entrar al canal cancela el timer.

### "spawn ENOENT" o "command not found"

Las rutas `YTDLP` y `FFMPEG` en `src/bot.ts:35-36` están cableadas. Si moviste ffmpeg o yt-dlp, editalas y recompilá.

---

## Arquitectura (resumen rápido)

- **Un único archivo:** `src/bot.ts` (~1300 líneas).
- **Estado por guild:** `Map<guildId, GuildState>` con `player`, `connection`, `queue`, `currentTrack`, `ffmpegProcess`, flags de modo radio, etc.
- **Pipeline de audio:** `yt-dlp` resuelve la URL directa del stream → `ffmpeg` lo recodifica a Opus 192kbps en un pipe → `@discordjs/voice` consume el pipe como `OggOpus`.
- **TTS del DJ:** `edge-tts-node` genera MP3 → `ffmpeg` lo pasa a Opus → se reproduce en un `announcePlayer` separado, pausando la música mientras dura, y al terminar re-suscribe el player principal y reanuda.
- **Cache de URLs resueltas:** `audioUrlCache` con TTL de 30 min para evitar llamadas repetidas a yt-dlp.

---

## Cosas para mejorar (TODO)

- [ ] Mover rutas `YTDLP`/`FFMPEG` a `.env` para no hardcodearlas.
- [ ] Tests unitarios (no hay ninguno).
- [ ] Comando `/volume` (actualmente no implementado).
- [ ] Comando `/loop` y `/shuffle`.
- [ ] Persistir cola entre reinicios.
- [ ] Ducking real de música cuando habla el DJ (hoy se pausa; lo ideal sería bajar volumen y mezclar).
