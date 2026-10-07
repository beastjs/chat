export interface SmoothScrollDriver {
  scrollTo(top: number, immediate: boolean): void
  resize(): void
  destroy(): void
}

/** One viewport-owned Lenis instance; RAF runs only while scrolling. */
export async function createSmoothScroll(viewport: HTMLElement, content: HTMLElement, onScroll: () => void): Promise<SmoothScrollDriver> {
  const {default: Lenis} = await import('lenis')
  const lenis = new Lenis({wrapper: viewport, content, eventsTarget: viewport, autoRaf: false, autoResize: false, smoothWheel: true, syncTouch: false, lerp: 0.12, overscroll: true})
  let frame: number | null = null
  let destroyed = false
  const tick = (time: number) => {
    frame = null
    if (destroyed) return
    lenis.raf(time)
    if (lenis.isScrolling === 'smooth') frame = requestAnimationFrame(tick)
  }
  const wake = () => { if (!destroyed && frame === null) frame = requestAnimationFrame(tick) }
  const offInput = lenis.on('virtual-scroll', wake)
  const offScroll = lenis.on('scroll', onScroll)
  return {
    scrollTo(top, immediate) {
      if (destroyed) return
      lenis.resize()
      lenis.scrollTo(top, {immediate, force: true, lerp: 0.18})
      if (!immediate) wake()
    },
    resize() { if (!destroyed) lenis.resize() },
    destroy() {
      destroyed = true
      if (frame !== null) cancelAnimationFrame(frame)
      offInput()
      offScroll()
      lenis.destroy()
    },
  }
}
