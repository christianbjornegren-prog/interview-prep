import FileUpload from '../components/FileUpload'
import CompetencyList from '../components/CompetencyList'

export default function CompetencyBank() {
  return (
    <div className="space-y-12">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Kompetensbank
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#6b7280' }}>
          Ladda upp ditt CV eller LinkedIn-profil så extraherar AI:n dina kompetenser automatiskt.
        </p>
      </div>

      {/* Section 1 – Upload */}
      <section>
        <SectionLabel>Ladda upp dokument</SectionLabel>
        <FileUpload />
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #2a2d3a' }} />

      {/* Section 2 – Competency list */}
      <section>
        <SectionLabel>Dina kompetenser</SectionLabel>
        <CompetencyList />
      </section>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-widest mb-4"
      style={{ color: '#4A6FA5' }}
    >
      {children}
    </p>
  )
}
