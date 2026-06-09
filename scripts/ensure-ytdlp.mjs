// Descarga el binario standalone de yt-dlp para Linux si no existe.
// Se ejecuta antes de arrancar el bot en la nube (Discloud), donde yt-dlp
// no viene como paquete APT. El binario yt-dlp_linux es autocontenido
// (no necesita Python). Si ya está, no vuelve a bajarlo.
//
// El bot lo encuentra vía la variable de entorno YTDLP=./bin/yt-dlp (.env).

import { existsSync, mkdirSync, chmodSync, createWriteStream, statSync } from 'fs';
import { dirname } from 'path';
import https from 'https';

const DEST = './bin/yt-dlp';
const URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'harmonix-bot' } }, (res) => {
        // GitHub releases responde 302 hacia el CDN; seguimos el redirect.
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects <= 0) return reject(new Error('Demasiados redirects'));
          res.resume();
          return resolve(download(res.headers.location, dest, redirects - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} al bajar yt-dlp`));
        }
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  if (existsSync(DEST) && statSync(DEST).size > 1_000_000) {
    console.log('✅ yt-dlp ya presente, no se descarga.');
    return;
  }
  mkdirSync(dirname(DEST), { recursive: true });
  console.log('⬇️  Descargando yt-dlp (Linux standalone)...');
  await download(URL, DEST);
  chmodSync(DEST, 0o755);
  console.log(`✅ yt-dlp listo en ${DEST}`);
}

main().catch((err) => {
  console.error('❌ No se pudo preparar yt-dlp:', err.message);
  process.exit(1);
});
