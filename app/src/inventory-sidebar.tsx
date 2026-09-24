import {
  appDefinitionsById,
  buildNavigation,
  getDefaultAppUrls,
  getDeploymentBrand,
} from '@niteowl/app-config'
import { NiteOwlNavigationIcon } from '@niteowl/ui/navigation'

export function InventorySidebar({
  currentPath,
  canManageAssignments = false,
}: {
  currentPath: string
  canManageAssignments?: boolean
}) {
  const app = appDefinitionsById.inventory
  const hostname = getHostname()
  const brand = getDeploymentBrand(hostname)
  const navigation = buildNavigation({
    currentApp: 'inventory',
    currentPath,
    urls: getDefaultAppUrls(hostname),
    canAccess: ({ key }) =>
      key === 'inventory:manage-assignments'
        ? canManageAssignments
        : true,
  })

  return (
    <aside className="inventory-sidebar" aria-label="Application navigation">
      <a className="inventory-brand" href="/">
        <span className="inventory-brand-icon" aria-hidden="true">
          <NiteOwlNavigationIcon icon={app.icon} />
        </span>
        <span>
          <span className="inventory-brand-eyebrow">{brand}</span>
          <span className="inventory-brand-title">{app.label}</span>
        </span>
      </a>

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
