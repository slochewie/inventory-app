import { createFileRoute } from '@tanstack/react-router'
import { LiquorModMasterPage } from '#/components/liquor-mod-master-page'

export const Route = createFileRoute('/master-bar-prep')({
  component: MasterBarPrepRoute,
})

function MasterBarPrepRoute() {
  return (
    <LiquorModMasterPage
      currentPath="/master-bar-prep"
      type="bar_prep"
      title="Master Bar Prep"
      singular="Bar Prep Modifier"
      description="Manage the shared Bar Prep modifier catalog used by every organization."
    />
  )
}
