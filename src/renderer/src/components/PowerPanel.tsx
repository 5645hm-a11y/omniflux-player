import { useState } from 'react'
import { usePlayer } from '../store/player'
import { useT } from '../i18n'
import { Button, Icon, IconButton } from './ui'

/**
 * לוח הכלים המתקדם.
 *
 * זה מה שיש ל-VLC ואין לנגנים היפים: אקולייזר, סנכרון כתוביות
 * ואודיו, ויחס תצוגה. ההבדל הוא שכאן הם לא מוסתרים בשלושה תפריטים
 * מקוננים — הם בשכבה אחת, עם משוב מיידי.
 */

/** התדרים שהאקולייזר חושף. מרווחי אוקטבה, התקן המוכר מכל נגן. */
const BANDS = ['31', '62', '125', '250', '500', '1K', '2K', '4K', '8K', '16K']

const PRESETS: Array<{ key: 'flat' | 'speech' | 'bass' | 'cinema' | 'night'; gains: number[] }> = [
  { key: 'flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { key: 'speech', gains: [-4, -3, -1, 2, 4, 4, 3, 1, 0, -1] },
  { key: 'bass', gains: [7, 6, 4, 1, 0, 0, 0, 0, 0, 0] },
  { key: 'cinema', gains: [5, 4, 1, 0, -1, 0, 2, 3, 4, 4] },
  { key: 'night', gains: [-6, -5, -2, 1, 3, 3, 1, -1, -3, -4] }
]

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  resetLabel,
  onChange,
  onReset
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  resetLabel: string
  onChange: (v: number) => void
  onReset: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-[12.5px] text-ink-2">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        dir="ltr"
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink/20 accent-violet"
        aria-label={label}
      />
      <button
        className="w-16 shrink-0 text-end text-[12px] text-ink/80 tabular-nums transition-colors hover:text-violet"
        onClick={onReset}
        title={resetLabel}
      >
        {value > 0 ? '+' : ''}
        {value.toFixed(step < 1 ? 1 : 0)}
        {suffix}
      </button>
    </div>
  )
}

