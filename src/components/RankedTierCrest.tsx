import { getRankedTierTheme } from '../utils/rankedDisplay.ts';

interface RankedTierCrestProps {
  tier?: string | null;
  sizeClass?: string;
}

export function RankedTierCrest({ tier, sizeClass = 'w-9 h-9' }: RankedTierCrestProps) {
  const normalized = (tier || 'UNRANKED').toUpperCase();
  const theme = getRankedTierTheme(normalized);
  const isUnranked = normalized === 'UNRANKED';

  return (
    <svg
      viewBox="0 0 36 36"
      className={`${sizeClass} shrink-0`}
      aria-hidden="true"
    >
      <path
        d="M18 3L30 8.5V18.2C30 25.4 24.9 30.8 18 33C11.1 30.8 6 25.4 6 18.2V8.5L18 3Z"
        fill={isUnranked ? 'rgba(100, 116, 139, 0.14)' : `${theme.accentHex}22`}
        stroke={theme.accentHex}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M18 8.2L25 11.6V18.2C25 22.8 22 26.3 18 28C14 26.3 11 22.8 11 18.2V11.6L18 8.2Z"
        fill={isUnranked ? 'rgba(100, 116, 139, 0.12)' : `${theme.secondaryHex}30`}
        stroke={theme.accentHex}
        strokeOpacity="0.65"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {isUnranked ? (
        <path
          d="M14 18H22"
          stroke={theme.accentHex}
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <polygon
          points="18,12 22.2,18 18,24 13.8,18"
          fill={theme.accentHex}
        />
      )}
    </svg>
  );
}
