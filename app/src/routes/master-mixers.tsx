import { createFileRoute } from '@tanstack/react-router'
import { LiquorModMasterPage } from '#/components/liquor-mod-master-page'

export const Route = createFileRoute('/master-mixers')({
  component: MasterMixersRoute,
})

function MasterMixersRoute() {
  return (
    <LiquorModMasterPage
      currentPath="/master-mixers"
      type="mixer"
      title="Master Mixers"
      singular="Mixer"
      description="Manage the shared Mixer catalog used by every organization."
    />
  )
}
