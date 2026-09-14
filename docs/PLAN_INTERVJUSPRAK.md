# Genomförandeplan – Intervjuspråk (svenska/engelska)

Status: **byggd 2026-09-14, väntar på manuellt röktest.** Skapad 2026-09-14.

> Fas 1–10 är implementerade. `npm test` grönt (276 tester i 12 filer),
> `npm run build` kompilerar. Inget är pushat – nästa steg är det manuella
> röktestet i `docs/SMOKE_TEST_LANGUAGE.md`, därefter två pushar enligt Fas 4.
>
> **Förfining mot ursprungsplanen:** `analyzeJobPosting` fick INGET språkval.
> Kravbilden på uppdragssidan förblir svensk och bara *frågorna* får en engelsk
> variant, via en egen smal `generateInterviewQuestions()`. Det håller
> enum-risken borta från kravanalysen helt i stället för att hantera den där.
> Dessutom översattes HELA intervjuskärmen, inte bara statustexterna – en skärm
> som säger "Fråga 3 av 5" medan en engelsk röst frågar vore inkonsekvent.

Funktionen: konsulten väljer språk på konfigurationsskärmen inför intervjun.
Valet styr frågorna, talet, intervjuarens namn och feedbacken.

## Beslut (fastställda)

| # | Fråga | Beslut |
|---|-------|--------|
| 1 | Feedbackens språk vid engelsk intervju | **Engelska** |
| 2 | Språk per session eller per uppdrag | **Per session** |
| 3 | Markering för säljaren | **Ja**, i historik + delad feedback |
| 4 | Engelskt intervjuarnamn och röst | **Ja** |

## Kärnprincip — bär hela planen

> **Datakontraktet är svenskt. Endast prosa och tal byter språk.**

`match` (`stark`/`delvis`/`svag`), `importance` (`hög`/`medel`/`låg`),
`strength` (`Hög`/`Medel`/`Låg`), frågornas `category`
(`erfarenhet`/`kompetens`/`situation`/`motivation`) och de 13 posterna i
`CATEGORY_ENUM` är **nycklar**, inte text. De översätts aldrig — oavsett
intervjuspråk.

Håller vi den linjen är `gapAnalysis.js`, kompetensbanken, filtren och samtliga
135 befintliga tester orörda. Släpper vi den går kravanalysen sönder tyst
(se Fas 6).

---

## Fas 0 — Dokumentationsunderlag

### Källor genomgångna

Hela filer: `src/lib/claude.js`, `src/lib/interviewPhase.js`,
`src/lib/gapAnalysis.js`, `src/pages/InterviewSimulatorTTS.jsx`,
`src/pages/JobPage.jsx`, `src/pages/FeedbackPage.jsx`,
`src/pages/JobCreate.jsx`, `api/whisper.js`, `api/tts.js`,
`firestore.rules`, `vite.config.js`, `package.json`,
`test/unit/interviewPhase.test.js`, `test/unit/claude.test.js`,
`docs/SMOKE_TEST.md`. Delvis: `src/pages/KonsultProfilPage.jsx:607-646`.

### Tillåtna API:er (verifierade i kod som körs i produktion)

**Whisper** — `POST https://api.openai.com/v1/audio/transcriptions`, multipart:
`file`, `model=whisper-1`, `language=<ISO-639-1>`.
Verifierat mot OpenAI:s publicerade OpenAPI-spec: `language` är singular och
valfri, och `'en'` är rätt värde för engelska. Dokumentationen anger att
**angivet språk förbättrar både träffsäkerhet och svarstid** — vi ska alltså
fortsätta skicka det, inte gå över till automatisk språkdetektering.
Parametern är dessutom bevisad i drift: den skickas idag hårdkodat som `'sv'`
(`api/whisper.js:24`).

> ⏳ **`whisper-1` avvecklas 26 februari 2027** (OpenAI:s deprecations-sida).
> Efterträdare är `gpt-transcribe`, där `language` ersätts av **`languages`
> (array)** — de två fälten får inte skickas samtidigt.
> `gpt-4o-transcribe` och `gpt-4o-mini-transcribe` avvecklas samma datum och är
> alltså återvändsgränder. Migreringen ligger **utanför den här planen** men har
> en deadline: se "Utanför scope".

**TTS** — `POST https://api.openai.com/v1/audio/speech`, JSON: `model=tts-1-hd`,
`input`, `voice`, `response_format=mp3`.
**Inget språkfält existerar** — hela parameteruppsättningen är `model`, `input`,
`instructions`, `voice`, `response_format`, `speed`, `stream_format`. Språket
följer `input`-texten, och både svenska och engelska är dokumenterat stödda
(`api/tts.js:23-34`). **TTS behöver noll kodändringar för engelska.**
`tts-1-hd` är inte avvecklad. Rösten `shimmer` är giltig i båda modellgenerationerna.

