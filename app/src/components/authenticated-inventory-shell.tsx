import type { ReactNode } from "react"
import { useEffect } from "react"
import { OrganizationSelector } from "@niteowl/ui"

import { InventorySidebar } from "#/inventory-sidebar"
import { authBaseURL, authClient } from "#/lib/auth-client"

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?"

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function AuthenticatedInventoryShell({
  currentPath,
  children,
}: {
  currentPath: string
  children: ReactNode
}) {
  const { data: session, isPending: isSessionPending } = authClient.useSession()
  const { data: organizations, isPending: areOrganizationsPending } =
    authClient.useListOrganizations()
  const { data: activeOrganization, isPending: isActiveOrganizationPending } =
    authClient.useActiveOrganization()

  useEffect(() => {
    if (
      !session ||
      areOrganizationsPending ||
      isActiveOrganizationPending ||
      activeOrganization ||
      organizations?.length !== 1
    ) {
      return
    }

    void authClient.organization.setActive({
      organizationId: organizations[0].id,
    })
  }, [
    activeOrganization,
    areOrganizationsPending,
    isActiveOrganizationPending,
    organizations,
    session,
  ])

  useEffect(() => {
    if (isSessionPending || session || typeof window === "undefined") return

    const signInUrl = new URL("/auth/sign-in", authBaseURL)
    signInUrl.searchParams.set("callbackURL", window.location.href)
    window.location.assign(signInUrl.toString())
  }, [isSessionPending, session])

  if (isSessionPending || !session) {
    return (
      <main className="inventory-auth-loading">
        <p>Checking Inventory access…</p>
      </main>
    )
  }

  const displayName = session.user.name || session.user.email
  const initials = getInitials(displayName)

  return (
    <main className="inventory-shell">
      <InventorySidebar currentPath={currentPath} />

      <section className="inventory-authenticated-main">
        <header className="inventory-auth-header">
          <a className="inventory-auth-header-title" href="/">
            Inventory
          </a>

          <div className="inventory-auth-header-actions">
            <OrganizationSelector
              variant="compact"
              organizations={organizations ?? []}
              value={activeOrganization?.id}
              loading={areOrganizationsPending || isActiveOrganizationPending}
              className="inventory-auth-organization-selector"
              onValueChange={(organizationId) => {
                void authClient.organization.setActive({ organizationId })
              }}
            />

            <a
              className="inventory-auth-account"
              href={`${authBaseURL}/settings/account`}
              title={displayName}
              aria-label={`Open account settings for ${displayName}`}
            >
              {initials}
            </a>

            <button
              className="inventory-auth-signout"
              type="button"
              onClick={() => {
                void authClient.signOut().then(() => {
                  window.location.assign(`${authBaseURL}/auth/sign-in`)
                })
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="inventory-authenticated-content">{children}</div>
      </section>
    </main>
  )
}
