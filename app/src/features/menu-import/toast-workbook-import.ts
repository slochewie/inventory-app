import { strFromU8, unzipSync } from 'fflate'
import type {
  NormalizedMenuItem,
  ParsedMenuImport,
  RawMenuRow,
} from './types'

const WORKBOOK_PATH = 'xl/workbook.xml'
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels'
const RELATIONSHIP_NS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

export const TOAST_WORKBOOK_STAGING_PARSER_VERSION = '4'

const TRUSTED_SOURCE_TABS = new Set([
  'beer',
  'liquor',
  'cocktails',
  'na bev',
  'retail',
  'menu build',
])

type WorkbookSheet = {
  name: string
  path: string
  state: string
}

type ParsedWorkbook = {
  files: Record<string, Uint8Array>
  sharedStrings: string[]
  sheets: WorkbookSheet[]
}

type ImportResult = {
  importFile: ParsedMenuImport
  items: NormalizedMenuItem[]
}

type ItemInput = {
  id: string
  name: string
  category: string
  toastCategory: string
  toastDestination: string
  toastSlot?: string | null
  price: string
  happyHourPrice?: string
  variantKind?: string
  variantSizeOz?: number | null
  variantPackageType?: string | null
  sheet: string
  rowNumber: number
  notes?: string[]
  forceReview?: boolean
}

export function parseToastWorkbookForReview(
  arrayBuffer: ArrayBuffer,
  fileName: string,
): ImportResult {
  const workbook = readWorkbook(arrayBuffer)
  const visibleTrustedSheets = workbook.sheets.filter(
    (sheet) =>
      sheet.state === 'visible' &&
      TRUSTED_SOURCE_TABS.has(sheet.name.toLowerCase()),
  )

  const rows: RawMenuRow[] = []
  const items: NormalizedMenuItem[] = []
  const warnings: string[] = []

  let draftSlotMappings: Array<{
    toastSizeOz: number | null
    actualSizeOz: number
  }> = []

  const beerSheet = findSheet(visibleTrustedSheets, 'Beer')
  if (beerSheet) {
    const parsed = parseBeerSheet(workbook, beerSheet)
    rows.push(...parsed.rows)
    items.push(...parsed.items)
    warnings.push(...parsed.warnings)
    draftSlotMappings = parsed.draftSlotMappings
  } else {
    warnings.push('Visible Beer source tab was not found.')
  }

  const liquorSheet = findSheet(visibleTrustedSheets, 'Liquor')
  if (liquorSheet) {
    const parsed = parseLiquorSheet(workbook, liquorSheet)
    rows.push(...parsed.rows)
    items.push(...parsed.items)
    warnings.push(...parsed.warnings)
  } else {
    warnings.push('Visible Liquor source tab was not found.')
  }

  const cocktailsSheet = findSheet(visibleTrustedSheets, 'Cocktails')
  if (cocktailsSheet) {
    const parsed = parseCocktailsSheet(workbook, cocktailsSheet)
    rows.push(...parsed.rows)
    items.push(...parsed.items)
    warnings.push(...parsed.warnings)
  }

  const naBevSheet = findSheet(visibleTrustedSheets, 'NA Bev')
  if (naBevSheet) {
    const parsed = parseSimpleMenuSheet(workbook, naBevSheet, 'NA Bev', 'na-bev')
    rows.push(...parsed.rows)
    items.push(...parsed.items)
    warnings.push(...parsed.warnings)
  }

  const retailSheet = findSheet(visibleTrustedSheets, 'Retail')
  if (retailSheet) {
    const parsed = parseSimpleMenuSheet(workbook, retailSheet, 'Retail', 'retail')
    rows.push(...parsed.rows)
    items.push(...parsed.items)
    warnings.push(...parsed.warnings)
  }

  const menuBuildSheet = findSheet(visibleTrustedSheets, 'Menu Build')
  if (menuBuildSheet) {
    warnings.push(...inspectMenuBuild(workbook, menuBuildSheet))
  }

  const ignoredHiddenTabs = workbook.sheets
    .filter(
      (sheet) =>
        sheet.state !== 'visible' ||
        !TRUSTED_SOURCE_TABS.has(sheet.name.toLowerCase()),
    )
    .map((sheet) => sheet.name)

  warnings.push(
    `Staging import read only visible source tabs. Ignored ${ignoredHiddenTabs.length} generated, helper, or unsupported tab(s).`,
  )

  const importFile: ParsedMenuImport = {
    sourceKind: 'toast-template-sheet',
    sourceName: fileName,
    rows,
    warnings: [...new Set(warnings)],
    meta: {
      source: 'toast-workbook-staging',
      stagingOnly: 'true',
      parserVersion: TOAST_WORKBOOK_STAGING_PARSER_VERSION,
      sourceTabs: visibleTrustedSheets.map((sheet) => sheet.name).join(', '),
      draftSlotMappings: JSON.stringify(draftSlotMappings),
    },
  }

  return { importFile, items }
}

