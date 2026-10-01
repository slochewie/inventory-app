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
import { Martini } from "lucide-react"

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

function ToastBrandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="11" fill="#ff4c00" />
      <path
        d="M7.25 16.5c-.55-1.05-.65-2.9-.65-4.5 0-1.35.7-2.55 1.8-3.25-.5-.45-.8-1-.8-1.6 0-1.5 1.95-2.65 4.4-2.65s4.4 1.15 4.4 2.65c0 .6-.3 1.15-.8 1.6 1.1.7 1.8 1.9 1.8 3.25 0 1.6-.1 3.45-.65 4.5-.45.85-1.25 1.15-2.05.95a11.7 11.7 0 0 0-5.4 0c-.8.2-1.6-.1-2.05-.95Z"
        fill="none"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
  canManageMasterCatalog = false,
}: {
  currentPath: string
  canImportExport?: boolean
  canEdit?: boolean
  canManageAssignments?: boolean
  canManageMasterCatalog?: boolean
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

          if (key === "inventory:manage-master-catalog") {
            return canManageMasterCatalog
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
  const basePrimaryItems =
    primarySection?.items.filter((item) => item.label !== "Menu Categories") ?? []
  const liquorModsItem = appLinks
    ? ({
        id: "inventory:liquor-mods",
        label: "Liquor Mods",
        href: `${appLinks.inventory.replace(/\/$/, "")}/liquor-mods`,
        active: currentPath === "/liquor-mods",
        icon: "martini",
      } as (typeof basePrimaryItems)[number])
    : null
  const primaryItems = liquorModsItem
    ? insertLiquorModsItem(basePrimaryItems, liquorModsItem)
    : basePrimaryItems
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
        {primarySection && primaryItems.length ? (
          <SidebarGroup>
            {primarySection.label ? (
              <SidebarGroupLabel>{primarySection.label}</SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={item.active}
                      tooltip={item.label}
                      onClick={() => window.location.assign(item.href)}
                    >
                      {item.label === "Export to Toast" ? (
                        <ToastBrandIcon />
                      ) : ["Cocktails", "Liquor Mods"].includes(item.label) ? (
                        <Martini className="size-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <NiteOwlNavigationIcon icon={item.icon} />
                      )}
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
                      {item.label === "Export to Toast" ? (
                        <ToastBrandIcon />
                      ) : ["Cocktails", "Liquor Mods"].includes(item.label) ? (
                        <Martini className="size-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <NiteOwlNavigationIcon icon={item.icon} />
                      )}
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

function insertLiquorModsItem<T extends { label: string }>(items: T[], item: T) {
  if (items.some((existing) => existing.label === item.label)) return items

  const cocktailsIndex = items.findIndex((existing) => existing.label === "Cocktails")
  if (cocktailsIndex === -1) return [...items, item]

  return [
    ...items.slice(0, cocktailsIndex + 1),
    item,
    ...items.slice(cocktailsIndex + 1),
  ]
}
