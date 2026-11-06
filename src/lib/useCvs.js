import { useCallback, useEffect, useState } from 'react'
import { describeCvError } from './cvs'

/**
 * Laddar CV:n från ett CV-lager (lib/cvStore.js) och exponerar `reload`.
 * Äldre data migreras av lagret innan listan returneras.
 *
 * @param {object|null} store
 * @returns {{ cvs: object[], loading: boolean, error: string, reload: () => Promise<void> }}
 */
export function useCvs(store) {
  const [cvs, setCvs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!store) return
    setError('')
    try {
      setCvs(await store.list())
    } catch (err) {
      console.error('Kunde inte hämta CV:n:', err)
      setError(describeCvError(err))
    } finally {
      setLoading(false)
    }
  }, [store])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  return { cvs, loading, error, reload }
}
