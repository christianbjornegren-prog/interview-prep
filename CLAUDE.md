# Intervjucoach – Projektöversikt

## Syfte
AI-driven intervjuträningsapp för konsulter. Träna inför specifika 
uppdrag baserat på din egen kompetensbank.

## Tech Stack
- React + Vite, HashRouter, Tailwind CSS
- Firebase (Firestore + Auth + Storage), Blaze-plan
- Claude API (kompetensextraktion, jobbanalys, feedback)
- OpenAI Whisper (STT) + TTS via Vercel-proxy
- GitHub Pages via GitHub Actions CI/CD
- Lokal dev: localhost:5173

## Arkitektur
- Vercel används ENBART som proxy för OpenAI-anrop (api/whisper.js, api/tts.js)
- Firebase hanterar all data och auth
- WebRTC-versionen är övergiven – använd ENBART TTS-versionen (InterviewSimulatorTTS.jsx)

## Datamodell
users/{uid}/competencies/{docId}
users/{uid}/jobs/{jobId}
users/{uid}/jobs/{jobId}/feedback/{feedbackId}

## Viktiga beslut
- Kompetensbanken är kumulativ – byggs av flera CV-uppladdningar över tid
- Matchning sker per jobbannons mot hela kompetensbanken
- Feedback sparas med historik per jobbannons
- Jobbannonser sorteras på senaste aktivitet, arkivering som opt-in

## Miljövariabler (.env.local)
VITE_FIREBASE_PROJECT_ID=interview-prep-81cb6 (INTE .firebaseapp.com)
VITE_FIREBASE_STORAGE_BUCKET=interview-prep-81cb6.appspot.com

## UI-konventioner
- Kompetensbanken visar kompetenser grupperade per kategori i accordion (alla kollapsade by default)
- Filter-chips i kompetensbanken behålls och styr vilka kategorier som syns
- JobPage har ENBART två tabbar: "Förberedelse" och "Historik" (Intervjufrågor-tabben är borttagen)
- Intervjuflödet: JobPage → konfigurationsskärm (ersätter tab-innehållet) → InterviewSimulatorTTS
- Konfigurationsskärm: tvåkolumns layout — vänster: inställningar, höger: live-preview av frågor
- Konfiguration skickas som location.state: { numQuestions, focus, difficulty, selectedQuestions }
- selectedQuestions är den förberäknade listan — simulatorn använder den direkt

## Intervjukonfiguration (standardvärden)
- Antal frågor: 5 (alternativ: 3, 5, 8)
- Fokus: Mix (alternativ: Erfarenhet, Kompetens, Situation)
- Svårighetsgrad: Standard (alternativ: Avslappnad, Standard, Hård)

## Gap-analys & kompetenser
- sanitizeCompetencies() i claude.js är den enda platsen kompetenser normaliseras
  → skickar { namn, beskrivning, taggar } — inga ID-fält
- Används i: analyzeJobPosting, analyzeInterviewFeedback, saveSession
- NO_ID_INSTRUCTION-konstanten i claude.js läggs till i alla relevanta prompter

## Intervju state machine (InterviewSimulatorTTS)
States: CONNECTING → AI_SPEAKING → WAITING_FOR_USER → RECORDING → PROCESSING → PREPARING_NEXT → (loop eller FINISHED)
- CONNECTING: grå ring snurrar, ingen knapp (visas ENBART vid greeting)
- AI_SPEAKING: blå ring pulsar, frågetext visas, ingen knapp  
- WAITING_FOR_USER: grön ring stillastående, "Din tur", klick-knapp
- RECORDING: röd ring pulsar, klick-knapp "Klar"
- PROCESSING: vit ring snurrar (Whisper), pulserande text, ingen knapp
- PREPARING_NEXT: vit ring snurrar (TTS-fetch), pulserande text, ingen knapp
- FINISHED: teal ring, sparar feedback → navigate till /feedback/
- speakText() signalerar AI_SPEAKING när playback börjar (inte vid fetch)
- Inspelning är click-toggle (inte push-to-hold), minimum 1 sekund
- Simulatorn auto-startar intervjun när jobb laddas (inget "Starta"-steg)
- Refs: transcriptRef, currentQuestionIndexRef, activeQuestionsRef, recordingStartRef, streamRef

