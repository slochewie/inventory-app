import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { buildToastExportFiles } from './toast-export'
import { getToastWorkbookCategory } from './workbook-routing'
import {
  buildPopulatedToastTemplateWorkbook,
  validatePopulatedBeerWorkbook,
  type OptionalBeerCategoryOptions,
  type ToastDraftSlotMapping,
} from './toast-template-workbook'
import type { NormalizedMenuItem } from './types'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const WORKBOOK_PATH = 'xl/workbook.xml'
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels'
const CONTENT_TYPES_PATH = '[Content_Types].xml'
const SPREADSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'
const WORKSHEET_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'
const WORKSHEET_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
const DRAWING_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
const DRAWING_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.drawing+xml'
const DATA_ROW_BUFFER = 20

const DEFAULT_HAPPY_HOUR_DAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const

const HAPPY_HOUR_NOTE_ROWS = DEFAULT_HAPPY_HOUR_DAYS.map((day, index) => ({
  day,
  rowNumber: 20 + index,
}))


type WorkbookPackage = {
  files: Record<string, Uint8Array>
  sharedStrings: string[]
  workbook: Document
  workbookRelationships: Document
}

type WorkbookSheet = {
  name: string
  path: string
}

type LiquorRow = {
  itemName: string
  basePrice: number | null
  happyHourPrice: number | null
  liquorType: string
}

type LiquorSlot = {
  label: string
  kind: string
  categoryCol: number
  nameCol: number
  priceCol: number
  happyHourCol: number | null
  doubleCol: number | null
}

type LiquorTemplateMapping = {
  sheetPath: string
  sheetName: string
  categoryRow: number
  headerRow: number
  dataStartRow: number
  lastTemplateRow: number
  slots: LiquorSlot[]
}

type SimpleMenuRow = {
  itemName: string
  basePrice: number | null
  happyHourPrice: number | null
  description: string
  menuGroup: string
}

type SimpleSheetMapping = {
  sheetPath: string
  sheetName: string
  headerRow: number
  dataStartRow: number
  lastTemplateRow: number
  nameCol: number
  priceCol: number
  descriptionCol: number | null
  groupCol: number | null
  happyHourCol: number | null
}

export async function buildPopulatedToastTemplateWorkbookWithLiquorAsync({
  templateArrayBuffer,
  items,
  happyHourEnabled = true,
  happyHourStart = null,
  happyHourEnd = null,
  happyHourDays = DEFAULT_HAPPY_HOUR_DAYS,
  happyHourRange2Enabled = false,
  happyHourRange2Start = null,
  happyHourRange2End = null,
  happyHourRange2Days = DEFAULT_HAPPY_HOUR_DAYS,
  draftSlotMappings,
  optionalBeerCategories,
  builtInFormatVisibility,
}: {
  templateArrayBuffer: ArrayBuffer
  items: NormalizedMenuItem[]
  happyHourEnabled?: boolean
  happyHourStart?: string | null
  happyHourEnd?: string | null
  happyHourDays?: readonly string[]
  happyHourRange2Enabled?: boolean
  happyHourRange2Start?: string | null
  happyHourRange2End?: string | null
  happyHourRange2Days?: readonly string[]
  draftSlotMappings?: readonly ToastDraftSlotMapping[]
  optionalBeerCategories?: readonly OptionalBeerCategoryOptions[]
  builtInFormatVisibility?: BeerBuiltInFormatVisibility
}) {
  const beerPopulatedWorkbook = buildPopulatedToastTemplateWorkbook({
    templateArrayBuffer,
    items,
    happyHourEnabled,
    draftSlotMappings,
    optionalBeerCategories,
    builtInFormatVisibility,
  })
  const beerWorkbookBuffer = await beerPopulatedWorkbook.arrayBuffer()
  const workbookPackage = readWorkbookPackage(beerWorkbookBuffer)

  populateLiquorSheet(workbookPackage, items, happyHourEnabled)
  populateCocktailsSheet(workbookPackage, items, happyHourEnabled)
  // Retail and Open Items duplicate the pristine NA Bev sheet when needed,
  // so create them before writing NA Bev rows into the source worksheet.
  populateRetailSheet(workbookPackage, items)
  populateOpenItemsSheet(workbookPackage, items)
  populateNaBevSheet(workbookPackage, items)
  populateHappyHourNotesSheet(
    workbookPackage,
    happyHourEnabled,
    happyHourStart,
    happyHourEnd,
    happyHourDays,
    happyHourRange2Enabled,
    happyHourRange2Start,
    happyHourRange2End,
    happyHourRange2Days,
  )
  moveNotesSheetToEnd(workbookPackage)

  return new Blob([zipSync(workbookPackage.files, { level: 6 })], { type: XLSX_MIME })
}

export function validatePopulatedToastTemplateWorkbookWithLiquor({
  workbookArrayBuffer,
  items,
  happyHourEnabled = true,
  happyHourStart = null,
  happyHourEnd = null,
  happyHourDays = DEFAULT_HAPPY_HOUR_DAYS,
  happyHourRange2Enabled = false,
  happyHourRange2Start = null,
  happyHourRange2End = null,
  happyHourRange2Days = DEFAULT_HAPPY_HOUR_DAYS,
  draftSlotMappings,
  optionalBeerCategories,
  builtInFormatVisibility,
}: {
  workbookArrayBuffer: ArrayBuffer
  items: NormalizedMenuItem[]
  happyHourEnabled?: boolean
  happyHourStart?: string | null
  happyHourEnd?: string | null
  happyHourDays?: readonly string[]
  happyHourRange2Enabled?: boolean
  happyHourRange2Start?: string | null
  happyHourRange2End?: string | null
  happyHourRange2Days?: readonly string[]
  draftSlotMappings?: readonly ToastDraftSlotMapping[]
  optionalBeerCategories?: readonly OptionalBeerCategoryOptions[]
  builtInFormatVisibility?: BeerBuiltInFormatVisibility
}) {
  const beer = validatePopulatedBeerWorkbook({
    workbookArrayBuffer,
    items,
    happyHourEnabled,
    draftSlotMappings,
    optionalBeerCategories,
    builtInFormatVisibility,
  })
  const workbookPackage = readWorkbookPackage(workbookArrayBuffer)
  const mapping = getLiquorTemplateMapping(workbookPackage)
  const sheetDoc = parseXml(getTextFile(workbookPackage.files, mapping.sheetPath))
  const rowsByKind = groupLiquorRowsByKind(getLiquorRows(items, happyHourEnabled))
  const issues = [...beer.issues]
  let liquorRows = 0

  mapping.slots.forEach((slot) => {
    const rows = rowsByKind.get(slot.kind) ?? []
    liquorRows += rows.length

    rows.forEach((row, index) => {
      const rowNumber = mapping.dataStartRow + index
      validateLiquorCell(issues, sheetDoc, workbookPackage.sharedStrings, slot.nameCol, rowNumber, row.itemName, row.itemName + ' Liquor name')
      validateLiquorCell(issues, sheetDoc, workbookPackage.sharedStrings, slot.priceCol, rowNumber, row.basePrice, row.itemName + ' Liquor price')
      if (slot.happyHourCol) {
        validateLiquorCell(issues, sheetDoc, workbookPackage.sharedStrings, slot.happyHourCol, rowNumber, row.happyHourPrice, row.itemName + ' Liquor Happy Hour')
      }
    })
  })

  const cocktails = validateCocktailsSheet(
    workbookPackage,
    items,
    happyHourEnabled,
    issues,
  )
  const retail = validateRetailSheet(workbookPackage, items, issues)
  const openItems = validateOpenItemsSheet(workbookPackage, items, issues)
  const naBev = validateNaBevSheet(workbookPackage, items, issues)

  const happyHourNotes = validateHappyHourNotesSheet(
    workbookPackage,
    happyHourEnabled,
    happyHourStart,
    happyHourEnd,
    happyHourDays,
    happyHourRange2Enabled,
    happyHourRange2Start,
    happyHourRange2End,
    happyHourRange2Days,
  )
  issues.push(...happyHourNotes.issues)

  return {
    valid: issues.length === 0,
    issues,
    beer: {
      draftRows: beer.draftRows,
      canRows: beer.canRows,
      bottleSlotRows: beer.bottleSlotRows,
      optionalBeerCategory1Rows: beer.optionalBeerCategory1Rows,
      optionalBeerCategoryRows: beer.optionalBeerCategoryRows,
    },
    liquorRows,
    cocktailRows: cocktails,
    naBevRows: naBev,
    retailRows: retail,
    openItemsRows: openItems,
    happyHourNotes: happyHourNotes.valid,
  }
}

function populateCocktailsSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
  happyHourEnabled: boolean,
) {
  const rows = getCocktailRows(items, happyHourEnabled)
  if (rows.length === 0) return

  const mapping = getSimpleSheetMapping(workbookPackage, 'Cocktails')
  writeSimpleMenuRows(workbookPackage, mapping, rows)
}

function populateNaBevSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
) {
  const rows = getNaBevRows(items)
  if (rows.length === 0) return

  const mapping = getSimpleSheetMapping(workbookPackage, 'NA Bev')
  writeSimpleMenuRows(workbookPackage, mapping, rows)
}

function populateRetailSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
) {
  const rows = getRetailRows(items)
  if (rows.length === 0) return

  ensureSimpleClonedSheet(workbookPackage, 'Retail')
  const mapping = getSimpleSheetMapping(workbookPackage, 'Retail')
  writeSimpleMenuRows(workbookPackage, mapping, rows)
}

function populateOpenItemsSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
) {
  const rows = getOpenItemsRows(items)
  if (rows.length === 0) return

  ensureSimpleClonedSheet(workbookPackage, 'Open Items')
  const mapping = getSimpleSheetMapping(workbookPackage, 'Open Items')
  writeSimpleMenuRows(workbookPackage, mapping, rows)
}

function getCocktailRows(
  items: NormalizedMenuItem[],
  happyHourEnabled: boolean,
): SimpleMenuRow[] {
  return items
    .filter(
      (item) =>
        item.exportIncluded &&
        item.basePriceCents !== null &&
        (
          /cocktail/i.test(clean(item.toastDestination)) ||
          /cocktail/i.test(clean(item.toastCategory))
        ),
    )
    .map((item) => ({
      itemName: clean(item.name),
      basePrice: item.basePriceCents! / 100,
      happyHourPrice:
        happyHourEnabled && item.happyHourPriceCents !== null
          ? item.happyHourPriceCents / 100
          : null,
      description: clean(item.rawRows[0]?.description),
      menuGroup: getSimpleMenuGroup(item, 'Cocktails'),
    }))
    .filter((row) => row.itemName)
    .sort((left, right) => left.itemName.localeCompare(right.itemName))
}

function getNaBevRows(items: NormalizedMenuItem[]): SimpleMenuRow[] {
  return getSimpleCategoryRows(items, 'NA Bev')
}

function getRetailRows(items: NormalizedMenuItem[]): SimpleMenuRow[] {
  return getSimpleCategoryRows(items, 'Retail')
}

function getOpenItemsRows(items: NormalizedMenuItem[]): SimpleMenuRow[] {
  return getSimpleCategoryRows(items, 'Open Items')
}

function getSimpleCategoryRows(
  items: NormalizedMenuItem[],
  workbookCategory: 'NA Bev' | 'Retail' | 'Open Items',
): SimpleMenuRow[] {
  return items
    .filter(
      (item) =>
        item.exportIncluded &&
        (workbookCategory === 'Open Items' || item.basePriceCents !== null) &&
        matchesSimpleWorkbookDestination(item, workbookCategory),
    )
    .map((item) => ({
      itemName: clean(item.name),
      basePrice:
        item.basePriceCents === null
          ? null
          : item.basePriceCents / 100,
      happyHourPrice: null,
      description: clean(
        item.rawRows[0]?.description ??
          item.rawRows[0]?.Description,
      ),
      menuGroup: getSimpleMenuGroup(item, workbookCategory),
    }))
    .filter((row) => row.itemName)
    .sort((left, right) => left.itemName.localeCompare(right.itemName))
}

function getSimpleMenuGroup(
  item: NormalizedMenuItem,
  workbookCategory: 'Cocktails' | 'NA Bev' | 'Retail' | 'Open Items',
) {
  const rawGroup = clean(
    item.rawRows[0]?.Group ??
      item.rawRows[0]?.group ??
      item.rawRows[0]?.menuGroup ??
      item.rawRows[0]?.['Menu Group'] ??
      item.rawRows[0]?.['Menu Group Name'],
  )
  if (rawGroup) return rawGroup

  const visibleCategory = clean(item.category)
  if (
    visibleCategory &&
    !matchesWorkbookCategoryLabel(visibleCategory, workbookCategory)
  ) {
    return visibleCategory
  }

  const toastCategory = clean(item.toastCategory)
  if (
    toastCategory &&
    !matchesWorkbookCategoryLabel(toastCategory, workbookCategory)
  ) {
    return toastCategory
  }

  return workbookCategory
}

