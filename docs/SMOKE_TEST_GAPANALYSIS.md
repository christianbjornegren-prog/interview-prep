# Manuell röktest – gap-analys ("coach not judge")

Kör lokalt (`npm run dev`) som inloggad konsult. Öppna ett uppdrag →
Förberedelse-tabben ("Inför intervjun"-sektionen). Den rena logiken
(normalisering + täckning) täcks av test/unit/gapAnalysis.test.js.

## A. Äldre jobb (gammal struktur, utan criticalGaps)
- [ ] Öppna ett uppdrag skapat FÖRE denna ändring (gapAnalysis = { covered, gaps }).
- [ ] Sidan kraschar inte.
- [ ] Täckningsindikatorn visar "X av Y krav täckta" (mappat från gamla covered/gaps).
- [ ] "Prioritera dessa" visas INTE (criticalGaps tom för gamla jobb).
- [ ] "Förbered dig på" listar gamla gaps (utan badge).
- [ ] "Dina styrkor …" (<details>) innehåller gamla täckta krav som chips.
- [ ] Dashboardens/konsultprofilens "Matchning: X av Y krav"-badge visas fortfarande.

## B. Nytt jobb med criticalGaps
- [ ] Klicka "🔄 Uppdatera analys" (eller skapa nytt uppdrag) så ny struktur genereras.
- [ ] Täckningsindikator: tunn lila progress-bar + "X av Y krav täckta" + procent.
- [ ] "Prioritera dessa" (om Claude returnerar några): orange/amber kort – INTE rött.
      Per kort: kompetensnamn (tydligt) + "Annonsens formulering: …" (muted) +
      ljus infopanel "Så här hanterar du det: …" (prominent, inte fotnot).
- [ ] "Förbered dig på": alla områden synliga, ingen "Visa alla/färre". Varningsikon +
      namn + "Meriterande"-badge där type=meriterande.
- [ ] "Dina styrkor för det här uppdraget": kollapsad som standard, summary
      "X styrkor matchade – visa", expandera → gröna checkmark-chips. Chevron roterar.

## C. Jobb helt utan gaps/data
- [ ] Uppdrag där analysen saknas helt → "Ingen analys tillgänglig än." Ingen krasch.
- [ ] Uppdrag där allt är täckt (inga critical/prep) → bara täckningsindikator (100%)
      + "Dina styrkor". Inga tomma rubriker.

## D. Copy-granskning (coach not judge)
- [ ] Inga "gap"/"kritiska gap"/"täckta krav"/"betyg" i gap-sektionens UI.
- [ ] Rubriker: "Inför intervjun", "Prioritera dessa", "Förbered dig på",
      "Dina styrkor för det här uppdraget".

## E. Automatiska tester (kör före push)
- [ ] `npm test` → enhetstester gröna (inkl. gapAnalysis).
- [ ] `npm run build` → kompilerar utan fel.
