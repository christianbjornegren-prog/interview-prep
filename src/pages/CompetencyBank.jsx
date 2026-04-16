import FileUpload from '../components/FileUpload'
import CompetencyList from '../components/CompetencyList'

export default function CompetencyBank() {
  return (
    <div className="space-y-10">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Kompetensbank</h1>
        <p className="text-gray-400 text-sm">
          Ladda upp ditt CV för att extrahera och spara dina kompetenser.
        </p>
      </div>

      {/* Upload section */}
      <section>
        <SectionLabel>Ladda upp dokument</SectionLabel>
        <FileUpload />
      </section>

      {/* Divider */}
      <div className="border-t border-brand-border" />

      {/* Competency list */}
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
      className="text-xs uppercase tracking-widest font-semibold mb-4"
      style={{ color: '#4A6FA5' }}
    >
      {children}
    </p>
  )
}
