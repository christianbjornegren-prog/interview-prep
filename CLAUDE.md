# Intervjucoach – Projektöversikt

## Syfte
AI-driven intervjuträningsapp för konsulter. Träna inför specifika 
uppdrag baserat på din egen kompetensbank.

## Designprincip
Coach not judge: appen är en förberedelsepartner, inte ett bedömningssystem.
All copy ska inta konsultens perspektiv – fokus på strategi och förberedelse,
aldrig på brister. Perspektivet är alltid "jag är på din sida och hjälper dig
gå in i rummet förberedd".
Namnkonventioner: "Förbered dig på" (ej "gap"), "Prioritera dessa" (ej "kritiska
gap"), "Dina styrkor" (ej "täckta krav"), "träningsindikator" (ej "betyg").
Färgspråk: EN ENDA uppmärksamhetsfärg – amber (var(--color-text-warning)) reserveras
för "Prioritera dessa". "Förbered dig på" är NEUTRALT (inga varningstrianglar/röd/amber).
Styrkor = grön (var(--color-text-success)), täckning = lila #8064ad. Färgade siffervärden
i mörkt läge MÅSTE använda ljusa semantiska vars/#8064ad – aldrig mörka ramp-hex.

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
  → bl.a. jobTitle, company, summary, rawJobText, questions[],
    requirements [{ requirement, importance:'hög'|'medel'|'låg', match:'stark'|'delvis'|'svag', note, howToAddress }],
    quickFacts { kund, roll, miljö, fokus } och sections [{ heading, points[] }]
    (äldre jobb har gapAnalysis {covered,gaps} ELLER {criticalGaps,...} istället för
     requirements; resolveRequirements() mappar dem framåt → vyn kraschar aldrig)
users/{uid}/jobs/{jobId}/feedback/{feedbackId}
  → inkluderar sharedWithSeller (boolean, default false) + sharedAt (timestamp|null)
    Saknat sharedWithSeller behandlas överallt som false.
pendingProfiles/{email} → { name, email, createdAt, competencies: [...], jobs: [...] }
systemEvents/{eventId} → { type, severity: 'info'|'error', step, message, uid, createdAt }
  → TEKNISK driftlogg (Whisper→Claude→TTS→Firestore). ALDRIG betyg/feedbackinnehåll.
    Oföränderlig: write-only för inloggad (egen uid), läs endast admin.

## Viktiga beslut
- Kompetensbanken är kumulativ – byggs av flera CV-uppladdningar över tid
- Matchning sker per jobbannons mot hela kompetensbanken
- Feedback sparas med historik per jobbannons
- Jobbannonser sorteras på senaste aktivitet, arkivering som opt-in
- Betygsskala: 1–10 (overallScore + questionFeedback.score). Kalibreras i claude.js
  (POÄNGSKALA 1–10). All display ska visa "/10" – aldrig "/5".
  Färgtrösklar för betyg (gäller ALLA betygsdisplayer – FeedbackPage, JobPage Historik,
  KonsultProfilPage Delad feedback): ≥8 grön (#22c55e), ≥6 gul (#E9C46A), <6 röd (#ef4444).
  OBS: detta är betygströsklar (1–10), ej att förväxla med JobCard/gap-analysens
  scoreRatio (0–1 matchningsandel: ≥0.7 grön, ≥0.4 gul).
- Förtroende-i-arkitektur: konsulten äger sin träning. Feedback är PRIVAT by
  default och delas med säljaren ENBART via konsultens opt-in (sharedWithSeller),
  återkalleligt när som helst. Driften loggas tekniskt (systemEvents) utan betyg.

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
- JobPage läser targetUid från location.state – används för Firestore-anrop (säljare tittar på konsults jobb)
- JobPage = executive briefing-layout (desktop-first). Bryter ut ur appens smala max-w-5xl till
  ~1200px centrerat via `relative left-1/2 -translate-x-1/2 w-[min(1200px,100vw-2rem)]`
  (gäller ENBART uppdragsvyn; Layout/övriga vyer orörda). Stackar till en kolumn under lg.
- JobPage header: titel + kund till vänster, "🎙 Starta intervjuträning" (brand-purple) till höger
  på samma rad. Flikar under headern.
- Förberedelse-tab = FULLBREDD, ingen högerräls. Uppifrån och ned:
  1. AI-summering (job.summary) + "🔄 Uppdatera analys" (höger)
  2. Quick facts som rad av pills (Kund/Roll/Miljö/Fokus, från resolveQuickFacts)
  3. Metric-rad (4 kort, deriveGapBuckets): Kravtäckning %, Att prioritera, Att förbereda, Dina styrkor.
     Kravtäckning-kortet innehåller progressbaren OCH "X av Y krav starkt matchade" (ingen lös rad under).
     Övriga kort har m-sub som förklarar talet. Korten är KLICKBARA wayfinding (role=button, tabindex,
     Enter/Space, fokusring, ti-chevron-down) → smooth-scroll till sektionens id-ankare + .section-flash.
  4. "Prioritera dessa" (amber) – 2-kolumnsgrid; per kort: krav, metarad (Krav/Din matchning), howToAddress
     prominent. 0 prioritera → positivt tomtillstånd ("Stark matchning – inget kritiskt att prioritera").
  5. "Förbered dig på" – NEUTRAL 2-kolumnslista med "Delvis"-märkning (inga varningstrianglar).
  6. "Dina styrkor" – chip-moln fullbredd, ALLTID synligt.
  7. "Hela uppdragsbeskrivningen" längst ned: job.sections strukturerat, annars parseJobDescription(rawText)
     (prefix-strippad, BEVARAR radbrytningar, detekterar rubriker/punkter).
  Wayfinding-färger (ikonbricka ljus bg + mörk ikon, samma ikon på rubriken): Kravtäckning lila ti-chart-pie,
  Att prioritera amber ti-flag, Att förbereda neutral ti-list-check, Dina styrkor grön ti-star.
- Back-knapp i JobPage: om targetUid → /konsulter/:uid, annars → /
- Intervjuflödet: JobPage → konfigurationsskärm (ersätter tab-innehållet) → InterviewSimulatorTTS
- Konfigurationsskärm: tvåkolumns layout — vänster: inställningar, höger: live-preview av frågor
- Konfiguration skickas som location.state: { numQuestions, focus, difficulty, selectedQuestions }
- selectedQuestions är den förberäknade listan — simulatorn använder den direkt

### Dashboard onboarding (Home.jsx, inloggad konsult)
- Ren logik i lib/onboarding.js (enhetstestad): computeChecklist(), resolvePrimaryCta(),
  resolveEmptyState(). Inga Firestore-anrop i hjälparna.
- Primär CTA "🎙 Starta intervjuträning" (brand-purple) högst upp:
  - 0 aktiva uppdrag → knappen visas inte (tomma-state-kortet tar över)
  - exakt 1 uppdrag → navigerar direkt till /jobb/:jobId (Förberedelse-tabben)
  - flera uppdrag → öppnar JobPickerModal (välj uppdrag att träna på)
- Vägledande tomma states (resolveEmptyState):
  - 'no-jobs': kort "Lägg till ditt första uppdrag…" + knapp → /jobb/ny
  - 'no-training': kort "Du är redo – starta din första träning" + Starta-knapp, ovanför listan
  - 'normal': primär CTA + uppdragslista. 'no-training' undertrycks tills feedback laddats
    (loadingFeedbacks) för att undvika flimmer.
- Onboarding-checklista ersätter gamla profileActivated-bannern: tre steg (CV uppladdat /
  Uppdrag tillagt / Första träning) med avbockning. Visas medan profileActivated && !allDone;
  döljs automatiskt när alla tre är klara, eller manuellt via ✕ (clearProfileActivated).
- FileUpload success-state: ersätter uppladdningsformuläret med "✓ {antal} kompetenser
  tillagda!" + nästa-steg-länk till /jobb/ny (ENDAST när !targetUid, dvs konsultens egen
  upload — döljs för säljare). Diskret "Ladda upp ett till CV" återställer formuläret.
- recharts är INTE installerat (övervägt för dashboard-grafik, ej infört).

## Intervjukonfiguration (standardvärden)
- Antal frågor: 5 (alternativ: 3, 5, 8)
- Fokus: Mix (alternativ: Erfarenhet, Kompetens, Situation)
- Svårighetsgrad: Standard (alternativ: Avslappnad, Standard, Hård)

## Kompetensextraktion (claude.js)
- `CATEGORY_ENUM` (exporterad konstant) — 13 kategorier, enda sanningskällan:
  Mjukvaruutveckling & programmering | Systemintegration & middleware |
  IT-arkitektur & design | Testning & kvalitetssäkring |
  Microsoft 365 & Power Platform | Data & analys |
  Ledarskap & styrning | Projektledning & agila metoder |
  Affärsutveckling & försäljning | Kommunikation & presentation |
  Processutveckling & förbättring | Branschkunskap & domänexpertis | Övrigt
- `COMPETENCY_TOOL`: JSON schema med `category: { enum: CATEGORY_ENUM }` och `strength: { enum: ['Hög','Medel','Låg'] }`
- `extractCompetencies()`: tool_use med `tool_choice: { type: 'tool', name: 'save_competencies' }`, min 5 max 25
- `recategorizeCompetencies(competencies)`: skickar `[{title,description}]`, returnerar `[{title,category,tags}]` via samma tool_use-schema
- `sanitizeCompetencies()` — enda platsen kompetenser normaliseras → skickar { namn, beskrivning, taggar } — inga ID-fält
- Används i: analyzeJobPosting, analyzeInterviewFeedback, saveSession
- NO_ID_INSTRUCTION-konstanten läggs till i alla relevanta prompter
- `analyzeJobPosting()` returnerar (utöver jobTitle/company/questions): `summary`,
  `quickFacts` { kund, roll, miljö, fokus }, `sections` [{ heading, points[] }], och kärnan:
  `requirements` [{ requirement, importance:'hög'|'medel'|'låg', match:'stark'|'delvis'|'svag', note, howToAddress }].
  - KALIBRERING (rotorsaksfix mot inflation): match bedöms ÄRLIGT. stark = direkt påvisbar erfarenhet,
    delvis = angränsande/partiell, svag = lite/ingen. Brett senior-CV gör INTE allt 'stark'.
    howToAddress sätts för svag/delvis, skrivet som en erfaren kollega. max_tokens = 6000.
- lib/gapAnalysis.js (rena, enhetstestade):
  - `deriveGapBuckets(requirements)` → { styrkor(stark), förbered(delvis | svag&låg),
    prioritera(svag & hög|medel), coverage(=antal stark/antal krav), total }.
    Reconciliation: styrkor + förbered + prioritera === requirements.length. Ogiltiga värden normaliseras.
  - `resolveRequirements(job)` → requirements[] (job.requirements, annars härlett från gammal gapAnalysis:
    covered→stark, prep→delvis, critical→svag/hög). `coverageFromJob(job)` → { covered=stark, total, ratio }.
  - (kvar för bakåtkompat/tester) `normalizeGapAnalysis`, `computeCoverage`.
- lib/jobDescription.js (rena, enhetstestade): `cleanJobDescription(raw)` strippar dubblerat
  "Uppdragsbeskrivning:"-prefix + bevarar radbrytningar; `parseJobDescription(raw)` → block
  [{heading|list|paragraph}] med BEVARADE radbrytningar (tom rad = nytt stycke, rubrik/punkt-detektion);
  `resolveQuickFacts(job)` bygger pills (quickFacts, fallback company/jobTitle, filtrerar tomma).
- Match-badgen "Matchning: X av Y krav" på uppdragskorten (Home/Konsult/Pending) använder coverageFromJob(job)
  (X = starkt matchade krav) → funkar för både nya och äldre jobb.
- "🔄 Uppdatera analys" i JobPage kör analyzeJobPosting och skriver requirements + summary + sections
  + quickFacts (genererar nya fält för befintliga jobb). JobCreate sparar samma fält vid skapande.

## Kompetensbank – UI & hantering
- CompetencyList.jsx: `categorize(comp)` läser `comp.category` (exakt namn) FÖRST, faller sedan tillbaka på tagg-matchning
- CATEGORIES-arrayen i CompetencyList har 13 poster med namn som matchar CATEGORY_ENUM exakt
- CompetencyBank.jsx: "🔄 Kategorisera om"-knapp → kör `recategorizeCompetencies()` → updateDoc(category, tags) per kompetens
- CompetencyBank.jsx: "🗑 Töm kompetensbank"-knapp med tvåstegs-bekräftelse → deleteDoc per kompetens
- Samma recategorize + töm-mönster finns i KonsultProfilPage.jsx och PendingProfilPage.jsx
  - KonsultProfilPage: updateDoc per Firestore-doc
  - PendingProfilPage: updateDoc({ competencies: [] }) resp. updateDoc({ competencies: updatedArray }) på pendingProfiles-doc
- FileUpload.jsx validerar kategorier mot `new Set(CATEGORY_ENUM)` (importerad från claude.js)

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
- /admin/drift kräver BÅDE RequireAuth + RequireAdmin

### Admin-UI (/admin → AdminPage.jsx)
- Hämtar alla docs från users-collection
- Sökfilter client-side (namn/e-post)
- Tabell: Namn | E-post | Roll (dropdown) | Ändrad
- Rollbyte → updateDoc + optimistisk lokal uppdatering + bekräftelsetoast 3s
- updatedAt: serverTimestamp() sätts vid rollbyte

### Driftöversikt (/admin/drift → DriftPage.jsx) — TEKNISK hälsovy
- Läser ENBART systemEvents (`collection(db,'systemEvents')`, orderBy createdAt desc).
  Läser INTE längre feedback. INGA betyg, INGEN feedbacktext, INGEN personrankning.
- KPI:er via `summarizeEvents()` (ren funktion i lib/systemEvents.js):
  slutförda sessioner totalt / 7d / 30d, aktiva konsulter (distinkta uid med
  session_completed), tekniska fel, felfrekvens = fel / (fel + slutförda).
- "Senaste tekniska fel": tabell Tid | Steg | Meddelande | Konsult (uid→namn via
  users-collection, enbart för läsbarhet — felets steg, ej prestation).
- Steg-etiketter: whisper | claude | tts | firestore | complete.

### Navbar
- Utloggade användare ser ENBART loggan (ingen knapp i navbar – knappen finns på startsidan)
- Inloggade: Mina uppdrag | Kompetensbank | (Konsulter om säljare/admin) | (Användarhantering om admin) | (Driftöversikt om admin) | Om | Avatar | Logga ut
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
- Home.jsx Dashboard: visar onboarding-checklista om profileActivated=true (se Dashboard
  onboarding ovan) – ersätter den tidigare gröna engångsbannern

### Firestore Security Rules (firestore.rules)
- Roller: admin kan läsa/skriva alla users; säljare kan läsa users + jobb + kompetenser; owner kan allt i sitt eget träd
- feedback-subcollection (SAMTYCKESSTYRD, specifik path-regel):
  - read:   owner ELLER ((säljare||admin) OCH resource.data.sharedWithSeller == true)
  - create: owner
  - update: owner (konsulten slår på/av delning)
  - delete: owner ELLER admin
  - Admins GENERELLA läsrätt till all feedback är BORTTAGEN. Admin ser bara delad feedback.
- Den gamla rekursiva `/{path=**}/feedback`-regeln (admin läser ALL feedback) är
  BORTTAGEN. Driftvyn läser inte längre feedback, och säljaren läser delad feedback
  PER JOBB: `query(collection(...,'feedback'), where('sharedWithSeller','==',true))`
  — den specifika path-regeln räcker, queryn MÅSTE filtrera på sharedWithSeller==true.
- systemEvents: create om inloggad och request.resource.data.uid == auth.uid;
  read endast admin; update/delete alltid false (oföränderlig logg).
- pendingProfiles: enbart admin + säljare (ej owner/konsult)
- firebase.json pekar på firestore.rules; emulators.firestore satt (port 8080) för regeltester
- VIKTIGT: regeländringar måste DEPLOYAS separat – `firebase deploy --only firestore:rules
  --project interview-prep-81cb6`. En odeployad regel ger "Missing or insufficient
  permissions" i appen även om firestore.rules är korrekt lokalt. (Drift-buggen 2026-06-13
  berodde på att systemEvents-regeln aldrig deployats – inga regeländringar behövdes.)
