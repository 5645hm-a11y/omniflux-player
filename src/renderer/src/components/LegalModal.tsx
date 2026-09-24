import { Button, IconButton } from './ui'
import { useT } from '../i18n'

export type LegalKind = 'terms' | 'privacy'

export function LegalModal({ kind, onClose }: { kind: LegalKind; onClose: () => void }): React.JSX.Element {
  const t = useT()
  const sections = kind === 'terms'
    ? [
        [t('legal.personalUseTitle'), t('legal.personalUseBody')],
        [t('legal.cacheTitle'), t('legal.cacheBody')],
        [t('legal.thirdPartyTitle'), t('legal.thirdPartyBody')],
        [t('legal.availabilityTitle'), t('legal.availabilityBody')]
      ]
    : [
        [t('legal.localDataTitle'), t('legal.localDataBody')],
        [t('legal.tokensTitle'), t('legal.tokensBody')],
        [t('legal.externalTitle'), t('legal.externalBody')],
        [t('legal.controlTitle'), t('legal.controlBody')]
      ]
  const title = t(kind === 'terms' ? 'legal.terms' : 'legal.privacy')

  return (
    <div className="fixed inset-0 z-[160] grid place-items-center bg-canvas/80 p-6 backdrop-blur-xl" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="legal-title" className="glass-thick max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-o-2xl border border-ink/10 p-7 shadow-e4">
        <header className="mb-7 flex items-start gap-5">
          <div className="min-w-0 flex-1"><h2 id="legal-title" className="font-display text-[28px] font-extrabold">{title}</h2><p className="mt-1 text-[12px] text-ink-3">{t('legal.effective')}</p></div>
          <IconButton icon="close" label={t('nav.close')} onClick={onClose} />
        </header>
        <div className="space-y-6">{sections.map(([heading, body]) => <section key={heading}><h3 className="mb-2 text-[14px] font-bold text-ink">{heading}</h3><p className="max-w-prose text-[13px] leading-7 text-ink-2">{body}</p></section>)}</div>
        <div className="mt-8 border-t border-ink/10 pt-5"><p className="text-[11.5px] leading-6 text-ink-3">{t('legal.allServices')}</p><Button className="mt-5" variant="outline" size="sm" onClick={onClose}>{t('nav.close')}</Button></div>
      </section>
    </div>
  )
}