function parseBeerSheet(workbook: ParsedWorkbook, sheet: WorkbookSheet) {
  const sheetDoc = parseXml(getTextFile(workbook.files, sheet.path))
  const headerRow = findRowWithValues(
    sheetDoc,
    workbook.sharedStrings,
    (values) => values.get(1)?.toLowerCase() === 'draft beer',
  )
  const warnings: string[] = []
  const rows: RawMenuRow[] = []
  const items: NormalizedMenuItem[] = []

  if (headerRow === null) {
    return {
      rows,
      items,
      warnings: ['Beer tab is missing the expected Draft Beer header.'],
    }
  }

  const headerValues = getRowValueMap(
    sheetDoc,
    headerRow,
    workbook.sharedStrings,
  )
  const structuralDraftSlots = [
    { toastSizeOz: 8, priceCol: 2, happyHourCol: 3 },
    { toastSizeOz: 16, priceCol: 4, happyHourCol: 5 },
    { toastSizeOz: 24, priceCol: 6, happyHourCol: 7 },
    { toastSizeOz: null, priceCol: 8, happyHourCol: 9 },
  ] as const

  const draftSlots = structuralDraftSlots.flatMap((slot) => {
    const header = clean(headerValues.get(slot.priceCol))
    const actualSizeOz = parseSizeOz(header)

    if (slot.toastSizeOz === null) {
      return /^pitcher$/i.test(header)
        ? [{
            kind: 'draft' as const,
            nameCol: 1,
            priceCol: slot.priceCol,
            happyHourCol: slot.happyHourCol,
            destination: 'Pitcher',
            sizeOz: null,
            toastSlot: null,
            structuralToastSizeOz: null,
          }]
        : []
    }

    if (actualSizeOz === null) return []

    return [{
      kind: 'draft' as const,
      nameCol: 1,
      priceCol: slot.priceCol,
      happyHourCol: slot.happyHourCol,
      destination: `${actualSizeOz}oz Draft`,
      sizeOz: actualSizeOz,
      toastSlot: null,
      structuralToastSizeOz: slot.toastSizeOz,
    }]
  })

  const draftSlotMappings = draftSlots.flatMap((slot) =>
    slot.structuralToastSizeOz !== null && slot.sizeOz !== null
      ? [{
          toastSizeOz: slot.structuralToastSizeOz,
          actualSizeOz: slot.sizeOz,
        }]
      : [],
  )

  const slots = [
    ...draftSlots,
    {
      kind: 'can',
      nameCol: 10,
      priceCol: 11,
      happyHourCol: 12,
      destination: 'Can',
      sizeOz: null,
      toastSlot: null,
    },
    {
      kind: 'bottle',
      nameCol: 13,
      priceCol: 14,
      happyHourCol: 15,
      destination: 'Bottle',
      sizeOz: null,
      toastSlot: null,
    },
    ...[0, 1, 2, 3, 4].map((slotIndex) => {
      const nameCol = 16 + slotIndex * 3
      return {
        kind: 'can',
        nameCol,
        priceCol: nameCol + 1,
        happyHourCol: nameCol + 2,
        destination:
          clean(headerValues.get(nameCol)) ||
          `Optional Beer Category ${slotIndex + 1}`,
        sizeOz: null,
        toastSlot: `optional-beer-${slotIndex + 1}`,
      }
    }),
  ] as const

  for (let rowNumber = headerRow + 1; rowNumber <= 250; rowNumber += 1) {
    slots.forEach((slot) => {
      const name = getCellValue(
        sheetDoc,
        slot.nameCol,
        rowNumber,
        workbook.sharedStrings,
      )
      const price = getCellValue(
        sheetDoc,
        slot.priceCol,
        rowNumber,
        workbook.sharedStrings,
      )
      const happyHourPrice = getCellValue(
        sheetDoc,
        slot.happyHourCol,
        rowNumber,
        workbook.sharedStrings,
      )

      if (!hasMeaningfulInput(name, price, happyHourPrice)) return
      if (isToastTemplateInstruction(name)) return

      const raw = {
        sheet: sheet.name,
        row: String(rowNumber),
        slot: slot.destination,
        name,
        price,
        happyHourPrice,
      }
      rows.push(raw)

      const missingName = clean(name) === ''
      const numericName = isNumericOnly(name)
      const notes: string[] = []
      if (missingName && isPositiveMoney(price)) {
        notes.push(
          `${sheet.name} row ${rowNumber}: price exists but the item name is blank.`,
        )
      } else if (numericName && isPositiveMoney(price)) {
        notes.push(
          `${sheet.name} row ${rowNumber}: numeric-only item name "${clean(name)}" was preserved for review.`,
        )
      }
      if (clean(name) && !isPositiveMoney(price)) {
        notes.push(
          `${sheet.name} row ${rowNumber}: ${clean(name)} has no positive price.`,
        )
      }

      const itemName =
        normalizeItemName(name) ||
        `[Review ${sheet.name} row ${rowNumber}]`

      items.push(
        createItem({
          id: `toast-workbook:beer:${rowNumber}:${slot.priceCol}`,
          name: itemName,
          category: 'Beer',
          toastCategory: 'Beer',
          toastDestination: slot.destination,
          toastSlot: slot.toastSlot,
          price,
          happyHourPrice,
          variantKind: slot.kind,
          variantSizeOz: slot.sizeOz,
          variantPackageType:
            slot.kind === 'draft' ? null : slot.kind,
          sheet: sheet.name,
          rowNumber,
          notes,
          forceReview: missingName || numericName,
        }),
      )
    })
  }

  return { rows, items, warnings, draftSlotMappings }
}

