'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Loader2, X } from 'lucide-react';

type Status = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function VoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  // Wrap in object so .current stays readonly-compatible but inner list is mutable
  const historyRef = useRef<{ list: Message[] }>({ list: [] });
  const recognitionRef = useRef<{ stop?: () => void } | null>(null);

  const [mounted, setMounted] = useState(false);
  const locationRef = useRef<{ value: string }>({ value: '' });

  useEffect(() => {
    setMounted(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const res = await fetch(
              `/api/google/geocode?latlng=${latitude},${longitude}`
            );
            const data = await res.json();
            const city = data?.results?.[0]?.address_components?.find(
              (c: { types: string[] }) => c.types.includes('locality')
            )?.long_name;
            if (city) locationRef.current.value = city;
          } catch {}
        },
        () => {}
      );
    }
  }, []);

  const supported =
    mounted &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    setStatus('speaking');
    utter.onend = () => setStatus('idle');
    utter.onerror = () => setStatus('idle');
    window.speechSynthesis.speak(utter);
  }, []);

  const query = useCallback(
    async (text: string) => {
      setStatus('thinking');
      setTranscript(text);
      setReply('');

      try {
        const res = await fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history: historyRef.current.list, location: locationRef.current.value }),
        });

        if (res.status === 401) {
          setErrorMsg('Please sign in to use the voice assistant.');
          setStatus('error');
          return;
        }
        if (res.status === 503) {
          setErrorMsg('Voice assistant is not configured yet.');
          setStatus('error');
          return;
        }

        const data = await res.json();
        const responseText = data.response || "Sorry, I didn't catch that.";

        historyRef.current.list = [
          ...historyRef.current.list,
          { role: 'user' as const, content: text },
          { role: 'assistant' as const, content: responseText },
        ].slice(-20);

        setReply(responseText);
        speak(responseText);
      } catch {
        setErrorMsg('Something went wrong. Please try again.');
        setStatus('error');
      }
    },
    [speak],
  );

  const startListening = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setStatus('listening');
      setErrorMsg('');
    };
    recognition.onresult = (e: any) => {
      const text: string = e.results[0][0].transcript;
      query(text);
    };
    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        setErrorMsg('Microphone error: ' + e.error);
        setStatus('error');
      } else {
        setStatus('idle');
      }
    };
    recognition.onend = () => {
      if (status === 'listening') setStatus('idle');
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [supported, query, status]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop?.();
    window.speechSynthesis.cancel();
    setStatus('idle');
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setTranscript('');
    setReply('');
    setErrorMsg('');
    startListening();
  };

  const handleClose = () => {
    stop();
    setOpen(false);
    setTranscript('');
    setReply('');
    setErrorMsg('');
    historyRef.current.list = [];
  };

  const handleMicClick = () => {
    if (status === 'listening' || status === 'speaking') {
      stop();
    } else {
      startListening();
    }
  };

  if (!mounted || !supported) return null;

  return createPortal(
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Bubble */}
      {open && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-4 w-72 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tracking-wide uppercase">
              Hey Cheap
            </span>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={14} />
            </button>
          </div>

          {status === 'listening' && (
            <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">
              Listening…
            </p>
          )}
          {status === 'thinking' && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Thinking…
            </p>
          )}
          {status === 'error' && errorMsg && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}

          {transcript && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">You:</span> {transcript}
            </p>
          )}
          {reply && (
            <p className="text-sm text-slate-900 dark:text-white leading-snug">
              {reply}
            </p>
          )}

          {status === 'idle' && (
            <p className="text-xs text-slate-400 text-center">
              Tap the mic to speak again
            </p>
          )}
        </div>
      )}

      {/* Mic button */}
      <button
        onClick={open ? handleMicClick : handleOpen}
        title="Talk to Hey Cheap"
        className={`relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors duration-200 ${
          status === 'listening'
            ? 'bg-red-500 hover:bg-red-600'
            : status === 'thinking'
              ? 'bg-slate-400 cursor-wait'
              : status === 'speaking'
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {status === 'thinking' ? (
          <Loader2 size={22} className="text-white animate-spin" />
        ) : status === 'listening' ? (
          <MicOff size={22} className="text-white" />
        ) : (
          <Mic size={22} className="text-white" />
        )}

        {status === 'listening' && (
          <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
        )}
        {status === 'speaking' && (
          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-30" />
        )}
      </button>
    </div>,
    document.body,
  );
}
