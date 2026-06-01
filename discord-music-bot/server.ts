import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { DEFAULT_TRACKS } from './src/data/tracks';

// Load env variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini Client
let _ai: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      console.warn('GEMINI_API_KEY is missing or using placeholder. AI features will run in simulation mode.');
      return null;
    }
    _ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _ai;
}

// 1. API: Search and curate music
app.post('/api/search', async (req, res) => {
  const { query, source } = req.body;
  
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const queryTrimmed = query.trim().toLowerCase();

  // Handle stream links directly (e.g. custom HTTP stream urls)
  if (queryTrimmed.startsWith('http://') || queryTrimmed.startsWith('https://')) {
    const isSpotify = queryTrimmed.includes('spotify.com');
    const isYoutube = queryTrimmed.includes('youtube.com') || queryTrimmed.includes('youtu.be');
    const isSoundcloud = queryTrimmed.includes('soundcloud.com');
    let title = 'Custom Audio Link';
    let artist = 'Web Stream';
    let genre = 'Electronic';
    let artwork = 'linear-gradient(135deg, #1f1c2c 0%, #928dab 100%)';

    // Parse URL for metadata guess
    try {
      const urlObj = new URL(query);
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
      if (pathParts.length > 0) {
        title = decodeURIComponent(pathParts[pathParts.length - 1].replace(/[-_]/g, ' '));
      }
    } catch (e) {}

    const customTrack = {
      id: `custom_${Date.now()}`,
      title,
      artist,
      album: 'Global Stream Feed',
      duration: 360, // Mock duration for streams
      url: query,
      artwork,
      source: isSpotify ? 'spotify' : isYoutube ? 'youtube' : isSoundcloud ? 'soundcloud' : 'local',
      genre,
      isCustomUrl: true,
      lyrics: '[00:00] Playing custom stream URL.\n[00:10] Enjoy the high-quality Discord streaming node.'
    };
    return res.json([customTrack]);
  }

  // Exact matching against internal database first
  const localMatches = DEFAULT_TRACKS.filter(track => 
    track.title.toLowerCase().includes(queryTrimmed) ||
    track.artist.toLowerCase().includes(queryTrimmed) ||
    track.genre.toLowerCase().includes(queryTrimmed)
  );

  // If we have local matches and it's not looking like an abstract request, return them
  const isAbstract = queryTrimmed.split(' ').length > 2 || 
                     queryTrimmed.includes('mood') || 
                     queryTrimmed.includes('like') || 
                     queryTrimmed.includes('chill') || 
                     queryTrimmed.includes('programming') || 
                     queryTrimmed.includes('study');

  if (localMatches.length > 0 && !isAbstract) {
    return res.json(localMatches);
  }

  // Let's call Gemini to act as a Smart Music Curator!
  const ai = getGemini();
  if (ai) {
    try {
      const systemInstruction = `You are the AI Music Butler for a high-fidelity Discord Music Bot.
Given a search prompt or conversational song suggestion request from the user, search your knowledge base of music (including Spotify, Youtube, SoundCloud genres).
Generate 1 to 3 beautiful tracks that best fit the prompt perfectly. For EACH track, provide valid metadata. Set the audio URLs to one of our designated stable streams that fits the genre best. Our available stream URLs are:
- 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' (Best for Synthwave, Fast Synth, Electronic, Vaporwave)
- 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' (Best for Lofi, Jazz, Cozy, Cafe, R&B)
- 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' (Best for Ambient, Atmospheric, Space, Post-Rock)
- 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' (Best for Heavy Synthesizer, Dark Cyberpunk, Industrial, metal/rock vibes)
- 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' (Best for Acoustic, Breeze, Pop, Indie Rock, Summer, Happy vibes)
- 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' (Best for Deep House, Club, Dance, Tech House, EDM)

Respond ONLY in valid raw JSON.`;

      const prompt = `Recommend 1 to 3 tracks for this query: "${query}". Map each track to the most appropriate stream URL from our collection. Create beautiful modern artist/track names and set beautiful CSS gradient colors for 'artwork' (e.g. "linear-gradient(135deg, #color1 0%, #color2 100%)"). Specify the source as spotify, youtube, or soundcloud.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                artist: { type: Type.STRING },
                album: { type: Type.STRING },
                duration: { type: Type.INTEGER, description: 'Track duration in seconds between 120 and 500' },
                url: { type: Type.STRING, description: 'One of our allowed soundhelix URLs' },
                artwork: { type: Type.STRING, description: 'Beautiful CSS gradient string' },
                source: { type: Type.STRING, description: 'One of: spotify, youtube, soundcloud' },
                genre: { type: Type.STRING },
                reason: { type: Type.STRING, description: 'A short reason why the DJ chose this track for you' }
              },
              required: ['title', 'artist', 'album', 'duration', 'url', 'artwork', 'source', 'genre']
            }
          }
        }
      });

      const responseText = response.text;
      if (responseText) {
        const aiTracks = JSON.parse(responseText.trim());
        // Map track IDs to secure string format
        const cleanAiTracks = aiTracks.map((tr: any, idx: number) => ({
          ...tr,
          id: tr.id || `ai_track_${Date.now()}_${idx}`,
        }));
        return res.json(cleanAiTracks);
      }
    } catch (err) {
      console.error('Gemini music search failed, falling back to local database matches:', err);
    }
  }

  // Fallback if Gemini is not set up or fails
  const partialMatches = DEFAULT_TRACKS.filter(track => 
    track.title.toLowerCase().includes(queryTrimmed) || 
    track.artist.toLowerCase().includes(queryTrimmed) ||
    track.genre.toLowerCase().includes(queryTrimmed)
  );
  if (partialMatches.length > 0) {
    return res.json(partialMatches);
  }

  // Global catch-all matching (returns a randomized beautiful track template)
  const defaultTrack = DEFAULT_TRACKS[Math.floor(Math.random() * DEFAULT_TRACKS.length)];
  const randomizedMockTrack = {
    ...defaultTrack,
    id: `rnd_${Date.now()}`,
    title: query.charAt(0).toUpperCase() + query.slice(1),
    artist: 'Selected Artist Mix',
    album: 'Custom Discord Request',
  };
  return res.json([randomizedMockTrack]);
});

// 2. API: Dynamic structured lyrics generation
app.post('/api/lyrics', async (req, res) => {
  const { title, artist } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Song title is required' });
  }

  const ai = getGemini();
  if (ai) {
    try {
      const prompt = `Write or fetch accurate song lyrics for "${title}" by "${artist || 'Unknown'}".
Format it with simulated sync timestamps (brackets at start of line with active second e.g. [00:12], [01:05]) so that they scroll nicely.
Include at least 6-8 timed lyric lines, covering Intro, Verse, Chorus, Bridge, or Outro where appropriate.
If the song is instrumental or you cannot fetch actual lyrics, write a beautiful rhythmic cybernetic lyric series matching the mood.
Return ONLY the formatted text with timestamps, nothing else.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
      });

      if (response.text) {
        return res.json({ lyrics: response.text.trim() });
      }
    } catch (err) {
      console.error('Gemini lyrics generation failed:', err);
    }
  }

  // Local fallback
  const localMatch = DEFAULT_TRACKS.find(t => t.title.toLowerCase() === title.toLowerCase());
  if (localMatch && localMatch.lyrics) {
    return res.json({ lyrics: localMatch.lyrics });
  }

  // Simulated timestamp lyrics
  const simulatedLyrics = `[00:00] (Instrumental Intro)
[00:15] Lost in the beat, deep inside the console stream.
[00:30] Golden frequencies are singing to our dreams.
[00:48] Play it loud now, let the music fill the line.
[01:05] Audio waves surfing back and forth in time.
[01:25] (Stunning Synthesizer Solo)
[01:50] Walking through the neon hallways in our mind.
[02:10] No more boundaries, only rhythms left to find.
[02:30] (Peaceful Echoes - Fade Out)`;

  return res.json({ lyrics: simulatedLyrics });
});

