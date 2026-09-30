import {
  appDefinitionsById,
  buildNavigation,
  getDefaultAppUrls,
  getDeploymentBrand,
} from "@niteowl/app-config"
import {
  AppSidebarIdentity,
  NiteOwlNavigationIcon,
  useCurrentHostname,
} from "@niteowl/ui"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "#/components/ui/sidebar.tsx"

const INVENTORY_APP = appDefinitionsById.inventory

function SidebarIdentityToggle({
  href,
  brand,
}: {
  href: string
  brand: string
}) {
  const { toggleSidebar } = useSidebar()

  return (
    <AppSidebarIdentity
      href={href}
      brand={brand}
      appName={INVENTORY_APP.label}
      onToggle={toggleSidebar}
    />
  )
}

export function InventorySidebar({
  currentPath,
  canImportExport = false,
  canEdit = false,
  canManageAssignments = false,
}: {
  currentPath: string
  canImportExport?: boolean
  canEdit?: boolean
  canManageAssignments?: boolean
}) {
  const hostname = useCurrentHostname()
  const appLinks = hostname ? getDefaultAppUrls(hostname) : null
  const brand = hostname ? getDeploymentBrand(hostname) : null
  const navigation = appLinks
    ? buildNavigation({
        currentApp: "inventory",
        currentPath,
        urls: appLinks,
        canAccess: ({ key }) => {
          if (key === "inventory:manage-assignments") {
            return canManageAssignments
          }

          if (key === "inventory:import-export") {
            return canImportExport
          }

          if (key === "inventory:edit") {
            return canEdit
          }

          return true
        },
      })
    : null

  const primarySection = navigation?.primary[0]
  const appsSection = navigation?.apps[0]
  const currentHref = appLinks
    ? `${appLinks.inventory.replace(/\/$/, "")}${currentPath}`
    : null

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {currentHref && brand ? (
          <SidebarIdentityToggle href={currentHref} brand={brand} />
        ) : (
          <div className="h-12" aria-hidden="true" />
        )}
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {primarySection ? (
          <SidebarGroup>
            {primarySection.label ? (
              <SidebarGroupLabel>{primarySection.label}</SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {primarySection.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={item.active}
                      tooltip={item.label}
                      onClick={() => window.location.assign(item.href)}
                    >
                      <NiteOwlNavigationIcon icon={item.icon} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarSeparator />

        {appsSection ? (
          <SidebarGroup>
            {appsSection.label ? (
              <SidebarGroupLabel className="text-sm">
                {appsSection.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {appsSection.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      onClick={() => window.location.assign(item.href)}
                    >
                      <NiteOwlNavigationIcon icon={item.icon} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
    </Sidebar>
  )
}
