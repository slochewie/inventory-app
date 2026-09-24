import { createFileRoute } from '@tanstack/react-router'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { ImportHistoryPanel } from '#/features/import-review/import-history-panel'

export const Route = createFileRoute('/imports')({ component: ImportHistory })

function ImportHistory() {
  return (
    <AuthenticatedInventoryShell currentPath="/import-review">
      <section className="inventory-content">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Import & Review</p>
            <h1>Import history</h1>
            <p>Review saved imports and any conflicts recorded during normalization.</p>
          </div>
          <a className="inventory-secondary-link" href="/import-review">
            Import & Review
          </a>
        </header>
        <ImportHistoryPanel />
      </section>
    </AuthenticatedInventoryShell>
  )
}
