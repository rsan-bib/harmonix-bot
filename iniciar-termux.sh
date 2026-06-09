#!/data/data/com.termux/files/usr/bin/bash
# Arranque del bot Harmonix en Android/Termux.
# A diferencia de la nube, acá yt-dlp y ffmpeg vienen del PATH de Termux
# (instalados con pkg/pip), así que NO usamos ensure-ytdlp ni el override YTDLP.

# Evita que Android duerma el proceso al apagar la pantalla.
termux-wake-lock 2>/dev/null

# Ir a la carpeta del script (raíz del proyecto).
cd "$(dirname "$0")" || exit 1

echo "🎵 Iniciando Harmonix en Termux..."
echo "   (Ctrl+C para detener · 'termux-wake-unlock' libera el wake-lock)"

# Corre el compilado (más liviano que tsx). yt-dlp/ffmpeg se resuelven del PATH.
node dist/bot.js
