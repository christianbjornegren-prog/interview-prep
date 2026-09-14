# Manuellt röktest – intervjuspråk (svenska/engelska)

Ljudkedjan (mikrofon → Whisper → Claude → TTS) går inte att automatisera.
Kör denna checklista lokalt (`npm run dev`) efter varje ändring i intervju-,
prompt- eller proxylagret.

**Båda körningarna krävs.** Den svenska är regressionsbeviset – den visar att
språkstödet inte rubbade det befintliga flödet. Hoppa aldrig över den.

## Förberedelse
- [ ] `.env.local` ifylld. Logga in med ett @boulder.se-konto.
- [ ] Minst ett uppdrag med frågor finns (skapa ett nytt kostar ett Claude-anrop).
- [ ] Fungerande mikrofon. För den engelska körningen: var beredd att faktiskt
      svara på engelska – det är transkriberingen som testas.

---

## 1. Svensk intervju (regressionsbeviset)

- [ ] JobPage → "🎙 Starta intervjuträning" → konfigurationsskärmen visas.
- [ ] Språkväljaren finns och står på **Svenska** från start.
- [ ] Starta. Hälsningen läses upp på svenska med ett svenskt intervjuarnamn
      (Maria/Anna/Sara/Erik/Johan/Anders).
- [ ] Skärmen är på svenska: "Fråga 1 av N", "Din tur — tryck på knappen...".
- [ ] Svara på svenska. Transkriberingen blir begriplig svenska.
- [ ] Övergången säger "Tack. Fråga 2 av N: ...".
- [ ] Avslutningen: "Tack så mycket, det var alla mina frågor...".
- [ ] Feedbacken är på **svenska**, betyg på 1–10-skalan.
- [ ] Historiken visar sessionen **utan** EN-märkning.

## 2. Engelsk intervju

- [ ] Samma uppdrag → konfigurationsskärmen → välj **English**.
- [ ] Förhandsvisningen noterar att engelska frågor skapas vid start.
- [ ] Starta. Knappen visar "Förbereder engelska frågor..." första gången
      (frågorna genereras och sparas som `questionsEn`).
- [ ] Hälsningen är på engelska med ett **engelskt** intervjuarnamn
      (Sarah/Emma/Rachel/James/Michael/Daniel).
- [ ] Skärmen är på engelska: "Question 1 of N", "Your turn — press the button...".
- [ ] Frågorna är på engelska och läses upp med begriplig engelsk uttal.
- [ ] Svara på **engelska**. Transkriberingen blir begriplig engelska –
      INTE svensk-tolkad grötighet. (Detta bevisar att `?language=en` nådde proxyn.)
- [ ] Inspelningsknappen visar "0:05 — press when you're done".
- [ ] Avslutningen är på engelska.
- [ ] Feedbacken är på **engelska** – summary, strengths, improvements, kommentarer.
- [ ] Betygen ligger på samma 1–10-skala och känns rimliga (inte systematiskt
      strängare eller snällare än den svenska körningen).
- [ ] Historiken visar sessionen **med** en lila "EN"-markering.

## 3. Andra körningen på engelska (cachning)

- [ ] Starta en engelsk intervju till på samma uppdrag.
- [ ] Ingen "Förbereder engelska frågor..." – frågorna återanvänds från `questionsEn`.
- [ ] Frågorna är desamma som i körning 2.

## 4. Säljarens vy

- [ ] Dela den engelska feedbacken (toggeln på feedbacksidan).
- [ ] Logga in som säljare → /konsulter → konsulten → "Delad feedback".
- [ ] Sessionen har en "EN"-markering så säljaren vet vad hen möter.
- [ ] Feedbacksidan öppnas HELT på engelska: rubriker (Summary, Strengths,
      Areas to improve), delningskortet, datumformatet och rolltiteln
      ("Interim Head of IT", inte "Interim IT-chef").
- [ ] Ingen svensk text någonstans på den engelska feedbacksidan.
- [ ] Öppna en SVENSK session: den är oförändrat svensk, inklusive datum.

## 5. Kravanalysen är orörd

- [ ] Öppna Förberedelse-tabben på samma uppdrag efter de engelska körningarna.
- [ ] Kravtäckning, "Prioritera dessa", "Förbered dig på" och "Dina styrkor"
      är **oförändrade och på svenska**.
- [ ] Ingen varningsruta om att analysen inte kunde tolkas.
- [ ] Detta bevisar kärnprincipen: datakontraktet påverkades inte av språkvalet.

## 6. Felvägar

- [ ] Stäng nätverket mitt i ett engelskt svar → felmeddelande på engelska,
      appen kraschar inte, ett `systemEvents`-dokument med `severity: error` skapas.
- [ ] Avbryt en engelsk intervju → bekräftelsen är på engelska
      ("End the interview? Your answer won't be saved.").

## 7. Automatiska tester (kör före push)
- [ ] `npm test` → alla gröna.
- [ ] `npm run build` → kompilerar utan fel.
- [ ] `npm run test:rules` → kräver Java. Språkstödet ändrar inga regler,
      så detta är frivilligt för just den här funktionen.