function matchesSimpleWorkbookDestination(
  item: NormalizedMenuItem,
  workbookCategory: 'NA Bev' | 'Retail' | 'Open Items',
) {
  const routedCategory = getToastWorkbookCategory(item)
  if (routedCategory !== null) {
    return routedCategory === workbookCategory
  }

  const destination = clean(item.toastDestination)

  if (workbookCategory === 'NA Bev') {
    return /^(?:toast\s+)?na\s*bev(?:\s+tab)?(?:\b|:)/i.test(destination)
      || matchesWorkbookCategoryLabel(clean(item.category), workbookCategory)
      || matchesWorkbookCategoryLabel(clean(item.toastCategory), workbookCategory)
  }

  if (workbookCategory === 'Retail') {
    return /^(?:toast\s+)?retail(?:\s+tab)?(?:\b|:)/i.test(destination)
      || matchesWorkbookCategoryLabel(clean(item.category), workbookCategory)
      || matchesWorkbookCategoryLabel(clean(item.toastCategory), workbookCategory)
  }

  return /^(?:toast\s+)?open\s*items?(?:\s+tab)?(?:\b|:)/i.test(destination)
    || matchesWorkbookCategoryLabel(clean(item.category), workbookCategory)
    || matchesWorkbookCategoryLabel(clean(item.toastCategory), workbookCategory)
}

function matchesWorkbookCategoryLabel(
  value: string,
  workbookCategory: 'Cocktails' | 'NA Bev' | 'Retail' | 'Open Items',
) {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim()

  if (workbookCategory === 'Cocktails') {
    return normalized === 'cocktail' || normalized === 'cocktails'
  }
  if (workbookCategory === 'NA Bev') {
    return (
      normalized === 'na bev' ||
      normalized === 'na beverage' ||
      normalized === 'na beverages'
    )
  }
  if (workbookCategory === 'Retail') return normalized === 'retail'

  return normalized === 'open items' || normalized === 'open item'
}

function getSimpleSheetMapping(
  workbookPackage: WorkbookPackage,
  sheetName: string,
): SimpleSheetMapping {
  const sheet = getWorkbookSheets(workbookPackage).find(
    (candidate) => candidate.name.toLowerCase() === sheetName.toLowerCase(),
  )
  if (!sheet) throw new Error(`Toast template is missing a ${sheetName} tab`)

  const sheetDoc = parseXml(getTextFile(workbookPackage.files, sheet.path))
  let headerRow: number | null = null
  let headerValues: { col: number, value: string }[] = []

  const isCocktails = sheetName.toLowerCase() === 'cocktails'

  for (let rowNumber = 1; rowNumber <= 30; rowNumber += 1) {
    const values = getRowValues(
      sheetDoc,
      rowNumber,
      workbookPackage.sharedStrings,
    )
    const normalized = values.map((cell) => normalizeHeader(cell.value))
    const hasNameHeader = isCocktails
      ? normalized.some((value) => value.includes('cocktail'))
      : normalized.includes('item name')
    const hasPriceHeader = normalized.some((value) =>
      value.startsWith('price'),
    )

    if (hasNameHeader && hasPriceHeader) {
      headerRow = rowNumber
      headerValues = values
      break
    }
  }

  if (headerRow === null) {
    throw new Error(
      isCocktails
        ? 'Cocktails tab is missing the expected Cocktail / Price header'
        : `${sheetName} tab is missing the expected Item Name / Price header`,
    )
  }

  const nameCol =
    headerValues.find((cell) => {
      const header = normalizeHeader(cell.value)
      return isCocktails
        ? header.includes('cocktail')
        : header === 'item name'
    })?.col ?? 1
  const priceCol =
    headerValues.find((cell) => normalizeHeader(cell.value).startsWith('price'))
      ?.col ?? 2
  const descriptionCol =
    headerValues.find((cell) =>
      normalizeHeader(cell.value).includes('description'),
    )?.col ?? null
  const groupCol =
    headerValues.find((cell) => {
      const header = normalizeHeader(cell.value)
      return header.includes('group') || header.includes('menu group')
    })?.col ?? null
  const happyHourCol =
    headerValues.find((cell) =>
      normalizeHeader(cell.value).includes('happy hour'),
    )?.col ?? null

  return {
    sheetPath: sheet.path,
    sheetName: sheet.name,
    headerRow,
    dataStartRow: headerRow + 1,
    lastTemplateRow: getLastWorksheetRow(sheetDoc),
    nameCol,
    priceCol,
    descriptionCol,
    groupCol,
    happyHourCol,
  }
}

function writeSimpleMenuRows(
  workbookPackage: WorkbookPackage,
  mapping: SimpleSheetMapping,
  rows: SimpleMenuRow[],
) {
  const sheetDoc = parseXml(
    getTextFile(workbookPackage.files, mapping.sheetPath),
  )
  const columns = [
    mapping.nameCol,
    mapping.priceCol,
    mapping.descriptionCol,
    mapping.groupCol,
    mapping.happyHourCol,
  ].filter((column): column is number => column !== null)
  const clearToRow = Math.max(
    mapping.lastTemplateRow,
    mapping.dataStartRow + rows.length + DATA_ROW_BUFFER,
  )

  clearCells(
    sheetDoc,
    columns,
    mapping.dataStartRow,
    clearToRow,
  )

  rows.forEach((row, index) => {
    const rowNumber = mapping.dataStartRow + index
    writeCellValue(
      sheetDoc,
      mapping.nameCol,
      rowNumber,
      row.itemName,
      mapping.dataStartRow,
    )
    if (row.basePrice !== null) {
      writeCellValue(
        sheetDoc,
        mapping.priceCol,
        rowNumber,
        row.basePrice,
        mapping.dataStartRow,
      )
    }
    if (mapping.descriptionCol && row.description) {
      writeCellValue(
        sheetDoc,
        mapping.descriptionCol,
        rowNumber,
        row.description,
        mapping.dataStartRow,
      )
    }
    if (mapping.groupCol && row.menuGroup) {
      writeCellValue(
        sheetDoc,
        mapping.groupCol,
        rowNumber,
        row.menuGroup,
        mapping.dataStartRow,
      )
    }
    if (mapping.happyHourCol && row.happyHourPrice !== null) {
      writeCellValue(
        sheetDoc,
        mapping.happyHourCol,
        rowNumber,
        row.happyHourPrice,
        mapping.dataStartRow,
      )
    }
  })

  workbookPackage.files[mapping.sheetPath] = strToU8(serializeXml(sheetDoc))
}

function validateCocktailsSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
  happyHourEnabled: boolean,
  issues: string[],
) {
  const rows = getCocktailRows(items, happyHourEnabled)
  if (rows.length === 0) return 0

  const mapping = getSimpleSheetMapping(workbookPackage, 'Cocktails')
  validateSimpleMenuRows(workbookPackage, mapping, rows, issues)
  return rows.length
}

function validateNaBevSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
  issues: string[],
) {
  const rows = getNaBevRows(items)
  if (rows.length === 0) return 0

  const mapping = getSimpleSheetMapping(workbookPackage, 'NA Bev')
  validateSimpleMenuRows(workbookPackage, mapping, rows, issues)
  return rows.length
}

function validateRetailSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
  issues: string[],
) {
  const rows = getRetailRows(items)
  if (rows.length === 0) return 0

  const mapping = getSimpleSheetMapping(workbookPackage, 'Retail')
  validateSimpleMenuRows(workbookPackage, mapping, rows, issues)
  return rows.length
}

function validateOpenItemsSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
  issues: string[],
) {
  const rows = getOpenItemsRows(items)
  if (rows.length === 0) return 0

  const mapping = getSimpleSheetMapping(workbookPackage, 'Open Items')
  validateSimpleMenuRows(workbookPackage, mapping, rows, issues)
  return rows.length
}

function validateSimpleMenuRows(
  workbookPackage: WorkbookPackage,
  mapping: SimpleSheetMapping,
  rows: SimpleMenuRow[],
  issues: string[],
) {
  const sheetDoc = parseXml(
    getTextFile(workbookPackage.files, mapping.sheetPath),
  )

  rows.forEach((row, index) => {
    const rowNumber = mapping.dataStartRow + index
    validateLiquorCell(
      issues,
      sheetDoc,
      workbookPackage.sharedStrings,
      mapping.nameCol,
      rowNumber,
      row.itemName,
      `${row.itemName} ${mapping.sheetName} name`,
    )
    validateLiquorCell(
      issues,
      sheetDoc,
      workbookPackage.sharedStrings,
      mapping.priceCol,
      rowNumber,
      row.basePrice,
      `${row.itemName} ${mapping.sheetName} price`,
    )
    if (mapping.groupCol && row.menuGroup) {
      validateLiquorCell(
        issues,
        sheetDoc,
        workbookPackage.sharedStrings,
        mapping.groupCol,
        rowNumber,
        row.menuGroup,
        `${row.itemName} ${mapping.sheetName} group`,
      )
    }
    if (mapping.happyHourCol && row.happyHourPrice !== null) {
      validateLiquorCell(
        issues,
        sheetDoc,
        workbookPackage.sharedStrings,
        mapping.happyHourCol,
        rowNumber,
        row.happyHourPrice,
        `${row.itemName} ${mapping.sheetName} Happy Hour`,
      )
    }
  })
}

function ensureSimpleClonedSheet(
  workbookPackage: WorkbookPackage,
  targetSheetName: 'Retail' | 'Open Items',
) {
  if (
    getWorkbookSheets(workbookPackage).some(
      (sheet) => sheet.name.toLowerCase() === targetSheetName.toLowerCase(),
    )
  ) {
    return
  }

  const source = getWorkbookSheets(workbookPackage).find(
    (sheet) => /^na\s*bev$/i.test(sheet.name),
  )
  if (!source) {
    throw new Error(
      'Toast template is missing the NA Bev tab required to create Retail',
    )
  }

  const worksheetNumbers = Object.keys(workbookPackage.files).flatMap((path) => {
    const match = path.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)
    return match ? [Number(match[1])] : []
  })
  const nextWorksheetNumber = Math.max(0, ...worksheetNumbers) + 1
  const newSheetPath = `xl/worksheets/sheet${nextWorksheetNumber}.xml`
  workbookPackage.files[newSheetPath] =
    workbookPackage.files[source.path].slice()

  const clonedParts: { path: string; contentType: string }[] = []
  const sourceNumber = source.path.match(/sheet(\d+)\.xml$/)?.[1]
  if (sourceNumber) {
    const sourceRelsPath =
      `xl/worksheets/_rels/sheet${sourceNumber}.xml.rels`
    const sourceRels = workbookPackage.files[sourceRelsPath]
    if (sourceRels) {
      const relsDoc = parseXml(strFromU8(sourceRels))

      Array.from(relsDoc.getElementsByTagName('Relationship')).forEach(
        (relationship) => {
          if (
            relationship.getAttribute('Type') !== DRAWING_RELATIONSHIP_TYPE
          ) {
            return
          }

          const target = relationship.getAttribute('Target')
          if (!target) return

          const sourceDrawingPath = resolveXlsxPath(source.path, target)
          const sourceDrawing = workbookPackage.files[sourceDrawingPath]
          if (!sourceDrawing) return

          const drawingNumbers = Object.keys(workbookPackage.files).flatMap(
            (filePath) => {
              const match = filePath.match(/^xl\/drawings\/drawing(\d+)\.xml$/)
              return match ? [Number(match[1])] : []
            },
          )
          const nextDrawingNumber = Math.max(0, ...drawingNumbers) + 1
          const newDrawingPath =
            `xl/drawings/drawing${nextDrawingNumber}.xml`
          workbookPackage.files[newDrawingPath] = sourceDrawing.slice()
          relationship.setAttribute(
            'Target',
            `../drawings/drawing${nextDrawingNumber}.xml`,
          )
          clonedParts.push({
            path: newDrawingPath,
            contentType: DRAWING_CONTENT_TYPE,
          })

          const sourceDrawingNumber =
            sourceDrawingPath.match(/drawing(\d+)\.xml$/)?.[1]
          if (sourceDrawingNumber) {
            const sourceDrawingRelsPath =
              `xl/drawings/_rels/drawing${sourceDrawingNumber}.xml.rels`
            const sourceDrawingRels =
              workbookPackage.files[sourceDrawingRelsPath]
            if (sourceDrawingRels) {
              workbookPackage.files[
                `xl/drawings/_rels/drawing${nextDrawingNumber}.xml.rels`
              ] = sourceDrawingRels.slice()
            }
          }
        },
      )

      workbookPackage.files[
        `xl/worksheets/_rels/sheet${nextWorksheetNumber}.xml.rels`
      ] = strToU8(serializeXml(relsDoc))
    }
  }

  const relationshipNodes = Array.from(
    workbookPackage.workbookRelationships.getElementsByTagName('Relationship'),
  )
  const relationshipNumbers = relationshipNodes.flatMap((relationship) => {
    const match = relationship.getAttribute('Id')?.match(/^rId(\d+)$/)
    return match ? [Number(match[1])] : []
  })
  const relationshipId =
    `rId${Math.max(0, ...relationshipNumbers) + 1}`
  const relationship =
    workbookPackage.workbookRelationships.createElementNS(
      PACKAGE_RELATIONSHIP_NS,
      'Relationship',
    )
  relationship.setAttribute('Id', relationshipId)
  relationship.setAttribute('Type', WORKSHEET_RELATIONSHIP_TYPE)
  relationship.setAttribute(
    'Target',
    `worksheets/sheet${nextWorksheetNumber}.xml`,
  )
  workbookPackage.workbookRelationships.documentElement.appendChild(
    relationship,
  )

  const sheetNodes = Array.from(
    workbookPackage.workbook.getElementsByTagName('sheet'),
  )
  const sheetIds = sheetNodes.flatMap((sheet) => {
    const value = Number(sheet.getAttribute('sheetId'))
    return Number.isFinite(value) ? [value] : []
  })
  const newSheet = workbookPackage.workbook.createElementNS(
    SPREADSHEET_NS,
    'sheet',
  )
  newSheet.setAttribute('name', targetSheetName)
  newSheet.setAttribute(
    'sheetId',
    String(Math.max(0, ...sheetIds) + 1),
  )
  newSheet.setAttributeNS(RELATIONSHIP_NS, 'r:id', relationshipId)
  workbookPackage.workbook
    .getElementsByTagName('sheets')[0]
    .appendChild(newSheet)

  const contentTypes = parseXml(
    getTextFile(workbookPackage.files, CONTENT_TYPES_PATH),
  )
  const override = contentTypes.createElementNS(
    CONTENT_TYPES_NS,
    'Override',
  )
  override.setAttribute('PartName', `/${newSheetPath}`)
  override.setAttribute('ContentType', WORKSHEET_CONTENT_TYPE)
  contentTypes.documentElement.appendChild(override)

  clonedParts.forEach((part) => {
    const partOverride = contentTypes.createElementNS(
      CONTENT_TYPES_NS,
      'Override',
    )
    partOverride.setAttribute('PartName', `/${part.path}`)
    partOverride.setAttribute('ContentType', part.contentType)
    contentTypes.documentElement.appendChild(partOverride)
  })

  workbookPackage.files[WORKBOOK_PATH] = strToU8(
    serializeXml(workbookPackage.workbook),
  )
  workbookPackage.files[WORKBOOK_RELS_PATH] = strToU8(
    serializeXml(workbookPackage.workbookRelationships),
  )
  workbookPackage.files[CONTENT_TYPES_PATH] = strToU8(
    serializeXml(contentTypes),
  )
}

