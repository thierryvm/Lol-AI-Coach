import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Info,
  Trophy,
  X,
} from 'lucide-react';

export type ToastVariant = 'postgame' | 'goal' | 'success' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description: string;
  action?: ToastAction;
  durationMs?: number;
}

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastCard({ toast, onDismiss }: ToastCardProps) {
  const [paused, setPaused] = useState(false);
  const durationMs = toast.durationMs ?? 6500;

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, durationMs, paused, onDismiss]);

  const styleMap: Record<
    ToastVariant,
    {
      border: string;
      accentBar: string;
      iconWrap: string;
      Icon: typeof History;
      progressBar: string;
    }
  > = {
    postgame: {
      border: 'border-sky-500/35 dark:border-sky-400/30',
      accentBar: 'bg-sky-500',
      iconWrap: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
      Icon: History,
      progressBar: 'bg-sky-500/70',
    },
    goal: {
      border: 'border-emerald-500/40 dark:border-emerald-400/35',
      accentBar: 'bg-emerald-500',
      iconWrap: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      Icon: Trophy,
      progressBar: 'bg-emerald-500/75',
    },
    success: {
      border: 'border-amber-500/35 dark:border-amber-400/30',
      accentBar: 'bg-amber-500',
      iconWrap: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      Icon: CheckCircle2,
      progressBar: 'bg-amber-500/75',
    },
    warning: {
      border: 'border-rose-500/40 dark:border-rose-400/35',
      accentBar: 'bg-rose-500',
      iconWrap: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
      Icon: AlertTriangle,
      progressBar: 'bg-rose-500/75',
    },
    info: {
      border: 'border-slate-300 dark:border-slate-700',
      accentBar: 'bg-slate-400 dark:bg-slate-500',
      iconWrap: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
      Icon: Info,
      progressBar: 'bg-slate-400/70',
    },
  };

  const styles = styleMap[toast.variant];
  const Icon = styles.Icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] },
      }}
      exit={{
        opacity: 0,
        x: 32,
        scale: 0.96,
        transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] },
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="status"
      aria-live="polite"
      className={`pointer-events-auto relative overflow-hidden rounded-xl border ${styles.border} bg-white/95 dark:bg-[#121722]/95 backdrop-blur-md shadow-xl p-4`}
    >
      {/* Barre latérale d'accentuation */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 bottom-0 w-1 ${styles.accentBar}`}
      />

      <div className="flex items-start gap-3 pl-1.5">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${styles.iconWrap}`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
              {toast.title}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Fermer la notification"
              className="p-0.5 -mt-0.5 -mr-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {toast.description}
          </p>

          {toast.action && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
                className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-md bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Indicateur discret de temps restant avant fermeture auto */}
      {!paused && (
        <motion.div
          key={`${toast.id}-timer`}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: durationMs / 1000, ease: 'linear' }}
          style={{ transformOrigin: 'left center' }}
          aria-hidden="true"
          className={`absolute left-0 right-0 bottom-0 h-0.5 ${styles.progressBar}`}
        />
      )}
    </motion.div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 w-[calc(100vw-2rem)] sm:w-96 pointer-events-none"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
