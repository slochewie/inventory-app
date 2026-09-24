import {
  appDefinitionsById,
  buildNavigation,
  getDefaultAppUrls,
  getDeploymentBrand,
} from '@niteowl/app-config'
import { NiteOwlNavigationIcon } from '@niteowl/ui/navigation'

export function InventorySidebar({
  currentPath,
  open = true,
  onToggle,
  canImportExport = false,
  canEdit = false,
  canManageAssignments = false,
}: {
  currentPath: string
  open?: boolean
  onToggle?: () => void
  canImportExport?: boolean
  canEdit?: boolean
  canManageAssignments?: boolean
}) {
  const app = appDefinitionsById.inventory
  const hostname = getHostname()
  const brand = getDeploymentBrand(hostname)
  const navigation = buildNavigation({
    currentApp: 'inventory',
    currentPath,
    urls: getDefaultAppUrls(hostname),
    canAccess: ({ key }) => {
      if (key === 'inventory:manage-assignments') {
        return canManageAssignments
      }

      if (key === 'inventory:import-export') {
        return canImportExport
      }

      if (key === 'inventory:edit') {
        return canEdit
      }

      return true
    },
  })

  return (
    <aside
      className={open ? "inventory-sidebar" : "inventory-sidebar is-collapsed"}
      aria-label="Application navigation"
    >
      <div className="inventory-sidebar-brand-row">
        <a className="inventory-brand" href="/" title={app.label}>
        <span className="inventory-brand-icon" aria-hidden="true">
          <NiteOwlNavigationIcon icon={app.icon} />
        </span>
        <span>
          <span className="inventory-brand-eyebrow">{brand}</span>
          <span className="inventory-brand-title">{app.label}</span>
        </span>
        </a>
        <button
          type="button"
          className="inventory-sidebar-toggle"
          onClick={onToggle}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          title={open ? "Collapse sidebar" : "Expand sidebar"}
        >
          <span aria-hidden="true">{open ? "‹" : "›"}</span>
        </button>
      </div>

      <nav className="inventory-nav">
        {[...navigation.primary, ...navigation.apps].map((section) => (
          <section key={section.id} className="inventory-nav-section">
            {section.label ? <h2>{section.label}</h2> : null}
            <ul>
              {section.items.map((item) => (
                <li key={item.id}>
                  <a
                    className={item.active ? 'inventory-nav-link is-active' : 'inventory-nav-link'}
                    href={item.href}
                    title={!open ? item.label : undefined}
                  >
                    <span className="inventory-nav-icon" aria-hidden="true">
                      <NiteOwlNavigationIcon icon={item.icon} />
                    </span>
                    <span>{item.label}</span>
                    {item.external ? <span className="inventory-nav-external">↗</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </aside>
  )
}

function getHostname() {
  return typeof window === 'undefined' ? 'inventory.niteowl.dev' : window.location.hostname
}
