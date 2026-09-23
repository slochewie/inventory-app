import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'

import appCss from '../styles.css?url'
import exportControlsCss from '../export-controls.css?url'
import sidebarCss from '../sidebar.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'NiteOwl Inventory',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'stylesheet',
        href: exportControlsCss,
      },
      {
        rel: 'stylesheet',
        href: sidebarCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  useEffect(() => {
    function wireSidebarToggle() {
      const brandIcons = Array.from(document.querySelectorAll<HTMLElement>('.inventory-brand-icon'))

      brandIcons.forEach((brandIcon) => {
        if (brandIcon.dataset.sidebarToggleWired === 'true') return

        brandIcon.dataset.sidebarToggleWired = 'true'
        brandIcon.setAttribute('role', 'button')
        brandIcon.setAttribute('tabindex', '0')
        brandIcon.setAttribute('title', 'Collapse or expand sidebar')
        brandIcon.setAttribute('aria-label', 'Collapse or expand sidebar')

        function toggleSidebar(event: Event) {
          event.preventDefault()
          event.stopPropagation()
          brandIcon.closest('.inventory-shell')?.classList.toggle('is-sidebar-collapsed')
        }

        brandIcon.addEventListener('click', toggleSidebar)
        brandIcon.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') toggleSidebar(event)
        })
      })
    }

    wireSidebarToggle()

    const observer = new MutationObserver(wireSidebarToggle)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}

        <Scripts />
      </body>
    </html>
  )
}