function moveNotesSheetToEnd(workbookPackage: WorkbookPackage) {
  const sheets = workbookPackage.workbook.getElementsByTagName('sheets')[0]
  if (!sheets) {
    throw new Error('Toast template is missing the workbook sheets collection')
  }

  const notesSheet = Array.from(sheets.getElementsByTagName('sheet')).find(
    (sheet) => sheet.getAttribute('name')?.trim().toLowerCase() === 'notes',
  )
  if (!notesSheet) {
    throw new Error('Toast template is missing a Notes tab')
  }

  if (notesSheet !== sheets.lastElementChild) {
    sheets.appendChild(notesSheet)
  }

  workbookPackage.files[WORKBOOK_PATH] = strToU8(
    serializeXml(workbookPackage.workbook),
  )
}

function populateHappyHourNotesSheet(
  workbookPackage: WorkbookPackage,
  enabled: boolean,
  start: string | null,
  end: string | null,
  days: readonly string[],
  range2Enabled: boolean,
  range2Start: string | null,
  range2End: string | null,
  range2Days: readonly string[],
) {
  const notesSheet = getWorkbookSheets(workbookPackage)
    .find((sheet) => sheet.name.toLowerCase() === 'notes')
  if (!notesSheet) throw new Error('Toast template is missing a Notes tab')

  const sheetDoc = parseXml(getTextFile(workbookPackage.files, notesSheet.path))
  const range1Columns = [5, 6, 8, 9]
  const range2Columns = [11, 12, 14, 15]

  for (let rowNumber = 20; rowNumber <= 26; rowNumber += 1) {
    ;[...range1Columns, ...range2Columns].forEach((column) => {
      clearCellValue(sheetDoc, column, rowNumber)
    })
  }

  if (enabled) {
    if (!start || !end) {
      throw new Error('Happy Hour is enabled but its start/end time is missing')
    }

    const startTime = splitHappyHourTime(start)
    const endTime = splitHappyHourTime(end)

    const selectedDays = normalizeHappyHourDays(days)

    HAPPY_HOUR_NOTE_ROWS.forEach(({ day, rowNumber }) => {
      if (!selectedDays.has(day)) return

      writeCellValue(sheetDoc, 5, rowNumber, startTime.time, rowNumber)
      writeCellValue(sheetDoc, 6, rowNumber, startTime.meridiem, rowNumber)
      writeCellValue(sheetDoc, 8, rowNumber, endTime.time, rowNumber)
      writeCellValue(sheetDoc, 9, rowNumber, endTime.meridiem, rowNumber)
    })

    if (range2Enabled) {
      if (!range2Start || !range2End) {
        throw new Error('Happy Hour Time Range 2 is enabled but its start/end time is missing')
      }

      const range2StartTime = splitHappyHourTime(range2Start)
      const range2EndTime = splitHappyHourTime(range2End)
      const selectedRange2Days = normalizeHappyHourDays(range2Days)

      HAPPY_HOUR_NOTE_ROWS.forEach(({ day, rowNumber }) => {
        if (!selectedRange2Days.has(day)) return

        writeCellValue(sheetDoc, 11, rowNumber, range2StartTime.time, rowNumber)
        writeCellValue(sheetDoc, 12, rowNumber, range2StartTime.meridiem, rowNumber)
        writeCellValue(sheetDoc, 14, rowNumber, range2EndTime.time, rowNumber)
        writeCellValue(sheetDoc, 15, rowNumber, range2EndTime.meridiem, rowNumber)
      })
    }
  }

  workbookPackage.files[notesSheet.path] = strToU8(serializeXml(sheetDoc))
}

function validateHappyHourNotesSheet(
  workbookPackage: WorkbookPackage,
  enabled: boolean,
  start: string | null,
  end: string | null,
  days: readonly string[],
  range2Enabled: boolean,
  range2Start: string | null,
  range2End: string | null,
  range2Days: readonly string[],
) {
  const notesSheet = getWorkbookSheets(workbookPackage)
    .find((sheet) => sheet.name.toLowerCase() === 'notes')
  if (!notesSheet) {
    return { valid: false, issues: ['Toast template is missing a Notes tab'] }
  }

  const sheetDoc = parseXml(getTextFile(workbookPackage.files, notesSheet.path))
  const issues: string[] = []
  const expectedStart = enabled && start ? splitHappyHourTime(start) : null
  const expectedEnd = enabled && end ? splitHappyHourTime(end) : null

  const selectedDays = normalizeHappyHourDays(days)
  const expectedRange2Start =
    enabled && range2Enabled && range2Start
      ? splitHappyHourTime(range2Start)
      : null
  const expectedRange2End =
    enabled && range2Enabled && range2End
      ? splitHappyHourTime(range2End)
      : null
  const selectedRange2Days = normalizeHappyHourDays(range2Days)

  HAPPY_HOUR_NOTE_ROWS.forEach(({ day, rowNumber }) => {
    const dayEnabled =
      enabled &&
      selectedDays.has(day) &&
      expectedStart !== null &&
      expectedEnd !== null

    const expected = dayEnabled
      ? [
          [5, expectedStart.time],
          [6, expectedStart.meridiem],
          [8, expectedEnd.time],
          [9, expectedEnd.meridiem],
        ] as const
      : [
          [5, ''],
          [6, ''],
          [8, ''],
          [9, ''],
        ] as const

    expected.forEach(([column, value]) => {
      const cell = findCell(sheetDoc, column, rowNumber)
      const actual = cell
        ? getCellDisplayValue(cell, workbookPackage.sharedStrings)
        : ''
      if (actual !== value) {
        issues.push('Notes Happy Hour schedule does not match organization settings')
      }
    })

    const range2DayEnabled =
      enabled &&
      range2Enabled &&
      selectedRange2Days.has(day) &&
      expectedRange2Start !== null &&
      expectedRange2End !== null

    const expectedRange2 = range2DayEnabled
      ? [
          [11, expectedRange2Start.time],
          [12, expectedRange2Start.meridiem],
          [14, expectedRange2End.time],
          [15, expectedRange2End.meridiem],
        ] as const
      : [
          [11, ''],
          [12, ''],
          [14, ''],
          [15, ''],
        ] as const

    expectedRange2.forEach(([column, value]) => {
      const cell = findCell(sheetDoc, column, rowNumber)
      const actual = cell
        ? getCellDisplayValue(cell, workbookPackage.sharedStrings)
        : ''
      if (actual !== value) {
        issues.push('Notes Happy Hour Time Range 2 does not match organization settings')
      }
    })
  })

  return { valid: issues.length === 0, issues: [...new Set(issues)] }
}

