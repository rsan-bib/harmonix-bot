import React, { useState, useRef, useEffect } from 'react';
import { TerminalMessage, Track } from '../types';
import { Terminal, Send, Shield, Zap, Sparkles, HelpCircle, ArrowRight } from 'lucide-react';

interface CommandTerminalProps {
  messages: TerminalMessage[];
  onExecuteCommand: (commandString: string) => void;
  availableTracks: Track[];
}

const COMMAND_SUGGESTIONS = [
  { cmd: '/play', desc: 'Find and stream a track', sub: '/play Neon Odyssey' },
  { cmd: '/skip', desc: 'Skip current track', sub: '/skip' },
  { cmd: '/stop', desc: 'Clear queue & stop stream', sub: '/stop' },
  { cmd: '/queue', desc: 'Display active playlist queue', sub: '/queue' },
  { cmd: '/nowplaying', desc: 'Show info about playing track', sub: '/nowplaying' },
  { cmd: '/lyrics', desc: 'AI sync text lyrics', sub: '/lyrics' },
  { cmd: '/volume', desc: 'Set sound level', sub: '/volume 80' },
  { cmd: '/ai-dj', desc: 'Let Gemini curate music from prompt', sub: '/ai-dj late night coding mood' },
  { cmd: '/soundcloud', desc: 'List active SoundCloud options', sub: '/soundcloud search chill' },
  { cmd: '/spotify', desc: 'List active Spotify track items', sub: '/spotify list' },
  { cmd: '/help', desc: 'Show bot commands system guide', sub: '/help' },
];