> ⚠️ `input` har ett **hårt tak på 4096 tecken**. Hälsningen bakar in första
> frågan (`InterviewSimulatorTTS.jsx:273-277`), så en ovanligt lång genererad
> fråga kan teoretiskt slå i taket. Lägg in en längdkontroll i `buildGreeting`
> (Fas 2) som klipper eller delar upp i stället för att låta anropet fela.

**Claude** — `POST https://api.anthropic.com/v1/messages` via `fetch`, headers
`x-api-key`, `anthropic-version: 2023-06-01`,
`anthropic-dangerous-direct-browser-access: true`. Modell `claude-sonnet-4-5`.
Två anropsformer i bruk: ren text-JSON (`analyzeJobPosting`,
`analyzeInterviewFeedback`) och `tool_use` med `tool_choice`
(`extractCompetencies`, `recategorizeCompetencies`).

### Anti-patterns — gör INTE detta

- **Inför inte Anthropic-SDK:n.** Projektet anropar API:et med `fetch` rakt
  igenom. Blanda inte de två.
- **Byt inte modell** som del av den här ändringen. Poängskalan 1–10 är
  kalibrerad mot `claude-sonnet-4-5` (`claude.js:396-404`); ett modellbyte
  ändrar betygsättningen och kräver egen omkalibrering. Separat beslut.
- **Översätt aldrig enum-värden.** Se kärnprincipen.
- **Skriv inga DOM-beroende tester.** `vite.config.js` sätter enbart env —
  ingen jsdom, inga `setupFiles`. Alla nya tester måste vara rena Node-tester
  utan React-rendering.
- **Lägg nya tester i `test/unit/`.** `npm test` kör `vitest run test/unit` —
  tester någon annanstans körs aldrig.
- **Inga regeländringar behövs.** `firestore.rules` grindar dokument, inte
  fält. `language` på ett jobb- eller feedbackdokument täcks redan av
  ägarregeln (`firestore.rules:25-43`). Rör inte reglerna.

---

## Fas 1 — Språkfundament

**Ny fil:** `src/lib/language.js` (ren, inget React, inget Firebase)

```
LANGUAGES        = { SV: 'sv', EN: 'en' }
DEFAULT_LANGUAGE = 'sv'
normalizeLanguage(value) -> 'sv' | 'en'   // allt okänt -> 'sv'
```

Varför först: varje senare fas importerar härifrån. En sanningskälla.

**Mönster att kopiera:** `src/lib/interviewPhase.js` — ren modul, JSDoc per
exporterad funktion, defensiva defaults.

**Verifiering**
- [ ] `normalizeLanguage` tål `null`, `undefined`, `''`, `'EN'`, `'sv-SE'`, `42`
- [ ] `npm test` grönt

---

## Fas 2 — Intervjuns manus ut ur komponenten

**Ny fil:** `src/lib/interviewScript.js` (ren)

```
buildGreeting({ interviewerName, jobTitle, company, total, firstQuestion, language })
buildBridge({ index, total, question, language })
buildClosing({ language })
pickVoiceAndName(language, rng = Math.random)
```

**Kopiera de svenska formuleringarna ordagrant** från
`InterviewSimulatorTTS.jsx:273-277` (hälsning), `:358-360` (övergång) och
`:365-367` (avslutning). Svensk text ska vara identisk tecken för tecken efter
flytten — annars ändrar vi det svenska flödet, vilket är precis vad vi vill undvika.

Flytta även `FEMALE_VOICES` / `MALE_VOICES` / `FEMALE_NAMES` / `MALE_NAMES`
(`:26-29`) hit och lägg till engelska namnlistor. `rng` injiceras så funktionen
går att testa deterministiskt.

Därefter: `InterviewSimulatorTTS.jsx` importerar i stället för att definiera.

**Verifiering**
- [ ] Test som låser den svenska hälsningen exakt (regressionslås)
- [ ] Engelsk motsvarighet finns för alla tre texterna
- [ ] `pickVoiceAndName('en', () => 0)` ger engelskt namn, `('sv', () => 0)` svenskt
- [ ] `npm test` grönt

---

## Fas 3 — Statustexterna tar språk

**Fil:** `src/lib/interviewPhase.js`

`buttonStateForPhase(phase, { interviewerName, language = 'sv' })`.
Default på `language` gör att varje befintligt anrop och varje befintligt test
fungerar oförändrat.

**Verifiering**
- [ ] Alla 7 states × 2 språk ger icke-tom `subLabel`
- [ ] Okänt state ger fortfarande säkert tomt objekt
- [ ] De 50 befintliga testerna är orörda och gröna