function parseLiquorSheet(workbook: ParsedWorkbook, sheet: WorkbookSheet) {
  const sheetDoc = parseXml(getTextFile(workbook.files, sheet.path))
  const headerRow = findRowWithValues(
    sheetDoc,
    workbook.sharedStrings,
    (values) =>
      values.get(1)?.toLowerCase() === 'item name' &&
      /price/i.test(values.get(2) ?? ''),
  )
  const rows: RawMenuRow[] = []
  const items: NormalizedMenuItem[] = []
  const warnings: string[] = []

  if (headerRow === null || headerRow <= 1) {
    return {
      rows,
      items,
      warnings: ['Liquor tab is missing the expected Item Name / Price header.'],
    }
  }

  const categoryValues = getRowValueMap(
    sheetDoc,
    headerRow - 1,
    workbook.sharedStrings,
  )

  for (let nameCol = 1; nameCol <= 45; nameCol += 4) {
    const category =
      clean(categoryValues.get(nameCol)) ||
      `Liquor column ${columnLetters(nameCol)}`

    for (let rowNumber = headerRow + 1; rowNumber <= 250; rowNumber += 1) {
      const name = getCellValue(
        sheetDoc,
        nameCol,
        rowNumber,
        workbook.sharedStrings,
      )
      const price = getCellValue(
        sheetDoc,
        nameCol + 1,
        rowNumber,
        workbook.sharedStrings,
      )
      const happyHourPrice = getCellValue(
        sheetDoc,
        nameCol + 2,
        rowNumber,
        workbook.sharedStrings,
      )

      if (!hasMeaningfulInput(name, price, happyHourPrice)) continue
      if (isToastTemplateInstruction(name)) continue

      rows.push({
        sheet: sheet.name,
        row: String(rowNumber),
        category,
        name,
        price,
        happyHourPrice,
      })

      const numericName = isNumericOnly(name)
      const notes: string[] = []
      if (numericName && isPositiveMoney(price)) {
        notes.push(
          `${sheet.name} row ${rowNumber}: numeric-only item name "${clean(name)}" in ${category} was preserved for review.`,
        )
      }
      if (clean(name) && !isPositiveMoney(price)) {
        notes.push(
          `${sheet.name} row ${rowNumber}: ${clean(name)} has no positive price.`,
        )
      }
      if (/^liquor column /i.test(category)) {
        notes.push(
          `${sheet.name}: category header above column ${columnLetters(nameCol)} is blank or unreadable.`,
        )
      }

      items.push(
        createItem({
          id: `toast-workbook:liquor:${rowNumber}:${nameCol}`,
          name:
            normalizeItemName(name) ||
            `[Review ${sheet.name} ${category} row ${rowNumber}]`,
          category,
          toastCategory: normalizeLiquorCategory(category),
          toastDestination: category,
          price,
          happyHourPrice,
          variantKind: 'standard',
          variantPackageType: null,
          sheet: sheet.name,
          rowNumber,
          notes,
          forceReview: numericName || /^liquor column /i.test(category),
        }),
      )
    }
  }

  return { rows, items, warnings }
}