function normalizeHappyHourDays(days: readonly string[]) {
  const allowed = new Set<string>(DEFAULT_HAPPY_HOUR_DAYS)
  return new Set(
    days
      .map((day) => day.toLowerCase())
      .filter((day) => allowed.has(day)),
  )
}

function splitHappyHourTime(value: string) {
  const [hourText, minute = '00'] = value.split(':')
  const hour = Number(hourText)

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    throw new Error('Invalid Happy Hour time')
  }

  return {
    time: `${hour % 12 || 12}:${minute}`,
    meridiem: hour >= 12 ? 'PM' : 'AM',
  }
}

function populateLiquorSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
  happyHourEnabled: boolean,
) {
  const liquorRows = getLiquorRows(items, happyHourEnabled)
  if (liquorRows.length === 0) return

  const mapping = getLiquorTemplateMapping(workbookPackage)
  const sheetXml = getTextFile(workbookPackage.files, mapping.sheetPath)
  const sheetDoc = parseXml(sheetXml)
  const rowsByKind = groupLiquorRowsByKind(liquorRows)
  const templateKinds = new Set(mapping.slots.filter((slot) => slot.kind !== 'optional').map((slot) => slot.kind))
  const unsupportedKinds = [...rowsByKind.keys()].filter((kind) => !templateKinds.has(kind))

  if (unsupportedKinds.length > 0) {
    throw new Error(
      `Toast Liquor tab has no fixed category slot for: ${unsupportedKinds.join(', ')}. Template headers are not modified.`,
    )
  }

  const writtenRowCount = writeLiquorRowsToSheet(sheetDoc, mapping, rowsByKind)

  updateWorksheetDimension(sheetDoc, mapping, writtenRowCount)
  workbookPackage.files[mapping.sheetPath] = strToU8(serializeXml(sheetDoc))
}

function getLiquorRows(
  items: NormalizedMenuItem[],
  happyHourEnabled: boolean,
): LiquorRow[] {
  const liquorFile = buildToastExportFiles(items, { happyHourEnabled })
    .find((file) => file.id === 'liquor')
  if (!liquorFile) return []

  return liquorFile.rows.slice(1).flatMap((row) => {
    const itemName = clean(row[0])
    const basePrice = parseDollars(row[1])
    const happyHourPrice = parseDollars(row[2])
    const liquorType = clean(row[3]).toUpperCase()

    if (!itemName || basePrice === null || !liquorType) return []

    return [{ itemName, basePrice, happyHourPrice, liquorType }]
  })
}

function groupLiquorRowsByKind(rows: LiquorRow[]) {
  const groups = new Map<string, LiquorRow[]>()

  rows.forEach((row) => {
    const kind = normalizeLiquorKind(row.liquorType)
    const existing = groups.get(kind) ?? []
    existing.push(row)
    groups.set(kind, existing)
  })

  groups.forEach((groupRows) => groupRows.sort((left, right) => left.itemName.localeCompare(right.itemName)))

  return groups
}

function writeLiquorRowsToSheet(sheetDoc: Document, mapping: LiquorTemplateMapping, rowsByKind: Map<string, LiquorRow[]>) {
  const targetColumns = getLiquorTargetColumns(mapping)
  const longestGroup = Math.max(0, ...[...rowsByKind.values()].map((rows) => rows.length))
  const clearToRow = Math.max(mapping.lastTemplateRow, mapping.dataStartRow + longestGroup + DATA_ROW_BUFFER)

  clearCells(sheetDoc, targetColumns, mapping.dataStartRow, clearToRow)

  mapping.slots.forEach((slot) => {
    const rows = rowsByKind.get(slot.kind) ?? []

    rows.forEach((liquorRow, index) => {
      const rowNumber = mapping.dataStartRow + index
      writeCellValue(sheetDoc, slot.nameCol, rowNumber, liquorRow.itemName, mapping.dataStartRow)
      writeCellValue(sheetDoc, slot.priceCol, rowNumber, liquorRow.basePrice, mapping.dataStartRow)
      if (slot.happyHourCol) writeCellValue(sheetDoc, slot.happyHourCol, rowNumber, liquorRow.happyHourPrice, mapping.dataStartRow)
      if (slot.doubleCol) clearCellValue(sheetDoc, slot.doubleCol, rowNumber)
    })
  })

  return longestGroup
}

function getLiquorTemplateMapping(workbookPackage: WorkbookPackage): LiquorTemplateMapping {
  const liquorSheet = getWorkbookSheets(workbookPackage).find((sheet) => sheet.name.toLowerCase() === 'liquor')
  if (!liquorSheet) throw new Error('Toast template is missing a Liquor tab')

  const sheetDoc = parseXml(getTextFile(workbookPackage.files, liquorSheet.path))
  const categoryRow = findLiquorCategoryRow(sheetDoc, workbookPackage.sharedStrings)
  if (!categoryRow) throw new Error('Liquor tab is missing the expected Toast category header row')

  const headerRow = categoryRow + 1
  const dataStartRow = headerRow + 1
  const categoryValues = getRowValues(sheetDoc, categoryRow, workbookPackage.sharedStrings)
  const headerValues = getRowValues(sheetDoc, headerRow, workbookPackage.sharedStrings)
  const slots = getLiquorSlots(categoryValues, headerValues)

  if (slots.length === 0) throw new Error('Liquor tab is missing Item Name / Price columns')

  return {
    sheetPath: liquorSheet.path,
    sheetName: liquorSheet.name,
    categoryRow,
    headerRow,
    dataStartRow,
    lastTemplateRow: getLastWorksheetRow(sheetDoc),
    slots,
  }
}

