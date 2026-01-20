import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, AlertCircle, Info } from 'lucide-react';
import WireframeSphere from './components/WireframeSphere';
import { BotState } from './types';
import { createPcmBlob, decodeAudioData } from './utils/audioUtils';

const App: React.FC = () => {
  const [isLive, setIsLive] = useState(false);
  const [botState, setBotState] = useState<BotState>(BotState.IDLE);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const stopSession = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    sourcesRef.current.forEach(source => { try { source.stop(); } catch (e) {} });
    sourcesRef.current.clear();
    setIsLive(false);
    setBotState(BotState.IDLE);
    setVolume(0);
  }, []);

  const startSession = async () => {
    if (isLive) return;
    setError(null);
    setBotState(BotState.LISTENING); 

    try {
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = ac;

      const inputAnalyser = ac.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyserRef.current = inputAnalyser;

      const outputAnalyser = ac.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyserRef.current = outputAnalyser;
      outputAnalyser.connect(ac.destination); 

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsLive(true);
            const micSource = ac.createMediaStreamSource(stream);
            micSource.connect(inputAnalyser);
            const processor = ac.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              sessionPromise.then(s => s.sendRealtimeInput({ media: createPcmBlob(inputData) }));
            };
            micSource.connect(processor);
            processor.connect(ac.destination); 
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setBotState(BotState.SPEAKING);
              const buffer = await decodeAudioData(base64ToUint8Array(audioData), ac);
              const source = ac.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAnalyser); 
              const start = Math.max(nextStartTimeRef.current, ac.currentTime);
              source.start(start);
              nextStartTimeRef.current = start + buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setBotState(BotState.LISTENING);
              };
            }
            if (msg.serverContent?.interrupted) {
               sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
               sourcesRef.current.clear();
               setBotState(BotState.LISTENING);
            }
          },
          onclose: () => stopSession(),
          onerror: (err) => {
            setError("Connection Interrupted");
            stopSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
          systemInstruction: `You are the Orbital Voice Core. Speak naturally and stay concise.`,
        }
      });
    } catch (e: any) {
      setError(e.message || "Access Denied");
      stopSession();
    }
  };

  const base64ToUint8Array = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  useEffect(() => {
    let frame: number;
    const update = () => {
      if (isLive) {
        const data = new Uint8Array(256);
        const analyzer = botState === BotState.SPEAKING ? outputAnalyserRef.current : inputAnalyserRef.current;
        if (analyzer) {
          analyzer.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          setVolume(prev => prev * 0.8 + (sum / data.length / 100) * 0.2);
        }
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [isLive, botState]);

  return (
    <div className="fixed inset-0 w-full h-full bg-black overflow-hidden font-sans select-none">
      <WireframeSphere volume={volume} state={botState} />

      {/* Header Info */}
      <div className="absolute top-8 left-0 right-0 flex justify-center pointer-events-none">
        <div className="px-6 py-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-3">
           <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-cyan-400 animate-pulse' : 'bg-white/20'}`} />
           <span className="text-white/60 text-xs tracking-[0.3em] uppercase font-medium">
             {botState === BotState.IDLE ? 'System Dormant' : botState}
           </span>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-8 z-50">
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-5 py-2 rounded-full backdrop-blur-md text-sm animate-bounce">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* The Mic Button - Redesigned for maximum visibility */}
        <div className="relative group pointer-events-auto">
          {isLive && (
            <div className="absolute -inset-4 bg-cyan-500/20 rounded-full blur-2xl animate-pulse" />
          )}
          
          <button
            onClick={isLive ? stopSession : startSession}
            className={`
              relative flex items-center justify-center w-28 h-28 rounded-full 
              transition-all duration-700 border-2
              ${isLive 
                ? 'bg-red-500/20 border-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.4)]' 
                : 'bg-white/5 border-white/20 hover:border-white/40 shadow-[0_0_30px_rgba(255,255,255,0.1)]'
              }
            `}
          >
            {isLive ? (
              <div className="flex flex-col items-center">
                <MicOff className="w-10 h-10 text-white animate-pulse" />
                <span className="text-[10px] text-white/50 mt-1 font-bold uppercase tracking-tighter">Stop</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Mic className="w-10 h-10 text-white" />
                <span className="text-[10px] text-white/50 mt-1 font-bold uppercase tracking-tighter">Start</span>
              </div>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 text-white/30 text-[10px] tracking-[0.4em] uppercase font-light">
          <Info size={12} className="opacity-50" />
          <span>Tap the central core to initialize link</span>
        </div>
      </div>
    </div>
  );
};

export default App;