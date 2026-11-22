import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Info, X } from 'lucide-react';

interface SectionInfoTooltipProps {
  title: string;
  description: string;
  usageTip?: string;
  align?: 'left' | 'right';
}

export function SectionInfoTooltip({
  title,
  description,
  usageTip,
  align = 'left',
}: SectionInfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open && !pinned) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, pinned]);

  const isVisible = open || pinned;

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`Information sur la section : ${title}`}
        aria-expanded={isVisible}
        aria-controls={isVisible ? tooltipId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((prev) => {
            const next = !prev;
            setOpen(next);
            return next;
          });
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
          isVisible
            ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400'
            : 'border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400'
        }`}
      >
        <Info className="w-3 h-3" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            id={tooltipId}
            role="dialog"
            aria-label={`À propos de : ${title}`}
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] },
            }}
            exit={{
              opacity: 0,
              y: 2,
              scale: 0.98,
              transition: { duration: 0.1, ease: [0.23, 1, 0.32, 1] },
            }}
            className={`absolute top-full mt-2 z-50 w-72 sm:w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D121C] p-3.5 shadow-xl text-left ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                {title}
              </div>
              {pinned && (
                <button
                  type="button"
                  onClick={() => {
                    setPinned(false);
                    setOpen(false);
                  }}
                  aria-label="Fermer la bulle d'information"
                  className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {description}
            </p>
            {usageTip && (
              <p className="mt-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px] font-medium text-amber-700 dark:text-amber-400 leading-relaxed">
                Utilité : {usageTip}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
