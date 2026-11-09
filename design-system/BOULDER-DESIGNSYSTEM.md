# Boulder designsystem – guide för kod och AI-verktyg (Lovable m.fl.)

Klistra in den här filen i projektets instruktioner/knowledge i Lovable, Cursor, v0 eller liknande. Lägg `tokens.css` och `tailwind.config.js` i projektet. Källan är Figma-filen **Designsystem** – ändra där, exportera igen.

## 1. Sätt upp projektet

- Importera `tokens.css` först i appens globala CSS. Den laddar Poppins (400, 500) och Syne (700) och definierar alla tokens som CSS-variabler.
- Använd `tailwind.config.js` (färger, spacing, radier och textstilar pekar på CSS-variablerna). Använd aldrig hex-värden eller Tailwinds standardfärger (`blue-500`, `gray-200` osv.) – bara tokens.
- Ikoner: **Lucide** (`lucide-react`), stroke 2, storlek 20 px (16 px i små knappar, 24 px fristående). Ikoner ärver textens färg (`currentColor`) – sätt aldrig en egen färg på en ikon i en knapp.
- Dark mode är standard (`:root`). Light mode: `data-theme="light"` på `<html>` eller på en enskild yta.

## 2. Grundregler (bryt aldrig)

1. **Ingen blå** som varumärkes- eller interaktionsfärg. Blå finns bara som `--color-feedback-info`.
2. **Lila betyder interaktion**: knappar, länkar, valt läge, fokus, aktiv flik. Aldrig som dekor, bakgrund på ytor eller i sidfoten.
3. **Neutrala ytor.** Färg bara för det som avviker (fel, varning, väntande, ditt val). Lediga/normala saker är neutrala.
4. **WCAG 2.2 AA**: text ≥ 4,5:1, stor text och UI-delar ≥ 3:1, valt läge måste skilja sig ≥ 3:1 (inte bara via en vit platta på grått). Fokus alltid synligt (`--color-focus-ring`). Tryckytor minst 44 × 44 px.
5. **Svenska**, meningsversaler (”Skicka kvitto”, inte ”Skicka Kvitto”). Knappar är verb. Datum `ÅÅÅÅ-MM-DD`. Exempeldata är påhittad: ”Förnamn Efternamn”, ”namn@boulder.se”, ”070-000 00 00”.
6. Respektera `prefers-reduced-motion`.

## 3. Tokens i korthet

| Grupp | Exempel | Används till |
|---|---|---|
| Ytor | `--color-background-primary / -secondary / -tertiary` | kort och paneler / sidbakgrund / spår, skeleton |
| Text | `--color-text-primary / -secondary / -tertiary` | brödtext / hjälptext / inaktivt |
| Kanter | `--color-border-default / -strong` | avdelare / kontroller |
| Handling | `--color-action-primary-*`, `-secondary-*`, `-ghost-*`, `-danger-*`, `-disabled-*` | knappar |
| Länk | `--color-link-text(-hover/-pressed)` | länkar, vald flik |
| Formulär | `--color-input-*`, `--color-control-checked` | fält, checkbox, radio, switch |
| Feedback | `--color-feedback-{error,success,warning,info}(-background)` | Alert, Toast, validering |
| Taggar | `--color-tag-neutral-*`, `--color-tag-{färg}-{1,2,3}` | Tag – neutral som standard |
| Mått | `--spacing-{3xs…7xl}` (2–64 px), `--size-control-{sm,md,lg}` (32/44/56), `--border-radius-{xs…full}` | |
| Layout | `--layout-page-padding` (64/32/24), `--layout-workspace-padding` (40/32/24), `--layout-gutter` (24/24/16), 12/8/4 kolumner | |
| Typografi | `.text-display-*` (Syne), `.text-heading-h1…h5`, `.text-body-*`, `.text-label-*`, `.text-caption` | storlekar krymper automatiskt på mobil |

Brytpunkter: mobil < 768 px, tablet 768–1023 px, desktop ≥ 1024 px, max-bredd 1440 px.

## 4. Navigering – välj efter typ av verktyg

| Typ | Exempel | Navigering |
|---|---|---|
| Webb | boulder.se, Book of Boulder | **Header** med menyval; Mobile menu på mobil. Footer neutral (inte lila). |
| Arbetsyta med flera sidor | Onboarding, Partner HUB, Grottan | **Sidebar** 240 px (mörk, alltid) + ljus arbetsyta. Mobil: **App bar** 56 px + Drawer. Verktygets namn under loggan. |
| Enkelt verktyg, en sida | Kvitto, Signatur | **Tool header**: logga │ verktygets namn, användare och Logga ut till höger. Ingen meny. Flikar på sidan vid behov. |

Verktygets namn syns alltid bredvid loggan. Logga ut nås utan att öppna en meny.

