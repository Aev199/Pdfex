// `count` > 1: several pages travel; the picture says how many.
export function buildPageDragImage(pageEl: HTMLElement, rect: DOMRect, count = 1): HTMLElement {
  const w = rect.width
  const h = rect.height
  const k = pageEl.offsetHeight ? h / pageEl.offsetHeight : 1

  const wrap = document.createElement('div')
  Object.assign(wrap.style, {
    position: 'fixed',
    top: '0',
    left: '-100000px',
    width: `${w}px`,
    height: `${h}px`,
    borderRadius: `${10 * k}px`,
    overflow: 'hidden',
    background: 'var(--surface)',
    pointerEvents: 'none'
  })

  const src = pageEl.querySelector('canvas.pageview-base') as HTMLCanvasElement | null
  if (src && src.classList.contains('ready')) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w * dpr))
    c.height = Math.max(1, Math.round(h * dpr))
    Object.assign(c.style, { width: '100%', height: '100%', display: 'block' })
    c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height)
    wrap.appendChild(c)
  }

  if (count > 1) {
    // A second sheet peeking out behind, and the number.
    wrap.style.boxShadow = `${6 * k}px ${6 * k}px 0 -${1 * k}px rgba(255, 255, 255, 0.85)`
    wrap.style.overflow = 'visible'
    const badge = document.createElement('div')
    badge.textContent = String(count)
    Object.assign(badge.style, {
      position: 'absolute',
      top: '-8px',
      right: '-8px',
      minWidth: '22px',
      height: '22px',
      padding: '0 6px',
      borderRadius: '11px',
      background: '#4483f7',
      color: '#fff',
      font: '600 12px/22px system-ui, sans-serif',
      textAlign: 'center',
      boxSizing: 'border-box'
    })
    wrap.appendChild(badge)
  }
  document.body.appendChild(wrap)
  return wrap
}