function parseCocktailsSheet(
  workbook: ParsedWorkbook,
  sheet: WorkbookSheet,
) {
  const sheetDoc = parseXml(getTextFile(workbook.files, sheet.path))
  const headerRow = findRowWithValues(
    sheetDoc,
    workbook.sharedStrings,
    (values) =>
      /cocktail/i.test(values.get(1) ?? '') &&
      /price/i.test(values.get(2) ?? ''),
  )
  const rows: RawMenuRow[] = []
  const items: NormalizedMenuItem[] = []
  const warnings: string[] = []

  if (headerRow === null) return { rows, items, warnings }

  for (let rowNumber = headerRow + 1; rowNumber <= 200; rowNumber += 1) {
    const name = getCellValue(sheetDoc, 1, rowNumber, workbook.sharedStrings)
    const price = getCellValue(sheetDoc, 2, rowNumber, workbook.sharedStrings)
    const description = getCellValue(
      sheetDoc,
      3,
      rowNumber,
      workbook.sharedStrings,
    )
    const menuGroup = getCellValue(
      sheetDoc,
      4,
      rowNumber,
      workbook.sharedStrings,
    )
    const happyHourPrice = getCellValue(
      sheetDoc,
      5,
      rowNumber,
      workbook.sharedStrings,
    )

    if (!hasMeaningfulInput(name, price, happyHourPrice)) continue
    if (isToastTemplateInstruction(name)) continue
    if (isNumericOnly(name) && !isPositiveMoney(price)) continue

    rows.push({
      sheet: sheet.name,
      row: String(rowNumber),
      name,
      price,
      description,
      menuGroup,
      happyHourPrice,
    })

    const notes: string[] = []
    if (clean(name) && !isPositiveMoney(price)) {
      notes.push(
        `${sheet.name} row ${rowNumber}: ${clean(name)} has no positive base price.`,
      )
    }
    if (!clean(menuGroup)) {
      notes.push(
        `${sheet.name} row ${rowNumber}: ${clean(name) || 'Cocktail'} has no Menu Group Name.`,
      )
    }
    if (
      !clean(menuGroup) &&
      clean(description) &&
      /cocktail/i.test(description)
    ) {
      notes.push(
        `${sheet.name} row ${rowNumber}: "${clean(description)}" appears in Description where a Menu Group may have been intended.`,
      )
    }

    items.push(
      createItem({
        id: `toast-workbook:cocktail:${rowNumber}`,
        name:
          normalizeItemName(name) ||
          `[Review ${sheet.name} row ${rowNumber}]`,
        category: 'Cocktails',
        toastCategory: clean(menuGroup) || 'Cocktails',
        toastDestination: '',
        price,
        happyHourPrice,
        variantKind: 'standard',
        variantPackageType: null,
        sheet: sheet.name,
        rowNumber,
        notes,
        forceReview:
          isNumericOnly(name) ||
          !clean(menuGroup) ||
          !isPositiveMoney(price),
      }),
    )
  }

  return { rows, items, warnings }
}

