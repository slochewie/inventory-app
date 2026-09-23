import {
  appDefinitionsById,
  buildNavigation,
  getDefaultAppUrls,
  getDeploymentBrand,
} from '@niteowl/app-config'
import { NiteOwlNavigationIcon } from '@niteowl/ui/navigation'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const app = appDefinitionsById.inventory
  const hostname = getHostname()
  const brand = getDeploymentBrand(hostname)
  const navigation = buildNavigation({
    currentApp: 'inventory',
    currentPath: '/',
    urls: getDefaultAppUrls(hostname),
  })

  return (
    <main className="inventory-shell">
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

      <section className="inventory-content">
        <header className="inventory-hero">
          <p className="inventory-kicker">Menu items</p>
          <h1>{app.label}</h1>
          <p>
            Import Aloha menu exports, normalize the data, review items, and generate the
            Toast bulk-import format from one place.
          </p>
        </header>

        <section className="inventory-card">
          <h2>Aloha to Toast mapping</h2>
          <p>
            The app shell is wired to the shared NiteOwl package config. The next layer can
            add CSV upload, mapping review, happy-hour price handling, and Toast export generation.
          </p>
        </section>
      </section>
    </main>
  )
}

function getHostname() {
  return typeof window === 'undefined' ? 'inventory.niteowl.dev' : window.location.hostname
}
