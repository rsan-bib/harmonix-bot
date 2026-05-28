@echo off
:: JSRadio - Iniciar bot con Node.js v22 (compilado, rápido)
set "PATH=%PATH%;C:\Users\Roko\ffmpeg;C:\Users\Roko\yt-dlp"
cd /d "C:\Users\Roko\Desktop\harmonix-bot"
echo Iniciando JSRadio...
"C:\Users\Roko\AppData\Roaming\fnm\node-versions\v22.22.3\installation\node.exe" dist\bot.js
pause
