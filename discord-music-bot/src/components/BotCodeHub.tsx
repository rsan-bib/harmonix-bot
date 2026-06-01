import { useState } from 'react';
import { Copy, Check, Terminal, ExternalLink, Download, FileText, Settings, Play, Server } from 'lucide-react';

export default function BotCodeHub() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const BOT_FILES = [
    {
      name: 'bot.ts',
      desc: 'The complete TypeScript source code for the actual Discord Music Bot, utilizing Discord.js v14 & @discordjs/voice with play-dl.',
      code: `import { 
  Client, 
  GatewayIntentBits, 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  PermissionFlagsBits 
} from 'discord.js';
import { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnection 
} from '@discordjs/voice';
import play from 'play-dl';

// Initialize Client with Voice & Guild intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ]
});

// Sound queues and connections mapped by Guild ID
const queues = new Map<string, any[]>();
const connections = new Map<string, VoiceConnection>();
const players = new Map<string, any>();

client.on('ready', () => {
  console.log(\`⚡ Harmonix Bot is logged in as \${client.user?.tag}!\`);
  
  // Register Slash Commands
  const playCmd = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play / Stream a track from Spotify, Youtube or SoundCloud')
    .addStringOption(opt => 
      opt.setName('query')
        .setDescription('Search query, track title or direct audio link')
        .setRequired(true)
    );

  const skipCmd = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing track');

  const stopCmd = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Terminate the audio stream and clear the server queue');

  client.application?.commands.set([
    playCmd.toJSON(),
    skipCmd.toJSON(),
    stopCmd.toJSON()
  ]);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId } = interaction;
  if (!guildId) return;

  const member = interaction.member as any;
  const voiceChannel = member.voice && member.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({ 
      content: '❌ You must be in a voice channel to command Harmonix!', 
      ephemeral: true 
    });
  }

  if (commandName === 'play') {
    await interaction.deferReply();
    const query = interaction.options.getString('query', true);

    try {
      // 1. Join Voice Channel
      let connection = connections.get(guildId);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        connections.set(guildId, connection);
      }

      // 2. Search song using play-dl (supports YT, Spotify, Soundcloud urls or queries)
      const searchResults = await play.search(query, { limit: 1 });
      if (searchResults.length === 0) {
        return interaction.editReply(\`❌ Track not found for: "\${query}"\`);
      }
      
      const song = searchResults[0];
      let queue = queues.get(guildId) || [];
      queue.push(song);
      queues.set(guildId, queue);

      // 3. Setup Resource player
      let player = players.get(guildId);
      if (!player) {
        player = createAudioPlayer();
        players.set(guildId, player);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
          const activeQueue = queues.get(guildId) || [];
          activeQueue.shift(); // Remove completed song
          queues.set(guildId, activeQueue);

          if (activeQueue.length > 0) {
            playNextTrack(guildId);
          } else {
            // Cleanup on idle empty queue
            connection?.destroy();
            connections.delete(guildId);
            players.delete(guildId);
            queues.delete(guildId);
          }
        });
        
        playNextTrack(guildId);
        interaction.editReply(\`🎵 Spinning: **\${song.title}** [\${song.durationRaw}]\`);
      } else {
        interaction.editReply(\`➕ Enqueued: **\${song.title}** at position #\${queue.length}\`);
      }

    } catch (err: any) {
      console.error(err);
      interaction.editReply(\`❌ Bot streams failure: \${err.message}\`);
    }
  }

  if (commandName === 'skip') {
    const player = players.get(guildId);
    if (!player) {
      return interaction.reply('❌ No active streams running to skip!');
    }
    player.stop();
    interaction.reply('⏭️ Skiped current track!');
  }

  if (commandName === 'stop') {
    const connection = connections.get(guildId);
    if (!connection) {
      return interaction.reply('❌ The bot is not currently streaming anywhere.');
    }
    
    connection.destroy();
    connections.delete(guildId);
    players.delete(guildId);
    queues.delete(guildId);
    interaction.reply('🛑 Stream severed! Bot left the voice channel.');
  }
});

async function playNextTrack(guildId: string) {
  const queue = queues.get(guildId) || [];
  if (queue.length === 0) return;

  const song = queue[0];
  const player = players.get(guildId);
  const stream = await play.stream(song.url);
  const resource = createAudioResource(stream.stream, {
    inputType: stream.type
  });
  player.play(resource);
}

// Start with client token
client.login(process.env.DISCORD_TOKEN);`
    },
    {
      name: 'package.json',
      desc: 'The exact dependencies your local Node project needs to compile and run the Discord music bot.',
      code: `{
  "name": "discord-music-bot",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "ts-node bot.ts"
  },
  "dependencies": {
    "discord.js": "^14.14.1",
    "@discordjs/voice": "^0.16.1",
    "play-dl": "^1.9.11",
    "libsodium-wrappers": "^0.7.13",
    "@discordjs/opus": "^0.9.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2",
    "@types/node": "^20.11.16"
  }
}`
    },
    {
      name: '.env',
      desc: 'Environment variable declaration file template for holding secret credentials securely.',
      code: `DISCORD_TOKEN="YOUR_DISCORD_BOT_TOKEN_HERE"
# Optional play-dl configs (SoundCloud client ID, YouTube cookie, Spotify credentials)
# play-dl works out of the box, but these enhance rate limits and premium queries
SPOTIFY_CLIENT_ID="YOUR_SPOTIFY_CLIENT_ID"
SPOTIFY_CLIENT_SECRET="YOUR_SPOTIFY_SECRET"
`
    }
  ];

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    copiedIndex === null && setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  return (
    <div id="bot-code-hub-container" className="flex flex-col h-full bg-[#050505] border border-[#222] rounded-none p-5 text-[#dbdee1]">
      <div className="flex items-center gap-3.5 mb-5 border-b border-[#222] pb-4">
        <Server className="w-5 h-5 text-[#00FF41]" />
        <div>
          <h3 className="text-sm font-black uppercase text-white tracking-widest font-display leading-none">Self-Hosted Bot Deployment Hub</h3>
          <p className="text-[9.5px] text-[#555] font-black font-mono uppercase tracking-widest mt-1.5">Deploy this exact Discord.js engine on your custom computer or server.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 overflow-y-auto pr-1 scrollbar-thin">
        {/* Setup Guides panel */}
        <div className="lg:col-span-1 space-y-4 bg-[#0a0a0a] p-4 rounded-none border border-[#222] h-fit">
          <div className="flex items-center gap-2 pb-2.5 border-b border-[#222]">
            <Settings className="w-4 h-4 text-[#00FF41]" />
            <h4 className="text-[10px] font-black text-white uppercase tracking-widest font-mono">Installation Checklist</h4>
          </div>

          <ol className="space-y-4 text-[10.5px] uppercase tracking-wide leading-relaxed font-mono list-decimal list-inside pl-1 text-[#888]">
            <li className="font-semibold text-[#888]">
              <span className="font-extrabold text-white">Create Discord App</span>:
              <p className="text-[#555] mt-1 ml-4 lowercase tracking-normal">Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-[#00FF41] hover:underline flex items-center inline-flex gap-0.5 font-bold">Discord Developer Portal <ExternalLink className="w-3 h-3" /></a>, make a new Application, navigate to the <span className="text-[#00FF41] font-semibold">Bot</span> tab, create a bot, and toggle on <span className="font-semibold text-white">Guild Intents</span>.</p>
            </li>
            <li className="font-semibold text-[#888]">
              <span className="font-extrabold text-white">Configure Server Credentials</span>:
              <p className="text-[#555] mt-1 ml-4 lowercase tracking-normal">Copy the Bot Token into your <span className="text-[#00FF41] font-bold">.env</span> file securely to authentic connection nodes.</p>
            </li>
            <li className="font-semibold text-[#888]">
              <span className="font-extrabold text-white">Invite the Bot to Discord</span>:
              <p className="text-[#555] mt-1 ml-4 lowercase tracking-normal">Navigate to the OAuth2 URL Generator. Select constraints: <span className="font-semibold text-white">bot</span>, <span className="font-semibold text-white">applications.commands</span>. Bot Voice permissions: <span className="text-[#00FF41]">Connect</span>, <span className="text-[#00FF41]">Speak</span>.</p>
            </li>
            <li className="font-semibold text-[#888]">
              <span className="font-extrabold text-white">Local System Prerequisite</span>:
              <p className="text-[#555] mt-1 ml-4 lowercase tracking-normal">Make sure <span className="text-white bg-[#111] px-1 py-0.5 border border-[#222]">ffmpeg</span> is installed on your local host system so audio decompression operates smoothly in Discord-Voice nodes.</p>
            </li>
            <li className="font-semibold text-[#888]">
              <span className="font-extrabold text-white">Launch the Engine</span>:
              <p className="text-[#555] mt-1 ml-4 lowercase tracking-normal">Run <span className="text-white bg-[#111] px-1 py-0.5 border border-[#222]">npm install</span> then launch with <span className="text-[#00FF41] bg-[#00FF41]/10 px-1.5 py-0.5 border border-[#00FF41]/20">npm start</span> to go LIVE!</p>
            </li>
          </ol>
        </div>

        {/* Code view box panel */}
        <div className="lg:col-span-2 space-y-4">
          {BOT_FILES.map((file, idx) => (
            <div key={idx} className="bg-[#0a0a0a] rounded-none border border-[#222] overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#070707] border-b border-[#222]">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#00FF41]" />
                  <span className="text-[10px] font-black text-white font-mono uppercase tracking-wider">{file.name}</span>
                </div>
                <button
                  onClick={() => handleCopy(file.code, idx)}
                  className="p-1 px-2.5 text-[9px] font-black uppercase tracking-widest rounded-none border border-[#222] bg-[#050505] text-[#888] hover:text-[#00FF41] hover:border-[#00FF41] flex items-center gap-1.5 transition-all cursor-pointer"
                  id={`copy-code-${file.name.replace('.', '-')}`}
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#00FF41]" />
                      <span className="text-[#00FF41] font-bold">COPIED</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>COPY CODE</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-3 bg-[#050505] text-[10px] uppercase font-mono tracking-wide text-[#555] border-b border-[#222] leading-relaxed select-none">
                {file.desc}
              </div>
              <div className="p-3 overflow-x-auto max-h-[300px] bg-[#050505] scrollbar-thin">
                <pre className="text-[10.5px] font-mono leading-relaxed text-[#00FF41] whitespace-pre select-all">
                  <code>{file.code}</code>
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
