import mark from '../assets/omniflux-mark.png'

/**
 * The canonical OmniFlux mark generated for the product.
 *
 * Keep the renderer, Windows shell and installer on the same raster source;
 * replacing it with a separately redrawn glyph makes the brand diverge.
 */
export function Mark({ size = 28, className = '' }: { size?: number; className?: string }): React.JSX.Element {
  return (
    <img
      src={mark}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      alt="OmniFlux"
    />
  )
}
