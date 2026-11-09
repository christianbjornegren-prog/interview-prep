export default function OmPage() {
  return (
    <div className="max-w-2xl space-y-10">
      <h1 className="text-2xl font-medium text-text-primary tracking-tight">Om Intervjucoach</h1>

      <Section title="Varför finns den">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
          Intervjucoach är ett internt verktyg byggt för Boulder-konsulter för att träna
          inför specifika uppdrag. Verktyget analyserar det CV du kopplat till uppdraget mot jobbannonsen,
          visar vad du ska förbereda och låter dig öva med en AI-driven intervjuare som ger personlig
          feedback.
        </p>
      </Section>

      <Section title="Techstack">
        <ul className="space-y-2">
          {[
            ['React + Vite', 'Frontend-ramverk med snabb utvecklingsserver'],
            ['Firebase', 'Auth, Firestore (databas) och Storage'],
            ['Claude API (Anthropic)', 'Kompetensextraktion, jobbanalys och intervjufeedback'],
            ['OpenAI Whisper + TTS', 'Tal-till-text och text-till-tal i intervjusimulatorn'],
            ['Vercel', 'Serverless proxy för OpenAI-anrop'],
            ['GitHub Pages', 'Hosting via GitHub Actions CI/CD'],
          ].map(([name, desc]) => (
            <li key={name} className="flex items-start gap-3">
              <span
                className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--color-accent-purple)' }}
              />
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                <span className="font-medium text-text-primary">{name}</span>
                {' '}— {desc}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Byggt av">
        <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
          Christian Björnegren, Boulder AB, 2026
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2
        className="text-xs font-medium uppercase tracking-widest"
        style={{ color: 'var(--color-accent-purple)' }}
      >
        {title}
      </h2>
      <div
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
      >
        {children}
      </div>
    </section>
  )
}
