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
pendingProfiles/{email} → { name, email, createdAt, competencies: [...], jobs: [...] }

## Viktiga beslut
- Kompetensbanken är kumulativ – byggs av flera CV-uppladdningar över tid
- Matchning sker per jobbannons mot hela kompetensbanken
- Feedback sparas med historik per jobbannons
- Jobbannonser sorteras på senaste aktivitet, arkivering som opt-in

## Miljövariabler (.env.local)
VITE_FIREBASE_PROJECT_ID=interview-prep-81cb6 (INTE .firebaseapp.com)
VITE_FIREBASE_STORAGE_BUCKET=interview-prep-81cb6.appspot.com

## Designsystem (Boulder-tema)
- Font: Poppins (300/400/500/600/700) via Google Fonts – satt på body och rubriker
- Sidbakgrund: #000000, kortyta: #1d1d1d, mörkare yta: #141414
- Primär border: #404040, mörk border: #323232
- Primäraccentfärg: #8064ad (brand-purple) – används på knappar, aktiva tabs, badges, navbar
- Accent hover: #9781be (brand-purple-header)
- Semantiska färger behålls: #22c55e (grön), #f87171 (röd), #E9C46A (gul), #e76f51 (orange)
- Kategorifärger i kompetensbanken behålls distinkta (IT-arkitektur = teal #2a9d8f etc.)
- FINISHED-ring i InterviewSimulatorTTS: #2a9d8f (teal – semantisk "klar"-signal)
- CSS-variabler definierade i :root i index.css; Tailwind-tokens i tailwind.config.js

## UI-konventioner
- Kompetensbanken visar kompetenser grupperade per kategori i accordion (alla kollapsade by default)
- Filter-chips i kompetensbanken behålls och styr vilka kategorier som syns
- JobPage har ENBART två tabbar: "Förberedelse" och "Historik" (Intervjufrågor-tabben är borttagen)
- JobPage: om role == 'saljare' döljs Historik-tabben och Starta-knappen; Förberedelse visas alltid
- JobPage: ingen sticky footer – enda "Starta"-knappen finns i headern ovanför tabbar
- JobPage läser targetUid från location.state – används för Firestore-anrop (säljare tittar på konsults jobb)
- Uppdragsbeskrivning i Förberedelse-tabben visar 2 meningar som default; "Läs mer →" / "Läs mindre ←" expanderar
- Back-knapp i JobPage: om targetUid → /konsulter/:uid, annars → /
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
- JobPage har "🔄 Uppdatera gap-analys"-knapp bredvid "Gap att adressera"-rubriken
  → hämtar senaste kompetenser från Firestore, kör analyzeJobPosting, skriver bara gapAnalysis-fältet
  → använder job.jobText (råtext) som indata, fallback till job.summary

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
- ADMIN_WHITELIST = ['christian.bjornegren@gmail.com']
- Ej tillåten → signOut() i signInWithGoogle() + felmeddelande (ALDRIG i onAuthStateChanged)
- Tillåten → skapa/hämta users/{uid} i Firestore

### Användarroller
- Firestore: users/{uid} → { email, name, role, createdAt }
- Roller: 'admin' | 'konsult' | 'saljare'
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
- Inloggade: Mina uppdrag | Kompetensbank | (Konsulter om säljare/admin) | (Användarhantering om admin) | Om | Avatar | Logga ut
- NavLink-styling: alla länkar identiska – ingen aktiv bakgrund, enbart vit textfärg på aktiv/hover vs #6b7280 inaktiv
- /om (OmPage): synlig för alla inloggade, RequireAuth, innehåller Varför/Techstack/Byggt av

### Säljare-flöde
- SÄLJARE_WHITELIST = ['filip.almstrom@boulder.se'] — sätts vid första login
- /konsulter (SäljarePage): två listsektioner — aktiva konsulter (role='konsult') + väntande profiler (pendingProfiles-collection)
  - "+ Förbered ny konsult" → modal (namn + @boulder.se e-post) → skapar pendingProfiles/{email}-doc → navigerar till /konsulter/pending/:email
- /konsulter/:uid (KonsultProfilPage): tabs Kompetensbank (read-only accordion + CV-upload + add-modal) + Uppdrag (klickbara kort → JobPage)
  - FileUpload accepterar targetUid-prop och sparar under den uid:n
  - FileUpload accepterar onSuccess-callback för att trigga refresh
  - Uppdragskort navigerar till /jobb/:jobId med { state: { targetUid } } som kontext
- /konsulter/pending/:email (PendingProfilPage): FÖRE /konsulter/:uid i App.jsx-routes
  - Banner: konsulten har inte loggat in än
  - Tab Kompetensbank: läser pendingProfiles/{email}.competencies, CV-upload via PendingFileUpload (sparar via arrayUnion), add-modal
  - Tab Uppdrag: läser pendingProfiles/{email}.jobs
  - "+ Skapa nytt uppdrag åt konsulten" → navigate('/jobb/ny', { state: { pendingEmail, pendingName } })
- JobCreate: läser location.state.pendingEmail/pendingName om satt
  - Hämtar kompetenser från pendingProfiles/{email}.competencies istället för users-subcollection
  - Sparar jobb via arrayUnion till pendingProfiles/{email}.jobs (med genererat id-fält)
  - Navigerar till /konsulter/pending/:email efter save
- AuthGate: vid första login, kopierar pendingProfiles/{email} → users/{uid}/competencies + jobs → raderar pending-doc → sätter profileActivated=true
- Home.jsx Dashboard: visar grön banner om profileActivated=true (kan stängas)

### Firestore Security Rules (firestore.rules)
- Roller: admin kan läsa/skriva alla users; säljare kan läsa users + jobb + kompetenser; owner kan allt i sitt eget träd
- feedback-subcollection: enbart owner + admin
- pendingProfiles: enbart admin + säljare (ej owner/konsult)
- firebase.json pekar på firestore.rules

## Konventioner
- Svenska i hela UI
- Pusha aldrig till main utan att testa lokalt först
- Uppdatera alltid CLAUDE.md efter varje förändring som påverkar 
  arkitektur, datamodell eller viktiga beslut
