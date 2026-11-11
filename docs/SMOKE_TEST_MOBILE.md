# Röktest – mobil och felanalys (2026-11)

## Vad som ändrades och vad det kan påverka

| Del | Påverkar | Risk |
|---|---|---|
| Layout på mobil | Bara utseende under 1024 px. Desktop bildpunkt för bildpunkt oförändrat (bevisat). | Ingen för funktion |
| Driftöversikten | Bara admin-sidan /admin/drift | Ingen för konsulter |
| Proxyn för transkribering (`api/whisper.js`) | Namnger ljudfilen efter format. Dagens app skickar samma format som förut. | Ingen |
| Ljud och inspelning i intervjun | **Intervjuflödet för alla webbläsare** | Därför ett regressionstest |

Automatiskt bevisat: 507 enhetstester + en hel intervju i Chrome (41 kontroller).
Det som inte kan automatiseras är riktigt ljud, riktig mikrofon och riktiga AI-anrop.

## 1. Regressionstest före utläggning (lokalt, ca 5 min)

I **Chrome på Macen**, på den lokala adressen:

- [ ] Öppna ett uppdrag → Starta intervjuträning → Starta intervju.
- [ ] Intervjuaren hörs.
- [ ] Svara på alla frågor (välj 3 frågor för att gå fort).
- [ ] Feedbacksidan visas med betyg.

Fungerar det: lägg ut.

## 2. Efter utläggning (på iPhone, ca 5 min)

I **Safari på iPhone**, på den riktiga adressen:

- [ ] Starta en intervju. Intervjuaren hörs.
- [ ] Svara på minst en fråga. Nästa fråga kommer.

Fungerar det inte: titta i Driftöversikten. Felet står där med orsak och enhet.
Backa vid behov: `git revert` av commiten.

## Kända begränsningar

- Användarhanteringens tabell rullar i sidled inuti sin ram på mobil.
- Delningsreglaget på feedbacksidan är litet (träffytan är förstorad).
- En session där telefonen stängs mitt i kan inte logga sitt eget slut. Den
  syns som "Stängde sidan" i Driftöversikten.
