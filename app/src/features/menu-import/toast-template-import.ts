import { strFromU8, unzipSync } from 'fflate'
import type { NormalizedMenuItem, ParsedMenuImport, RawMenuRow } from './types'

const WORKBOOK_PATH = 'xl/workbook.xml'
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels'
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

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

type CellValue = {
  col: number
  value: string
}

type TemplateImportResult = {
  importFile: ParsedMenuImport
  items: NormalizedMenuItem[]
}

type BeerSlot = {
  label: string
  kind: 'draft' | 'can' | 'can24oz' | 'bottle'
  nameCol: number
  priceCol: number
  happyHourCol: number | null
  sourceSizeOz?: number | null
}

type GenericTabConfig = {
  sheetName: string
  toastCategory: string
  categoryFromGroup?: boolean
}

const GENERIC_TABS: GenericTabConfig[] = [
  { sheetName: 'Wine', toastCategory: 'Wine' },
  { sheetName: 'Cocktails', toastCategory: 'Cocktails' },
  { sheetName: 'NA Bev', toastCategory: 'NA Bev', categoryFromGroup: true },
  { sheetName: 'Retail', toastCategory: 'Retail', categoryFromGroup: true },
]

const LIQUOR_CATEGORY_NAMES = new Set([
  'vodka',
  'gin',
  'rum',
  'tequila',
  'whiskey/bourbon',
  'whiskey & bourbon',
  'bourbon',
  'scotch',
  'liqueurs/cordials',
  'liqueurs & cordials',
  'brandy/cognac',
  'brandy & cognac',
])

