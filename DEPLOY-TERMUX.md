# 📱 Correr Harmonix en el teléfono (Android + Termux)

Ventaja clave: tu teléfono usa una **IP residencial/móvil**, así que YouTube
**no la bloquea** como a las IPs de datacenter de la nube. Adiós al problema
de *"confirmá que no sos un bot"*.

> ⚠️ El teléfono tiene que quedar **prendido, enchufado y con Termux abierto**.
> Si lo reiniciás o se cierra Termux, el bot se cae.

---

## 1. Instalar Termux (¡bien!)

Instalá Termux **desde F-Droid o GitHub**, NO desde la Play Store
(esa versión está abandonada y rota).

- F-Droid: https://f-droid.org/packages/com.termux/
- GitHub: https://github.com/termux/termux-app/releases

Después instalá también **Termux:API** (misma fuente) para el wake-lock.

---

## 2. Preparar el entorno

Abrí Termux y pegá esto (una línea a la vez o todo junto):

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs git ffmpeg python termux-api
pip install -U yt-dlp
```

Verificá que estén los 3 binarios:

```bash
node -v        # v22.x o similar
ffmpeg -version
yt-dlp --version
```

> Si `npm install` (paso 3) se queja de compilar algo nativo:
> `pkg install -y build-essential` y reintentá.

---

## 3. Clonar y construir

```bash
git clone https://github.com/rsan-bib/harmonix-bot.git
cd harmonix-bot
npm install
npm run build
```

---

## 4. Configurar el `.env`

Creá el archivo de claves:

```bash
nano .env
```

Pegá (con tus valores reales):

```env
DISCORD_TOKEN=tu_token
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_CLIENT_SECRET=tu_client_secret
GEMINI_API_KEY=tu_key_de_gemini
```

> 🚫 En Termux **NO** pongas `YTDLP=./bin/yt-dlp`. Esa línea es solo para
> Discloud. Acá yt-dlp se toma del PATH (lo instalaste con `pip`).

Guardá en nano con `Ctrl+O`, Enter, `Ctrl+X`.

---

## 5. Arrancar

```bash
chmod +x iniciar-termux.sh
./iniciar-termux.sh
```

Deberías ver el login del bot a Discord. ¡Listo! 🎉

---

## Tips para que no se caiga

- **Batería:** Ajustes de Android → Apps → Termux → Batería → **Sin restricciones**.
- **Pantalla:** el `wake-lock` (ya lo hace el script) evita que duerma el proceso.
- **Datos:** si no estás en wifi, streamear música consume datos.
- **Actualizar yt-dlp** (si YouTube cambia y deja de andar): `pip install -U yt-dlp`.
- **Detener:** `Ctrl+C`. Para soltar el wake-lock: `termux-wake-unlock`.