---

## Fas 4 — Whisper tar språk ⚠️ deploy-ordning

**Fil:** `api/whisper.js`

Läs språk från query (`?language=en`), **validera mot vitlista** `['sv','en']`,
fall tillbaka till `'sv'`. Skicka aldrig rå indata vidare till OpenAI.
Ersätt `formData.append('language', 'sv')` (`:24`) med det validerade värdet.

**Fil:** `src/pages/InterviewSimulatorTTS.jsx:342` — lägg query-parametern på
anropet. Klienten postar rå ljuddata med `Content-Type: audio/webm`, så det
finns ingen JSON-kropp att lägga fältet i — query är rätt väg.

> ⚠️ **Deployordning löses med två pushar, inte med manuell deploy.**
>
> Vercel är kopplat till GitHub-repot (`vercel[bot]` gör Production-deploy vid
> push till main; PR:er får Preview-deployer). GitHub Actions deployar samtidigt
> frontend till Pages. **En push deployar alltså båda parallellt, utan garanterad
> ordning.**
>
> Lösning: dela upp i två pushar.
> 1. **Push 1 — bara `api/whisper.js`.** Bakåtkompatibel: tar emot `?language=`
>    men defaultar till `sv`. Frontend orörd, inget beteende ändras.
>    Vänta tills Vercel-deployen är grön.
> 2. **Push 2 — frontend.** Nu finns en proxy som förstår parametern.
>
> Gör man det i en enda push är risken liten men verklig: en kort lucka där ny
> frontend skickar `?language=en` till en gammal proxy som ignorerar det, och
> engelskt tal transkriberas tyst som svenska.

**Verifiering**
- [ ] `curl` mot deployad proxy med `?language=en` och engelsk ljudfil
- [ ] `?language=<skräp>` faller tillbaka till `sv` utan fel
- [ ] Vercel-loggen visar rätt språk

---

## Fas 5 — Prompterna tar språk

**Fil:** `src/lib/claude.js`

Bryt ut som **exporterade rena funktioner** (testbara utan API-anrop):

```
buildJobAnalysisSystemPrompt(language)
buildFeedbackSystemPrompt(language)
```

Ta bort de hårda låsningarna på `:422` och `:444` (`'Tala ALLTID på svenska.'`)
och ersätt med språkstyrd instruktion. `analyzeInterviewFeedback` tar
`{ language }` i sin config-parameter.

**KRITISKT:** den engelska prompten måste fortfarande kräva **svenska
enum-värden**. Ungefär: *"Write all prose in English. The values of
`importance`, `match` and `category` MUST remain exactly these Swedish tokens:
hög|medel|låg, stark|delvis|svag, erfarenhet|kompetens|situation|motivation.
Never translate them."*

**Verifiering**
- [ ] Svensk prompt innehåller svenska-instruktionen
- [ ] Engelsk prompt innehåller engelska-instruktionen
- [ ] **Båda** innehåller enum-instruktionen med svenska tokens
- [ ] Inga nätverksanrop i testerna

---

## Fas 6 — Skydd mot tyst degradering ⭐ viktigast

**Fil:** `src/lib/gapAnalysis.js`

Ny exporterad funktion:

```
findInvalidRequirementValues(requirements) -> [{ index, field, value }]
```

Returnerar varje `match`/`importance` som ligger utanför `MATCH` / `IMPORTANCE`.

**Ändra INTE `deriveGapBuckets`.** Den ska fortsätta normalisera tyst
(`:118-119`) — det är rätt beteende för bakåtkompatibilitet med äldre jobb.
Skyddet läggs *bredvid*, inte i stället.

**Fil:** `src/pages/JobPage.jsx` — om listan inte är tom, visa en synlig varning
("Analysen kunde inte tolkas korrekt – kör Uppdatera analys") i stället för att
rendera 0 % kravtäckning som om allt vore normalt.

Detta är testet som hade fångat den farligaste risken i analysen.

**Verifiering**
- [ ] Engelska värden (`strong`/`high`) ger utslag i listan
- [ ] Svenska värden ger tom lista
- [ ] `deriveGapBuckets` ger **identiskt** resultat som före för svensk indata

---

## Fas 7 — Språkval i UI och persistens

**Fil:** `src/pages/JobPage.jsx`
- Fjärde `OptionGroup` "Språk" med `Svenska` / `English` (`:860-877`)
- `config`-state får `language: 'sv'` (`:52`)
- Följer automatiskt med i `location.state` via `...config` (`:145`)

**Fil:** `src/pages/InterviewSimulatorTTS.jsx`
- `normalizeLanguage(location.state?.language)` in i `interviewConfig`
- `language` sparas på feedback-dokumentet (`:433-448`)

