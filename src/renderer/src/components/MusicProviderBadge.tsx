import deezerMark from '../assets/deezer-mark.svg'

/** Compact provider marks used only to identify the service that supplied a music item. */
export function MusicProviderBadge({ provider, compact = false }: { provider: string; compact?: boolean }): React.JSX.Element {
  const spotify = /^spotify$/i.test(provider)
  const deezer = /^deezer$/i.test(provider)
  if (/^youtube$/i.test(provider)) {
    // הסימן המוכר של YouTube: משולש לבן על מלבן אדום מעוגל
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#17171c]/92 px-2 py-1 text-[10px] font-bold tracking-tight text-white backdrop-blur-md" aria-label="YouTube">
        <svg viewBox="0 0 28 20" className="h-3 w-[17px]" aria-hidden="true">
          <rect width="28" height="20" rx="5" fill="#FF0033" />
          <path d="M11 5.5v9l7.5-4.5z" fill="#fff" />
        </svg>
        {!compact && <span>YouTube</span>}
      </span>
    )
  }
  if (!spotify && !deezer) {
    return <span className="rounded-full bg-canvas/70 px-2 py-1 text-[10px] font-semibold text-ink/80">{provider}</span>
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold tracking-tight backdrop-blur-md ${
        spotify ? 'bg-[#1ED760]/90 text-[#07130b]' : 'bg-[#17171c]/92 text-white'
      }`}
      aria-label={provider}
    >
      {spotify ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="currentColor" opacity="0.12" />
          <path d="M5.3 8.2c4.4-1.3 9.8-.9 13.6 1.1M6.2 12c3.7-1 8.3-.7 11.5.9M7 15.5c3-.7 6.6-.5 9.3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : (
        <img src={deezerMark} alt="" className="h-3.5 w-4 object-contain" />
      )}
      {!compact && <span>{provider}</span>}
    </span>
  )
}
