import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { createUserCvStore } from '../lib/cvStore'
import { useCvs } from '../lib/useCvs'
import CvLibrary from '../components/CvLibrary'

/**
 * "Mina CV" (route /kompetensbank behålls för bokmärken). Överblick över
 * konsultens CV:n – INTE en samlad kompetensbank. Varje uppdrag pekar ut
 * vilket CV som gäller; det görs på uppdragssidan.
 */
export default function CompetencyBank() {
  const navigate = useNavigate()
  const uid = auth.currentUser.uid
  const store = useMemo(() => createUserCvStore(uid), [uid])
  const { cvs, loading, error, reload } = useCvs(store)
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'jobs'),
      (snap) => setJobs(snap.docs.map((d) => ({ docId: d.id, ...d.data() }))),
      (err) => console.error('Kunde inte hämta uppdrag:', err)
    )
    return unsub
  }, [uid])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-text-primary tracking-tight">Mina CV</h1>
        <p className="mt-1 text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
          Ett CV per profil du använder. Varje uppdrag kopplas till det CV som gäller för just
          det uppdraget – kravmatchningen, intervjufrågorna och feedbacken bygger på det CV:t.
        </p>
      </div>

      <CvLibrary
        store={store}
        cvs={cvs}
        jobs={jobs}
        loading={loading}
        error={error}
        onChanged={reload}
        onOpenJob={(job) => navigate(`/jobb/${job.docId}`)}
        showNextStep
      />
    </div>
  )
}