function parseSimpleMenuSheet(
  workbook: ParsedWorkbook,
  sheet: WorkbookSheet,
  workbookCategory: 'NA Bev' | 'Retail',
  idPrefix: 'na-bev' | 'retail',
) {
  const sheetDoc = parseXml(getTextFile(workbook.files, sheet.path))
  const headerRow = findRowWithValues(
    sheetDoc,
    workbook.sharedStrings,
    (values) =>
      values.get(1)?.toLowerCase() === 'item name' &&
      /price/i.test(values.get(2) ?? ''),
  )
  const rows: RawMenuRow[] = []
  const items: NormalizedMenuItem[] = []
  const warnings: string[] = []

  if (headerRow === null) return { rows, items, warnings }

  for (let rowNumber = headerRow + 1; rowNumber <= 200; rowNumber += 1) {
    const name = getCellValue(sheetDoc, 1, rowNumber, workbook.sharedStrings)
    const price = getCellValue(sheetDoc, 2, rowNumber, workbook.sharedStrings)
    const description = getCellValue(
      sheetDoc,
      3,
      rowNumber,
      workbook.sharedStrings,
    )
    const group = getCellValue(
      sheetDoc,
      4,
      rowNumber,
      workbook.sharedStrings,
    )

    if (!hasMeaningfulInput(name, price)) continue
    if (isToastTemplateInstruction(name)) continue
    if (isNumericOnly(name) && !clean(price)) continue

    rows.push({
      sheet: sheet.name,
      row: String(rowNumber),
      name,
      price,
      description,
      group,
    })

    const openPrice = /^open$/i.test(clean(price))
    const validPrice = isPositiveMoney(price)
    const notes: string[] = []
    if (openPrice) {
      notes.push(
        `${sheet.name} row ${rowNumber}: ${clean(name)} uses Open pricing and requires review.`,
      )
    } else if (clean(name) && !validPrice) {
      notes.push(
        `${sheet.name} row ${rowNumber}: ${clean(name)} has no positive price.`,
      )
    }

    items.push(
      createItem({
        id: `toast-workbook:${idPrefix}:${rowNumber}`,
        name:
          normalizeItemName(name) ||
          `[Review ${sheet.name} row ${rowNumber}]`,
        category: workbookCategory,
        toastCategory: clean(group) || workbookCategory,
        toastDestination: '',
        price,
        variantKind: 'standard',
        variantPackageType: null,
        sheet: sheet.name,
        rowNumber,
        notes,
        forceReview: isNumericOnly(name) || openPrice || !validPrice,
      }),
    )
  }

  return { rows, items, warnings }
}

function inspectMenuBuild(workbook: ParsedWorkbook, sheet: WorkbookSheet) {
  const sheetDoc = parseXml(getTextFile(workbook.files, sheet.path))
  const headerRow = findRowWithValues(
    sheetDoc,
    workbook.sharedStrings,
    (values) =>
      /menu group name/i.test(values.get(4) ?? '') &&
      values.has(1),
  )
  if (headerRow === null) return []

  const warnings: string[] = []

  for (let rowNumber = headerRow + 1; rowNumber <= 500; rowNumber += 1) {
    const name = getCellValue(sheetDoc, 1, rowNumber, workbook.sharedStrings)
    const price = getCellValue(sheetDoc, 2, rowNumber, workbook.sharedStrings)
    const menuGroup = getCellValue(
      sheetDoc,
      4,
      rowNumber,
      workbook.sharedStrings,
    )

    if (
      !clean(name) ||
      isToastTemplateInstruction(name) ||
      (isNumericOnly(name) && !isPositiveMoney(price))
    ) {
      continue
    }

    if (!clean(menuGroup)) {
      warnings.push(
        `Menu Build row ${rowNumber}: ${clean(name)} has no Menu Group Name.`,
      )
    }
  }

  return warnings
}

