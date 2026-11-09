# Ansiktslyft – översättning från gamla färger till Boulder-tokens

Gäller ansiktslyftet till Boulder designsystem (se `design-system/BOULDER-DESIGNSYSTEM.md`,
`src/styles/tokens.css`, `tailwind.boulder.js`). Appen körs i **ljust tema**
(`<html data-theme="light">`); sidomenyn är mörk. All färg ska gå via tokens så
att temat styr den.

## HÅRDA REGLER – bryt aldrig
1. Ändra BARA utseende: värden i `className`, värden i `style={{…}}`, färgsträngar,
   och värden som tilldelas `e.currentTarget.style.*` i hover-handlers.
2. Rör ALDRIG: JSX-text/copy (även emoji), struktur (lägg inte till/ta bort element),
   props, handlers, villkor, state, imports, logik. Inga omformuleringar.
3. Endast tokennamn som finns i `src/styles/tokens.css`. Inline: `'var(--color-…)'`.
   Klasser: tokenklasser från tailwind-konfigurationen, t.ex. `text-text-primary`,
   `text-text-secondary`, `bg-background-primary`, `border-border-default`,
   `bg-action-primary-background`, `text-link-text`, `text-feedback-error`.
4. Efter dina ändringar: `node scripts/check-facelift.mjs` – dina filer MÅSTE stå
   `OK`. Kör också `npx vite build`. Kör INGA git-kommandon som ändrar något
   (ingen commit/checkout/stash/reset/add).
5. Ljust tema = kontrast: text på vit/ljus yta ≥ 4,5:1. Använd `text-secondary`
   för hjälptext, aldrig `text-tertiary` för text som ska läsas.

## Fråga dig: vilken ROLL har färgen? Samma hex kan ha olika roller.

### Ytor
| Gammalt | Roll | Token |
|---|---|---|
| `#000000` | sidbakgrund | `--color-background-secondary` |
| `#1d1d1d`, `#191919`, `#1a1a1a`, `#252525`, `#2a2a2a`, `#1e1f2a`, `#1e2130` | kort, panel, modal, dropdown | `--color-background-primary` |
| `#141414`, `#111` | inmatningsfält | `--color-input-background` |
| `#141414`, `#111` | infälld yta, spår (progressbar), skeleton | `--color-background-tertiary` |
| `#404040`, `#323232`, `#3a3d4a`, `#3a3d48`, `#444441` | avdelare, kortkant | `--color-border-default` |
| samma | kant på formulärfält | `--color-input-border` (hover `--color-input-border-hover`) |

### Text
| Gammalt | Roll | Token |
|---|---|---|
| `#fff`, `#ffffff`, `text-white`, `#f3f4f6`, `#e5e7eb`, `#e5e5e5`, `#d1d5db`, `#f1efe8` | text/ikon på yta | `--color-text-primary` / `text-text-primary` |
| samma | text/ikon PÅ fylld primärknapp eller lila fyllning | `--color-action-primary-text` (behåll vitt) |
| samma | text på fylld danger-knapp | `--color-action-danger-text` |
| samma | text på färgad tagg/chip | `--color-tag-text` |
| `#9ca3af`, `#6b7280`, `#4b5563` | hjälptext, metadata, sekundär text | `--color-text-secondary` |
| – | platshållare, verkligt inaktivt | `--color-text-tertiary` / `--color-input-placeholder` |

### Lila = interaktion
| Gammalt | Roll | Token |
|---|---|---|
| `#8064ad` | fylld knapp / valt kontrollläge | `--color-action-primary-background` |
| `#9781be` | hover på fylld knapp | `--color-action-primary-background-hover` |
| `#4f3a70` | nedtryckt | `--color-action-primary-background-pressed` |
| `#8064ad` | länktext, aktiv flik (text + 2 px linje), vald kant | `--color-link-text` (hover `--color-link-text-hover`) |
| `#8064ad` | fokusring | `--color-focus-ring` |
| `#8064ad` | kant/text på konturknapp | `--color-action-secondary-border` / `--color-action-secondary-text`, hover-bg `--color-action-secondary-background-hover` |
| `#8064ad20/1f/40/80`, `#1a1229`, `#1a1626`, `#221533`, `#1e1433`, `#26215c`, `#eeedfe` | svag lila markering av valt/aktivt | `--color-action-secondary-background-hover` (starkare: `-pressed`) |
| `#b19ae0`, `#b9a5d6`, `#e4dbf2`, `#d8ccec`, `#b19de0`, `#b48ef5`, `#7c5cbf`, `#8b5cf6` | ljuslila text | interaktiv → `--color-link-text`; annars `--color-text-primary`/`-secondary` |
| `#8064ad` | DATA: kravtäckning, progressfyllnad, täckningsikon | `--color-accent-purple` |
| `#8064ad` | avatar-cirkel | bg `--color-tag-purple-1`, text `--color-tag-text` |