function findLiquorCategoryRow(sheetDoc: Document, sharedStrings: string[]) {
  for (let rowNumber = 1; rowNumber <= 40; rowNumber += 1) {
    const values = getRowValues(sheetDoc, rowNumber, sharedStrings).map((cell) => normalizeHeader(cell.value))

    if (values.includes('vodka') && values.includes('gin') && values.includes('rum') && values.some((value) => value.includes('whiskey'))) {
      return rowNumber
    }
  }

  return null
}

function getLiquorSlots(categoryValues: { col: number, value: string }[], headerValues: { col: number, value: string }[]) {
  return categoryValues.flatMap((categoryCell): LiquorSlot[] => {
    const label = clean(categoryCell.value)
    if (!label) return []

    const kind = normalizeLiquorKind(label)
    if (!kind) return []

    const groupHeaders = headerValues.filter((headerCell) => headerCell.col >= categoryCell.col && headerCell.col <= categoryCell.col + 3)
    const nameCol = groupHeaders.find((headerCell) => /item\s*name/i.test(headerCell.value))?.col ?? categoryCell.col
    const priceCol = groupHeaders.find((headerCell) => /price/i.test(headerCell.value))?.col ?? categoryCell.col + 1
    const happyHourCol = groupHeaders.find((headerCell) => /happy\s*hour/i.test(headerCell.value))?.col ?? null
    const doubleCol = groupHeaders.find((headerCell) => /double/i.test(headerCell.value))?.col ?? null

    return [{ label, kind, categoryCol: categoryCell.col, nameCol, priceCol, happyHourCol, doubleCol }]
  })
}

function normalizeLiquorKind(value: string) {
  const key = clean(value).toUpperCase().replace(/&/g, '/').replace(/\s+/g, ' ')

  if (!key) return ''
  if (key.includes('VODKA')) return 'VODKA'
  if (key.includes('GIN')) return 'GIN'
  if (key.includes('RUM')) return 'RUM'
  if (key.includes('TEQUILA')) return 'TEQUILA'
  if (key.includes('WHISKEY') || key.includes('BOURBON')) return 'WHISKEY/BOURBON'
  if (key.includes('SCOTCH')) return 'SCOTCH'
  if (key.includes('LIQUEUR') || key.includes('CORDIAL')) return 'LIQUEURS/CORDIALS'
  if (key.includes('BRANDY') || key.includes('COGNAC')) return 'BRANDY/COGNAC'
  if (key.includes('OPTIONAL LIQUOR CATEGORY')) return 'optional'

  return key
}

function readWorkbookPackage(arrayBuffer: ArrayBuffer): WorkbookPackage {
  const files = unzipSync(new Uint8Array(arrayBuffer.slice(0)))
  const workbookXml = getTextFile(files, WORKBOOK_PATH)
  const workbookRelationshipsXml = getTextFile(files, WORKBOOK_RELS_PATH)

  return {
    files,
    sharedStrings: getSharedStrings(files),
    workbook: parseXml(workbookXml),
    workbookRelationships: parseXml(workbookRelationshipsXml),
  }
}

function getWorkbookSheets(workbookPackage: WorkbookPackage): WorkbookSheet[] {
  const relationshipById = new Map<string, string>()
  Array.from(workbookPackage.workbookRelationships.getElementsByTagName('Relationship')).forEach((relationship) => {
    const id = relationship.getAttribute('Id')
    const target = relationship.getAttribute('Target')
    if (id && target) relationshipById.set(id, resolveXlsxPath(WORKBOOK_PATH, target))
  })

  return Array.from(workbookPackage.workbook.getElementsByTagName('sheet')).flatMap((sheet) => {
    const name = sheet.getAttribute('name')
    const relationshipId = sheet.getAttributeNS(RELATIONSHIP_NS, 'id') ?? sheet.getAttribute('r:id')
    const path = relationshipId ? relationshipById.get(relationshipId) : null

    return name && path ? [{ name, path }] : []
  })
}

function getRowValues(sheetDoc: Document, rowNumber: number, sharedStrings: string[]) {
  const row = findRow(sheetDoc, rowNumber)
  if (!row) return []

  return Array.from(row.getElementsByTagName('c')).map((cell) => ({
    col: columnLettersToNumber(getCellReferenceColumn(cell.getAttribute('r') ?? '')),
    value: getCellDisplayValue(cell, sharedStrings),
  })).filter((cell) => cell.col > 0)
}

function getLiquorTargetColumns(mapping: LiquorTemplateMapping) {
  const columns = new Set<number>()
  mapping.slots.forEach((slot) => {
    columns.add(slot.nameCol)
    columns.add(slot.priceCol)
    if (slot.happyHourCol) columns.add(slot.happyHourCol)
    if (slot.doubleCol) columns.add(slot.doubleCol)
  })
  return [...columns]
}

function clearCells(sheetDoc: Document, columns: number[], fromRow: number, toRow: number) {
  for (let rowNumber = fromRow; rowNumber <= toRow; rowNumber += 1) {
    columns.forEach((column) => clearCellValue(sheetDoc, column, rowNumber))
  }
}

function writeCellValue(sheetDoc: Document, column: number, rowNumber: number, value: string | number | null, templateRow: number) {
  if (value === null || value === '') return

  const cell = getOrCreateCell(sheetDoc, column, rowNumber, templateRow)
  setCellValue(sheetDoc, cell, value)
}

function setCellValue(sheetDoc: Document, cell: Element, value: string | number) {
  removeChildren(cell, ['v', 'is'])

  if (typeof value === 'number') {
    cell.removeAttribute('t')
    const valueNode = sheetDoc.createElementNS(SPREADSHEET_NS, 'v')
    valueNode.textContent = formatNumberForCell(value)
    cell.appendChild(valueNode)
    return
  }

  cell.setAttribute('t', 'inlineStr')
  const inlineString = sheetDoc.createElementNS(SPREADSHEET_NS, 'is')
  const text = sheetDoc.createElementNS(SPREADSHEET_NS, 't')
  text.textContent = value
  inlineString.appendChild(text)
  cell.appendChild(inlineString)
}

function clearCellValue(sheetDoc: Document, column: number, rowNumber: number) {
  const cell = findCell(sheetDoc, column, rowNumber)
  if (!cell) return

  cell.removeAttribute('t')
  removeChildren(cell, ['v', 'is'])
}

