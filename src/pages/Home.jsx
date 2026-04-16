import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-10">
      {/* Hero */}
      <div className="space-y-5 max-w-2xl">
        <div
          className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border"
          style={{ borderColor: '#4A6FA5', color: '#7aa3d4', backgroundColor: '#0d1e35' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          AI-driven intervjuträning
        </div>

        <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
          Välkommen till{' '}
          <span style={{ color: '#4A6FA5' }}>Intervjucoach</span>
        </h1>

        <p className="text-gray-400 text-lg leading-relaxed">
          Ladda upp ditt CV och låt AI:n strukturera dina kompetenser – redo att
          användas när du tränar inför nästa intervju.
        </p>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Link
          to="/kompetensbank"
          className="px-6 py-3 rounded-lg text-white font-medium text-sm transition-colors"
          style={{ backgroundColor: '#4A6FA5' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#5a82bc')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#4A6FA5')}
        >
          Gå till Kompetensbank
        </Link>
        <span className="text-brand-muted text-sm">
          Ladda upp ett CV och börja träna
        </span>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mt-4">
        {FEATURES.map((f) => (
          <FeatureCard key={f.title} {...f} />
        ))}
      </div>
    </div>
  )
}

const FEATURES = [
  {
    icon: '📄',
    title: 'CV-analys',
    description: 'Ladda upp PDF eller DOCX – AI:n extraherar dina kompetenser automatiskt.',
  },
  {
    icon: '🗂️',
    title: 'Kompetensbank',
    description: 'Se och hantera alla dina extraherade kompetenser på ett ställe.',
  },
  {
    icon: '🎯',
    title: 'Intervjuförberedelse',
    description: 'Bygg upp din kompetensprofil och gå in i intervjun med självförtroende.',
  },
]

function FeatureCard({ icon, title, description }) {
  return (
    <div
      className="rounded-xl border border-brand-border p-5 text-left space-y-2"
      style={{ backgroundColor: '#1a1d27' }}
    >
      <span className="text-2xl">{icon}</span>
      <h3 className="text-white font-semibold text-sm">{title}</h3>
      <p className="text-gray-500 text-xs leading-relaxed">{description}</p>
    </div>
  )
}
