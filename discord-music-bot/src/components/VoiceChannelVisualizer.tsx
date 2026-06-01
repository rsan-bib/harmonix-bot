import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export default function VoiceChannelVisualizer({ isPlaying, audioRef }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isConnectedRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || 400;
      canvas.height = canvas.parentElement?.clientHeight || 200;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Dynamic wave simulation helper in case audio node stream API is blocked or has CORS
    let phase = 0;
    const barCount = 42;
    const heights = Array(barCount).fill(5);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      // Draw standard glowing neon background matrix
      const bgGradient = ctx.createLinearGradient(0, 0, width, height);
      bgGradient.addColorStop(0, 'rgba(5, 5, 5, 0.98)');
      bgGradient.addColorStop(1, 'rgba(10, 10, 10, 0.98)');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Radial glowing center
      const radialGlow = ctx.createRadialGradient(width / 2, centerY, 5, width / 2, centerY, Math.min(width, height) * 0.4);
      radialGlow.addColorStop(0, isPlaying ? 'rgba(0, 255, 65, 0.12)' : 'rgba(0, 255, 65, 0.02)');
      radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, width, height);

      // Attempt Web Audio API analysis if possible and supported
      let dataArray: Uint8Array | null = null;
      if (audioRef.current && isPlaying && !isConnectedRef.current) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioContext = new AudioContextClass();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 64;
          
          const sourceNode = audioContext.createMediaElementSource(audioRef.current);
          sourceNode.connect(analyser);
          analyser.connect(audioContext.destination);

          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
          isConnectedRef.current = true;
        } catch (e) {
          // Fall back gracefully to procedural simulation if cross-origin or autoplay restricts audio routing
        }
      }

      if (isConnectedRef.current && analyserRef.current) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);
      }

      // Render glowing audio frequencies bar chart (symmetric design)
      const barWidth = (width / barCount) * 0.75;
      const barSpacing = (width / barCount) * 0.25;

      phase += 0.05;

      for (let i = 0; i < barCount; i++) {
        let targetHeight = 4;

        if (isPlaying) {
          if (dataArray) {
            // Real Audio Context frequency data mapping
            const dataIndex = Math.floor((i < barCount / 2 ? i : barCount - i) * (dataArray.length / (barCount / 2)));
            targetHeight = (dataArray[dataIndex] / 255) * (height * 0.65) + 6;
          } else {
            // Symmetric procedural pulse wave simulation matching a realistic high-definition music player
            const wave1 = Math.sin(i * 0.25 + phase * 1.5) * 20;
            const wave2 = Math.cos(i * 0.15 - phase * 0.8) * 15;
            const centerFactor = 1 - Math.abs(i - barCount / 2) / (barCount / 2); // swell in center
            targetHeight = Math.max(5, (wave1 + wave2 + 35) * centerFactor + Math.random() * 8);
          }
        } else {
          // Standing idle breathing wave
          targetHeight = 4 + Math.sin(i * 0.3 + phase * 0.3) * 2;
        }

        // Smooth height transition
        heights[i] += (targetHeight - heights[i]) * 0.22;
        const currentBarHeight = heights[i];

        const x = i * (barWidth + barSpacing) + barSpacing / 2;
        const y = centerY - currentBarHeight / 2;

        // Visual gradients matching Discord's blurple / emerald bot colors
        const grad = ctx.createLinearGradient(x, y, x, y + currentBarHeight);
        if (isPlaying) {
          grad.addColorStop(0, '#00FF41'); // Advanced Synth Acid Green
          grad.addColorStop(0.5, '#02b531');
          grad.addColorStop(1, '#052e0f'); // Dim high-contrast decay
        } else {
          grad.addColorStop(0, '#222222');
          grad.addColorStop(1, '#111111');
        }

        // Round rect style for futuristic glow bars
        ctx.fillStyle = grad;
        ctx.shadowBlur = isPlaying ? 5 : 0;
        ctx.shadowColor = '#00FF41';
        
        // Draw elegant rounded-end bars
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, currentBarHeight, barWidth / 2);
        } else {
          ctx.rect(x, y, barWidth, currentBarHeight);
        }
        ctx.fill();
      }

      // Draw high-quality stereo stream HUD indicators
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(245, 245, 245, 0.45)';
      ctx.font = '10px "JetBrains Mono", Courier, monospace';
      ctx.fillText('L [■■■■■■■■■■□□] ST', 15, centerY - 65);
      ctx.fillText('R [■■■■■■■■■□□□] STEREO', 15, centerY - 50);

      ctx.fillStyle = isPlaying ? 'rgba(0, 255, 65, 0.6)' : 'rgba(245, 245, 245, 0.25)';
      ctx.fillText('LATENCY: 12ms', width - 110, centerY - 65);
      ctx.fillText('BITRATE: 320kbps', width - 110, centerY - 50);

      // Centered Orbit Visualizer Ring in background
      ctx.strokeStyle = isPlaying ? 'rgba(0, 255, 65, 0.12)' : 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(width / 2, centerY, Math.min(width, height) * 0.3, 0, Math.PI * 2);
      ctx.stroke();

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, audioRef]);

  return (
    <div id="visualizer-wrapper" className="relative w-full h-full min-h-[140px] grow bg-[#111214] rounded-xl overflow-hidden border border-[#2b2d31]">
      <canvas ref={canvasRef} className="block w-full h-full" id="stream-analyser-canvas" />
      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#1e1f22]/90 backdrop-blur px-2.5 py-1 rounded text-[10px] font-mono font-medium tracking-tight border border-[#2b2d31]">
        <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-[#23a55a] animate-pulse' : 'bg-[#4f545c]'}`} />
        <span className="text-[#dbdee1] uppercase">{isPlaying ? 'Streaming Audio' : 'Paused / Idle'}</span>
      </div>
    </div>
  );
}
