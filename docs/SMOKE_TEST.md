# Manuell röktest – förtroende-i-arkitekturen

Den live-baserade ljudkedjan (mikrofon → Whisper → Claude → TTS) går inte att
automatisera fullt. Kör denna checklista lokalt (`npm run dev`, localhost:5173)
efter ändringar i delnings-, drift- eller intervjuflödet.

## Förberedelse
- [ ] `.env.local` är ifylld (VITE_FIREBASE_*). Logga in med ett @boulder.se-konto.
- [ ] Ha minst ett uppdrag med frågor i kompetensbanken.

## 1. Intervju + driftloggning (konsult)
- [ ] Starta en intervju (JobPage → Starta intervjuträning → Starta).
- [ ] Svara på alla frågor; intervjun ska nå FINISHED och navigera till feedback.
- [ ] Verifiera i Firestore-konsolen: ett nytt `systemEvents`-dokument med
      `type: session_completed`, `severity: info`, `step: complete`, rätt `uid`.
- [ ] Det nya feedback-dokumentet har `sharedWithSeller: false` och `sharedAt: null`.
- [ ] (Felväg) Stäng nätverket mitt i ett svar → ett `systemEvents`-dokument med
      `severity: error` och rätt `step` (whisper/tts/claude/firestore) ska skapas,
      OCH appen ska visa felmeddelande utan att krascha (loggning blockerar inte flödet).

## 2. Delning (konsult)
- [ ] Öppna en feedback-sida. Integritetstexten överst ska stå: "Din träning är
      privat … du kan ta tillbaka det när som helst."
- [ ] Toggeln är AV och statusen visar "Privat – syns bara för dig".
- [ ] Slå PÅ → status blir "Delad med din säljare sedan {dagens datum}".
      Firestore: `sharedWithSeller: true`, `sharedAt` satt.
- [ ] Gå till uppdragets Historik-tab → sessionen har en diskret "Delad"-markör.
- [ ] Slå AV igen → status "Privat", `sharedWithSeller: false`, `sharedAt: null`,
      "Delad"-markören försvinner.

## 3. Säljarens vy
- [ ] Logga in som säljare (filip.almstrom@boulder.se eller johanna@boulder.se).
- [ ] /konsulter → välj konsulten → tab "Delad feedback".
- [ ] ENDAST sessioner som konsulten delat visas (datum, uppdrag, övergripande omdöme).
      Odelade sessioner ska INTE synas.
- [ ] Klicka en session → feedbacken öppnas (utan delnings-toggle, eftersom säljaren
      inte äger dokumentet). Tillbaka-länken går till konsultprofilen.
- [ ] Konsult utan delningar → "Konsulten har inte delat någon feedback."
- [ ] Negativt: en säljare ska INTE kunna läsa odelad feedback (bevisas även av regeltester).

## 4. Teknisk driftöversikt (admin)
- [ ] Logga in som admin → /admin/drift.
- [ ] KPI:er visas: slutförda sessioner (totalt/7d/30d), aktiva konsulter,
      tekniska fel, felfrekvens. INGA betyg eller feedbacktext någonstans.
- [ ] "Senaste tekniska fel" listar ev. error-events med Tid | Steg | Meddelande | Konsult.
- [ ] 🔄 Uppdatera laddar om datan.

## 5. Automatiska tester (kör före push)
- [ ] `npm test` → enhetstester gröna (18).
- [ ] `npm run test:rules` → regeltester gröna (kräver Java/Firestore-emulatorn).
- [ ] `npm run build` → kompilerar utan fel.
