import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { TitleDetails as Details } from '@shared/api'
import { useT } from '../i18n'
import { Button, Icon, IconButton, Pill } from '../components/ui'
import { TrailerPlayer } from '../components/TrailerPlayer'
import { usePlayer } from '../store/player'

/**
 * כרטיס הכותר.
 *
 * נפתח בתוך התוכנה ולא בדפדפן. לחיצה על כותר שאינו אצלנו הובילה
 * קודם לדף TMDB — כלומר החוצה, אל אתר שאינו קשור למשתמש, במקום
 * לענות על השאלה "מה זה ואיפה אפשר לראות".
 *
 * הכפתורים כאן מובילים ישירות לשירות עצמו. ‏TMDB מחזיר קישור אחד
 * בלבד — דף JustWatch — ולכן הכתובת לכל שירות נבנית אצלנו.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{label}</h3>
      {children}
    </div>
  )
}

export function TitleDetails({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element {
  const t = useT()
  const [data, setData] = useState<Details | null>(null)
  const [missing, setMissing] = useState(false)
  const [listed, setListed] = useState(false)
  const [showTrailer, setShowTrailer] = useState(false)

  useEffect(() => {
    let alive = true
    void window.cinema.hub.details(id).then((d) => {
      if (!alive) return
      if (d) setData(d)
      else setMissing(true)
    })
    void window.cinema.hub.inWatchlist(id).then(setListed)
    return () => {
      alive = false
    }
  }, [id])

  const toggle = (): void => {
    if (!data) return
    void window.cinema.hub
      .toggleWatchlist({
        id: data.id,
        title: data.title,
        poster: data.poster,
        year: data.year,
        rating: data.rating,
        itemId: data.itemId,
        externalUrl: data.fallbackUrl ?? undefined,
        brand: null
      })
      .then(setListed)
  }

  const open = (url: string | null): void => {
    const target = url ?? data?.fallbackUrl
    if (target) void window.cinema.search.openExternal(target)
  }

  const KIND: Record<string, string> = {
    flatrate: t('search.subscription'),
    rent: t('search.rent'),
    buy: t('search.buy')
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex items-start justify-center overflow-y-auto bg-canvas/55 px-6 py-[6vh] backdrop-blur-2xl"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="glass-regular relative w-full max-w-3xl overflow-hidden rounded-o-2xl"
      >
        <IconButton
          icon="close"
          label={t('nav.close')}
          size={18}
          onClick={onClose}
          className="absolute end-3 top-3 z-10 bg-canvas/60 backdrop-blur-md"
        />

        {!data && !missing && (
          <>
            <div className="skeleton h-56 w-full" />
            <div className="flex flex-col gap-3 p-7">
              <div className="skeleton h-8 w-2/5 rounded-o-md" />
              <div className="skeleton h-3 w-4/5 rounded-o-xs" />
              <div className="skeleton h-3 w-3/5 rounded-o-xs" />
            </div>
          </>
        )}

        {missing && <p className="p-10 text-center text-[14px] text-ink-2">{t('library.notFound')}</p>}

        {data && (
          <>
            <div className="relative h-56 w-full overflow-hidden">
              {data.backdrop ? (
                <img src={data.backdrop} alt="" className="h-full w-full object-cover object-top" />
              ) : (
                <div className="h-full w-full bg-surf-2" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 px-7 pb-4">
                {data.logo ? (
                  <img
                    src={data.logo}
                    alt={data.title}
                    className="max-h-16 w-auto max-w-[min(340px,60%)] object-contain drop-shadow-[0_6px_20px_rgba(0,0,0,0.8)]"
                  />
                ) : (
                  <h2 dir="auto" className="font-display text-[26px] leading-tight font-extrabold">
                    {data.title}
                  </h2>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6 p-7 pt-4">
              <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-ink-2">
                {data.rating > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-ink tabular-nums">
                    <Icon name="star" size={12} fill />
                    {data.rating.toFixed(1)}
                  </span>
                )}
                {data.year && <span className="tabular-nums">{data.year}</span>}
                {data.runtimeMinutes ? <span className="tabular-nums">{data.runtimeMinutes} min</span> : null}
                {data.genres.map((g) => (
                  <span key={g} className="rounded-full bg-ink/10 px-2.5 py-0.5">
                    {g}
                  </span>
                ))}
                {data.playable && <span className="font-medium text-mint">{t('hub.inLibrary')}</span>}
              </div>

              {data.overview && (
                <p dir="auto" className="max-w-prose text-[14px] leading-relaxed text-ink/80">
                  {data.overview}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                {data.playable && (
                  <Button
                    variant="primary"
                    onClick={() => data.itemId && void window.cinema.player.playItem(data.itemId).catch(usePlayer.getState().reportError)}
                  >
                    <Icon name="play" size={16} fill />
                    {t('hub.play')}
                  </Button>
                )}
                {data.trailerKey && (
                  <Button variant="primary" onClick={() => setShowTrailer(true)}>
                    <Icon name="play" size={16} fill />
                    {t('details.trailer')}
                  </Button>
                )}
                <Button variant="glass" onClick={toggle}>
                  <Icon name={listed ? 'check' : 'plus'} size={16} strokeWidth={2} />
                  {t('hub.watchlist')}
                </Button>
              </div>

              {data.watch.length > 0 && (
                <Row label={t('search.streaming')}>
                  <div className="flex flex-wrap gap-2">
                    {[...data.watch]
                      .sort((a, b) => Number(b.subscribed) - Number(a.subscribed))
                      .map((w) => (
                      <div
                        key={`${w.kind}:${w.provider}`}
                        className={`group flex items-stretch overflow-hidden rounded-o-lg border transition duration-fast ${
                          w.subscribed
                            ? 'border-mint/50 bg-mint/10 hover:bg-mint/16'
                            : 'border-ink/12 bg-ink/5 hover:border-ink/25 hover:bg-ink/10'
                        }`}
                      >
                        <button onClick={() => open(w.url)} title={w.provider} className="flex items-center gap-2.5 py-2 pe-3.5 ps-2">
                          {w.logo ? (
                            <img src={w.logo} alt="" className="h-7 w-7 rounded-o-sm object-cover" />
                          ) : (
                            <span className="grid h-7 w-7 place-items-center rounded-o-sm bg-ink/10">
                              <Icon name="globe" size={14} />
                            </span>
                          )}
                          <span className="flex flex-col items-start leading-tight">
                            <span className="text-[13px] font-medium">{w.provider}</span>
                            <span className={`text-[11px] ${w.subscribed ? 'text-mint' : 'text-ink-3'}`}>
                              {w.subscribed ? t('subs.included') : KIND[w.kind]}
                            </span>
                          </span>
                          <Icon name="external" size={13} className="ms-1 text-ink-3" />
                        </button>
                        {!w.subscribed && w.signupUrl && (
                          <button
                            onClick={() => open(w.signupUrl)}
                            className="border-s border-ink/10 px-3 text-[11.5px] font-semibold text-arctic transition-colors hover:bg-arctic hover:text-canvas"
                          >
                            {t('subs.subscribe')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </Row>
              )}

              {data.watch.length === 0 && !data.playable && (
                <Pill>{t('search.unavailable')}</Pill>
              )}

              {data.cast.length > 0 && (
                <Row label={t('details.cast')}>
                  <div className="flex flex-wrap gap-4">
                    {data.cast.map((c) => (
                      <div key={c.name} className="flex w-[104px] flex-col gap-1.5">
                        {c.photo ? (
                          <img src={c.photo} alt="" className="h-[104px] w-[104px] rounded-o-lg object-cover" />
                        ) : (
                          <span className="grid h-[104px] w-[104px] place-items-center rounded-o-lg bg-surf-2 text-ink-3">
                            <Icon name="info" size={20} />
                          </span>
                        )}
                        <span dir="auto" className="truncate text-[12px] font-medium">
                          {c.name}
                        </span>
                        <span dir="auto" className="truncate text-[11px] text-ink-3">
                          {c.character}
                        </span>
                      </div>
                    ))}
                  </div>
                </Row>
              )}

              {/*
                הזמינות מוצגת כאן, ולכן הייחוס חייב להופיע כאן.
              */}
              {data.watch.length > 0 && (
                <p className="text-[11.5px] leading-relaxed text-ink-3">{t('legal.attribution')}</p>
              )}
            </div>
          </>
        )}
        {data?.trailerKey && showTrailer && (
          <TrailerPlayer trailerKey={data.trailerKey} trailerLang={data.trailerLang} title={data.title} onClose={() => setShowTrailer(false)} />
        )}
      </motion.div>
    </div>
  )
}