- DriftPage gör en ENKEL collection-query (`collection(db,'systemEvents')` + orderBy),
  inte collectionGroup → `match /systemEvents/{eventId}` räcker, ingen rekursiv regel behövs.
- isAdmin()/isSaljare() jämför mot exakt gemener: produktionens admin har role=='admin',
  säljare role=='saljare' (verifierat mot Firestore).

### Delning / dataintegritet (samtyckesflöde)
- lib/sharing.js (rena hjälpare): describeShareStatus(), buildShareUpdate(), toDate()
- FeedbackPage: ShareCard med toggle "Dela denna feedback med din säljare" (AV default).
  På → updateDoc({sharedWithSeller:true, sharedAt:serverTimestamp()});
  Av → updateDoc({sharedWithSeller:false, sharedAt:null}). Status visas ("Delad sedan
  {datum}" / "Privat"). Integritetstext överst. Toggle visas BARA för ägaren.
- FeedbackPage läser targetUid från location.state — säljare/admin tittar på konsultens
  delade session (uid = targetUid ?? auth.currentUser.uid); toggle döljs då (isOwner=false).
- JobPage Historik: diskret "Delad"-chip per delad session.
- KonsultProfilPage: tredje tab "Delad feedback" — itererar konsultens jobb och kör
  per-jobb-query (where sharedWithSeller==true), länkar till /feedback/:jobId/:id med
  state {targetUid}. Tomt → "Konsulten har inte delat någon feedback."

### Teknisk driftloggning (lib/systemEvents.js)
- buildSystemEvent() (ren): normaliserar payload, klipper message till 500 tecken,
  tvingar severity till 'info'|'error'. summarizeEvents() (ren): driftaggregat.
- logSystemEvent(): fire-and-forget skriv till systemEvents; kräver inloggad (egen uid);
  sväljer alla egna fel (try/catch) — blockerar ALDRIG användarflödet.
- InterviewSimulatorTTS loggar pipeline_error per externt steg (whisper/tts/claude/
  firestore) + session_completed (info) när en intervju slutförs. Ny feedback skapas med
  sharedWithSeller:false, sharedAt:null.

### Tester
- Vitest enhetstester (test/unit/, körs utan emulator): `npm test`
  - sharing.test.js + systemEvents.test.js + onboarding.test.js + gapAnalysis.test.js
    + jobBriefing.test.js (deriveGapBuckets/resolveRequirements/coverageFromJob/parseJobDescription).
    68 tester.
- Firestore-regeltester (@firebase/rules-unit-testing mot emulatorn): `npm run test:rules`
  - test/rules/firestore.rules.test.js bevisar samtyckesgrindning + systemEvents-åtkomst.
  - Kräver Java/Firestore-emulatorn; körs via `firebase emulators:exec --only firestore`.
- Manuella röktest-checklistor (det som ej kan automatiseras):
  - docs/SMOKE_TEST.md (delning/drift, ljudkedjan)
  - docs/SMOKE_TEST_ONBOARDING.md (förstagångsupplevelse: utan data / uppdrag utan träning / genomförd träning)
  - docs/SMOKE_TEST_GAPANALYSIS.md (gap-analys: äldre jobb / nytt jobb med criticalGaps / utan gaps)
  - docs/SMOKE_TEST_JOBPAGE.md (executive briefing: äldre jobb / nytt jobb efter "Uppdatera analys" / smal vs bred skärm)

## Konventioner
- Svenska i hela UI
- Pusha aldrig till main utan att testa lokalt först
- Uppdatera alltid CLAUDE.md efter varje förändring som påverkar 
  arkitektur, datamodell eller viktiga beslut
