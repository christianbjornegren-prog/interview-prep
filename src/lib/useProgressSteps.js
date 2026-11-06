import { useCallback, useEffect, useRef, useState } from 'react'
import { DONE_PHASE, stepIndexAt } from './progressSteps'

/**
 * Håller reda på aktuell fas och tickar fram tidsstyrda understeg.
 * Se lib/progressSteps.js för principen (faser = verklighet, understeg = tid).
 *
 * @param {Array} steps
 * @returns {{ index: number, phase: string|null, enterPhase: (p: string) => void, reset: () => void }}
 */
export function useProgressSteps(steps) {
  const [phase, setPhase] = useState(null)
  const startedAtRef = useRef(0)
  const [now, setNow] = useState(() => Date.now())

  const enterPhase = useCallback((p) => {
    startedAtRef.current = Date.now()
    setNow(Date.now())
    setPhase(p)
  }, [])

  const reset = useCallback(() => setPhase(null), [])

  const active = phase !== null && phase !== DONE_PHASE
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [active])

  const index = phase === null ? 0 : stepIndexAt(steps, phase, now - startedAtRef.current)
  return { index, phase, enterPhase, reset }
}