## 5. Komponenter (samma namn som i Figma)

**Button** – Primary (en per vy), Secondary, Ghost, Danger. Storlekar 32/44/56 px, 44 är standard. Loading: spinner + ”Sparar…”, samma bredd, `aria-disabled`. Danger bara för sådant som inte går att ångra.
**Icon button** – alltid `aria-label` och Tooltip.
**Input, Textarea, Select** – etikett ovanför, hjälptext under, fel med ikon + text (aldrig bara färg). 44 px.
**Checkbox / Radio / Radio card** – Radio card när valet styr resten av formuläret. **Switch** när ändringen gäller direkt (ingen Spara-knapp).
**Search field** – 44 px, 320 px på desktop, sökikon, rensa-knapp. `<form role="search">`.
**Date picker** – textfält `ÅÅÅÅ-MM-DD` + kalender (veckan börjar på måndag). Mobil: `<input type="date">`.
**File upload** – Dropzone på desktop; på mobil ”Ta bild” (`capture="environment"`) + ”Välj fil”. File item per fil.
**Filter & Sort** – Filter dropdown 44 px → Menu med Filter option → Dismissible chip (32 px) för aktiva filter. Mobil: knapp som öppnar Sheet.
**Segmented control** – 2–4 lägen av samma innehåll; valt läge lila fyllning.
**Tabs** – byta vy inom samma sida. Vald flik lila text + 2 px linje. `role="tablist"`.
**List / List item** – Size Default och Compact, med leading (avatar/ikon), rubrik + beskrivning, meta och trailing.
**Table** – desktop; på mobil blir rader kort/listor. **Pagination** under (Full desktop, Compact mobil) eller ”Visa fler”.
**Card / Media card / Stat card** – 44 px knappar i kort. Media card: bild 1:1 till vänster på mobil.
**Accordion** – Plain/Card; Size Small inuti kort.
**Tag** – neutral som standard; färger bara för kategorier som behöver skiljas åt.
**Avatar / Avatar group / Badge** – initialer, Badge för antal olästa.
**Breadcrumb** – på undersidor i arbetsytor.
**Page header / Section header** – sidrubrik med valfri beskrivning och knappar.
**Stepper** – flöden med 3–5 steg; Compact på mobil.
**Menu** (”Fler val”) – knapp med tre prickar; Danger-val sist efter divider; Sheet på mobil.
**Tooltip** – bara för ikonknappar; aldrig viktig info; inte på mobil.
**Dialog** – Small 400 / Medium 560 / Large 720; Alert för oåterkalleligt (Danger-knapp, ingen stängknapp); på mobil Sheet nerifrån.
**Toast** – kort bekräftelse, försvinner efter 5 s (8 s med Ångra), går inte att stänga. Nere till höger (desktop) / nere i full bredd (mobil).
**Alert** – meddelande som ligger kvar på sidan och kan stängas. Allt användaren måste se eller agera på.
**Empty state** – Empty (inget skapat), No results, All done (enda med bock), Error. Neutral ikon i grå cirkel.
**Loading** – Skeleton för innehåll som laddar, Spinner för handlingar. Inget under 300 ms.

## 6. Mönster

- **Spara**: Knapp → Loading → Toast ”Ändringarna är sparade”. Fel → Alert vid formuläret.
- **Ta bort**: Går det att återställa → gör det direkt + Toast med ”Ångra”. Går det inte → Alert-dialog med Danger-knapp, sedan Toast utan Ångra. Aldrig båda.
- **Formulär**: en kolumn, max ca 640 px, sektioner med rubrik. Validera vid skicka/lämna fält, inte medan man skriver.
- **Listor**: sök först, sedan filter, sortering till höger. Visa antal träffar. Tomt → Empty state.
- **Mobil först** för verktyg som används i farten (Kvitto, Grottan).

## 7. Tillgänglighet – checklista

- Semantisk HTML först (`button`, `a`, `label`, `fieldset`, `dialog`, `nav`), ARIA bara där det behövs.
- Allt nås och används med tangentbord i logisk ordning; fokus flyttas medvetet (dialoger, steg, borttagning).
- Statusändringar (träffar, uppladdning, toasts) i `aria-live`.
- Ikoner utan text har `aria-label`; dekorativa ikoner `aria-hidden="true"`.
- Testa i både dark och light mode.

## 8. Exempelprompt

> Bygg [verktyg] enligt Boulder designsystem (se BOULDER-DESIGNSYSTEM.md, tokens.css, tailwind.config.js). Det är ett [enkelt verktyg / en arbetsyta med flera sidor] → använd [Tool header / Sidebar + App bar]. Dark mode som standard. Använd bara tokens, Lucide-ikoner med currentColor, svenska texter och påhittad exempeldata. Följ WCAG 2.2 AA.
