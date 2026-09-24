import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AuthenticatedInventoryShell } from '#/components/authenticated-inventory-shell'
import { authClient } from '#/lib/auth-client'
import {
  listInventoryAssignments,
  updateInventoryAssignment,
  type InventoryAssignment,
  type InventoryRole,
} from '#/lib/inventory-access'

export const Route = createFileRoute('/assignments')({ component: InventoryAssignments })

const ROLE_OPTIONS: InventoryRole[] = ['viewer', 'staff', 'manager', 'admin']

function InventoryAssignments() {
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [assignments, setAssignments] = useState<InventoryAssignment[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  async function reload() {
    if (!activeOrganization?.id) return
    setLoading(true)
    setError(null)

    try {
      setAssignments(await listInventoryAssignments(activeOrganization.id))
    } catch (nextError) {
      setAssignments([])
      setError(nextError instanceof Error ? nextError.message : 'Unable to load Inventory assignments.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [activeOrganization?.id])

  const filteredAssignments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return assignments

    return assignments.filter((assignment) =>
      assignment.name.toLowerCase().includes(normalizedQuery) ||
      assignment.email.toLowerCase().includes(normalizedQuery),
    )
  }, [assignments, query])

  async function saveAssignment(
    assignment: InventoryAssignment,
    patch: { enabled?: boolean; role?: InventoryRole },
  ) {
    if (!activeOrganization?.id || updatingUserId) return

    setUpdatingUserId(assignment.userId)
    setError(null)

    try {
      await updateInventoryAssignment({
        organizationId: activeOrganization.id,
        userId: assignment.userId,
        ...patch,
      })
      await reload()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update Inventory assignment.')
    } finally {
      setUpdatingUserId(null)
    }
  }

  return (
    <AuthenticatedInventoryShell currentPath="/assignments">
      <section className="inventory-content">
        <header className="inventory-hero">
          <p className="inventory-kicker">Assignments</p>
          <h1>Inventory access</h1>
          <p>Manage who can use Inventory and which application role each employee has.</p>
        </header>

        <section className="inventory-card inventory-table-card">
          <div className="inventory-table-heading">
            <div>
              <h2>Organization members</h2>
              <p>{assignments.length.toLocaleString()} members.</p>
            </div>
            <input
              className="inventory-input"
              type="search"
              value={query}
              placeholder="Search employees"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {error ? <p className="inventory-error">{error}</p> : null}
          {loading ? <p>Loading assignments…</p> : null}

          {!loading && filteredAssignments.length > 0 ? (
            <div className="inventory-table-scroll">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Access</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((assignment) => {
                    const updating = updatingUserId === assignment.userId

                    return (
                      <tr key={assignment.userId}>
                        <td>
                          <strong>{assignment.name}</strong>
                          <div>{assignment.email}</div>
                        </td>
                        <td>
                          <button
                            className="inventory-template-download"
                            type="button"
                            disabled={updating || !assignment.canUpdateAccess}
                            onClick={() => void saveAssignment(assignment, {
                              enabled: !assignment.enabled,
                            })}
                          >
                            {updating ? 'Saving…' : assignment.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        <td>
                          <select
                            className="inventory-input"
                            value={assignment.role}
                            disabled={updating || !assignment.canUpdateRole}
                            onChange={(event) => void saveAssignment(assignment, {
                              role: event.target.value as InventoryRole,
                            })}
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {role[0].toUpperCase() + role.slice(1)}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </section>
    </AuthenticatedInventoryShell>
  )
}
