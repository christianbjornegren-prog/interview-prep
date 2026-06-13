# Manuell röktest – förstagångsupplevelse (konsult)

Kör lokalt (`npm run dev`, localhost:5173) som inloggad konsult. Den automatiska
logiken täcks av enhetstester (test/unit/onboarding.test.js); detta verifierar
UI-flödet end-to-end.

## A. Förstagångsanvändare utan data (inga uppdrag)
- [ ] Dashboarden visar tomma-state-kortet "Lägg till ditt första uppdrag för att
      komma igång" med knapp "Lägg till uppdrag →".
- [ ] Knappen navigerar till /jobb/ny.
- [ ] Primärknappen "Starta intervjuträning" visas INTE (inga uppdrag att träna på).
- [ ] Gul banner "Din kompetensbank är tom" visas om inga kompetenser finns.

## B. CV-upload success (Kompetensbank)
- [ ] Ladda upp ett CV i /kompetensbank. Efter analysen ersätts uppladdningsformuläret
      av en bekräftelse: "✓ {antal} kompetenser tillagda!".
- [ ] Undertext-länken "Nästa steg: lägg till ett uppdrag och starta din träning →"
      navigerar till /jobb/ny.
- [ ] Diskret länk "Ladda upp ett till CV" återställer formuläret (drop-zonen visas igen).
- [ ] (Säljarkontroll) Samma upload via /konsulter/:uid (säljare) visar bekräftelsen
      MEN utan "Nästa steg → /jobb/ny"-länken (targetUid satt).

## C. Har uppdrag men ingen träning
- [ ] Skapa minst ett uppdrag. Dashboarden visar kortet "Du är redo – starta din
      första träning" med knapp "Starta intervjuträning →".
- [ ] Ett uppdrag → knappen går direkt till /jobb/:jobId (Förberedelse-tabben).
- [ ] Flera uppdrag → knappen öppnar en väljare (modal) med uppdragen; val navigerar
      till valt /jobb/:jobId.
- [ ] Uppdragslistan visas under kortet.

## D. Har uppdrag och genomförd träning (normalläge)
- [ ] Efter minst en genomförd intervju visas primärknappen "🎙 Starta intervjuträning"
      högst upp (ovanför listan), och INGET vägledande tomma-state-kort.
- [ ] Ett uppdrag → direkt till JobPage. Flera → väljaren.

## E. Onboarding-checklista (efter pending-profil aktiverad)
- [ ] Logga in som en konsult vars profil förberetts av en säljare (profileActivated).
- [ ] Grön checklista visas med tre steg: ✓ CV uppladdat (ikryssad), ▢ Uppdrag tillagt,
      ▢ Första träning.
- [ ] Lägg till ett uppdrag → "Uppdrag tillagt" blir ikryssad (ladda om vid behov).
- [ ] Genomför en träning → "Första träning" blir ikryssad.
- [ ] När alla tre är ikryssade döljs bannern automatiskt.
- [ ] ✕ stänger bannern manuellt även innan alla steg är klara.

## F. Automatiska tester (kör före push)
- [ ] `npm test` → enhetstester gröna (inkl. onboarding-logiken).
- [ ] `npm run build` → kompilerar utan fel.
