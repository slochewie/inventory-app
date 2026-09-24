import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { NiteOwlUserAvatar, OrganizationSelector } from "@niteowl/ui"
import {
  ArrowRightLeftIcon,
  CheckIcon,
  LogOutIcon,
  PlusCircleIcon,
  SettingsIcon,
} from "lucide-react"

import { InventorySidebar } from "#/inventory-sidebar"
import { authBaseURL, authClient } from "#/lib/auth-client"
import { getInventoryAccess } from "#/lib/inventory-access"


type InventoryRole = "viewer" | "staff" | "manager" | "admin"

export function useInventoryAccessRole() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [role, setRole] = useState<InventoryRole | null>(null)

  useEffect(() => {
    if (!activeOrganization?.id) {
      setRole(null)
      return
    }

    const controller = new AbortController()

    void getInventoryAccess(activeOrganization.id, controller.signal)
      .then((result) => {
        setRole(result.allowed ? result.role : null)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setRole(null)
      })

    return () => controller.abort()
  }, [activeOrganization?.id])

  return {
    role,
    loading: role === null,
    canImportExport: role !== null && role !== "viewer",
    canEdit: role === "manager" || role === "admin",
    canManageAssignments: role === "admin",
  }
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
  const {
    role: inventoryRole,
    canImportExport,
    canManageAssignments,
  } = useInventoryAccessRole()
  const [allowedOrganizationIds, setAllowedOrganizationIds] = useState<Set<string> | null>(null)
  const [deviceSessions, setDeviceSessions] = useState<Array<{
    session: { token: string }
    user: {
      id: string
      name?: string | null
      email: string
      image?: string | null
    }
  }>>([])
  const [switchingToken, setSwitchingToken] = useState<string | null>(null)
  const accountMenuRef = useRef<HTMLDetailsElement>(null)

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
    if (!session) {
      setDeviceSessions([])
      return
    }

    let cancelled = false

    void authClient.multiSession.listDeviceSessions().then(({ data }) => {
      if (cancelled) return
      setDeviceSessions((data ?? []) as typeof deviceSessions)
    })

    return () => {
      cancelled = true
    }
  }, [session])

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

  useEffect(() => {
    function closeAccountMenu(event: MouseEvent) {
      const menu = accountMenuRef.current
      if (!menu?.open) return

      if (event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false
      }
    }

    function closeAccountMenuOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return

      const menu = accountMenuRef.current
      if (!menu?.open) return

      menu.open = false
      menu.querySelector<HTMLElement>("summary")?.focus()
    }

    document.addEventListener("mousedown", closeAccountMenu)
    document.addEventListener("keydown", closeAccountMenuOnEscape)

    return () => {
      document.removeEventListener("mousedown", closeAccountMenu)
      document.removeEventListener("keydown", closeAccountMenuOnEscape)
    }
  }, [])

  if (isSessionPending || !session) {
    return (
      <main className="inventory-auth-loading">
        <p>Checking Inventory access…</p>
      </main>
    )
  }

  const displayName = session.user.name || session.user.email

  async function switchAccount(sessionToken: string, userId: string) {
    if (userId === session.user.id || switchingToken) return

    setSwitchingToken(sessionToken)
    const { error } = await authClient.multiSession.setActive({ sessionToken })

    if (error) {
      setSwitchingToken(null)
      return
    }

    window.location.reload()
  }

  function addAccount() {
    const signInUrl = new URL("/auth/sign-in", authBaseURL)
    signInUrl.searchParams.set("redirectTo", window.location.href)
    window.location.assign(signInUrl.toString())
  }

  return (
    <main className="inventory-shell">
      <InventorySidebar
        currentPath={currentPath}
        canImportExport={canImportExport}
        canManageAssignments={canManageAssignments}
      />

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

            <details ref={accountMenuRef} className="inventory-account-menu">
              <summary
                className="inventory-auth-account"
                title={displayName}
                aria-label={`Open account menu for ${displayName}`}
              >
                <NiteOwlUserAvatar user={session.user} />
              </summary>

              <div className="inventory-account-menu-content">
                <div className="inventory-account-menu-user">
                  <NiteOwlUserAvatar user={session.user} />
                  <div>
                    <strong>{displayName}</strong>
                    <span>{session.user.email}</span>
                  </div>
                </div>

                <div className="inventory-account-menu-separator" />

                <a href={`${authBaseURL}/settings/account`}>
                  <SettingsIcon />
                  Settings
                </a>

                <details className="inventory-account-switcher">
                  <summary>
                    <ArrowRightLeftIcon />
                    <span>Switch Account</span>
                    <span className="inventory-account-switcher-chevron">›</span>
                  </summary>

                  <div className="inventory-account-switcher-content">
                    {deviceSessions.map((deviceSession) => {
                      const accountName =
                        deviceSession.user.name || deviceSession.user.email
                      const current = deviceSession.user.id === session.user.id
                      const switching =
                        switchingToken === deviceSession.session.token

                      return (
                        <button
                          key={deviceSession.session.token}
                          type="button"
                          disabled={current || Boolean(switchingToken)}
                          onClick={() =>
                            void switchAccount(
                              deviceSession.session.token,
                              deviceSession.user.id,
                            )
                          }
                        >
                          <NiteOwlUserAvatar user={deviceSession.user} />
                          <span className="inventory-account-switcher-user">
                            <strong>{accountName}</strong>
                            <small>{deviceSession.user.email}</small>
                          </span>
                          {current ? <CheckIcon /> : null}
                          {switching ? <small>Switching…</small> : null}
                        </button>
                      )
                    })}

                    <div className="inventory-account-menu-separator" />

                    <button type="button" onClick={addAccount}>
                      <PlusCircleIcon />
                      Add Account
                    </button>
                  </div>
                </details>

                <div className="inventory-account-menu-separator" />

                <button
                  type="button"
                  onClick={() => {
                    void authClient.signOut().then(() => {
                      window.location.assign(`${authBaseURL}/auth/sign-in`)
                    })
                  }}
                >
                  <LogOutIcon />
                  Sign Out
                </button>
              </div>
            </details>
          </div>
        </header>

        <div className="inventory-authenticated-content">
          {accessState === "allowed" && inventoryRole ? (
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
