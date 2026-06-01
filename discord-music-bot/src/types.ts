export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  url: string;
  artwork: string;
  source: 'spotify' | 'youtube' | 'soundcloud' | 'local';
  genre: string;
  lyrics?: string;
  isCustomUrl?: boolean;
}

export interface DiscordMember {
  id: string;
  username: string;
  avatar: string;
  role: 'owner' | 'admin' | 'moderator' | 'member' | 'bot';
  isSpeaking: boolean;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}

export interface VoiceChannel {
  id: string;
  name: string;
  members: DiscordMember[];
}

export interface DiscordServer {
  id: string;
  name: string;
  icon: string;
  channels: {
    text: string[];
    voice: VoiceChannel[];
  };
}

export interface TerminalMessage {
  id: string;
  timestamp: string;
  sender: {
    username: string;
    avatar: string;
    isBot: boolean;
    roleColor: string; // Tailwind color class
  };
  content: string;
  embed?: {
    title?: string;
    description?: string;
    fields?: { name: string; value: string; inline?: boolean }[];
    color?: string; // Border color accent
    thumbnail?: string;
    footer?: string;
  };
}

export interface PlaybackState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number; // current time in seconds
  volume: number; // 0 to 100
  loop: 'none' | 'track' | 'queue';
  queue: Track[];
  history: Track[];
}