export function parseToastTemplateWorkbook(arrayBuffer: ArrayBuffer, fileName: string): TemplateImportResult {
  const workbookPackage = readWorkbookPackage(arrayBuffer)
  const sheets = getWorkbookSheets(workbookPackage)
  const items: NormalizedMenuItem[] = []
  const warnings: string[] = []

  const beerSheet = findSheet(sheets, 'Beer')
  if (beerSheet) {
    try {
      items.push(...parseBeerSheet(workbookPackage, beerSheet))
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Unable to import Beer tab')
    }
  }

  const liquorSheet = findSheet(sheets, 'Liquor')
  if (liquorSheet) {
    try {
      items.push(...parseLiquorSheet(workbookPackage, liquorSheet))
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Unable to import Liquor tab')
    }
  }

  GENERIC_TABS.forEach((config) => {
    const sheet = findSheet(sheets, config.sheetName)
    if (!sheet) return

    try {
      items.push(...parseGenericSheet(workbookPackage, sheet, config))
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Unable to import ${config.sheetName} tab`)
    }
  })

  const importFile: ParsedMenuImport = {
    sourceKind: 'toast-template-sheet',
    sourceName: fileName,
    rows: items.map((item) => item.rawRows[0] ?? {}),
    warnings,
    meta: {
      source: 'Toast Menu Template workbook',
      tabs: sheets.map((sheet) => sheet.name).join(', '),
    },
  }

  return { importFile, items }
}

function parseBeerSheet(workbookPackage: WorkbookPackage, sheet: WorkbookSheet) {
  const sheetDoc = parseXml(getTextFile(workbookPackage.files, sheet.path))
  const headerRow = findRowByValues(sheetDoc, workbookPackage.sharedStrings, (values) => (
    values.includes('draft beer') && values.some((value) => value === 'can' || value.includes('bottle') || value.includes('24oz can'))
  ))
  if (!headerRow) return []

  const headerValues = getRowValues(sheetDoc, headerRow, workbookPackage.sharedStrings)
  const dataStartRow = headerRow + 1
  const lastRow = getLastWorksheetRow(sheetDoc)
  const slots = getBeerSlots(headerValues)
  const items: NormalizedMenuItem[] = []

  slots.forEach((slot) => {
    for (let rowNumber = dataStartRow; rowNumber <= lastRow; rowNumber += 1) {
      const name = getCellValue(sheetDoc, slot.nameCol, rowNumber, workbookPackage.sharedStrings)
      const price = parseMoney(getCellValue(sheetDoc, slot.priceCol, rowNumber, workbookPackage.sharedStrings))
      const happyHour = slot.happyHourCol
        ? parseMoney(getCellValue(sheetDoc, slot.happyHourCol, rowNumber, workbookPackage.sharedStrings))
        : null

      if (!name || price === null) continue
      if (isLikelyInstructionRow(name)) continue

      const destination = getBeerDestination(slot)
      const row = buildRawRow(sheet.name, rowNumber, slot.label, name, price, happyHour)
      items.push(createItem({
        id: `toast-xlsx:beer:${slot.kind}:${slot.priceCol}:${rowNumber}`,
        name: slot.kind === 'draft' ? `${name} ${slot.label}` : name,
        category: getBeerCategory(slot),
        toastCategory: 'Beer',
        toastDestination: destination,
        basePriceCents: price,
        happyHourPriceCents: happyHour,
        rawRow: row,
      }))
    }
  })

  return items
}

function getBeerSlots(headerValues: CellValue[]): BeerSlot[] {
  const draftNameCol = findColumn(headerValues, /^draft\s+beer$/i)
  const firstPackagedCol = headerValues
    .filter((cell) => /^(can|bottle|24\s*oz\s*can)$/i.test(cell.value.trim()))
    .map((cell) => cell.col)
    .sort((left, right) => left - right)[0] ?? Number.POSITIVE_INFINITY
  const slots: BeerSlot[] = []

  if (draftNameCol !== null) {
    headerValues
      .filter((cell) => cell.col > draftNameCol && cell.col < firstPackagedCol)
      .forEach((cell) => {
        if (/happy\s*hour/i.test(cell.value) || /^pitcher$/i.test(cell.value)) return
        const sizeMatch = cell.value.match(/(\d+)\s*oz/i)
        if (!sizeMatch) return
        const happyHourCol = headerValues.find((candidate) => (
          candidate.col > cell.col
          && candidate.col <= cell.col + 1
          && /happy\s*hour/i.test(candidate.value)
        ))?.col ?? null

        slots.push({
          label: `${Number(sizeMatch[1])}oz`,
          kind: 'draft',
          nameCol: draftNameCol,
          priceCol: cell.col,
          happyHourCol,
          sourceSizeOz: Number(sizeMatch[1]),
        })
      })
  }

  headerValues.forEach((cell) => {
    const label = cell.value.trim()
    if (!/^(can|bottle|24\s*oz\s*can)$/i.test(label)) return

    const nextPackagedCol = headerValues
      .filter((candidate) => candidate.col > cell.col && /^(can|bottle|24\s*oz\s*can)$/i.test(candidate.value.trim()))
      .map((candidate) => candidate.col)
      .sort((left, right) => left - right)[0] ?? Number.POSITIVE_INFINITY
    const groupCells = headerValues.filter((candidate) => candidate.col > cell.col && candidate.col < nextPackagedCol)

    if (/^can$/i.test(label)) {
      const regularPriceCell = groupCells.find((candidate) => (
        !/happy\s*hour/i.test(candidate.value)
        && !/^24\s*oz(?:\s*can)?$/i.test(candidate.value)
      ))
      const regularPriceCol = regularPriceCell?.col ?? cell.col + 1
      const regularHappyHourCol = groupCells.find((candidate) => (
        candidate.col > regularPriceCol
        && candidate.col <= regularPriceCol + 1
        && /happy\s*hour/i.test(candidate.value)
      ))?.col ?? null

      slots.push({ label: regularPriceCell?.value || 'Can', kind: 'can', nameCol: cell.col, priceCol: regularPriceCol, happyHourCol: regularHappyHourCol })

      const can24ozCell = groupCells.find((candidate) => /^24\s*oz(?:\s*can)?$/i.test(candidate.value))
      if (can24ozCell) {
        const can24ozHappyHourCol = groupCells.find((candidate) => (
          candidate.col > can24ozCell.col
          && candidate.col <= can24ozCell.col + 1
          && /happy\s*hour/i.test(candidate.value)
        ))?.col ?? null
        slots.push({ label: '24oz Can', kind: 'can24oz', nameCol: cell.col, priceCol: can24ozCell.col, happyHourCol: can24ozHappyHourCol })
      }
      return
    }

    const priceCol = groupCells.find((candidate) => /price/i.test(candidate.value))?.col ?? cell.col + 1
    const happyHourCol = groupCells.find((candidate) => /happy\s*hour/i.test(candidate.value))?.col ?? null
    const kind = /^24\s*oz/i.test(label) ? 'can24oz' : 'bottle'
    slots.push({ label, kind, nameCol: cell.col, priceCol, happyHourCol })
  })

  return slots
}

function parseLiquorSheet(workbookPackage: WorkbookPackage, sheet: WorkbookSheet) {
  const sheetDoc = parseXml(getTextFile(workbookPackage.files, sheet.path))
  const categoryRow = findRowByValues(sheetDoc, workbookPackage.sharedStrings, (values) => (
    values.includes('vodka') && values.includes('gin') && values.includes('rum')
  ))
  if (!categoryRow) return []

  const headerRow = categoryRow + 1
  const dataStartRow = headerRow + 1
  const categoryValues = getRowValues(sheetDoc, categoryRow, workbookPackage.sharedStrings)
  const headerValues = getRowValues(sheetDoc, headerRow, workbookPackage.sharedStrings)
  const lastRow = getLastWorksheetRow(sheetDoc)
  const items: NormalizedMenuItem[] = []

  categoryValues.forEach((categoryCell) => {
    const liquorType = normalizeLiquorCategory(categoryCell.value)
    if (!liquorType) return

    const groupHeaders = headerValues.filter((cell) => cell.col >= categoryCell.col && cell.col <= categoryCell.col + 3)
    const nameCol = groupHeaders.find((cell) => /item\s*name/i.test(cell.value))?.col ?? categoryCell.col
    const priceCol = groupHeaders.find((cell) => /price/i.test(cell.value))?.col ?? categoryCell.col + 1
    const happyHourCol = groupHeaders.find((cell) => /happy\s*hour/i.test(cell.value))?.col ?? null

    for (let rowNumber = dataStartRow; rowNumber <= lastRow; rowNumber += 1) {
      const name = getCellValue(sheetDoc, nameCol, rowNumber, workbookPackage.sharedStrings)
      const price = parseMoney(getCellValue(sheetDoc, priceCol, rowNumber, workbookPackage.sharedStrings))
      const happyHour = happyHourCol
        ? parseMoney(getCellValue(sheetDoc, happyHourCol, rowNumber, workbookPackage.sharedStrings))
        : null

      if (!name || price === null) continue
      const row = buildRawRow(sheet.name, rowNumber, liquorType, name, price, happyHour)
      items.push(createItem({
        id: `toast-xlsx:liquor:${liquorType}:${nameCol}:${rowNumber}`,
        name,
        category: liquorType,
        toastCategory: liquorType,
        toastDestination: `Toast Liquor tab: ${liquorType}`,
        basePriceCents: price,
        happyHourPriceCents: happyHour,
        rawRow: row,
      }))
    }
  })

  return items
}

function parseGenericSheet(workbookPackage: WorkbookPackage, sheet: WorkbookSheet, config: GenericTabConfig) {
  const sheetDoc = parseXml(getTextFile(workbookPackage.files, sheet.path))
  const headerRow = findRowByValues(sheetDoc, workbookPackage.sharedStrings, (values) => (
    values.some((value) => /item\s*name|name/.test(value)) && values.some((value) => /price/.test(value))
  ))
  if (!headerRow) return []

  const headerValues = getRowValues(sheetDoc, headerRow, workbookPackage.sharedStrings)
  const nameCol = headerValues.find((cell) => /item\s*name|^name$/i.test(cell.value))?.col
  const priceCol = headerValues.find((cell) => /price/i.test(cell.value))?.col
  const happyHourCol = headerValues.find((cell) => /happy\s*hour/i.test(cell.value))?.col ?? null
  const groupCol = headerValues.find((cell) => /^group$/i.test(cell.value))?.col ?? null
  if (!nameCol || !priceCol) return []

  const items: NormalizedMenuItem[] = []
  const lastRow = getLastWorksheetRow(sheetDoc)
  for (let rowNumber = headerRow + 1; rowNumber <= lastRow; rowNumber += 1) {
    const name = getCellValue(sheetDoc, nameCol, rowNumber, workbookPackage.sharedStrings)
    const price = parseMoney(getCellValue(sheetDoc, priceCol, rowNumber, workbookPackage.sharedStrings))
    const happyHour = happyHourCol
      ? parseMoney(getCellValue(sheetDoc, happyHourCol, rowNumber, workbookPackage.sharedStrings))
      : null
    const group = groupCol ? getCellValue(sheetDoc, groupCol, rowNumber, workbookPackage.sharedStrings) : ''

    if (!name || price === null) continue
    const toastCategory = config.categoryFromGroup && group ? clean(group) : config.toastCategory
    const row = buildRawRow(sheet.name, rowNumber, toastCategory, name, price, happyHour, group)
    items.push(createItem({
      id: `toast-xlsx:${sheet.name}:${nameCol}:${rowNumber}`,
      name,
      category: toastCategory,
      toastCategory,
      toastDestination: `Toast ${sheet.name} tab${group ? `: ${group}` : ''}`,
      basePriceCents: price,
      happyHourPriceCents: happyHour,
      rawRow: row,
    }))
  }

  return items
}

function createItem({
  id,
  name,
  category,
  toastCategory,
  toastDestination,
  basePriceCents,
  happyHourPriceCents,
  rawRow,
}: {
  id: string
  name: string
  category: string
  toastCategory: string
  toastDestination: string
  basePriceCents: number
  happyHourPriceCents: number | null
  rawRow: RawMenuRow
}): NormalizedMenuItem {
  return {
    id,
    sourceKind: 'toast-template-sheet',
    sourceItemNumber: rawRow.Row,
    name: clean(name),
    category,
    toastCategory,
    toastDestination,
    basePriceCents,
    happyHourPriceCents,
    happyHourWindow: happyHourPriceCents === null ? undefined : 'Imported from Toast template',
    effectiveTimes: [],
    sourceRowCount: 1,
    status: 'ready',
    exportIncluded: true,
    notes: ['Imported from populated Toast template workbook'],
    rawRows: [rawRow],
  }
}

function getBeerDestination(slot: BeerSlot) {
  if (slot.kind === 'draft') return `Toast Beer tab: Draft Beer ${slot.label}`
  if (slot.kind === 'can24oz') return 'Toast Beer tab: 24oz Can'
  if (slot.kind === 'bottle') return 'Toast Beer tab: Bottle'
  return 'Toast Beer tab: Can'
}

function getBeerCategory(slot: BeerSlot) {
  if (slot.kind === 'draft') return `DRAFT ${slot.label.toUpperCase()}`
  if (slot.kind === 'can24oz') return 'BEER CAN 24OZ'
  if (slot.kind === 'bottle') return 'BEER BOTTLE'
  return 'BEER CAN'
}

function normalizeLiquorCategory(value: string) {
  const normalized = clean(value).replace(/&/g, '/').replace(/\s+/g, ' ')
  const key = normalized.toLowerCase()
  if (!LIQUOR_CATEGORY_NAMES.has(key) && !key.includes('optional liquor category')) return ''
  if (key.includes('optional liquor category')) return ''
  if (key.includes('whiskey') || key.includes('bourbon')) return 'WHISKEY/BOURBON'
  if (key.includes('liqueur') || key.includes('cordial')) return 'LIQUEURS/CORDIALS'
  if (key.includes('brandy') || key.includes('cognac')) return 'BRANDY/COGNAC'
  return normalized.toUpperCase()
}

function buildRawRow(sheet: string, rowNumber: number, group: string, name: string, price: number, happyHour: number | null, groupValue = ''): RawMenuRow {
  return {
    Sheet: sheet,
    Row: String(rowNumber),
    Group: groupValue || group,
    Name: name,
    Price: (price / 100).toFixed(2),
    'Happy Hour': happyHour === null ? '' : (happyHour / 100).toFixed(2),
  }
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

function findSheet(sheets: WorkbookSheet[], expectedName: string) {
  return sheets.find((sheet) => sheet.name.toLowerCase() === expectedName.toLowerCase()) ?? null
}

function findRowByValues(sheetDoc: Document, sharedStrings: string[], predicate: (values: string[]) => boolean) {
  const maxRow = Math.min(60, getLastWorksheetRow(sheetDoc))
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const values = getRowValues(sheetDoc, rowNumber, sharedStrings).map((cell) => clean(cell.value).toLowerCase())
    if (predicate(values)) return rowNumber
  }
  return null
}

function getRowValues(sheetDoc: Document, rowNumber: number, sharedStrings: string[]): CellValue[] {
  const row = findRow(sheetDoc, rowNumber)
  if (!row) return []

  return Array.from(row.getElementsByTagName('c')).map((cell) => ({
    col: columnLettersToNumber(getCellReferenceColumn(cell.getAttribute('r') ?? '')),
    value: getCellDisplayValue(cell, sharedStrings),
  })).filter((cell) => cell.col > 0)
}

function getCellValue(sheetDoc: Document, column: number, rowNumber: number, sharedStrings: string[]) {
  const row = findRow(sheetDoc, rowNumber)
  const cell = row ? findCellInRow(row, `${numberToColumnLetters(column)}${rowNumber}`) : null
  return cell ? getCellDisplayValue(cell, sharedStrings) : ''
}

function findColumn(rowValues: CellValue[], matcher: RegExp) {
  return rowValues.find((cell) => matcher.test(cell.value))?.col ?? null
}

function findRow(sheetDoc: Document, rowNumber: number) {
  return Array.from(sheetDoc.getElementsByTagName('row')).find((row) => Number(row.getAttribute('r')) === rowNumber) ?? null
}

function findCellInRow(row: Element, reference: string) {
  return Array.from(row.getElementsByTagName('c')).find((cell) => cell.getAttribute('r') === reference) ?? null
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

function parseMoney(value: string) {
  const cleaned = clean(value).replace(/[$,]/g, '')
  if (!cleaned) return null
  const numberValue = Number(cleaned)
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) : null
}

function clean(value?: string) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function isLikelyInstructionRow(value: string) {
  const cleaned = clean(value).toLowerCase()
  return cleaned.includes('example') || cleaned.includes('enter your') || cleaned.includes('delete or replace')
}