export default function CommandTerminal({ messages, onExecuteCommand, availableTracks }: CommandTerminalProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState(COMMAND_SUGGESTIONS);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (value.startsWith('/')) {
      const searchWord = value.toLowerCase();
      const filtered = COMMAND_SUGGESTIONS.filter(item => 
        item.cmd.toLowerCase().startsWith(searchWord)
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'Tab' && showSuggestions && filteredSuggestions.length > 0) {
      e.preventDefault();
      setInputValue(filteredSuggestions[0].cmd + ' ');
      setShowSuggestions(false);
    }
  };

  const executeCommand = () => {
    if (!inputValue.trim()) return;
    onExecuteCommand(inputValue);
    setInputValue('');
    setShowSuggestions(false);
  };

  const selectSuggestion = (cmd: string) => {
    setInputValue(cmd + ' ');
    setShowSuggestions(false);
  };

  return (
    <div id="command-terminal-console" className="flex flex-col h-full bg-[#050505] border border-[#222] rounded-none overflow-hidden shadow-none">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0A0A0A] border-b border-[#222]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#00FF41]" />
          <span className="text-xs font-black text-white uppercase tracking-[0.2em] font-display">COMMAND TERMINAL</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[9px] text-[#00FF41] font-bold tracking-widest">
          <span className="bg-[#00FF41] w-1.5 h-1.5 rounded-full animate-ping" />
          <span>GATEWAY ONLINE</span>
        </div>
      </div>

      {/* Terminal Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono select-text scrollbar-thin">
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-3 group hover:bg-[#111111]/80 p-1.5 rounded-none transition-colors border-l border-transparent hover:border-[#00FF41]/30">
            {/* User Avatar */}
            <div className="flex-shrink-0">
              {msg.sender.avatar.startsWith('http') || msg.sender.avatar.startsWith('data') ? (
                <img referrerPolicy="no-referrer" src={msg.sender.avatar} className="w-8 h-8 rounded-none bg-[#050505] border border-[#222]" alt="Avatar" />
              ) : (
                <div className={`w-8 h-8 rounded-none flex items-center justify-center font-black text-xs ${
                  msg.sender.isBot ? 'bg-[#00FF41] text-[#050505]' : 'bg-[#222] text-white'
                }`}>
                  {msg.sender.username.substring(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            {/* Message Body */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-xs font-black uppercase tracking-wider hover:underline cursor-pointer ${
                  msg.sender.isBot ? 'text-[#00FF41]' : 'text-white'
                }`}>
                  {msg.sender.username}
                </span>
                {msg.sender.isBot && (
                  <span className="bg-[#111] border border-[#00FF41] text-[#00FF41] text-[8px] font-black px-1 py-0.5 rounded-none tracking-widest uppercase leading-none flex items-center gap-0.5">
                    BOT
                  </span>
                )}
                <span className="text-[9px] text-[#666] font-mono">{msg.timestamp}</span>
              </div>

              {/* Message Content */}
              <div className="text-xs text-[#F5F5F5] leading-relaxed whitespace-pre-wrap select-text break-words pr-2 font-mono">
                {msg.content}
              </div>

              {/* Discord-style Embed representation */}
              {msg.embed && (
                <div 
                  className="mt-2.5 max-w-xl border-l-[3px] rounded-none bg-[#0e0e0e] p-4 border-[#222] shadow-none border-t border-r border-b"
                  style={{ borderLeftColor: msg.embed.color || '#00FF41' }}
                >
                  <div className="flex gap-3 justify-between">
                    <div className="flex-1">
                      {msg.embed.title && (
                        <h4 className="text-xs font-black text-white mb-2 uppercase tracking-wider hover:underline cursor-pointer">
                          {msg.embed.title}
                        </h4>
                      )}
                      {msg.embed.description && (
                        <p className="text-[11px] text-[#999] mb-3 leading-relaxed select-text whitespace-pre-line">
                          {msg.embed.description}
                        </p>
                      )}

                      {/* Embed Fields list */}
                      {msg.embed.fields && msg.embed.fields.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-2 border-t border-[#1a1a1a] pt-2">
                          {msg.embed.fields.map((field, idx) => (
                            <div key={idx} className={field.inline ? 'col-span-1' : 'col-span-2'}>
                              <div className="text-[9px] uppercase tracking-widest font-black text-[#555] mb-0.5">
                                {field.name}
                              </div>
                              <div className="text-[11px] text-[#F5F5F5] font-mono select-text font-medium">
                                {field.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {msg.embed.thumbnail && (
                      <div className="flex-shrink-0 w-14 h-14 rounded-none overflow-hidden bg-[#050505] border border-[#222]">
                        {msg.embed.thumbnail.startsWith('linear') ? (
                          <div className="w-full h-full" style={{ background: msg.embed.thumbnail }} />
                        ) : (
                          <img referrerPolicy="no-referrer" src={msg.embed.thumbnail} className="w-full h-full object-cover" alt="Thumb" />
                        )}
                      </div>
                    )}
                  </div>

                  {msg.embed.footer && (
                    <div className="mt-3 pt-2 border-t border-[#1a1a1a] text-[9px] text-[#00FF41] font-bold tracking-widest font-mono flex items-center gap-1 uppercase">
                      <Sparkles className="w-3 h-3 text-[#00FF41] animate-pulse" />
                      {msg.embed.footer}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>

      {/* Autocomplete Suggestions Overlay */}
      {showSuggestions && (
        <div className="relative mx-4 z-40">
          <div className="absolute bottom-1 left-0 right-0 bg-[#050505] border-2 border-[#00FF41] rounded-none shadow-2xl p-1 max-h-[180px] overflow-y-auto scrollbar-thin">
            <div className="text-[10px] text-[#666] font-black px-2.5 py-1.5 uppercase tracking-widest border-b border-[#222] mb-1">
              AUTOCOMPLETE PROTOCOL
            </div>
            {filteredSuggestions.map((item) => (
              <button
                key={item.cmd}
                onClick={() => selectSuggestion(item.cmd)}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-none text-left text-xs text-[#999] hover:bg-[#00FF41]/10 hover:text-[#00FF41] transition-colors font-mono"
                id={`autocomplete-suggestion-${item.cmd.replace('/', '')}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white bg-[#111] p-1 border border-[#222] font-semibold">{item.cmd}</span>
                  <span className="text-[#666] text-[10px]">{item.desc}</span>
                </div>
                <span className="text-[9px] font-mono text-[#555]">EX: {item.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Command Input Box Area */}
      <div className="p-4 bg-[#0A0A0A] border-t border-[#222]">
        <div className="relative flex items-center bg-[#050505] border border-[#222] focus-within:border-[#00FF41] transition-all">
          <div className="pl-3.5 flex items-center text-[#00FF41] shrink-0">
            <span className="font-mono text-medium font-black select-none text-[#00FF41] shrink-0">&gt;</span>
          </div>
          <input
            type="text"
            className="w-full bg-transparent border-0 ring-0 outline-none text-xs text-[#F5F5F5] pl-2 pr-10 py-3.5 placeholder-[#444] font-mono uppercase tracking-wider"
            placeholder="TYPE PROTOCOL COMMAND (EX: /PLAY NEON, /LYRICS)..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            id="discord-command-input"
          />
          <button
            onClick={executeCommand}
            className="absolute right-3 p-1.5 bg-[#00FF41] text-[#050505] hover:bg-white transition-all shrink-0 active:scale-95 cursor-pointer rounded-none"
            id="discord-send-command-btn"
            title="Execute Bot Command"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>

        {/* Action Command Suggestion Chips bar */}
        <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-[#1a1a1a]">
          <span className="text-[9px] text-[#444] font-black uppercase tracking-widest self-center mr-1 font-mono">QUICK RUN:</span>
          {COMMAND_SUGGESTIONS.slice(0, 8).map((sc) => (
            <button
              key={sc.cmd}
              onClick={() => onExecuteCommand(sc.sub)}
              className="text-[9px] px-2 py-0.5 bg-[#111] text-[#777] border border-[#222] hover:border-[#00FF41] hover:bg-[#00FF41]/5 hover:text-[#00FF41] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer"
              id={`chip-${sc.cmd.replace('/', '')}`}
            >
              {sc.cmd}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
