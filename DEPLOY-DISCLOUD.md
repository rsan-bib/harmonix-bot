# 🚀 Deploy en Discloud (gratis, sin tarjeta)

El bot ya está preparado para Discloud. Solo necesitás subirlo.

## Archivos que hacen el deploy

| Archivo | Para qué |
|---|---|
| `discloud.config` | Config de Discloud: tipo bot, RAM, instala `ffmpeg` por APT, arranca con `npm run start:prod`. |
| `scripts/ensure-ytdlp.mjs` | Baja el binario de `yt-dlp` para Linux al arrancar (Discloud no lo trae por APT). |
| `.discloudignore` | Excluye `node_modules`, `.git`, logs y PDFs del zip. |
| `dist/` | Código compilado que se ejecuta en producción (más liviano en RAM que `tsx`). |

## Pasos

1. **Compilá** (deja `dist/` fresco):
   ```powershell
   npm run build
   ```

2. **Editá el `.env`** y agregá esta línea (dónde encontrar yt-dlp en la nube):
   ```env
   YTDLP=./bin/yt-dlp
   ```
   El `.env` viaja DENTRO del zip a Discloud (no a GitHub). Tus claves quedan ahí.
   `FFMPEG`/`FFPROBE` NO hace falta setearlas: en Linux se resuelven solas del PATH.

3. **Subí a Discloud** — una de dos:

   **Opción A — Extensión de VS Code (recomendada):**
   - Instalá la extensión *Discloud* en VS Code.
   - Login con tu cuenta de Discloud (gratis, sin tarjeta, en https://discloud.com).
   - Click derecho en la carpeta del proyecto → *Discloud: Upload*.

   **Opción B — Bot de Discloud por Discord:**
   - Comprimí el proyecto en `.zip` (con `discloud.config` en la RAÍZ del zip).
   - Mandá el zip al bot de Discloud en su server con el comando de upload.

4. **Mirá los logs** en el panel de Discloud. Deberías ver:
   ```
   ⬇️  Descargando yt-dlp (Linux standalone)...
   ✅ yt-dlp listo en ./bin/yt-dlp
   ... y luego el login del bot a Discord
   ```

## Si YouTube bloquea (lo más probable que falle)

YouTube suele rechazar IPs de datacenter con *"Sign in to confirm you're not a bot"*.
Si en los logs ves ese error al reproducir, hay que pasarle cookies a yt-dlp.
Avisame y agrego soporte de `--cookies` (exportás las cookies de tu navegador y se suben con el bot).