export function PowerPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT()
  const subDelay = usePlayer((s) => s.engine.subDelay)
  const audioDelay = usePlayer((s) => s.engine.audioDelay)
  const eq = usePlayer((s) => s.engine.eq)
  const aspect = usePlayer((s) => s.engine.aspect)
  const brightness = usePlayer((s) => s.engine.brightness)
  const contrast = usePlayer((s) => s.engine.contrast)
  const saturation = usePlayer((s) => s.engine.saturation)
  const gamma = usePlayer((s) => s.engine.gamma)
  const sharpen = usePlayer((s) => s.engine.sharpen)
  const deband = usePlayer((s) => s.engine.deband)
  const videoFit = usePlayer((s) => s.engine.videoFit)
  const [tab, setTab] = useState<'sync' | 'eq' | 'video'>('sync')

  const setBand = (index: number, value: number): void => {
    const next = [...eq]
    next[index] = value
    void window.cinema.player.setEqualizer(next)
  }

  const tabClass = (id: typeof tab): string =>
    `no-drag rounded-o-md px-4 py-1.5 text-[13px] font-medium transition duration-fast ${
      tab === id ? 'bg-ink/14 text-ink' : 'text-ink-2 hover:bg-ink/8 hover:text-ink'
    }`

  const TABS: Array<{ id: typeof tab; label: string }> = [
    { id: 'sync', label: t('power.sync') },
    { id: 'eq', label: t('power.equalizer') },
    { id: 'video', label: t('power.image') }
  ]

  return (
    <div className="glass-regular no-drag pointer-events-auto w-[480px] rounded-o-xl border border-ink/10 p-5 shadow-e3 rise-in">
      <div className="mb-4 flex items-center gap-2">
        {TABS.map((tb) => (
          <button key={tb.id} className={tabClass(tb.id)} onClick={() => setTab(tb.id)}>
            {tb.label}
          </button>
        ))}
        <div className="flex-1" />
        <IconButton icon="close" label={t('nav.close')} size={15} className="h-8 w-8" onClick={onClose} />
      </div>

      {tab === 'sync' && (
        <div className="flex flex-col gap-4">
          <Slider
            label={t('power.subtitleDelay')}
            value={Math.round(subDelay * 1000)}
            min={-10000}
            max={10000}
            step={50}
            suffix={` ${t('power.milliseconds')}`}
            resetLabel={t('power.reset')}
            onChange={(v) => void window.cinema.player.setSubDelay(v / 1000)}
            onReset={() => void window.cinema.player.setSubDelay(0)}
          />
          <Slider
            label={t('power.audioDelay')}
            value={Math.round(audioDelay * 1000)}
            min={-5000}
            max={5000}
            step={25}
            suffix={` ${t('power.milliseconds')}`}
            resetLabel={t('power.reset')}
            onChange={(v) => void window.cinema.player.setAudioDelay(v / 1000)}
            onReset={() => void window.cinema.player.setAudioDelay(0)}
          />
          <p className="text-[12px] leading-relaxed text-ink-3">{t('power.syncHint')}</p>
        </div>
      )}

      {tab === 'eq' && (
        <div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                className="rounded-full border border-ink/15 px-3 py-1 text-[12px] transition-colors duration-fast hover:border-violet/55 hover:text-violet"
                onClick={() => void window.cinema.player.setEqualizer(preset.gains)}
              >
                {t(`power.${preset.key}` as 'power.flat')}
              </button>
            ))}
          </div>
          <div className="flex items-end justify-between gap-1" dir="ltr">
            {BANDS.map((band, i) => (
              <div key={band} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] text-ink-3 tabular-nums">
                  {(eq[i] ?? 0) > 0 ? '+' : ''}
                  {(eq[i] ?? 0).toFixed(0)}
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={eq[i] ?? 0}
                  onChange={(e) => setBand(i, Number(e.target.value))}
                  // סרגל אנכי: מסובבים, כי appearance אנכי אינו נתמך בכל מנוע
                  className="h-24 w-1 cursor-pointer appearance-none rounded-full bg-ink/20 accent-violet [direction:rtl] [writing-mode:vertical-lr]"
                  aria-label={t('power.band', { hz: band })}
                />
                <span className="text-[10px] text-ink-3">{band}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'video' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {[
              ['brightness', brightness, t('power.brightness')],
              ['contrast', contrast, t('power.contrast')],
              ['saturation', saturation, t('power.saturation')],
              ['gamma', gamma, t('power.gamma')]
            ].map(([property, value, label]) => (
              <label key={String(property)} className="flex flex-col gap-1.5 text-[12px] text-ink-2">
                <span className="flex items-center justify-between gap-2">
                  <span>{String(label)}</span>
                  <span className="text-ink tabular-nums">{Number(value) > 0 ? '+' : ''}{Number(value)}</span>
                </span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={Number(value)}
                  dir="ltr"
                  className="h-1 cursor-pointer appearance-none rounded-full bg-ink/20 accent-violet"
                  onChange={(e) =>
                    void window.cinema.player.setVideoAdjustment(
                      property as 'brightness' | 'contrast' | 'saturation' | 'gamma',
                      Number(e.target.value)
                    )
                  }
                />
              </label>
            ))}
          </div>

          <Slider
            label={t('power.sharpen')}
            value={sharpen}
            min={0}
            max={1.5}
            step={0.05}
            suffix=""
            resetLabel={t('power.reset')}
            onChange={(v) => void window.cinema.player.setSharpen(v)}
            onReset={() => void window.cinema.player.setSharpen(0)}
          />

          <button
            role="switch"
            aria-checked={deband}
            onClick={() => void window.cinema.player.setDeband(!deband)}
            className="flex items-center justify-between rounded-o-md border border-ink/10 bg-ink/5 px-3 py-2 text-[12.5px] transition-colors hover:bg-ink/10"
          >
            <span>{t('power.deband')}</span>
            <span className={`relative h-5 w-9 rounded-full transition-colors ${deband ? 'bg-violet' : 'bg-ink/20'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-arctic transition-transform ${deband ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </span>
          </button>

          <div>
            <div className="mb-2 text-[12.5px] text-ink-2">{t('power.aspect')}</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: t('power.aspectOriginal'), value: '-1' },
                { label: '16:9', value: '16:9' },
                { label: '4:3', value: '4:3' },
                { label: '21:9', value: '21:9' },
                { label: '1:1', value: '1:1' }
              ].map((r) => (
                <button
                  key={r.value}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition duration-fast ${
                    aspect === r.value
                      ? 'border-violet/60 bg-violet/14 text-violet'
                      : 'border-ink/15 hover:border-ink/30'
                  }`}
                  onClick={() => void window.cinema.player.setAspect(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[12.5px] text-ink-2">{t('power.fit')}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['fit', 'fill', 'zoom'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`rounded-o-md border px-3 py-2 text-[12.5px] transition duration-fast ${
                    videoFit === mode
                      ? 'border-violet/60 bg-violet/14 text-violet-bright'
                      : 'border-ink/15 hover:border-ink/30 hover:bg-ink/5'
                  }`}
                  onClick={() => void window.cinema.player.setVideoFit(mode)}
                >
                  {t(`power.${mode}` as 'power.fit')}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void window.cinema.player.resetVideo()}>
              {t('power.resetPicture')}
            </Button>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => void window.cinema.player.screenshot()}
          >
            <Icon name="camera" size={15} />
            {t('power.screenshot')}
          </Button>
          </div>
        </div>
      )}
    </div>
  )
}