**Markering för säljaren** (beslut 3) — samma mönster som "Delad"-chippet:
- `JobPage.jsx:752-760` (historiklistan)
- `KonsultProfilPage.jsx:607-646` (`SharedFeedbackItem`, säljarens vy)

**Verifiering**
- [ ] Feedback-dokumentet får `language`
- [ ] Chip visas endast när `language === 'en'`
- [ ] Äldre feedback utan fältet renderar utan chip och utan krasch

---

## Fas 8 — Engelska frågor

Frågorna genereras idag **en gång vid uppdragsskapandet** och sparas på svenska
(`JobCreate.jsx:54, :65`). En engelsk intervju behöver engelska frågor.

**Lösning:** lagra dem bredvid, inte i stället.
- Svenska frågor stannar i `job.questions` — **orörda**
- Engelska sparas som `job.questionsEn`
- `JobPage.launchInterview` (`:137-147`): om `language === 'en'` och
  `questionsEn` saknas → generera, spara på jobbdokumentet, fortsätt

Ingen migrering. Äldre uppdrag påverkas inte förrän någon faktiskt väljer
engelska på dem.

**Verifiering**
- [ ] Gammalt jobb utan `questionsEn` fungerar på svenska som förut
- [ ] Engelsk körning genererar, sparar och återanvänder vid andra körningen
- [ ] `requirements` rörs inte av frågegenereringen
- [ ] Laddningsindikator medan frågorna genereras

---

## Fas 9 — Testsvit

Nya filer i `test/unit/` (rena Node-tester, inga DOM-beroenden):

| Fil | Täcker |
|-----|--------|
| `language.test.js` | `normalizeLanguage` inkl. skräpindata |
| `interviewScript.test.js` | Hälsning/övergång/avslutning × 2 språk, namnval |
| `claudePrompts.test.js` | Promptbyggarna, särskilt enum-instruktionen i båda språken |
| `gapAnalysisGuard.test.js` | `findInvalidRequirementValues` + regressionslås på `deriveGapBuckets` |
| `interviewPhase.test.js` | Utökas med engelska varianter |

Mål: cirka **+60 tester**, totalt runt **195**.

---

## Fas 10 — Manuellt röktest och dokumentation

**Ny fil:** `docs/SMOKE_TEST_LANGUAGE.md` — engelsk intervju från start till
feedback, plus den svenska körningen som regressionsbevis.

**Uppdatera:** `CLAUDE.md` (projektkonventionen kräver det vid arkitektur- eller
datamodellsändring) och `docs/SMOKE_TEST.md` avsnitt 5 med nytt testantal.

---

## Slutfas — Verifiering före släpp

- [ ] `npm test` — alla gröna
- [ ] `npm run test:rules` — kräver Java (`brew install --cask temurin`)
- [ ] `npm run build` — kompilerar
- [ ] `grep -rn "strong\|partial\|weak" src/lib/gapAnalysis.js` — inga engelska enum-värden
- [ ] `grep -n "'sv'" api/whisper.js` — endast som fallback, inte hårdkodat i anropet
- [ ] Manuellt: **engelsk** intervju hela vägen till feedback
- [ ] Manuellt: **svensk** intervju hela vägen — regressionsbeviset
- [ ] Deployordning: push 1 = proxy (vänta på grön Vercel-deploy), push 2 = frontend
- [ ] OBS: varje push till main går direkt till produktion — både Vercel och Pages

---

## Utanför scope — medvetet

- **Full tvåspråkig UI** (~300 svenska strängar, ingen i18n-hantering finns).
  Funktionen heter "intervjuspråk", inte "appspråk".
- **Datumformat** — åtta hårdkodade `sv-SE` behålls.
- **Modellbyte** — se anti-patterns i Fas 0. Eget beslut, egen omkalibrering.
- **Säkerhetsfixen** (API-nyckel i klienten, öppna proxyer) — egen plan, men
  Vercel-deployen i Fas 4 bör samordnas med den.
- **Migrering `whisper-1` → `gpt-transcribe`** — ⏳ **deadline 26 februari 2027.**
  Hålls medvetet utanför den här planen: ett byte av transkriberingsmodell
  ändrar hur *svenska* svar tolkas, vilket är precis den regression vi undviker
  här. Den behöver eget röktest på båda språken. Deltan när det blir dags:
  samma endpoint, `language` → `languages: ["en"]`, ny `keywords`-array för
  teknisk vokabulär, och strömning blir möjlig (stöds inte av `whisper-1`).
  Notera också att `prompt`-parametern, om vi någonsin inför den, **måste vara
  på samma språk som ljudet** — alltså ytterligare en sak att språkanpassa.
