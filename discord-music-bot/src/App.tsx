import React, { useState, useRef, useEffect } from 'react';
import { Track, DiscordMember, DiscordServer, TerminalMessage, PlaybackState } from './types';
import { DEFAULT_TRACKS } from './data/tracks';
import VoiceChannelVisualizer from './components/VoiceChannelVisualizer';
import CommandTerminal from './components/CommandTerminal';
import BotCodeHub from './components/BotCodeHub';
import {
  Play, Pause, SkipForward, RotateCcw, Volume2, Music, Users, MessageSquare, 
  Settings, HelpCircle, Compass, Radio, ExternalLink, Headphones, Sparkles, Check, Server, Bot, Disc, FileCode
} from 'lucide-react';

// Pre-configured Discord server and member lists
const VIRTUAL_SERVERS: DiscordServer[] = [
  {
    id: 'server_1',
    name: "Harmonix HQ",
    icon: "🎧",
    channels: {
      text: ['welcome', 'music-bot-commands', 'general-lounge', 'announcements'],
      voice: [
        {
          id: 'vc_1',
          name: '🔊 Voice Chat 1',
          members: [
            { id: 'user_bot', username: 'Harmonix Bot', avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%235865f2"><rect width="100" height="100" rx="50"/><circle cx="50" cy="45" r="18" fill="white"/><circle cx="50" cy="45" r="12" fill="%231e1f22"/><circle cx="50" cy="45" r="5" fill="white"/><path d="M30,80 Q50,60 70,80" stroke="white" stroke-width="8" fill="none" stroke-linecap="round"/></svg>', role: 'bot', isSpeaking: false, status: 'online' }
          ]
        },
        {
          id: 'vc_2',
          name: '🔊 Acoustic Studio',
          members: []
        }
      ]
    }
  },
  {
    id: 'server_2',
    name: "Gamer Zone",
    icon: "🎮",
    channels: {
      text: ['general', 'gaming-clips'],
      voice: [
        {
          id: 'vc_3',
          name: '🔊 Duo Lobby',
          members: []
        }
      ]
    }
  }
];

const INITIAL_MEMBERS: DiscordMember[] = [
  { id: 'user_1', username: 'capitalcatto', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80', role: 'owner', isSpeaking: false, status: 'online' },
  { id: 'user_bot', username: 'Harmonix', avatar: '', role: 'bot', isSpeaking: false, status: 'online' },
  { id: 'user_2', username: 'Wumpus', avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=80&h=80&q=80', role: 'admin', isSpeaking: false, status: 'idle' },
  { id: 'user_3', username: 'Nelly', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&h=80&q=80', role: 'moderator', isSpeaking: false, status: 'dnd' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code-hub'>('simulator');
  const [activeServer, setActiveServer] = useState<DiscordServer>(VIRTUAL_SERVERS[0]);
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<string | null>(null);
  
  // Custom audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlaybackState>({
    currentTrack: null,
    isPlaying: false,
    position: 0,
    volume: 75,
    loop: 'none',
    queue: [],
    history: []
  });

  // Sidebar components selection
  const [lyricsPanelOpen, setLyricsPanelOpen] = useState(true);
  const [lyricsData, setLyricsData] = useState<string>('');
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [aiDjChatOpen, setAiDjChatOpen] = useState(false);
  const [aiDjResponse, setAiDjResponse] = useState<string>('');
  const [aiDjPromptInput, setAiDjPromptInput] = useState('');
  const [aiDjLoading, setAiDjLoading] = useState(false);

  // Terminal state logs preloaded with simulated startup
  const [terminalMessages, setTerminalMessages] = useState<TerminalMessage[]>([
    {
      id: 'init_1',
      timestamp: 'Today at 4:50 PM',
      sender: { username: 'System-Notify', avatar: '', isBot: true, roleColor: 'text-[#949ba4]' },
      content: '✔ Establishing websocket stream tunnel to Node compiler server on port :3000...'
    },
    {
      id: 'init_2',
      timestamp: 'Today at 4:51 PM',
      sender: { username: 'Harmonix', avatar: '', isBot: true, roleColor: 'text-[#5865f2]' },
      content: '👋 Welcome to **Harmonix Bot Hub**!\nDeploy an administrative stream server or enter `/play [song]` commands below to queue. Type `/help` for guidance guides.'
    }
  ]);

  // Synchronize audio capabilities
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = state.volume / 100;
    }
  }, [state.volume]);

  // Handle Track Completion Loop
  const handleTrackEnded = () => {
    if (state.loop === 'track') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      skipNextTrack();
    }
  };

  const playTrackDirect = (track: Track) => {
    setState(prev => ({
      ...prev,
      currentTrack: track,
      isPlaying: true,
      position: 0,
      history: prev.currentTrack ? [prev.currentTrack, ...prev.history].slice(0, 15) : prev.history
    }));

    // Trigger Join VC visually if not already in one
    if (!activeVoiceChannel) {
      setActiveVoiceChannel(activeServer.channels.voice[0].id);
    }

    // Set lyrics
    if (track.lyrics) {
      setLyricsData(track.lyrics);
    } else {
      fetchLyricsForTrack(track);
    }

    // Log terminal embed
    logBotMessage({
      content: `🎧 Commencing high-quality audio stream for: **${track.title}**`,
      embed: {
        title: `${track.title} - ${track.artist}`,
        description: `Now loading stream via standard ${track.source.toUpperCase()} gateway buffer...`,
        fields: [
          { name: 'ALBUM', value: track.album, inline: true },
          { name: 'DURATION', value: formatTime(track.duration), inline: true },
          { name: 'GENRE', value: track.genre, inline: true },
          { name: 'BITRATE', value: '320kbps STEREO', inline: true }
        ],
        color: track.source === 'spotify' ? '#1db954' : track.source === 'youtube' ? '#ff0000' : '#ff5500',
        thumbnail: track.artwork,
        footer: 'Harmonix Premium Streaming Engine'
      }
    });
  };

  const skipNextTrack = () => {
    if (state.queue.length > 0) {
      const nextTrack = state.queue[0];
      const remainingQueue = state.queue.slice(1);
      
      setState(prev => ({
        ...prev,
        queue: remainingQueue
      }));
      playTrackDirect(nextTrack);
    } else {
      // Loop entire history if configured or stop
      if (state.loop === 'queue' && state.history.length > 0) {
        const fullHistoryReversed = [...state.history].reverse();
        setState(prev => ({
          ...prev,
          queue: fullHistoryReversed.slice(1),
          history: []
        }));
        playTrackDirect(fullHistoryReversed[0]);
      } else {
        setState(prev => ({
          ...prev,
          isPlaying: false,
          currentTrack: null,
          position: 0
        }));
        logBotMessage({
          content: '⏹️ Playlist queue exhausted. Streaming connection idle.'
        });
      }
    }
  };

  const togglePlayPause = () => {
    if (!state.currentTrack) {
      if (DEFAULT_TRACKS.length > 0) {
        playTrackDirect(DEFAULT_TRACKS[0]);
      }
      return;
    }
    
    const nextPlaying = !state.isPlaying;
    setState(prev => ({ ...prev, isPlaying: nextPlaying }));

    if (audioRef.current) {
      if (nextPlaying) {
        audioRef.current.play().catch(e => console.warn('Play restricted:', e));
      } else {
        audioRef.current.pause();
      }
    }

    logBotMessage({
      content: nextPlaying ? '▶️ Resuming audio transmission feed...' : '⏸️ Streaming server connection paused.'
    });
  };

  // Trigger sound positioning scrub
  const handleProgressScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextPos = parseFloat(e.target.value);
    setState(prev => ({ ...prev, position: nextPos }));
    if (audioRef.current) {
      audioRef.current.currentTime = nextPos;
    }
  };

  // Bot embeds and messaging logger
  const logBotMessage = (opts: { content: string; embed?: TerminalMessage['embed'] }) => {
    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setTerminalMessages(prev => [
      ...prev,
      {
        id: `bot_${Date.now()}`,
        timestamp: `Today at ${formattedTime}`,
        sender: {
          username: 'Harmonix',
          avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%235865f2"><rect width="100" height="100" rx="50"/><circle cx="50" cy="45" r="18" fill="white"/><circle cx="50" cy="45" r="12" fill="%231e1f22"/><circle cx="50" cy="45" r="5" fill="white"/><path d="M30,80 Q50,60 70,80" stroke="white" stroke-width="8" fill="none" stroke-linecap="round"/></svg>',
          isBot: true,
          roleColor: 'text-[#5865f2]'
        },
        content: opts.content,
        embed: opts.embed
      }
    ].slice(-100)); // Cap scrollback
  };

  const logUserMessage = (text: string) => {
    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setTerminalMessages(prev => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        timestamp: `Today at ${formattedTime}`,
        sender: {
          username: 'capitalcatto',
          avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=80&h=80&q=80',
          isBot: false,
          roleColor: 'text-white'
        },
        content: text
      }
    ].slice(-100));
  };

  // API calls
  const fetchLyricsForTrack = async (track: Track) => {
    setLyricsLoading(true);
    try {
      const res = await fetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: track.title, artist: track.artist })
      });
      const data = await res.json();
      if (data.lyrics) {
        setLyricsData(data.lyrics);
      }
    } catch (e) {
      console.error('Failed to load lyrics:', e);
    } finally {
      setLyricsLoading(false);
    }
  };

  const handleExecuteCommand = async (commandString: string) => {
    const cleanCmd = commandString.trim();
    if (!cleanCmd) return;

    logUserMessage(cleanCmd);

    // Parse commands
    if (cleanCmd.startsWith('/play ')) {
      const query = cleanCmd.substring(6).trim();
      logBotMessage({ content: `🔍 Searching Spotify, YouTube & SoundCloud catalogs for: "${query}"...` });
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const tracks: Track[] = await res.json();
        
        if (tracks.length > 0) {
          const selectedTrack = tracks[0];
          if (!state.currentTrack) {
            playTrackDirect(selectedTrack);
          } else {
            setState(prev => ({
              ...prev,
              queue: [...prev.queue, selectedTrack]
            }));
            logBotMessage({
              content: `➕ Track enqueued successfully at position **#${state.queue.length + 1}**`,
              embed: {
                title: selectedTrack.title,
                description: `Added: **${selectedTrack.title}** by **${selectedTrack.artist}** to voice channel playlist queue.`,
                color: '#23a55a'
              }
            });
          }
        } else {
          logBotMessage({ content: `❌ No music items matching "${query}" were located.` });
        }
      } catch (e) {
        logBotMessage({ content: `❌ Backend searching error: ${e}` });
      }
    } 
    else if (cleanCmd === '/skip') {
      logBotMessage({ content: '⏭️ Skipping active audio track...' });
      skipNextTrack();
    } 
    else if (cleanCmd === '/stop' || cleanCmd === '/clear') {
      setState(prev => ({
        ...prev,
        isPlaying: false,
        currentTrack: null,
        position: 0,
        queue: []
      }));
      if (audioRef.current) {
        audioRef.current.pause();
      }
      logBotMessage({ content: '🛑 Terminated current stream output and purged queue cache.' });
    } 
    else if (cleanCmd === '/queue') {
      if (state.queue.length === 0) {
        logBotMessage({
          content: '📋 **Active Playlist Queue is Empty**',
          embed: {
            title: 'No upcoming tracks',
            description: 'Use `/play [query]` to insert tracks or choose from the side panel catalog.',
            color: '#b5bac1'
          }
        });
      } else {
        const listText = state.queue.map((t, i) => `**${i + 1}.** ${t.title} - ${t.artist} [\`${formatTime(t.duration)}\`]`).join('\n');
        logBotMessage({
          content: '📋 **Active Server Queue**',
          embed: {
            title: `Active Playlist (${state.queue.length} Tracks Enqueued)`,
            description: listText,
            color: '#5865f2',
            footer: 'Type /skip to skip to next track'
          }
        });
      }
    } 
    else if (cleanCmd === '/nowplaying' || cleanCmd === '/np') {
      if (!state.currentTrack) {
        logBotMessage({ content: '❌ No active audio streams running right now.' });
      } else {
        logBotMessage({
          content: '🎧 **Now Streaming Source Feed**',
          embed: {
            title: state.currentTrack.title,
            description: `Currently streaming from **${state.currentTrack.source.toUpperCase()}** Node gateway.`,
            fields: [
              { name: 'ARTIST', value: state.currentTrack.artist, inline: true },
              { name: 'GENRE/ALBUM', value: `${state.currentTrack.genre} / ${state.currentTrack.album}`, inline: true },
              { name: 'TIMING', value: `\`${formatTime(state.position)} / ${formatTime(state.currentTrack.duration)}\``, inline: true }
            ],
            color: '#5865f2',
            thumbnail: state.currentTrack.artwork
          }
        });
      }
    } 
    else if (cleanCmd === '/lyrics') {
      if (!state.currentTrack) {
        logBotMessage({ content: '❌ Play a song first to stream synchronous lyrics.' });
      } else {
        setLyricsPanelOpen(true);
        setAiDjChatOpen(false);
        logBotMessage({ content: `🌸 Synchronizing rolling lyrics display panel for **${state.currentTrack.title}**...` });
        fetchLyricsForTrack(state.currentTrack);
      }
    } 
    else if (cleanCmd.startsWith('/volume ')) {
      const volNum = parseInt(cleanCmd.substring(8));
      if (!isNaN(volNum) && volNum >= 0 && volNum <= 100) {
        setState(prev => ({ ...prev, volume: volNum }));
        logBotMessage({ content: `🔊 Output level balanced: **${volNum}%**` });
      } else {
        logBotMessage({ content: '❌ Volume range must be an integer between `0` and `100`.' });
      }
    } 
    else if (cleanCmd.startsWith('/ai-dj ') || cleanCmd.startsWith('/dj ')) {
      const prompt = cleanCmd.startsWith('/ai-dj ') ? cleanCmd.substring(7) : cleanCmd.substring(4);
      triggerAIdjPrompt(prompt);
    }
    else if (cleanCmd === '/help') {
      logBotMessage({
        content: `⚔ **Harmonix Bot Commands Reference Sheet**`,
        embed: {
          title: 'Discord Music Shell Interface v2.5',
          description: 'Type standard commands in the server terminal for immersive music bot streaming.',
          fields: [
            { name: '`/play [query]`', value: 'Search Spotify/YT/SC & play track', inline: true },
            { name: '`/skip`', value: 'Forward to next queued song', inline: true },
            { name: '`/stop`', value: 'Sever stream & empty server list', inline: true },
            { name: '`/queue`', value: 'Display following tracks list', inline: true },
            { name: '`/nowplaying`', value: 'Show active track meta data', inline: true },
            { name: '`/volume [0-100]`', value: 'Set sound level', inline: true },
            { name: '`/lyrics`', value: 'AI synchronize lyrics sidebar', inline: true },
            { name: '`/ai-dj [mood]`', value: 'Request Gemini custom mood recommendation', inline: true }
          ],
          color: '#5865f2',
          footer: 'Powered by Gemini 3.5-Flash & @google/genai Coder Suite'
        }
      });
    }
    else {
      // General chat interaction (Route to AI DJ/Conversation automatically for realism!)
      logBotMessage({ content: '⚙ Command unrecognized. Intermediating chat request with Gemini assistant...' });
      triggerAIdjPrompt(cleanCmd);
    }
  };

  const triggerAIdjPrompt = async (prompt: string) => {
    setAiDjLoading(true);
    setAiDjChatOpen(true);
    setLyricsPanelOpen(false);
    try {
      const res = await fetch('/api/ai-dj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (data.response) {
        setAiDjResponse(data.response);
        logBotMessage({
          content: `🎧 **AI DJ Harmonix recommends:**`,
          embed: {
            title: 'Harmonix Curated suggestion',
            description: data.response,
            color: '#f5af19',
            footer: 'Click elements or type /play to activate suggestion'
          }
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiDjLoading(false);
    }
  };

  // Helper formatting timing string
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Parse synchronized lyrics lines and timestamp match
  const parseLyricsLines = () => {
    if (!lyricsData) return [];
    return lyricsData.split('\n').map((line, ix) => {
      const timeMatch = line.match(/^\[(\d+):(\d+)\]/);
      let secondValue = -1;
      let text = line;
      if (timeMatch) {
        secondValue = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
        text = line.replace(/^\[\d+:\d+\]\s*/, '');
      }
      return { id: ix, seconds: secondValue, text };
    });
  };

  const lyricLines = parseLyricsLines();
  // Find current active lyric
  const findActiveLyricIndex = () => {
    let activeIdx = -1;
    for (let i = 0; i < lyricLines.length; i++) {
      if (lyricLines[i].seconds !== -1 && state.position >= lyricLines[i].seconds) {
        activeIdx = i;
      }
    }
    return activeIdx;
  };
  const activeLyricIdx = findActiveLyricIndex();

  return (
    <div id="discord-bot-application-root" className="flex flex-col h-screen w-screen bg-[#050505] text-[#F5F5F5] overflow-hidden font-sans antialiased text-sm">
      
      {/* Top Application Global Navigation Header with Bold Typography */}
      <header className="flex items-end justify-between px-6 py-4 bg-[#0A0A0A] border-b border-[#222] z-10 select-none">
        <div className="flex items-end gap-6">
          <div className="leading-none pl-1">
            <h1 className="text-[36px] md:text-[44px] font-black tracking-tighter uppercase leading-[0.8] font-display text-white">
              Synth<span className="text-[#00FF41]">.</span>
            </h1>
            <p className="text-[9px] tracking-[0.4em] uppercase font-bold text-[#666] mt-2 ml-0.5">
              Advanced Audio Streaming Protocol
            </p>
          </div>
          
          {/* Status Metrics */}
          <div className="hidden md:flex gap-6 mb-0.5 pl-4 border-l border-[#222]">
            <div className="text-left">
              <p className="text-[8px] uppercase text-[#666] font-black tracking-wider">Status</p>
              <p className="text-[#00FF41] text-xs font-mono font-bold">● ONLINE / 24ms</p>
            </div>
            <div className="text-left">
              <p className="text-[8px] uppercase text-[#666] font-black tracking-wider">Node Gateway</p>
              <p className="text-white text-xs font-mono font-bold">US-EAST-04</p>
            </div>
          </div>
        </div>

        {/* Workspace Mode select button triggers (Square Brutalist) */}
        <div className="flex items-center bg-[#050505] p-1 border border-[#222] rounded-none">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-1.5 px-4 py-2 border-0 rounded-none text-xs font-black uppercase tracking-wider transition-all duration-150 cursor-pointer ${
              activeTab === 'simulator' 
              ? 'bg-[#00FF41] text-[#050505]' 
              : 'text-[#666] hover:text-white hover:bg-[#111]'
            }`}
            id="tab-btn-simulator"
          >
            <Disc className={`w-3.5 h-3.5 ${state.isPlaying ? 'animate-spin text-[#050505]' : ''}`} />
            <span>Interactive Simulator</span>
          </button>
          <button
            onClick={() => setActiveTab('code-hub')}
            className={`flex items-center gap-1.5 px-4 py-2 border-0 rounded-none text-xs font-black uppercase tracking-wider transition-all duration-150 cursor-pointer ${
              activeTab === 'code-hub' 
              ? 'bg-[#efefef] text-[#050505]' 
              : 'text-[#666] hover:text-white hover:bg-[#111]'
            }`}
            id="tab-btn-codehub"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Self-Hosted Bot Code</span>
          </button>
        </div>
      </header>

      {/* Main Sandbox Interactive Split screen workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* TAB 1: Real-time interactive Discord simulation environment */}
        {activeTab === 'simulator' && (
          <div className="flex-1 flex overflow-hidden w-full">
            
            {/* 1. Leftmost Guild lists icons navigation bar (Gamer, Music server icons list) */}
            <div className="w-[72px] bg-[#0A0A0A] flex flex-col items-center py-4 gap-3 select-none flex-shrink-0 border-r border-[#222]">
              {VIRTUAL_SERVERS.map((server) => (
                <button
                  key={server.id}
                  onClick={() => setActiveServer(server)}
                  className={`w-12 h-12 rounded-none flex items-center justify-center text-lg bg-[#050505] border transition-all relative group cursor-pointer ${
                    activeServer.id === server.id 
                    ? 'border-[#00FF41] text-[#00FF41] bg-[#111]' 
                    : 'border-[#222] text-[#F5F5F5] hover:border-[#00FF41] hover:bg-[#111]'
                  }`}
                  id={`guild-selector-${server.id}`}
                  title={server.name}
                >
                  {/* Active selector indicator peg */}
                  <div className={`absolute left-0 w-[3px] bg-[#00FF41] transition-all duration-200 ${
                    activeServer.id === server.id ? 'h-8 top-2' : 'h-0 group-hover:h-4 top-4'
                  }`} />
                  <span>{server.icon}</span>
                </button>
              ))}

              <div className="w-8 h-[1px] bg-[#222] my-1" />
              
              <button 
                className="w-12 h-12 rounded-none flex items-center justify-center bg-[#050505] border border-[#222] text-[#666] hover:text-[#00FF41] hover:border-[#00FF41] transition-all cursor-pointer"
                onClick={() => handleExecuteCommand('/help')}
                title="Help Guide Options"
              >
                <Compass className="w-4 h-4" />
              </button>
            </div>

            {/* 2. Inner Guild channels sidebar with local tracks quick selection list */}
            <div className="w-[240px] bg-[#050505] flex flex-col flex-shrink-0 select-none border-r border-[#222]">
              
              {/* Guild Header title */}
              <div className="h-12 px-4 flex items-center justify-between border-b border-[#222] bg-[#0a0a0a]">
                <span className="font-black text-white text-xs uppercase tracking-wide font-display">{activeServer.name}</span>
                <span className="text-[8px] text-[#00FF41] bg-[#00FF41]/10 px-1.5 py-0.5 border border-[#00FF41]/20 font-mono font-bold tracking-widest">ACTIVE</span>
              </div>

              {/* Server Channels Scroll area */}
              <div className="flex-1 overflow-y-auto py-3 space-y-4 scrollbar-thin px-2">
                
                {/* Text channels list */}
                <div>
                  <div className="text-[9px] uppercase font-black text-[#555] tracking-widest px-2 mb-2 font-mono">Text Channels</div>
                  {activeServer.channels.text.map((ch) => (
                    <button
                      key={ch}
                      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-none text-xs font-black uppercase tracking-wider text-[#999] hover:bg-[#111111]/80 hover:text-white text-left transition-colors ${
                        ch === 'music-bot-commands' ? 'bg-[#111] text-[#00FF41] border-l border-[#00FF41] font-bold' : ''
                      }`}
                      id={`channel-${ch}`}
                    >
                      <span className="text-semibold text-[#555] font-mono leading-none">&gt;</span>
                      <span>{ch}</span>
                    </button>
                  ))}
                </div>

                {/* Voice general channels list */}
                <div>
                  <div className="text-[9px] uppercase font-black text-[#555] tracking-widest px-2 mb-2 font-mono">Voice Channels</div>
                  {activeServer.channels.voice.map((vc) => (
                    <div key={vc.id} className="space-y-1">
                      <button
                        onClick={() => setActiveVoiceChannel(activeVoiceChannel === vc.id ? null : vc.id)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-none text-xs font-black uppercase tracking-wider text-left transition-colors cursor-pointer ${
                          activeVoiceChannel === vc.id 
                            ? 'bg-[#111] text-[#00FF41] border-l border-[#00FF41]' 
                            : 'text-[#999] hover:bg-[#111] hover:text-white'
                        }`}
                        id={`vc-join-leave-${vc.id}`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          ⚡ {vc.name}
                        </span>
                        {activeVoiceChannel === vc.id && (
                          <span className="text-[8px] text-[#00FF41] font-bold font-mono bg-[#00FF41]/10 border border-[#00FF41]/20 px-1.5 py-0.5 mr-1">JOINED</span>
                        )}
                      </button>
                      
                      {/* Members list inside Voice channel */}
                      {activeVoiceChannel === vc.id && (
                        <div className="pl-4 space-y-2 py-1.5 border-l border-[#222] ml-2">
                          {/* Bot Member item */}
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <div className={`w-5 h-5 rounded-none bg-[#050505] border border-[#222] flex items-center justify-center text-[8px] font-bold text-[#00FF41] ${
                                state.isPlaying ? 'speaking-glow-active' : ''
                              }`}>
                                B
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${state.isPlaying ? 'text-[#00FF41]' : 'text-[#666]'}`}>
                              Harmonix Bot 🤖
                            </span>
                          </div>

                          {/* Client/User Member item */}
                          <div className="flex items-center gap-1.5">
                            <img referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=80&h=80&q=80" className="w-5 h-5 rounded-none border border-[#222]" alt="Me" />
                            <span className="text-[10.5px] uppercase tracking-wide font-medium text-[#777]">You</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Quick select Tracks Music Box */}
                <div className="pt-2 border-t border-[#222]">
                  <div className="text-[9px] uppercase font-black text-[#00FF41] tracking-widest px-2 mb-3 flex items-center gap-1.5 font-mono">
                    <Music className="w-3.5 h-3.5" />
                    <span>Quick Track List</span>
                  </div>
                  <div className="space-y-1">
                    {DEFAULT_TRACKS.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => playTrackDirect(track)}
                        className={`w-full flex items-center justify-between text-left p-2 rounded-none transition-all border-b border-[#111] hover:bg-[#111111] ${
                          state.currentTrack?.id === track.id ? 'bg-[#111] border-l-2 border-[#00FF41]' : ''
                        }`}
                        id={`quick-play-${track.id}`}
                      >
                        <div className="truncate pr-1 flex-1">
                          <p className={`font-black uppercase tracking-wider text-[11px] truncate leading-tight ${state.currentTrack?.id === track.id ? 'text-[#00FF41]' : 'text-white'}`}>{track.title}</p>
                          <p className="text-[9px] uppercase tracking-wide text-[#555] truncate font-bold mt-0.5">{track.artist}</p>
                        </div>
                        <span className="text-[8px] font-mono text-[#444] px-1.5 py-0.5 border border-[#1a1a1a] bg-[#050505] shrink-0 font-bold uppercase tracking-widest">{track.genre}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Bottom Discord User control footer panel */}
              <div className="h-14 bg-[#0a0a0a] px-3.5 flex items-center justify-between border-t border-[#222] flex-shrink-0 select-none pr-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <img referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&h=120&q=80" className="w-8 h-8 rounded-none bg-[#050505] border border-[#222]" alt="User Avatar" />
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#00FF41] border border-[#0a0a0a]" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-white leading-tight font-sans">capitalcatto</p>
                    <p className="text-[9.5px] text-[#555] font-bold leading-none font-mono">CLIENT#0420</p>
                  </div>
                </div>

                {/* Simulated Discord User utilities icon panel */}
                <div className="flex items-center gap-1.5 text-[#666]">
                  <button className="p-1 px-1.5 rounded hover:bg-[#111] hover:text-[#00FF41] transition-all cursor-pointer rounded-none border border-transparent hover:border-[#222]" title="Manage credentials" onClick={() => setActiveTab('code-hub')}>
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>

            {/* 3. Central Music Workspace layout (Sound visualizer, terminal commands tracker) */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#050505]">
              
              {/* Left sub-panel: Visualizer, player knobs card, and commands terminal */}
              <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto min-w-0 h-full scrollbar-thin">
                
                {/* Audio streaming visualizer container card */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:items-stretch flex-shrink-0">
                  
                  {/* Visual wave frequencies visualizer */}
                  <div className="xl:col-span-2 h-[180px]">
                    <VoiceChannelVisualizer isPlaying={state.isPlaying} audioRef={audioRef} />
                  </div>
 
                  {/* High Quality Media Knobs Card */}
                  <div className="xl:col-span-1 p-4 bg-[#0a0a0a] rounded-none border border-[#222] flex flex-col justify-between text-[#dbdee1] min-h-[180px]">
                    <div>
                      {state.currentTrack ? (
                        <div className="space-y-2.5">
                          <span className="text-[8px] uppercase tracking-widest font-black text-[#00FF41] bg-[#00FF41]/10 px-2.5 py-1 border border-[#00FF41]/20 font-mono">
                            STREAM: {state.currentTrack.source.toUpperCase()}
                          </span>
                          <div className="pt-1.5">
                            <h3 className="text-sm font-black uppercase text-white tracking-wider line-clamp-1 leading-tight font-display">{state.currentTrack.title}</h3>
                            <p className="text-[9px] uppercase font-bold text-[#666] tracking-widest mt-1 font-mono">{state.currentTrack.artist}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6 text-[#444]">
                          <Headphones className="w-8 h-8 mx-auto stroke-1 animate-bounce text-[#222] mb-2" />
                          <p className="text-xs font-black uppercase tracking-widest font-mono text-[#555]">STREAM IDLE</p>
                          <p className="text-[9px] uppercase tracking-wider text-[#444] mt-1 font-mono">Execute command or click list</p>
                        </div>
                      )}
                    </div>
 
                    {/* Progress slider bar & Controls panel */}
                    <div className="space-y-3.5 mt-2">
                       {state.currentTrack && (
                        <div className="space-y-1">
                          {/* Slider progress bar */}
                          <div className="h-[2px] w-full bg-[#111] relative group">
                            <input
                              type="range"
                              min="0"
                              max={state.currentTrack.duration}
                              value={state.position}
                              onChange={handleProgressScrub}
                              className="w-full absolute inset-0 opacity-0 cursor-pointer z-10"
                            />
                            <div 
                              className="h-full bg-[#00FF41] shadow-[0_0_8px_#00FF41]" 
                              style={{ width: `${(state.position / state.currentTrack.duration) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[8px] font-mono text-[#555] font-black">
                            <span>{formatTime(state.position)}</span>
                            <span>{formatTime(state.currentTrack.duration)}</span>
                          </div>
                        </div>
                      )}
 
                      {/* Interaction control keys bar */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {/* Play/Pause */}
                          <button
                            onClick={togglePlayPause}
                            className="w-8 h-8 rounded-none bg-[#00FF41] text-[#050505] hover:bg-white flex items-center justify-center transition-all cursor-pointer active:scale-95 border-0"
                          >
                            {state.isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                          </button>
 
                          {/* Skip track */}
                          <button
                            onClick={skipNextTrack}
                            className="w-8 h-8 rounded-none bg-[#111] hover:bg-[#1a1a1a] border border-[#222] text-[#F5F5F5] hover:border-[#00FF41] hover:text-[#00FF41] flex items-center justify-center transition-all cursor-pointer"
                            title="Skip / Play Next Track"
                          >
                            <SkipForward className="w-3.5 h-3.5" />
                          </button>
 
                          {/* Loop selection panel toggle */}
                          <button
                            onClick={() => setState(p => ({ ...p, loop: p.loop === 'none' ? 'track' : p.loop === 'track' ? 'queue' : 'none' }))}
                            className={`w-8 h-8 rounded-none transition-all flex items-center justify-center cursor-pointer border ${
                              state.loop !== 'none' 
                              ? 'bg-[#00FF41]/10 text-[#00FF41] border-[#00FF41]' 
                              : 'bg-[#111] hover:bg-[#1a1a1a] border-[#222] text-[#666]'
                            }`}
                            title={`Looping status: ${state.loop}`}
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${state.loop === 'track' ? 'scale-105 font-bold' : ''}`} />
                          </button>
                        </div>
 
                        {/* Sound volume slider controller */}
                        <div className="flex items-center gap-1.5 px-2 bg-[#111] py-1.5 rounded-none border border-[#222]">
                          <Volume2 className="w-3 h-3 text-[#555]" />
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={state.volume}
                            onChange={(e) => setState(p => ({ ...p, volume: parseInt(e.target.value) }))}
                            className="w-14 accent-[#00FF41] h-1 rounded cursor-pointer bg-[#222]"
                          />
                        </div>
                      </div>
                    </div>
 
                  </div>
 
                </div>
 
                {/* Commands Terminal logger node area */}
                <div className="flex-1 min-h-[300px] h-[340px]">
                  <CommandTerminal 
                    messages={terminalMessages} 
                    onExecuteCommand={handleExecuteCommand} 
                    availableTracks={DEFAULT_TRACKS}
                  />
                </div>

              </div>

              {/* Right panel: Active syncing lyrics + AI DJ conversation */}
              <div className="w-full md:w-[280px] bg-[#050505] border-l border-[#222] flex flex-col h-full select-text flex-shrink-0">
                
                {/* Right panel switcher tabs */}
                <div className="h-12 border-b border-[#222] px-3 flex items-center justify-between flex-shrink-0 bg-[#0a0a0a] select-none">
                  <div className="flex items-center bg-[#050505] p-0.5 border border-[#222] w-full rounded-none">
                    <button
                      onClick={() => { setLyricsPanelOpen(true); setAiDjChatOpen(false); }}
                      className={`flex-1 text-center py-1.5 rounded-none text-[9px] font-black tracking-widest uppercase transition-all duration-150 cursor-pointer ${
                        lyricsPanelOpen ? 'bg-[#00FF41] text-[#050505]' : 'text-[#666] hover:text-[#F5F5F5]'
                      }`}
                      id="utility-tab-lyrics"
                    >
                      TIMED LYRICS
                    </button>
                    <button
                      onClick={() => { setLyricsPanelOpen(false); setAiDjChatOpen(true); }}
                      className={`flex-1 text-center py-1.5 rounded-none text-[9px] font-black tracking-widest uppercase transition-all duration-150 cursor-pointer ${
                        aiDjChatOpen ? 'bg-[#00FF41] text-[#050505]' : 'text-[#666] hover:text-[#F5F5F5]'
                      }`}
                      id="utility-tab-aidj"
                    >
                      AI DJ CHAT
                    </button>
                  </div>
                </div>

                {/* Inner panel displaying contents */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                  
                  {/* UTILITY CARD 1: Sync active lyrics highlight stream */}
                  {lyricsPanelOpen && (
                    <div id="lyrics-panel" className="space-y-4 h-full">
                      {lyricsLoading ? (
                        <div className="py-20 text-center text-xs text-[#666] font-medium space-y-2 select-none font-mono uppercase tracking-wider">
                          <Compass className="w-6 h-6 mx-auto text-[#00FF41] animate-spin" />
                          <p>Consulting index...</p>
                        </div>
                      ) : state.currentTrack && lyricsData ? (
                        <div className="space-y-4">
                          <div className="pb-2.5 border-b border-[#222] select-none">
                            <h4 className="text-xs font-black uppercase tracking-wider text-white font-display leading-tight">{state.currentTrack.title}</h4>
                            <p className="text-[9px] uppercase tracking-widest text-[#555] font-mono mt-1 font-bold">LYRICS SYNCHRONIZED IN REAL TIME</p>
                          </div>
                          
                          <div className="space-y-3 font-mono select-text">
                            {lyricLines.map((line, idx) => (
                              <p
                                key={line.id}
                                onClick={() => {
                                  if (line.seconds !== -1 && audioRef.current) {
                                    audioRef.current.currentTime = line.seconds;
                                    setState(p => ({ ...p, position: line.seconds }));
                                  }
                                }}
                                className={`text-[11px] leading-relaxed cursor-pointer transition-all duration-150 pl-2 py-1.5 rounded-none ${
                                  idx === activeLyricIdx 
                                    ? 'text-[#00FF41] font-black bg-[#00FF41]/10 border-l border-[#00FF41]' 
                                    : 'text-[#555] uppercase tracking-wide'
                                }`}
                              >
                                {line.text}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="py-20 text-center text-xs text-[#555] space-y-2 select-none font-mono">
                          <Music className="w-7 h-7 text-[#222] mx-auto stroke-1" />
                          <p className="font-black uppercase tracking-widest">No synchronized lyrics</p>
                          <p className="text-[9px] text-[#444] uppercase leading-normal">Click on any track inside the Quick List or type `/lyrics` in terminal.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* UTILITY CARD 2: Personalized Interactive Gemini DJ chat block */}
                  {aiDjChatOpen && (
                    <div id="ai-dj-panel" className="space-y-4 h-full flex flex-col justify-between">
                      <div className="space-y-3 flex-1">
                        <div className="pb-2.5 border-b border-[#222]">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-[#00FF41] animate-pulse" />
                            <h4 className="text-xs font-black uppercase tracking-widest font-display text-white">Ask Harmonix DJ</h4>
                          </div>
                          <p className="text-[9px] uppercase tracking-widest text-[#555] font-mono font-bold mt-1">Describe a mood, genre, or speed</p>
                        </div>

                        {aiDjLoading ? (
                          <div className="py-16 text-center text-xs text-[#666] font-medium space-y-2 select-none font-mono uppercase tracking-wider">
                            <Disc className="w-7 h-7 mx-auto text-[#00FF41] animate-spin" />
                            <p>Composing recommendations...</p>
                          </div>
                        ) : aiDjResponse ? (
                          <div className="bg-[#0A0A0A] p-4 rounded-none border border-[#222] text-xs leading-relaxed text-[#F5F5F5] select-text font-mono border-t-2 border-t-[#00FF41]">
                            <div className="prose prose-invert max-w-none text-[10.5px] uppercase tracking-wide space-y-2 whitespace-pre-wrap">
                              {aiDjResponse}
                            </div>
                          </div>
                        ) : (
                          <div className="py-12 text-center text-xs text-[#555] space-y-2 select-none font-mono">
                            <Sparkles className="w-7 h-7 mx-auto text-[#00FF41]/25 animate-pulse stroke-1" />
                            <p className="font-black uppercase tracking-widest">Chat Suggestion Assistant</p>
                            <p className="text-[9px] text-[#444] uppercase leading-normal">Tell Harmonix what is your feeling right now! e.g., "fast speed racing synths" or "late night quiet rain coffee study".</p>
                          </div>
                        )}
                      </div>

                      {/* Side chat input panel */}
                      <div className="pt-4 border-t border-[#222] select-none bg-[#050505]">
                        <div className="relative flex items-center bg-[#0a0a0a] border border-[#222] focus-within:border-[#00FF41] rounded-none transition-all font-mono">
                          <input
                            type="text"
                            placeholder="ENTER MUSICAL PROMPT..."
                            value={aiDjPromptInput}
                            onChange={(e) => setAiDjPromptInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && aiDjPromptInput.trim()) {
                                triggerAIdjPrompt(aiDjPromptInput);
                                setAiDjPromptInput('');
                              }
                            }}
                            className="bg-transparent border-none ring-none outline-none text-[10px] uppercase tracking-wider text-white p-2.5 w-full placeholder-[#444]"
                            id="side-ai-dj-input"
                          />
                          <button
                            onClick={() => {
                              if (aiDjPromptInput.trim()) {
                                triggerAIdjPrompt(aiDjPromptInput);
                                setAiDjPromptInput('');
                              }
                            }}
                            className="p-1.5 mr-1.5 rounded-none bg-[#00FF41] text-[#050505] hover:bg-white transition-all shrink-0 cursor-pointer text-xs"
                            id="side-ai-dj-btn"
                          >
                            <Sparkles className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

              </div>

            </div>

          </div>
        )/* End of main tab layout view */}

        {/* TAB 2: Self-hosted code setup workshop panel display */}
        {activeTab === 'code-hub' && (
          <div className="flex-1 p-5 overflow-y-auto bg-[#050505]">
            <BotCodeHub />
          </div>
        )}

      </div>

      {/* Hidden Native Audio Element supporting direct MP3 playback */}
      {state.currentTrack && (
        <audio
          ref={audioRef}
          src={state.currentTrack.url}
          autoPlay={state.isPlaying}
          onTimeUpdate={(e) => {
            if (audioRef.current) {
              setState(prev => ({ ...prev, position: audioRef.current?.currentTime || 0 }));
            }
          }}
          onDurationChange={() => {
            if (audioRef.current) {
              const d = audioRef.current.duration;
              if (state.currentTrack && !isNaN(d)) {
                setState(prev => {
                  if (prev.currentTrack) {
                    return {
                      ...prev,
                      currentTrack: { ...prev.currentTrack, duration: d }
                    };
                  }
                  return prev;
                });
              }
            }
          }}
          onEnded={handleTrackEnded}
          id="native-browser-stream-node"
        />
      )}

    </div>
  );
}