function createItem(input: ItemInput): NormalizedMenuItem {
  const basePriceCents = moneyToCents(input.price)
  const happyHourPriceCents = moneyToCents(input.happyHourPrice ?? '')
  const notes = [...(input.notes ?? [])]
  const review =
    input.forceReview === true ||
    !clean(input.name) ||
    basePriceCents === null

  const rawRow: RawMenuRow = {
    sheet: input.sheet,
    row: String(input.rowNumber),
    name: input.name,
    price: input.price,
    happyHourPrice: input.happyHourPrice ?? '',
  }

  return {
    id: input.id,
    variantLabel: input.toastDestination || 'Standard',
    variantKind: input.variantKind ?? 'standard',
    variantSizeOz: input.variantSizeOz ?? null,
    variantPackageType: input.variantPackageType ?? null,
    sourceKind: 'toast-template-sheet',
    name: input.name,
    category: input.category,
    toastCategory: input.toastCategory,
    toastDestination: input.toastDestination,
    toastSlot: input.toastSlot ?? null,
    basePriceCents,
    happyHourPriceCents,
    effectiveTimes: [],
    sourceRowCount: 1,
    status: review ? 'review' : 'ready',
    organizationEnabled: true,
    exportToToast: !review,
    exportIncluded: !review,
    notes,
    rawRows: [rawRow],
  }
}

function readWorkbook(arrayBuffer: ArrayBuffer): ParsedWorkbook {
  const files = unzipSync(new Uint8Array(arrayBuffer.slice(0)))
  const workbook = parseXml(getTextFile(files, WORKBOOK_PATH))
  const relationships = parseXml(getTextFile(files, WORKBOOK_RELS_PATH))
  const sharedStrings = getSharedStrings(files)
  const relationshipById = new Map<string, string>()

  Array.from(
    relationships.getElementsByTagName('Relationship'),
  ).forEach((relationship) => {
    const id = relationship.getAttribute('Id')
    const target = relationship.getAttribute('Target')
    if (id && target) {
      relationshipById.set(id, resolveXlsxPath(WORKBOOK_PATH, target))
    }
  })

  const sheets = Array.from(workbook.getElementsByTagName('sheet')).flatMap(
    (sheet): WorkbookSheet[] => {
      const name = sheet.getAttribute('name')
      const relationshipId =
        sheet.getAttributeNS(RELATIONSHIP_NS, 'id') ??
        sheet.getAttribute('r:id')
      const path = relationshipId
        ? relationshipById.get(relationshipId)
        : null

      return name && path
        ? [
            {
              name,
              path,
              state: sheet.getAttribute('state') ?? 'visible',
            },
          ]
        : []
    },
  )

  return { files, sharedStrings, sheets }
}

function findSheet(sheets: WorkbookSheet[], name: string) {
  return (
    sheets.find(
      (sheet) => sheet.name.toLowerCase() === name.toLowerCase(),
    ) ?? null
  )
}

function findRowWithValues(
  sheetDoc: Document,
  sharedStrings: string[],
  predicate: (values: Map<number, string>) => boolean,
) {
  const rows = Array.from(sheetDoc.getElementsByTagName('row'))

  for (const row of rows) {
    const rowNumber = Number(row.getAttribute('r'))
    if (!Number.isFinite(rowNumber) || rowNumber > 80) continue

    const values = getRowValueMap(sheetDoc, rowNumber, sharedStrings)
    if (predicate(values)) return rowNumber
  }

  return null
}

function getRowValueMap(
  sheetDoc: Document,
  rowNumber: number,
  sharedStrings: string[],
) {
  const values = new Map<number, string>()
  const row = Array.from(sheetDoc.getElementsByTagName('row')).find(
    (candidate) => Number(candidate.getAttribute('r')) === rowNumber,
  )
  if (!row) return values

  Array.from(row.getElementsByTagName('c')).forEach((cell) => {
    const reference = cell.getAttribute('r') ?? ''
    const column = columnNumber(reference.replace(/\d+$/, ''))
    if (column <= 0) return
    values.set(column, getCellDisplayValue(cell, sharedStrings))
  })

  return values
}

