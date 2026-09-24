import { createFileRoute } from '@tanstack/react-router'
import {
  AuthenticatedInventoryShell,
  useInventoryAccessRole,
} from '#/components/authenticated-inventory-shell'
import { ReconcilePanel } from '#/features/import-review/reconcile-panel'

export const Route = createFileRoute('/reconcile')({ component: ReconcileRoute })

function ReconcileRoute() {
  const { canEdit } = useInventoryAccessRole()

  return (
    <AuthenticatedInventoryShell
      currentPath="/import-review"
      requiredCapability="edit"
    >
      <section className="inventory-content">
        <header className="inventory-page-heading">
          <div>
            <p className="inventory-kicker">Import & Review</p>
            <h1>Mapping review</h1>
            <p>Resolve unmapped rows and possible duplicate source mappings.</p>
          </div>
          <a className="inventory-secondary-link" href="/import-review">
            Import & Review
          </a>
        </header>
        {canEdit ? <ReconcilePanel /> : null}
      </section>
    </AuthenticatedInventoryShell>
  )
}
