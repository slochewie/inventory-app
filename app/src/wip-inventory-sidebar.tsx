import {
  appDefinitionsById,
  buildNavigation,
  getDefaultAppUrls,
  getDeploymentBrand,
} from '@niteowl/app-config'
import { NiteOwlNavigationIcon } from '@niteowl/ui/navigation'

export function WipInventorySidebar({ currentPath }: { currentPath: '/wip' | '/wip/toast-workbook' }) {
  const app = appDefinitionsById.inventory
  const hostname = getHostname()
  const brand = getDeploymentBrand(hostname)
  const sourcePath = currentPath === '/wip' ? '/' : '/toast-workbook'
  const navigation = buildNavigation({
    currentApp: 'inventory',
    currentPath: sourcePath,
    urls: getDefaultAppUrls(hostname),
  })

  const primary = navigation.primary.map((section) => ({
    ...section,
    items: section.items.flatMap((item) => {
      if (item.href === '/') return [{ ...item, href: '/wip', active: currentPath === '/wip' }]
      if (item.href === '/toast-workbook') {
        return [{ ...item, href: '/wip/toast-workbook', active: currentPath === '/wip/toast-workbook' }]
      }

      return []
    }),
  })).filter((section) => section.items.length > 0)

  return (
    <aside className="inventory-sidebar" aria-label="Application navigation">
      <a className="inventory-brand" href="/wip">
        <span className="inventory-brand-icon" aria-hidden="true">
          <NiteOwlNavigationIcon icon={app.icon} />
        </span>
        <span>
          <span className="inventory-brand-eyebrow">{brand}</span>
          <span className="inventory-brand-title">{app.label}</span>
        </span>
      </a>

      <nav className="inventory-nav">
        {[...primary, ...navigation.apps].map((section) => (
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