// 3. API: Gemini AI-DJ Interactive chatbot or conversation recommendation
app.post('/api/ai-dj', async (req, res) => {
  const { prompt, chatHistory } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'User prompt is required' });
  }

  const ai = getGemini();
  if (ai) {
    try {
      const systemInstruction = `You are a legendary Discord Music Bot AI named "Harmonix".
You respond in pure Discord chat markdown format.
You have a friendly, geeky, witty DJ attitude, using emojis like 🎧, 🎵, ⚡, 🔊, 💿.
Explain shortly why you are selecting recommendations, describe its vibe in cool musical adjectives, and formatting it elegantly like a Discord embed with Markdown blocks:
\`\`\`
[INFO-BLOCK]
\`\`\`
Recommend a theme, and tell them they can click on the recommendation or type "/play Song Name" to spin it right now.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { systemInstruction }
      });

      if (response.text) {
        return res.json({ response: response.text.trim() });
      }
    } catch (err) {
      console.error('Gemini DJ chatbot failed:', err);
    }
  }

  // Simple static fallback
  const staticAIdjResponse = `### 🎧 **Harmonix Bot Recommendation** 🎧

Hey there! I see you are looking for that perfect vibe. Here is what I picked out of our premium server stacks:
\`\`\`ts
📀 Title: Neon Odyssey
🎸 Artist: Dynasty 198X
🏷️ Genre: Synthwave (Retro Future)
\`\`\`
*This track has high-energy bass and neon twilight vocals, perfect for midnight server sessions.*

You can spin this track immediately by typing \`/play Neon Odyssey\` in the command input or clicking it on the media panel in your sidebar! Let's rock! ⚡`;

  return res.json({ response: staticAIdjResponse });
});

// Vite middleware development / static production setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