function getOrCreateCell(sheetDoc: Document, column: number, rowNumber: number, templateRow: number) {
  const row = getOrCreateRow(sheetDoc, rowNumber)
  const reference = `${numberToColumnLetters(column)}${rowNumber}`
  const existing = findCellInRow(row, reference)
  if (existing) {
    copyStyleFromSource(sheetDoc, existing, column, templateRow)
    return existing
  }

  const cell = sheetDoc.createElementNS(SPREADSHEET_NS, 'c')
  cell.setAttribute('r', reference)
  copyStyleFromSource(sheetDoc, cell, column, templateRow)

  insertCellSorted(row, cell, column)
  return cell
}

function copyStyleFromSource(sheetDoc: Document, targetCell: Element, sourceColumn: number, sourceRow: number) {
  const sourceCell = findCell(sheetDoc, sourceColumn, sourceRow)
  const styleId = sourceCell?.getAttribute('s')
  if (styleId) targetCell.setAttribute('s', styleId)
  else targetCell.removeAttribute('s')
}

function getOrCreateRow(sheetDoc: Document, rowNumber: number) {
  const existing = findRow(sheetDoc, rowNumber)
  if (existing) return existing

  const sheetData = sheetDoc.getElementsByTagName('sheetData')[0]
  const row = sheetDoc.createElementNS(SPREADSHEET_NS, 'row')
  row.setAttribute('r', String(rowNumber))

  const rows = Array.from(sheetData.getElementsByTagName('row'))
  const nextRow = rows.find((candidate) => Number(candidate.getAttribute('r')) > rowNumber)
  sheetData.insertBefore(row, nextRow ?? null)
  return row
}

function insertCellSorted(row: Element, cell: Element, column?: number) {
  const targetColumn = column ?? columnLettersToNumber(getCellReferenceColumn(cell.getAttribute('r') ?? ''))
  const cells = Array.from(row.getElementsByTagName('c'))
  const nextCell = cells.find((candidate) => columnLettersToNumber(getCellReferenceColumn(candidate.getAttribute('r') ?? '')) > targetColumn)
  row.insertBefore(cell, nextCell ?? null)
}

function findRow(sheetDoc: Document, rowNumber: number) {
  return Array.from(sheetDoc.getElementsByTagName('row')).find((row) => Number(row.getAttribute('r')) === rowNumber) ?? null
}

function findCell(sheetDoc: Document, column: number, rowNumber: number) {
  const row = findRow(sheetDoc, rowNumber)
  if (!row) return null

  return findCellInRow(row, `${numberToColumnLetters(column)}${rowNumber}`)
}

function findCellInRow(row: Element, reference: string) {
  return Array.from(row.getElementsByTagName('c')).find((cell) => cell.getAttribute('r') === reference) ?? null
}

function removeChildren(element: Element, tagNames: string[]) {
  tagNames.forEach((tagName) => {
    Array.from(element.getElementsByTagName(tagName)).forEach((child) => {
      if (child.parentNode === element) element.removeChild(child)
    })
  })
}

function updateWorksheetDimension(sheetDoc: Document, mapping: LiquorTemplateMapping, writtenRowCount: number) {
  const dimension = sheetDoc.getElementsByTagName('dimension')[0]
  if (!dimension) return

  const endRow = Math.max(mapping.lastTemplateRow, mapping.dataStartRow + writtenRowCount - 1)
  const maxColumn = Math.max(
    1,
    ...Array.from(sheetDoc.getElementsByTagName('c')).map((cell) => (
      columnLettersToNumber(getCellReferenceColumn(cell.getAttribute('r') ?? ''))
    )),
  )

  dimension.setAttribute('ref', `A1:${numberToColumnLetters(maxColumn)}${endRow}`)
}

function validateLiquorCell(
  issues: string[],
  sheetDoc: Document,
  sharedStrings: string[],
  column: number,
  rowNumber: number,
  expected: string | number | null,
  label: string,
) {
  const cell = findCell(sheetDoc, column, rowNumber)
  const actual = cell ? getCellDisplayValue(cell, sharedStrings) : ''
  const expectedText =
    expected === null || expected === ''
      ? ''
      : typeof expected === 'number'
        ? formatNumberForCell(expected)
        : String(expected)

  if (actual !== expectedText) {
    issues.push(label + ': workbook value does not match expected export value')
  }
}
function getLastWorksheetRow(sheetDoc: Document) {
  return Math.max(
    1,
    ...Array.from(sheetDoc.getElementsByTagName('row')).map((row) => Number(row.getAttribute('r')) || 1),
  )
}

function getCellDisplayValue(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute('t')
  if (type === 'inlineStr') return cell.getElementsByTagName('t')[0]?.textContent?.trim() ?? ''

  const value = cell.getElementsByTagName('v')[0]?.textContent ?? ''
  if (type === 's') return sharedStrings[Number(value)]?.trim() ?? ''

  return value.trim()
}

function getSharedStrings(files: Record<string, Uint8Array>) {
  const sharedStringsFile = files['xl/sharedStrings.xml']
  if (!sharedStringsFile) return []

  const sharedStringsDoc = parseXml(strFromU8(sharedStringsFile))
  return Array.from(sharedStringsDoc.getElementsByTagName('si')).map((sharedString) => (
    Array.from(sharedString.getElementsByTagName('t')).map((node) => node.textContent ?? '').join('')
  ))
}

function getTextFile(files: Record<string, Uint8Array>, path: string) {
  const file = files[path]
  if (!file) throw new Error(`Workbook is missing ${path}`)
  return strFromU8(file)
}

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = doc.getElementsByTagName('parsererror')[0]
  if (parseError) throw new Error(parseError.textContent ?? 'Unable to parse workbook XML')
  return doc
}

function serializeXml(doc: Document) {
  return new XMLSerializer().serializeToString(doc)
}

function resolveXlsxPath(basePath: string, target: string) {
  if (target.startsWith('/')) return target.slice(1)

  const baseParts = basePath.split('/')
  baseParts.pop()
  const parts = `${baseParts.join('/')}/${target}`.split('/')
  const resolved: string[] = []

  parts.forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') resolved.pop()
    else resolved.push(part)
  })

  return resolved.join('/')
}

function getCellReferenceColumn(reference: string) {
  return reference.match(/^[A-Z]+/i)?.[0] ?? ''
}

function columnLettersToNumber(letters: string) {
  return letters.toUpperCase().split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0)
}

function numberToColumnLetters(input: number) {
  let number = input
  let output = ''

  while (number > 0) {
    const remainder = (number - 1) % 26
    output = String.fromCharCode(65 + remainder) + output
    number = Math.floor((number - 1) / 26)
  }

  return output
}

function parseDollars(value: string) {
  const cleaned = clean(value).replace(/[$,]/g, '')
  if (!cleaned) return null

  const numberValue = Number(cleaned)
  return Number.isFinite(numberValue) ? numberValue : null
}

function clean(value?: string) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeHeader(value: string) {
  return clean(value).toLowerCase().replace(/&/g, '/').replace(/\s+/g, ' ')
}

function formatNumberForCell(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}