import {flushSync} from 'octane'

/** Capture the committed arrival, including its final scroll position. */
export function transitionSentMessage(update: () => void, fallback: () => void, afterCommit?: () => void, onFinished?: () => void) {
  const commit = () => { flushSync(update); afterCommit?.() }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
    commit()
    if (!reduced) fallback()
    return
  }
  let transition: ViewTransition
  try {
    transition = document.startViewTransition({update: commit, types: ['beast-chat-send']})
  } catch (cause) {
    if (cause instanceof TypeError) {
      try { transition = document.startViewTransition(commit) }
      catch { commit(); fallback(); return }
    } else { commit(); fallback(); return }
  }
  // API availability alone does not guarantee a successful native snapshot.
  void transition.ready.catch(fallback)
  void transition.finished.catch(() => {})
  void Promise.all([transition.ready, transition.finished]).then(onFinished, () => {})
  return () => transition.skipTransition()
}
