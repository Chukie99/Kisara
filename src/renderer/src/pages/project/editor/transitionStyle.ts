import type { CSSProperties } from 'react'
import type { TransitionId } from '@shared/types'

/**
 * How the outgoing clip (prev, drawn on top) and the incoming clip (cur) look at transition progress k
 * (0 to 1). Matches the FFmpeg xfade transitions of the export closely enough to judge them in the preview.
 */
export function transitionStyles(transition: TransitionId, k: number): { prev: CSSProperties; cur: CSSProperties } {
  if (transition === 'cut') return { prev: {}, cur: {} }
  if (transition === 'slideleft') return { prev: { transform: `translateX(${-k * 100}%)` }, cur: { transform: `translateX(${(1 - k) * 100}%)` } }
  if (transition === 'slideright') return { prev: { transform: `translateX(${k * 100}%)` }, cur: { transform: `translateX(${-(1 - k) * 100}%)` } }
  if (transition === 'slideup') return { prev: { transform: `translateY(${-k * 100}%)` }, cur: { transform: `translateY(${(1 - k) * 100}%)` } }
  // The new clip is revealed from its right edge leftwards, as FFmpeg's wipeleft does.
  if (transition === 'wipeleft') return { prev: {}, cur: { clipPath: `inset(0 0 0 ${(1 - k) * 100}%)` } }
  if (transition === 'circleopen') return { prev: {}, cur: { clipPath: `circle(${k * 75}% at 50% 50%)` } }
  if (transition === 'zoomin') return { prev: { transform: `scale(${1 + k * 0.6})`, opacity: 1 - k }, cur: {} }
  if (transition === 'squeezev') return { prev: { transform: `scaleY(${1 - k})` }, cur: {} }
  if (transition === 'blur') return { prev: { opacity: 1 - k, filter: `blur(${k * 18}px)` }, cur: {} }
  return { prev: { opacity: 1 - k }, cur: {} }
}
