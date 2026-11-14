import { useState } from 'react';

interface SafeGameIconProps {
  src?: string;
  alt: string;
  fallbackLabel: string;
  className?: string;
  sizeClass?: string;
}

export function SafeGameIcon({
  src,
  alt,
  fallbackLabel,
  className = '',
  sizeClass = 'w-10 h-10',
}: SafeGameIconProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const initials = fallbackLabel
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() || 'LoL';

    return (
      <div
        role="img"
        aria-label={alt}
        className={`${sizeClass} shrink-0 rounded-lg bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 ${className}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} shrink-0 rounded-lg object-cover border border-slate-200 dark:border-slate-700/80 bg-slate-900 ${className}`}
    />
  );
}
