import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { OrganizationSelector } from "@niteowl/ui"

import { InventorySidebar } from "#/inventory-sidebar"
import { authBaseURL, authClient } from "#/lib/auth-client"
import { getInventoryAccess } from "#/lib/inventory-access"

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
  const [accessState, setAccessState] = useState<
    "idle" | "checking" | "allowed" | "denied" | "error"
  >("idle")
  const [allowedOrganizationIds, setAllowedOrganizationIds] = useState<Set<string> | null>(null)

  const visibleOrganizations = (organizations ?? []).filter((organization) =>
    allowedOrganizationIds?.has(organization.id) ?? false,
  )

  useEffect(() => {
    if (!session || areOrganizationsPending) {
      setAllowedOrganizationIds(null)
      return
    }

    const controller = new AbortController()

    void Promise.all(
      (organizations ?? []).map(async (organization) => {
        try {
          const access = await getInventoryAccess(
            organization.id,
            controller.signal,
          )

          return access.allowed ? organization.id : null
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error
          }

          return null
        }
      }),
    )
      .then((organizationIds) => {
        if (controller.signal.aborted) return

        setAllowedOrganizationIds(
          new Set(
            organizationIds.filter(
              (organizationId): organizationId is string =>
                organizationId !== null,
            ),
          ),
        )
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setAllowedOrganizationIds(new Set())
      })

    return () => controller.abort()
  }, [areOrganizationsPending, organizations, session])

  useEffect(() => {
    if (
      !session ||
      areOrganizationsPending ||
      isActiveOrganizationPending ||
      allowedOrganizationIds === null
    ) {
      return
    }

    const activeIsAllowed =
      !!activeOrganization &&
      allowedOrganizationIds.has(activeOrganization.id)

    if (activeIsAllowed) return

    const nextOrganization = visibleOrganizations[0]
    if (!nextOrganization) return

    void authClient.organization.setActive({
      organizationId: nextOrganization.id,
    })
  }, [
    activeOrganization,
    allowedOrganizationIds,
    areOrganizationsPending,
    isActiveOrganizationPending,
    session,
    visibleOrganizations,
  ])

  useEffect(() => {
    if (isSessionPending || session || typeof window === "undefined") return

    const signInUrl = new URL("/auth/sign-in", authBaseURL)
    signInUrl.searchParams.set("callbackURL", window.location.href)
    window.location.assign(signInUrl.toString())
  }, [isSessionPending, session])


  useEffect(() => {
    if (!session || !activeOrganization?.id) {
      setAccessState("idle")
      return
    }

    const controller = new AbortController()
    setAccessState("checking")

    void getInventoryAccess(activeOrganization.id, controller.signal)
      .then((result) => {
        setAccessState(result.allowed ? "allowed" : "denied")
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setAccessState("error")
      })

    return () => controller.abort()
  }, [activeOrganization?.id, session])

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
              organizations={visibleOrganizations}
              value={
                activeOrganization &&
                allowedOrganizationIds?.has(activeOrganization.id)
                  ? activeOrganization.id
                  : undefined
              }
              loading={
                areOrganizationsPending ||
                isActiveOrganizationPending ||
                allowedOrganizationIds === null
              }
              className="inventory-auth-organization-selector"
              onValueChange={(organizationId) => {
                void authClient.organization.setActive({ organizationId })
              }}
            />

            <details className="inventory-account-menu">
              <summary
                className="inventory-auth-account"
                title={displayName}
                aria-label={`Open account menu for ${displayName}`}
              >
                {session.user.image ? (
                  <img src={session.user.image} alt="" />
                ) : (
                  initials
                )}
              </summary>

              <div className="inventory-account-menu-content">
                <div className="inventory-account-menu-user">
                  <strong>{displayName}</strong>
                  <span>{session.user.email}</span>
                </div>

                <div className="inventory-account-menu-separator" />

                <a href={`${authBaseURL}/settings/account`}>Account</a>
                <a href={`${authBaseURL}/settings/security`}>Security</a>
                <a href={`${authBaseURL}/settings/organizations`}>Organizations</a>
                <a href={`${authBaseURL}/settings`}>Settings</a>

                <div className="inventory-account-menu-separator" />

                <button
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
            </details>
          </div>
        </header>

        <div className="inventory-authenticated-content">
          {accessState === "allowed" ? (
            children
          ) : accessState === "denied" ? (
            <section className="inventory-auth-state">
              <h1>Inventory access required</h1>
              <p>
                Your account does not have Inventory access for this organization.
                Select another organization or contact an organization administrator.
              </p>
            </section>
          ) : accessState === "error" ? (
            <section className="inventory-auth-state">
              <h1>Unable to verify Inventory access</h1>
              <p>Refresh the page and try again.</p>
            </section>
          ) : (
            <section className="inventory-auth-state">
              <p>Checking Inventory access…</p>
            </section>
          )}
        </div>
      </section>
    </main>
  )
}
