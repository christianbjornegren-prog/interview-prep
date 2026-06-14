# Manuell röktest – JobPage vikt-/matchningsmodell + fullbreddslayout

Kör lokalt (`npm run dev`) som inloggad konsult. Öppna ett uppdrag (/jobb/:id),
Förberedelse-tabben. Ren logik (deriveGapBuckets, coverage, parseJobDescription)
täcks av test/unit/jobBriefing.test.js + gapAnalysis.test.js.

## A. Layout & bredd (desktop-first, fullbredd)
- [ ] Uppdragsvyn är bred (~1200px), centrerad. Övriga vyer är OFÖRÄNDRADE.
- [ ] Header: titel + kund vänster, "🎙 Starta intervjuträning" (lila) höger, flikar under.
- [ ] ALLT i Förberedelse är fullbredd – ingen högerräls, inget ur-linje-tomrum.
- [ ] < ~900px: 2-kolumnsgrids stackar till en kolumn; ingen horisontell scroll.

## B. Nytt jobb efter "🔄 Uppdatera analys" (ny requirements-modell)
- [ ] AI-summering (1 stycke) högst upp.
- [ ] Quick facts som rad av pills (Kund/Roll/Miljö/Fokus).
- [ ] Metric-rad: Kravtäckning %, Att prioritera, Att förbereda, Dina styrkor.
      Kravtäckning-kortet har progressbar + "X av Y krav starkt matchade" (ingen lös rad under).
- [ ] Siffervärdena syns tydligt i mörkt läge (amber/grön/lila – inte mörk/osynlig).
- [ ] "Prioritera dessa": 2-kolumnskort med metarad ("Krav: hög" + "Din matchning: svag")
      och "Så här hanterar du det:". Amber accent (ingen röd).
- [ ] "Förbered dig på": neutral 2-kolumnslista med "Delvis"-märkning (INGA varningstrianglar).
- [ ] "Dina styrkor": chip-moln, alltid synligt.
- [ ] "Hela uppdragsbeskrivningen" längst ned, strukturerad (rubriker + punkter), radbrytningar bevarade.

## C. Kalibrering (rotorsaksfixen – ärlig matchning)
- [ ] Med ett brett senior-CV: ALLT blir INTE "stark". Kravtäckning < 100% och rimlig.
- [ ] "Att prioritera" > 0 när viktiga krav saknas; annars positivt tomtillstånd
      ("Stark matchning – inget kritiskt att prioritera"), inte ett kallt "0".

## D. Wayfinding (klickbara metric-kort)
- [ ] Varje kort har en färgad ikonbricka; samma ikon+färg på sektionsrubriken (med antal · n).
- [ ] Klick på ett kort smooth-scrollar till rätt sektion + kort markering (flash).
- [ ] Tab till ett kort → fokusring syns; Enter/Space aktiverar (samma som klick).

## E. Äldre jobb (utan requirements[])
- [ ] Öppna ett uppdrag skapat före ändringen (har gammal gapAnalysis). Ingen krasch.
- [ ] Buckets härleds (täckta→styrkor, prep→förbered, kritiska→prioritera); siffrorna stämmer.
- [ ] Dashboardens/konsultprofilens "Matchning: X av Y krav"-badge visas fortfarande.

## F. Automatiska tester (kör före push)
- [ ] `npm test` → gröna (inkl. jobBriefing.test.js, 68 tester totalt).
- [ ] `npm run build` → utan fel.