## Avbryt-flöde (InterviewSimulatorTTS)
- "✕ Avsluta intervju" (röd text, ingen bakgrund) visas i övre högra hörnet i ALLA states utom FINISHED
- Klick → inline-bekräftelse: "Avsluta intervjun? Ditt svar sparas inte." + [Fortsätt] / [Ja, avsluta]
- Bekräftelse kör endInterview() → cleanup → navigate(-1)
- streamRef används för korrekt cleanup av mikrofon-stream vid unmount och abort

## TTS / Röst
- Model: tts-1-hd (uppgraderat från tts-1)
- Röst väljs slumpmässigt vid sessionstart baserat på kön
  - Kvinnliga röster: shimmer, nova, alloy → namn: Maria, Anna, Sara
  - Manliga röster: onyx, echo, fable → namn: Erik, Johan, Anders

## IAM & Åtkomstkontroll

### Domäncheck (AuthGate.jsx)
- ALLOWED_DOMAIN = 'boulder.se'
- ADMIN_WHITELIST = ['christianbjornegren@gmail.com']
- Ej tillåten → signOut() direkt + AccessDeniedScreen
- Tillåten → skapa/hämta users/{uid} i Firestore

### Användarroller
- Firestore: users/{uid} → { email, name, role, createdAt }
- Roller: 'admin' | 'konsult' | 'säljare'
- Role sätts vid första inloggning; uppdateras ALDRIG automatiskt (bevara manuella ändringar)
- Admin-whitelist-mail får role: 'admin', övriga 'konsult'

### Contexts (AuthGate.jsx)
- AuthContext → Firebase User (eller null)
- UserContext → { user, role }
- useAuth() → Firebase User (bakåtkompatibelt)
- useUser() → { user, role }

### Skyddade routes
- RequireAuth: blockerar ej inloggade → SignInScreen
- RequireAdmin: blockerar ej admins → redirect /
- /admin kräver BÅDE RequireAuth + RequireAdmin

### Admin-UI (/admin → AdminPage.jsx)
- Hämtar alla docs från users-collection
- Sökfilter client-side (namn/e-post)
- Tabell: Namn | E-post | Roll (dropdown) | Ändrad
- Rollbyte → updateDoc + optimistisk lokal uppdatering + bekräftelsetoast 3s
- updatedAt: serverTimestamp() sätts vid rollbyte

### Navbar
- Utloggade användare ser ENBART loggan (ingen knapp i navbar – knappen finns på startsidan)
- Inloggade: Mina uppdrag | Kompetensbank | (Konsulter om säljare/admin) | (Användarhantering om admin) | Avatar | Logga ut

### Säljare-flöde
- SÄLJARE_WHITELIST = ['filip.almstrom@boulder.se'] — sätts vid första login
- /konsulter (SäljarePage): lista med KONSULT_EMAILS-filtrerade users + kompetens/job-count
- /konsulter/:uid (KonsultProfilPage): tabs Kompetensbank (read-only accordion + add-modal) + Uppdrag (gap-analys inline)
- "+ Skapa nytt uppdrag åt konsulten" → navigate('/jobb/ny', { state: { targetUid, targetName } })
- JobCreate läser location.state.targetUid och sparar under konsultens uid om satt; navigerar till /konsulter/:uid efter save
- RequireSäljarOrAdmin skyddar /konsulter och /konsulter/:uid

### Firestore Security Rules (firestore.rules)
- Roller: admin kan läsa/skriva alla users; säljare kan läsa users + jobb + kompetenser; owner kan allt i sitt eget träd
- feedback-subcollection: enbart owner + admin
- firebase.json pekar på firestore.rules

## Konventioner
- Svenska i hela UI
- Pusha aldrig till main utan att testa lokalt först
- Uppdatera alltid CLAUDE.md efter varje förändring som påverkar 
  arkitektur, datamodell eller viktiga beslut
