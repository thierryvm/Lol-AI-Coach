import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Mic,
  MicOff,
  Radio,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { postCoachJson } from '../engines/aiConfig.ts';
import type { LiveCoachSnapshot } from '../engines/types.ts';
import {
  buildContextualFeedbackForMoment,
  detectKeyMomentFromTranscript,
  getFrenchSpeechVoices,
  speakCoachFeedback,
  stopCoachSpeech,
  VOICE_TEST_PRESETS,
  type KeyMomentType,
  type VoiceFeedbackMode,
  type VoiceMomentDetection,
} from '../engines/voiceMomentEngine.ts';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';
import type { ToastItem } from './ToastContainer.tsx';

interface VoiceMomentCoachPanelProps {
  snapshot: LiveCoachSnapshot;
  onNotify?: (toast: Omit<ToastItem, 'id'>) => void;
  onTranscriptDetected?: (transcript: string) => boolean | void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const FEEDBACK_MODE_STORAGE_KEY = 'lol_ai_coach_voice_feedback_mode_v1';
const VOICE_URI_STORAGE_KEY = 'lol_ai_coach_voice_uri_v1';

function loadFeedbackMode(): VoiceFeedbackMode {
  try {
    const raw = localStorage.getItem(FEEDBACK_MODE_STORAGE_KEY);
    if (raw === 'both' || raw === 'visual' || raw === 'vocal') return raw;
  } catch {
    // ignore
  }
  return 'both';
}

function loadSavedVoiceUri(): string {
  try {
    return localStorage.getItem(VOICE_URI_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(new Error('Impossible de lire l’enregistrement audio.'));
    reader.readAsDataURL(blob);
  });
}

const VALID_MOMENT_TYPES = new Set<KeyMomentType>([
  'DRAGON',
  'BARON',
  'HERALD_GRUBS',
  'GANK_IMMINENT',
  'RETREAT_DANGER',
  'SUMMONER_DOWN',
  'RECALL_BUY',
  'TEAMFIGHT_ENGAGE',
]);

export function VoiceMomentCoachPanel({
  snapshot,
  onNotify,
  onTranscriptDetected,
}: VoiceMomentCoachPanelProps) {
  const [feedbackMode, setFeedbackMode] = useState<VoiceFeedbackMode>(() => loadFeedbackMode());
  const [frenchVoices, setFrenchVoices] = useState<SpeechSynthesisVoice[]>(() =>
    getFrenchSpeechVoices(),
  );
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(() => loadSavedVoiceUri());
  const [isListening, setIsListening] = useState(false);
  const [listeningEngine, setListeningEngine] = useState<'idle' | 'speech' | 'gemini-vad'>('idle');
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [isAnalyzingClip, setIsAnalyzingClip] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [manualPhrase, setManualPhrase] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<VoiceMomentDetection | null>(null);
  const [history, setHistory] = useState<VoiceMomentDetection[]>([]);

  const speechSupported = Boolean(getSpeechRecognitionCtor());

  // Refs pour éviter les stale closures dans les callbacks audio / SpeechRecognition
  const isListeningRef = useRef(false);
  const listeningEngineRef = useRef<'idle' | 'speech' | 'gemini-vad'>('idle');
  const feedbackModeRef = useRef<VoiceFeedbackMode>(feedbackMode);
  const selectedVoiceUriRef = useRef<string>(selectedVoiceUri);
  const snapshotRef = useRef<LiveCoachSnapshot>(snapshot);
  const onTranscriptDetectedRef = useRef(onTranscriptDetected);
  const cooldownMapRef = useRef<Record<string, number>>({});
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Refs pour le mode VAD automatique (secours Gemini Audio quand SpeechRecognition est bloqué)
  const vadRecorderRef = useRef<MediaRecorder | null>(null);
  const vadChunksRef = useRef<Blob[]>([]);
  const vadStartedAtRef = useRef<number>(0);
  const vadLastLoudAtRef = useRef<number>(0);
  const vadBusyRef = useRef<boolean>(false);

  // Chargement asynchrone des voix françaises du système / navigateur (voiceschanged)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const refreshVoices = () => {
      const list = getFrenchSpeechVoices();
      setFrenchVoices(list);
      if (list.length > 0 && !selectedVoiceUriRef.current) {
        setSelectedVoiceUri(list[0].voiceURI);
      }
    };
    refreshVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', refreshVoices);
    };
  }, []);

  useEffect(() => {
    feedbackModeRef.current = feedbackMode;
    try {
      localStorage.setItem(FEEDBACK_MODE_STORAGE_KEY, feedbackMode);
    } catch {
      // ignore
    }
  }, [feedbackMode]);

  useEffect(() => {
    selectedVoiceUriRef.current = selectedVoiceUri;
    try {
      if (selectedVoiceUri) localStorage.setItem(VOICE_URI_STORAGE_KEY, selectedVoiceUri);
    } catch {
      // ignore
    }
  }, [selectedVoiceUri]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    onTranscriptDetectedRef.current = onTranscriptDetected;
  }, [onTranscriptDetected]);

  const playVoice = useCallback((text: string) => {
    speakCoachFeedback(text, {
      voiceURI: selectedVoiceUriRef.current || undefined,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    });
  }, []);

  const triggerDetection = useCallback(
    (detection: VoiceMomentDetection, ignoreCooldown = false) => {
      const now = Date.now();
      const lastTriggeredAt = cooldownMapRef.current[detection.type] || 0;
      if (!ignoreCooldown && now - lastTriggeredAt < 5000) {
        return;
      }
      cooldownMapRef.current[detection.type] = now;

      const mode = feedbackModeRef.current;
      setHistory((prev) => [detection, ...prev].slice(0, 12));

      if (mode === 'both' || mode === 'visual') {
        setActiveAlert(detection);
        onNotify?.({
          variant: detection.severity === 'critical' ? 'goal' : 'info',
          title: `Micro · ${detection.label}`,
          description: detection.coachAction,
          durationMs: 5500,
        });
      }

      if (mode === 'both' || mode === 'vocal') {
        playVoice(detection.spokenText);
      }
    },
    [onNotify, playVoice],
  );

  const analyzeAudioBlobWithGemini = useCallback(
    async (audioBlob: Blob, showEmptyMessage: boolean) => {
      if (audioBlob.size < 450) {
        if (showEmptyMessage) {
          setMicError(
            'Extrait audio trop court : parlez pendant 1 à 4 secondes avant de stopper.',
          );
        }
        return;
      }

      setIsAnalyzingClip(true);
      vadBusyRef.current = true;
      try {
        const audioBase64 = await blobToBase64(audioBlob);
        const aiRes = await postCoachJson<{
          transcript: string;
          detected: boolean;
          momentType: string;
          label: string;
          severity: 'critical' | 'warning' | 'tactical';
          headline: string;
          coachAction: string;
          spokenText: string;
        }>('/api/coach/voice-moment', {
          audioBase64,
          mimeType: audioBlob.type || 'audio/webm',
          snapshot: snapshotRef.current,
        });

        if (aiRes.transcript) {
          setLiveTranscript(aiRes.transcript);
          onTranscriptDetectedRef.current?.(aiRes.transcript);
        }

        if (aiRes.detected || (aiRes.momentType && aiRes.momentType !== 'NONE')) {
          const safeType: KeyMomentType = VALID_MOMENT_TYPES.has(aiRes.momentType as KeyMomentType)
            ? (aiRes.momentType as KeyMomentType)
            : 'TEAMFIGHT_ENGAGE';
          const fallback = buildContextualFeedbackForMoment(safeType, snapshotRef.current);

          triggerDetection(
            {
              id: `gemini-${Date.now()}`,
              type: safeType,
              label: aiRes.label || fallback.label,
              severity: aiRes.severity || fallback.severity,
              matchedPhrase: 'Analyse Audio Gemini',
              transcript: aiRes.transcript || '(Extrait audio)',
              headline: aiRes.headline || fallback.headline,
              coachAction: aiRes.coachAction || fallback.coachAction,
              spokenText: aiRes.spokenText || aiRes.coachAction || fallback.spokenText,
              gameTimeSec: snapshotRef.current.gameTimeSec,
              detectedAt: new Date().toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
              source: 'gemini-audio',
            },
            true,
          );
        } else if (showEmptyMessage) {
          setMicNotice(
            aiRes.transcript
              ? `Capté : « ${aiRes.transcript} » — aucun mot-clé LoL détecté dans cette phrase.`
              : 'Aucune parole claire captée dans cet extrait.',
          );
        }
      } catch (err) {
        setMicError(
          err instanceof Error
            ? err.message
            : 'Impossible d’analyser l’extrait audio pour le moment.',
        );
      } finally {
        setIsAnalyzingClip(false);
        window.setTimeout(() => {
          vadBusyRef.current = false;
        }, 650);
      }
    },
    [triggerDetection],
  );

  const stopMicPipeline = useCallback(() => {
    isListeningRef.current = false;
    listeningEngineRef.current = 'idle';
    setIsListening(false);
    setListeningEngine('idle');
    setMicLevel(0);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (vadRecorderRef.current && vadRecorderRef.current.state === 'recording') {
      try {
        vadRecorderRef.current.onstop = null;
        vadRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    vadRecorderRef.current = null;
    vadChunksRef.current = [];
    vadStartedAtRef.current = 0;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopMicPipeline();
      stopCoachSpeech();
    };
  }, [stopMicPipeline]);

  const startAudioLevelMeter = async (): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'Votre navigateur bloque l’accès au microphone dans ce contexte. Utilisez les raccourcis de test ou ouvrez l’application dans un onglet dédié.',
      );
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!streamRef.current) return;
        analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const norm = (data[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / data.length);
        const scaled = Math.min(1, rms * 4.5);
        setMicLevel(scaled);

        // Détection automatique de parole (VAD) lorsque le mode Gemini Audio automatique est actif
        if (
          isListeningRef.current &&
          listeningEngineRef.current === 'gemini-vad' &&
          typeof MediaRecorder !== 'undefined' &&
          !vadBusyRef.current
        ) {
          const now = Date.now();
          const activeRec = vadRecorderRef.current;

          if (!activeRec || activeRec.state === 'inactive') {
            if (scaled >= 0.08) {
              try {
                const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
                const mime = preferred.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
                const rec = mime
                  ? new MediaRecorder(stream, { mimeType: mime })
                  : new MediaRecorder(stream);
                vadChunksRef.current = [];
                vadStartedAtRef.current = now;
                vadLastLoudAtRef.current = now;
                rec.ondataavailable = (ev) => {
                  if (ev.data && ev.data.size > 0) vadChunksRef.current.push(ev.data);
                };
                rec.onstop = () => {
                  const blob = new Blob(vadChunksRef.current, {
                    type: rec.mimeType || mime || 'audio/webm',
                  });
                  vadChunksRef.current = [];
                  vadRecorderRef.current = null;
                  if (isListeningRef.current) {
                    void analyzeAudioBlobWithGemini(blob, false);
                  }
                };
                vadRecorderRef.current = rec;
                rec.start();
              } catch {
                // ignore recorder start error
              }
            }
          } else if (activeRec.state === 'recording') {
            if (scaled >= 0.06) {
              vadLastLoudAtRef.current = now;
            }
            const silenceMs = now - vadLastLoudAtRef.current;
            const totalMs = now - vadStartedAtRef.current;
            if ((totalMs >= 650 && silenceMs >= 850) || totalMs >= 4500) {
              try {
                activeRec.stop();
              } catch {
                // ignore
              }
            }
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    return stream;
  };

  const activateGeminiVadMode = useCallback((reasonMsg: string) => {
    if (!isListeningRef.current) return;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    listeningEngineRef.current = 'gemini-vad';
    setListeningEngine('gemini-vad');
    setMicError(null);
    setMicNotice(reasonMsg);
  }, []);

  const handleToggleListening = async () => {
    if (isListening) {
      stopMicPipeline();
      setMicNotice(null);
      return;
    }

    setMicError(null);
    setMicNotice(null);
    try {
      await startAudioLevelMeter();
      isListeningRef.current = true;
      setIsListening(true);

      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        activateGeminiVadMode(
          'Dictée Web Speech absente sur ce navigateur : écoute automatique par détection vocale Gemini Audio activée.',
        );
        return;
      }

      listeningEngineRef.current = 'speech';
      setListeningEngine('speech');

      const recognition = new Ctor();
      recognition.lang = 'fr-FR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let interimText = '';
        let latestChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript?.trim() || '';
          if (!text) continue;
          latestChunk = `${latestChunk} ${text}`.trim();
          if (!res.isFinal) {
            interimText = `${interimText} ${text}`.trim();
          } else {
            setLiveTranscript(text);
            onTranscriptDetectedRef.current?.(text);
            const found = detectKeyMomentFromTranscript(
              text,
              snapshotRef.current,
              'speech-live',
            );
            if (found) {
              triggerDetection(found);
            }
          }
        }

        if (interimText) {
          setLiveTranscript(interimText);
          const foundInterim = detectKeyMomentFromTranscript(
            latestChunk || interimText,
            snapshotRef.current,
            'speech-live',
          );
          if (foundInterim) {
            triggerDetection(foundInterim);
          }
        }
      };

      recognition.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setMicError(
            'Permission microphone refusée par le navigateur. Autorisez le micro dans la barre d’adresse (icône cadenas) ou ouvrez l’app dans un onglet dédié.',
          );
          stopMicPipeline();
        } else if (ev.error === 'network') {
          // Bascule transparente vers la détection automatique Gemini Audio
          activateGeminiVadMode(
            'Dictée Chrome indisponible ici : bascule automatique sur l’écoute vocale Gemini Audio (parlez normalement, vos phrases sont analysées dès que vous marquez une pause).',
          );
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current && listeningEngineRef.current === 'speech') {
          try {
            recognition.start();
          } catch {
            // ignore restart race
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      stopMicPipeline();
      const rawMsg = err instanceof Error ? err.message : 'Impossible d’accéder au microphone.';
      if (rawMsg.toLowerCase().includes('denied') || rawMsg.toLowerCase().includes('permission')) {
        setMicError(
          'Accès au micro refusé. Vérifiez les autorisations microphone de votre navigateur puis réessayez.',
        );
      } else {
        setMicError(rawMsg);
      }
    }
  };

  const handleToggleGeminiAudioClip = async () => {
    if (isRecordingClip && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingClip(false);
      return;
    }

    setMicError(null);
    setMicNotice(null);
    try {
      const existingStream = streamRef.current || (await startAudioLevelMeter());
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('Enregistrement audio MediaRecorder non supporté sur ce navigateur.');
      }

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const chosenMime = preferredTypes.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const recorder = chosenMime
        ? new MediaRecorder(existingStream, { mimeType: chosenMime })
        : new MediaRecorder(existingStream);

      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || chosenMime || 'audio/webm';
        const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        recordedChunksRef.current = [];

        if (!isListeningRef.current) {
          stopMicPipeline();
        }

        await analyzeAudioBlobWithGemini(audioBlob, true);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingClip(true);
    } catch (err) {
      setMicError(
        err instanceof Error ? err.message : 'Impossible de démarrer l’enregistrement micro.',
      );
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualPhrase.trim();
    if (!clean) return;
    setMicError(null);
    setMicNotice(null);
    setLiveTranscript(clean);
    const spellMatched = Boolean(onTranscriptDetectedRef.current?.(clean));
    const detected = detectKeyMomentFromTranscript(clean, snapshot, 'simulation');
    if (detected) {
      triggerDetection(detected, true);
      setManualPhrase('');
    } else if (spellMatched) {
      setManualPhrase('');
    } else {
      setMicError(
        `Aucun mot-clé détecté dans « ${clean} ». Essayez par exemple : dragon, baron, gank, Aatrox plus de flash, je back ou recule.`,
      );
    }
  };

  const handleTriggerPreset = (sampleTranscript: string) => {
    setMicError(null);
    setMicNotice(null);
    setLiveTranscript(sampleTranscript);
    onTranscriptDetectedRef.current?.(sampleTranscript);
    const detected = detectKeyMomentFromTranscript(sampleTranscript, snapshot, 'simulation');
    if (detected) {
      triggerDetection(detected, true);
    }
  };

  const alertColors =
    activeAlert?.severity === 'critical'
      ? 'border-rose-500/45 bg-rose-500/10 text-rose-800 dark:text-rose-200'
      : activeAlert?.severity === 'warning'
        ? 'border-amber-500/45 bg-amber-500/10 text-amber-900 dark:text-amber-200'
        : 'border-sky-500/45 bg-sky-500/10 text-sky-900 dark:text-sky-200';

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
      {/* En-tête + Contrôles principaux */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Coach Vocal &amp; Détection de Moments Clés au Micro
            </h2>
            <SectionInfoTooltip
              title="Détection vocale des moments clés"
              description="Écoute votre micro pendant la partie pour repérer immédiatement les mots-clés stratégiques (Dragon, Baron, Gank imminent, Plus de Flash, Rappel) et déclencher une alerte visuelle et/ou vocale adaptée au match en cours."
              usageTip="Choisissez « Visuel seul » si vous jouez sur Discord pour éviter tout retour audio, ou « Extrait Audio Gemini » pour dicter une phrase libre analysée par IA."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Prononcez « Dragon », « Baron Nashor », « Gank imminent » ou « Plus de flash » ·{' '}
            {listeningEngine === 'gemini-vad'
              ? 'Écoute vocale automatique Gemini Audio active'
              : speechSupported
                ? 'Écoute continue instantanée + option Audio Gemini'
                : 'Mode Audio Gemini automatique & raccourcis manuels actifs'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sélecteur de mode de feedback */}
          <div
            role="group"
            aria-label="Mode de feedback du coach micro"
            className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D121C] border border-slate-200 dark:border-slate-800"
          >
            {(
              [
                { id: 'both', label: 'Vocal + Visuel' },
                { id: 'visual', label: 'Visuel seul' },
                { id: 'vocal', label: 'Vocal seul' },
              ] as Array<{ id: VoiceFeedbackMode; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFeedbackMode(opt.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  feedbackMode === opt.id
                    ? 'bg-white dark:bg-[#161D2C] text-slate-900 dark:text-white shadow-sm font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {frenchVoices.length > 0 && feedbackMode !== 'visual' && (
            <select
              value={selectedVoiceUri}
              onChange={(e) => setSelectedVoiceUri(e.target.value)}
              aria-label="Voix française utilisée pour le retour vocal"
              className="max-w-[180px] truncate px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-800 dark:text-slate-200"
            >
              {frenchVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  Voix : {v.name.replace(/Microsoft |Google /g, '')}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleToggleListening}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              isListening
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Couper le micro</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Activer l’écoute micro</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleToggleGeminiAudioClip}
            disabled={isAnalyzingClip}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              isRecordingClip
                ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            <span>
              {isAnalyzingClip
                ? 'Analyse IA...'
                : isRecordingClip
                  ? 'Stop & Analyser (Gemini)'
                  : 'Extrait Audio Gemini'}
            </span>
          </button>

          {isSpeaking && (
            <button
              type="button"
              onClick={() => {
                stopCoachSpeech();
                setIsSpeaking(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Taire la voix</span>
            </button>
          )}
        </div>
      </div>

      {/* Bandeau niveau micro réel + transcription en direct */}
      <div className="rounded-lg bg-slate-50 dark:bg-[#0D121C] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 min-w-[210px]">
          <Radio
            className={`w-4 h-4 shrink-0 ${
              isListening || isRecordingClip ? 'text-emerald-500' : 'text-slate-400'
            }`}
            aria-hidden="true"
          />
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
              <span className="font-medium">
                {isRecordingClip
                  ? 'Enregistrement extrait IA...'
                  : isAnalyzingClip
                    ? 'Analyse Gemini Audio...'
                    : listeningEngine === 'gemini-vad'
                      ? 'Écoute Gemini auto'
                      : isListening
                        ? 'Micro actif'
                        : 'Micro en veille'}
              </span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {Math.round(micLevel * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full w-full origin-left bg-emerald-500 transition-transform duration-75"
                style={{
                  transform: `scaleX(${isListening || isRecordingClip ? Math.max(0.04, micLevel) : 0})`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="sm:border-l sm:border-slate-200 dark:sm:border-slate-800 sm:pl-4 flex-1 min-w-0 text-xs">
          <span className="text-slate-500 dark:text-slate-400 mr-1.5">Dernière phrase captée :</span>
          <span className="font-medium text-slate-900 dark:text-white break-words">
            {liveTranscript ? `« ${liveTranscript} »` : 'En attente d’une détection vocale...'}
          </span>
        </div>
      </div>

      {micNotice && !micError && (
        <div className="rounded-lg border border-sky-500/35 bg-sky-500/5 px-4 py-2.5 text-xs text-sky-800 dark:text-sky-300">
          {micNotice}
        </div>
      )}

      {micError && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          {micError}
        </div>
      )}

      {/* Bannière d'alerte visuelle instantanée */}
      <AnimatePresence mode="wait">
        {activeAlert && (
          <motion.div
            key={activeAlert.id}
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
            }}
            exit={{
              opacity: 0,
              y: -4,
              transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] },
            }}
            role="alert"
            className={`rounded-xl border p-4 space-y-2.5 ${alertColors}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-medium opacity-85 flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{activeAlert.label}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Horloge {formatClock(activeAlert.gameTimeSec)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Repère : « {activeAlert.matchedPhrase} »</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeAlert.headline}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => playVoice(activeAlert.spokenText)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-white/80 dark:bg-slate-900/70 text-slate-900 dark:text-white border border-slate-300/70 dark:border-slate-700 hover:border-amber-500 transition-colors whitespace-nowrap"
                >
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Réécouter</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAlert(null)}
                  aria-label="Fermer l’alerte vocale"
                  className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed">
              {activeAlert.coachAction}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tests rapides en 1 clic + Saisie manuelle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Tester un déclencheur :
          </span>
          {VOICE_TEST_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleTriggerPreset(preset.sampleTranscript)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-200 hover:border-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleManualSubmit} className="flex items-center gap-2 sm:min-w-[300px]">
          <input
            type="text"
            value={manualPhrase}
            onChange={(e) => setManualPhrase(e.target.value)}
            placeholder="Simuler une phrase (ex: Gank bot)"
            aria-label="Simuler une phrase vocale"
            className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <Send className="w-3 h-3" aria-hidden="true" />
            <span>Tester</span>
          </button>
        </form>
      </div>

      {/* Journal chronologique des moments détectés */}
      {history.length > 0 && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Historique des appels détectés ({history.length})
            </h3>
            <button
              type="button"
              onClick={() => setHistory([])}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" aria-hidden="true" />
              <span>Effacer</span>
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {history.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                      {item.detectedAt}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span
                      className={`font-semibold ${
                        item.severity === 'critical'
                          ? 'text-rose-600 dark:text-rose-400'
                          : item.severity === 'warning'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-sky-600 dark:text-sky-400'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="text-slate-600 dark:text-slate-300 truncate">
                      « {item.transcript} »
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {item.coachAction}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => playVoice(item.spokenText)}
                  title="Réécouter le feedback vocal"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  <Volume2 className="w-3 h-3" aria-hidden="true" />
                  <span>Audio</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