function getCellValue(
  sheetDoc: Document,
  column: number,
  rowNumber: number,
  sharedStrings: string[],
) {
  const reference = `${columnLetters(column)}${rowNumber}`
  const cell = Array.from(sheetDoc.getElementsByTagName('c')).find(
    (candidate) => candidate.getAttribute('r') === reference,
  )
  if (!cell) return ''

  return getCellDisplayValue(cell, sharedStrings)
}

function getCellDisplayValue(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute('t')
  const value = cell.getElementsByTagName('v')[0]?.textContent ?? ''

  if (type === 's') {
    const index = Number(value)
    return Number.isInteger(index) ? sharedStrings[index] ?? '' : ''
  }

  if (type === 'inlineStr') {
    return Array.from(cell.getElementsByTagName('t'))
      .map((node) => node.textContent ?? '')
      .join('')
  }

  if (type === 'str') return value

  return value
}

function getSharedStrings(files: Record<string, Uint8Array>) {
  const bytes = files['xl/sharedStrings.xml']
  if (!bytes) return []

  const doc = parseXml(strFromU8(bytes))

  return Array.from(doc.getElementsByTagName('si')).map((item) =>
    Array.from(item.getElementsByTagName('t'))
      .map((text) => text.textContent ?? '')
      .join(''),
  )
}

function getTextFile(files: Record<string, Uint8Array>, path: string) {
  const bytes = files[path]
  if (!bytes) throw new Error(`Toast workbook is missing ${path}`)
  return strFromU8(bytes)
}

function parseXml(value: string) {
  const doc = new DOMParser().parseFromString(value, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Unable to parse Toast workbook XML')
  }
  return doc
}

function resolveXlsxPath(basePath: string, target: string) {
  if (target.startsWith('/')) return target.replace(/^\/+/, '')

  const baseParts = basePath.split('/')
  baseParts.pop()

  target.split('/').forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') baseParts.pop()
    else baseParts.push(part)
  })

  return baseParts.join('/')
}

function moneyToCents(value: string) {
  const cleaned = clean(value).replace(/^\$/, '').replace(/,/g, '')
  if (!cleaned || /^open$/i.test(cleaned)) return null

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100)
}

function isPositiveMoney(value: string) {
  return moneyToCents(value) !== null
}

function normalizeItemName(value: string) {
  const normalized = clean(value)
  if (!normalized) return ''

  if (/^-?\d+\.0+$/.test(normalized)) {
    return normalized.replace(/\.0+$/, '')
  }

  return normalized
}

function isToastTemplateInstruction(value: string) {
  const normalized = clean(value).toLowerCase()

  return (
    normalized.startsWith('need more space?') ||
    normalized.includes('menu onboarding consultant via the "notes" tab') ||
    normalized.includes("menu onboarding consultant via the 'notes' tab")
  )
}

function isNumericOnly(value: string) {
  const cleaned = clean(value)
  if (!cleaned) return false
  return /^\$?\d+(?:\.\d+)?$/.test(cleaned)
}

function hasMeaningfulInput(...values: string[]) {
  return values.some((value) => {
    const cleaned = clean(value)
    return cleaned !== '' && cleaned !== '0' && cleaned !== '0.0'
  })
}

function normalizeLiquorCategory(value: string) {
  const category = clean(value).toUpperCase().replace(/&/g, '/')

  if (category.includes('WHISKEY') || category.includes('BOURBON')) {
    return 'WHISKEY/BOURBON'
  }
  if (category.includes('BRANDY') || category.includes('COGNAC')) {
    return 'BRANDY/COGNAC'
  }
  if (category.includes('LIQUEUR') || category.includes('CORDIAL')) {
    return 'LIQUEURS'
  }

  return category
}

function parseSizeOz(value: string) {
  const match = clean(value).match(/(\d+(?:\.\d+)?)\s*oz/i)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function columnNumber(letters: string) {
  return letters
    .toUpperCase()
    .split('')
    .reduce((value, character) => {
      const code = character.charCodeAt(0) - 64
      return code >= 1 && code <= 26 ? value * 26 + code : value
    }, 0)
}

function columnLetters(column: number) {
  let value = column
  let result = ''

  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }

  return result
}

function clean(value?: string) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