### Feedback (text/ikon/kant vs bakgrund)
| Typ | Text/ikon/kant | Bakgrund |
|---|---|---|
| Grön: `#22c55e`, `#4ade80`, `#86efac`, `#16a34a`, `#10b981`, `#4ec994`, `#57a773`, `#7dcc99`, `#6b9a7a`, `#4d7c5a`, `#166534` | `--color-feedback-success` | `#0d2b1a`, `#052e16`, `#1a4d2e`, `#0d2b1f`, `#0d2b27`, `#22c55e20`, `#d1f4e0`, `#eaf3de`, `#27500a` → `--color-feedback-success-background` |
| Röd: `#f87171`, `#ef4444`, `#c0392b`, `#fca5a5`, `#f0a085` | `--color-feedback-error` | `#2b0d0d`, `#4d1a1a`, `#5b1a1a`, `#7f1d1d`, `#2b1a14`, `#2b1020` → `--color-feedback-error-background` |
| Röd FYLLD knapp (oåterkalleligt) | – | `--color-action-danger-background` (+ `-hover`), text `--color-action-danger-text` |
| Amber: `#e9c46a`, `#f59e0b`, `#f0d48a`, `#f5c060`, `#f0c674`, `#fb923c`, `#e76f51` | `--color-feedback-warning` | `#2b2414`, `#4d3e1a`, `#211a0d`, `#2b2010`, `#2b1a0d`, `#4d2e1a`, `#faeeda`, `#f0e3c8`, `#7c5a1a`, `#854f0b` → `--color-feedback-warning-background` |
| Blå/info: `#3b82f6`, `#60a5fa`, `#0ea5e9`, `#5bc4f5`, `#a5d8ff`, `#7db4f8`, `#06b6d4`, `#4dd8e8`, `#5ecfc3` | `--color-feedback-info` | `#1e2d45`, `#0d1f3c`, `#1a2e4d`, `#0d1a2b`, `#0d2233`, `#0d2633` → `--color-feedback-info-background` |

Betygsfärger (1–10): ≥8 → success, ≥6 → warning, <6 → error. Logiken/trösklarna rörs INTE, bara färgvärdena.
Amber/warning reserveras för "Prioritera dessa" och verkliga varningar. "Förbered dig på" är neutral.
Blå används ALDRIG som varumärkes- eller interaktionsfärg, bara info.

### Kategorier och taggar
Kompetenskategorier och andra färger som bara ska skilja saker åt → taggpaletten:
bg `--color-tag-{purple|pink|blue|teal|green|orange}-{1|2|3}`, text `--color-tag-text`.
Neutral standardtagg: bg `--color-tag-neutral-background`, text `--color-tag-neutral-text`.
Behåll att kategorierna går att skilja åt.

### Intervjuskärmens ring (InterviewSimulatorTTS)
CONNECTING grå → `--color-border-strong` · AI_SPEAKING blå → `--color-feedback-info` ·
WAITING_FOR_USER grön → `--color-feedback-success` · RECORDING röd → `--color-feedback-error` ·
PROCESSING/PREPARING_NEXT vit → `--color-text-secondary` · FINISHED teal `#2a9d8f` → `--color-tag-teal-1`.
Genomskinliga varianter (glöd, puls i `<style>`-block / rgba): `color-mix(in srgb, var(--color-…) 40%, transparent)`.

### Lämna orört
Googles logofärger (`#4285f4`, `#ea4335`, `#fbbc05`, `#34a853`), modalbakgrund `rgba(0,0,0,…)`.

### Typografi (valfritt, bara klasser)
Rubriker h1–h3: `font-bold`/`font-semibold` → `font-medium` (designsystemet använder 500).
Ändra inte storlekar.
