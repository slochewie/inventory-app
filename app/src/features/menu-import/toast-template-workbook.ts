import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { buildBeerTabPreviewRows, type BeerTabPreviewRow } from './beer-preview'
import type { NormalizedMenuItem } from './types'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const WORKBOOK_PATH = 'xl/workbook.xml'
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels'
const SPREADSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const DATA_ROW_BUFFER = 20

const OMIT_WORKBOOK_BEERS = new Set([
  '$5', '$5 can', 'domestic', 'domestic can', 'import', 'import can', 'tall',
  'malibu boo', 'pb & j', 'the setup', 'cc 1.00', 'cc 100', 'cc 1', 'c', 'c-',
  'sierra pale', 'stiegl radler', 'fig. mtn. agua santa', 'fig mtn agua santa',
  'sierra torpedo', 'blue moon', 'banquet', 'bd', 'bd lite', 'm lite', 'h life', 'tec',
  'bavic pilsner', 'ashland seltzer', 'ashland 16', 'jameson can', 'jameson', 'draft',
  'dba', 'weinstephan', 'stone', 'rogue', 'liquid gravity', 'fig mtn davy brown',
  'pizza port', 'alesmith', 'maui brewing', 'voodoo ranger', 'lg dope melody',
  'wandering don', 'weihenstephan', "killian's", 'tap it', 'weihensteph',
  'new beer', 'tdne', 'silva',
])

export type ToastTemplateWorkbookInfo = {
  fileName: string
  sheetNames: string[]
  beer?: BeerTemplateInfo
  warnings: string[]
}

export type BeerTemplateInfo = {
  sheetName: string
  headerRow: number
  draftSizes: string[]
  packagedGroups: string[]
  dataStartRow: number
}

type WorkbookPackage = {
  files: Record<string, Uint8Array>
  sharedStrings: string[]
  workbook: Document
  workbookRelationships: Document
}

type BeerTemplateMapping = {
  sheetPath: string
  sheetName: string
  headerRow: number
  dataStartRow: number
  lastTemplateRow: number
  draftNameCol: number | null
  draftSizes: DraftSizeSlot[]
  packagedGroups: PackagedGroupSlot[]
  warnings: string[]
}

type DraftSizeSlot = {
  label: string
  sizeOz: number | null
  priceCol: number
  happyHourCol: number | null
}

type PackagedGroupSlot = {
  label: string
  kind: 'can' | 'bottle' | 'can24oz' | 'optional'
  nameCol: number
  priceCol: number | null
  happyHourCol: number | null
}

export function inspectToastTemplateWorkbook(arrayBuffer: ArrayBuffer, fileName: string): ToastTemplateWorkbookInfo {
  const workbookPackage = readWorkbookPackage(arrayBuffer)
  const sheetNames = getWorkbookSheets(workbookPackage).map((sheet) => sheet.name)
  const warnings: string[] = []
  let beer: BeerTemplateInfo | undefined

  try {
    const mapping = getBeerTemplateMapping(workbookPackage)
    warnings.push(...mapping.warnings)
    beer = {
      sheetName: mapping.sheetName,
      headerRow: mapping.headerRow,
      draftSizes: mapping.draftSizes.map((slot) => slot.label),
      packagedGroups: mapping.packagedGroups.map((slot) => slot.label),
      dataStartRow: mapping.dataStartRow,
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'Unable to inspect Beer tab')
  }

  return { fileName, sheetNames, beer, warnings }
}

export function buildPopulatedToastTemplateWorkbook({
  templateArrayBuffer,
  items,
  happyHourEnabled = true,
}: {
  templateArrayBuffer: ArrayBuffer
  items: NormalizedMenuItem[]
  happyHourEnabled?: boolean
}) {
  const workbookPackage = readWorkbookPackage(templateArrayBuffer)
  populateBeerSheet(workbookPackage, items, happyHourEnabled)
  return new Blob([zipSync(workbookPackage.files, { level: 6 })], { type: XLSX_MIME })
}

export async function buildToastWorkbookZip(filename: string, workbook: Blob) {
  const bytes = new Uint8Array(await workbook.arrayBuffer())
  return new Blob(
    [zipSync({ [filename]: bytes }, { level: 6 })],
    { type: 'application/zip' },
  )
}

export function downloadToastWorkbookFile(filename: string, blob: Blob) {
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function buildToastWorkbookFilename(organizationName: string, now = new Date()) {
  const safeOrganizationName = organizationName
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'Organization'

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return [
    'Toast-Menu-Template',
    safeOrganizationName,
    `${parts.month}-${parts.day}-${parts.year}-${parts.hour}${parts.minute}`,
  ].join('-') + '.xlsx'
}

function populateBeerSheet(
  workbookPackage: WorkbookPackage,
  items: NormalizedMenuItem[],
  happyHourEnabled: boolean,
) {
  const mapping = getBeerTemplateMapping(workbookPackage)
  const sheetXml = getTextFile(workbookPackage.files, mapping.sheetPath)
  const sheetDoc = parseXml(sheetXml)
  const beerRows = buildWorkbookBeerRows(items, happyHourEnabled)
  const writtenRowCount = writeBeerRowsToSheet(sheetDoc, mapping, beerRows)

  updateWorksheetDimension(sheetDoc, mapping, writtenRowCount)
  workbookPackage.files[mapping.sheetPath] = strToU8(serializeXml(sheetDoc))
}

function buildWorkbookBeerRows(
  items: NormalizedMenuItem[],
  happyHourEnabled: boolean,
) {
  const merged = new Map<string, BeerTabPreviewRow>()

  buildBeerTabPreviewRows(items, happyHourEnabled)
    .filter((row) => hasAnyBeerPrice(row) && !isOmittedWorkbookBeer(row.beerName))
    .forEach((row) => {
      const key = workbookBeerKey(row.beerName)
      const existing = merged.get(key)

      if (!existing) {
        merged.set(key, {
          ...row,
          beerName: titleWorkbookBeerName(row.beerName),
          reviewNotes: [...row.reviewNotes],
        })
        return
      }

      mergeWorkbookBeerRow(existing, row)
    })

  return [...merged.values()].sort((left, right) => left.beerName.localeCompare(right.beerName))
}

function mergeWorkbookBeerRow(target: BeerTabPreviewRow, source: BeerTabPreviewRow) {
  if (source.draft10ozPrice !== null) target.draft10ozPrice = source.draft10ozPrice
  if (source.draft10ozHappyHour !== null) target.draft10ozHappyHour = source.draft10ozHappyHour
  if (source.draft16ozPrice !== null) target.draft16ozPrice = source.draft16ozPrice
  if (source.draft16ozHappyHour !== null) target.draft16ozHappyHour = source.draft16ozHappyHour
  if (source.canPrice !== null) target.canPrice = source.canPrice
  if (source.canHappyHour !== null) target.canHappyHour = source.canHappyHour
  if (source.can24ozPrice !== null) target.can24ozPrice = source.can24ozPrice
  if (source.can24ozHappyHour !== null) target.can24ozHappyHour = source.can24ozHappyHour
  if (source.bottlePrice !== null) target.bottlePrice = source.bottlePrice
  if (source.bottleHappyHour !== null) target.bottleHappyHour = source.bottleHappyHour
  target.reviewNotes.push(...source.reviewNotes)
}

function isOmittedWorkbookBeer(beerName: string) {
  const key = normalizeWorkbookBeerName(beerName)
  const compactKey = workbookBeerKey(beerName)
  return OMIT_WORKBOOK_BEERS.has(key)
    || OMIT_WORKBOOK_BEERS.has(compactKey)
    || /^\$?\d+(?:\.\d{2})?$/.test(key)
    || /^\$?\d+(?:\.\d{2})?$/.test(compactKey)
}

function normalizeWorkbookBeerName(value: string) {
  return value
    .toLowerCase()
    .replace(/[.’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function workbookBeerKey(value: string) {
  return normalizeWorkbookBeerName(value)
    .replace(/\b(10\s*oz|10oz|16\s*oz|16oz|20\s*oz|20oz|24\s*oz|24oz)\b/gi, '')
    .replace(/\b(draft|pint|imperial|imp|reg|regular|can|bottle|btl|tall)\b/gi, '')
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9$]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleWorkbookBeerName(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bIpa\b/g, 'IPA')
    .replace(/\bNa\b/g, 'NA')
}

function writeBeerRowsToSheet(sheetDoc: Document, mapping: BeerTemplateMapping, beerRows: BeerTabPreviewRow[]) {
  const draftRows = beerRows.filter(hasDraftBeerPrice)
  const canRows = beerRows.filter((row) => row.canPrice !== null)
  const bottleSlotRows = [
    ...beerRows
      .filter((row) => row.can24ozPrice !== null)
      .map((row) => ({ row, kind: 'can24oz' as const })),
    ...beerRows
      .filter((row) => row.bottlePrice !== null)
      .map((row) => ({ row, kind: 'bottle' as const })),
  ]
  const writtenRowCount = Math.max(draftRows.length, canRows.length, bottleSlotRows.length)
  const clearToRow = Math.max(mapping.lastTemplateRow, mapping.dataStartRow + writtenRowCount + DATA_ROW_BUFFER)
  const targetColumns = getBeerTargetColumns(mapping)

  clearCells(sheetDoc, targetColumns, mapping.dataStartRow, clearToRow)

  draftRows.forEach((beerRow, index) => {
    writeDraftBeerRow(sheetDoc, mapping, mapping.dataStartRow + index, beerRow)
  })

  canRows.forEach((beerRow, index) => {
    writeCanBeerRow(sheetDoc, mapping, mapping.dataStartRow + index, beerRow)
  })

  bottleSlotRows.forEach(({ row, kind }, index) => {
    writeBottleSlotBeerRow(sheetDoc, mapping, mapping.dataStartRow + index, row, kind)
  })

  return writtenRowCount
}

function writeDraftBeerRow(sheetDoc: Document, mapping: BeerTemplateMapping, rowNumber: number, beerRow: BeerTabPreviewRow) {
  if (mapping.draftNameCol === null) return

  const draft10Slot = findDraftSlot(mapping, 10)
  const draft16Slot = findDraftSlot(mapping, 16)

  writeCellValue(sheetDoc, mapping.draftNameCol, rowNumber, beerRow.beerName, mapping.dataStartRow)

  if (draft10Slot) {
    writeCellValue(sheetDoc, draft10Slot.priceCol, rowNumber, centsToDollars(beerRow.draft10ozPrice), mapping.dataStartRow)
    if (draft10Slot.happyHourCol) {
      writeCellValue(sheetDoc, draft10Slot.happyHourCol, rowNumber, centsToDollars(beerRow.draft10ozHappyHour), mapping.dataStartRow)
    }
  }

  if (draft16Slot) {
    writeCellValue(sheetDoc, draft16Slot.priceCol, rowNumber, centsToDollars(beerRow.draft16ozPrice), mapping.dataStartRow)
    if (draft16Slot.happyHourCol) {
      writeCellValue(sheetDoc, draft16Slot.happyHourCol, rowNumber, centsToDollars(beerRow.draft16ozHappyHour), mapping.dataStartRow)
    }
  }
}

function writeCanBeerRow(sheetDoc: Document, mapping: BeerTemplateMapping, rowNumber: number, beerRow: BeerTabPreviewRow) {
  const canSlot = findPackagedSlot(mapping, 'can')
  if (!canSlot || beerRow.canPrice === null) return

  writeCellValue(sheetDoc, canSlot.nameCol, rowNumber, beerRow.beerName, mapping.dataStartRow)
  if (canSlot.priceCol) writeCellValue(sheetDoc, canSlot.priceCol, rowNumber, centsToDollars(beerRow.canPrice), mapping.dataStartRow)
  if (canSlot.happyHourCol) writeCellValue(sheetDoc, canSlot.happyHourCol, rowNumber, centsToDollars(beerRow.canHappyHour), mapping.dataStartRow)
}

function writeBottleSlotBeerRow(
  sheetDoc: Document,
  mapping: BeerTemplateMapping,
  rowNumber: number,
  beerRow: BeerTabPreviewRow,
  kind: 'can24oz' | 'bottle',
) {
  const bottleSlot = findPackagedSlot(mapping, 'bottle')
  const price = kind === 'can24oz' ? beerRow.can24ozPrice : beerRow.bottlePrice
  const happyHour = kind === 'can24oz' ? beerRow.can24ozHappyHour : beerRow.bottleHappyHour
  if (!bottleSlot || price === null) return

  writeCellValue(sheetDoc, bottleSlot.nameCol, rowNumber, beerRow.beerName, mapping.dataStartRow)
  if (bottleSlot.priceCol) writeCellValue(sheetDoc, bottleSlot.priceCol, rowNumber, centsToDollars(price), mapping.dataStartRow)
  if (bottleSlot.happyHourCol) writeCellValue(sheetDoc, bottleSlot.happyHourCol, rowNumber, centsToDollars(happyHour), mapping.dataStartRow)
}

function findDraftSlot(mapping: BeerTemplateMapping, sourceSizeOz: 10 | 16) {
  if (sourceSizeOz === 10) {
    const eightOunceSlot = mapping.draftSizes.find((slot) => slot.sizeOz === 8)
    if (eightOunceSlot) return eightOunceSlot

    return [...mapping.draftSizes]
      .filter((slot) => slot.sizeOz !== null)
      .sort((left, right) => Number(left.sizeOz) - Number(right.sizeOz))[0] ?? null
  }

  const exact = mapping.draftSizes.find((slot) => slot.sizeOz === 16)
  if (exact) return exact

  return mapping.draftSizes.find(
    (slot) => slot.sizeOz !== null && slot.sizeOz >= 14 && slot.sizeOz <= 20,
  ) ?? null
}

function findPackagedSlot(mapping: BeerTemplateMapping, kind: 'can' | 'bottle') {
  return mapping.packagedGroups.find((slot) => slot.kind === kind) ?? null
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

function getBeerTemplateMapping(workbookPackage: WorkbookPackage): BeerTemplateMapping {
  const beerSheet = getWorkbookSheets(workbookPackage).find((sheet) => sheet.name.toLowerCase() === 'beer')
  if (!beerSheet) throw new Error('Toast template is missing a Beer tab')

  const sheetDoc = parseXml(getTextFile(workbookPackage.files, beerSheet.path))
  const headerRow = findBeerHeaderRow(sheetDoc, workbookPackage.sharedStrings)
  if (!headerRow) throw new Error('Beer tab is missing the expected Toast header row')

  const rowValues = getRowValues(sheetDoc, headerRow, workbookPackage.sharedStrings)
  const lastTemplateRow = getLastWorksheetRow(sheetDoc)
  const draftNameCol = findColumn(rowValues, /^draft\s+beer$/i)
  const canColumn = findColumn(rowValues, /^can$/i)
  const firstPackagedCol = getFirstPackagedColumn(rowValues)
  const draftSizes = getDraftSizeSlots(rowValues, draftNameCol, firstPackagedCol)
  const packagedGroups = getPackagedGroupSlots(rowValues)
  const warnings: string[] = []

  if (draftNameCol === null) warnings.push('Beer tab has no Draft Beer column')
  if (draftSizes.length === 0) warnings.push('Beer tab has no draft size columns')
  if (canColumn === null) warnings.push('Beer tab has no Can column')
  if (!packagedGroups.some((slot) => slot.kind === 'bottle')) {
    warnings.push('Beer tab has no Bottle column; 24oz cans cannot be written to the fixed Toast template')
  }

  return {
    sheetPath: beerSheet.path,
    sheetName: beerSheet.name,
    headerRow,
    dataStartRow: headerRow + 1,
    lastTemplateRow,
    draftNameCol,
    draftSizes,
    packagedGroups,
    warnings,
  }
}

function getWorkbookSheets(workbookPackage: WorkbookPackage) {
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

function findBeerHeaderRow(sheetDoc: Document, sharedStrings: string[]) {
  for (let rowNumber = 1; rowNumber <= 40; rowNumber += 1) {
    const rowValues = getRowValues(sheetDoc, rowNumber, sharedStrings)
    const values = rowValues.map((cell) => cell.value.toLowerCase())

    if (values.includes('draft beer') && values.includes('can')) return rowNumber
  }

  return null
}

function getRowValues(sheetDoc: Document, rowNumber: number, sharedStrings: string[]) {
  const row = findRow(sheetDoc, rowNumber)
  if (!row) return []

  return Array.from(row.getElementsByTagName('c')).map((cell) => ({
    col: columnLettersToNumber(getCellReferenceColumn(cell.getAttribute('r') ?? '')),
    value: getCellDisplayValue(cell, sharedStrings),
  })).filter((cell) => cell.col > 0)
}

function getDraftSizeSlots(rowValues: { col: number, value: string }[], draftNameCol: number | null, firstPackagedCol: number | null): DraftSizeSlot[] {
  if (draftNameCol === null) return []

  const upperBound = firstPackagedCol ?? Number.POSITIVE_INFINITY
  const slots: DraftSizeSlot[] = []

  rowValues
    .filter((cell) => cell.col > draftNameCol && cell.col < upperBound)
    .forEach((cell) => {
      if (/happy\s*hour/i.test(cell.value)) return

      const sizeMatch = cell.value.match(/(\d+)\s*oz/i)
      const isPitcher = /^pitcher$/i.test(cell.value)
      if (!sizeMatch && !isPitcher) return

      const happyHourCol = rowValues.find((candidate) => (
        candidate.col > cell.col
        && candidate.col < upperBound
        && candidate.col <= cell.col + 1
        && /happy\s*hour/i.test(candidate.value)
      ))?.col ?? null

      slots.push({
        label: cell.value,
        sizeOz: sizeMatch ? Number(sizeMatch[1]) : null,
        priceCol: cell.col,
        happyHourCol,
      })
    })

  return slots
}

function getPackagedGroupSlots(rowValues: { col: number, value: string }[]): PackagedGroupSlot[] {
  return rowValues.flatMap((cell) => {
    const label = cell.value.trim()
    if (!label) return []
    if (/^(draft\s+beer|price\s*\$?|happy\s*hour\s*\$?|\d+\s*oz|pitcher)$/i.test(label)) return []

    const kind = getPackagedKind(label)
    if (!kind) return []

    if (kind === 'can') return getCanGroupSlots(rowValues, cell)

    const nextCells = rowValues.filter((candidate) => candidate.col > cell.col && candidate.col <= cell.col + 3)
    const priceCol = nextCells.find((candidate) => /price/i.test(candidate.value))?.col ?? cell.col + 1
    const happyHourCol = nextCells.find((candidate) => /happy\s*hour/i.test(candidate.value))?.col ?? null

    return [{ label, kind, nameCol: cell.col, priceCol, happyHourCol }]
  })
}

function getCanGroupSlots(rowValues: { col: number, value: string }[], canCell: { col: number, value: string }): PackagedGroupSlot[] {
  const nextPackagedHeader = rowValues
    .filter((candidate) => candidate.col > canCell.col && getPackagedKind(candidate.value) !== null)
    .map((candidate) => candidate.col)
    .sort((left, right) => left - right)[0] ?? Number.POSITIVE_INFINITY
  const canGroupCells = rowValues.filter((candidate) => candidate.col > canCell.col && candidate.col < nextPackagedHeader)
  const regularPriceCell = canGroupCells.find((candidate) => (
    !/happy\s*hour/i.test(candidate.value)
    && !/^24\s*oz(?:\s*can)?$/i.test(candidate.value)
  ))
  const regularPriceCol = regularPriceCell?.col ?? canCell.col + 1
  const regularHappyHourCol = canGroupCells.find((candidate) => (
    candidate.col > regularPriceCol
    && candidate.col <= regularPriceCol + 1
    && /happy\s*hour/i.test(candidate.value)
  ))?.col ?? null
  const can24ozCell = canGroupCells.find((candidate) => /^24\s*oz(?:\s*can)?$/i.test(candidate.value))
  const can24ozHappyHourCol = can24ozCell
    ? canGroupCells.find((candidate) => (
      candidate.col > can24ozCell.col
      && candidate.col <= can24ozCell.col + 1
      && /happy\s*hour/i.test(candidate.value)
    ))?.col ?? null
    : null
  const slots: PackagedGroupSlot[] = [{
    label: regularPriceCell?.value ? `${canCell.value} ${regularPriceCell.value}` : canCell.value,
    kind: 'can',
    nameCol: canCell.col,
    priceCol: regularPriceCol,
    happyHourCol: regularHappyHourCol,
  }]

  if (can24ozCell) {
    slots.push({
      label: can24ozCell.value,
      kind: 'can24oz',
      nameCol: canCell.col,
      priceCol: can24ozCell.col,
      happyHourCol: can24ozHappyHourCol,
    })
  }

  return slots
}

function getPackagedKind(label: string): PackagedGroupSlot['kind'] | null {
  if (/24\s*oz.*can/i.test(label)) return 'can24oz'
  if (/^can$/i.test(label)) return 'can'
  if (/bottle/i.test(label)) return 'bottle'
  if (/optional/i.test(label)) return 'optional'
  return null
}

function getFirstPackagedColumn(rowValues: { col: number, value: string }[]) {
  return rowValues
    .filter((cell) => getPackagedKind(cell.value) !== null)
    .map((cell) => cell.col)
    .sort((left, right) => left - right)[0] ?? null
}

function getBeerTargetColumns(mapping: BeerTemplateMapping) {
  const columns = new Set<number>()
  if (mapping.draftNameCol !== null) columns.add(mapping.draftNameCol)
  mapping.draftSizes.forEach((slot) => {
    columns.add(slot.priceCol)
    if (slot.happyHourCol) columns.add(slot.happyHourCol)
  })
  mapping.packagedGroups.forEach((slot) => {
    columns.add(slot.nameCol)
    if (slot.priceCol) columns.add(slot.priceCol)
    if (slot.happyHourCol) columns.add(slot.happyHourCol)
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
  if (existing) return existing

  const cell = sheetDoc.createElementNS(SPREADSHEET_NS, 'c')
  cell.setAttribute('r', reference)

  const templateCell = findCell(sheetDoc, column, templateRow)
  const styleId = templateCell?.getAttribute('s')
  if (styleId) cell.setAttribute('s', styleId)

  insertCellSorted(row, cell, column)
  return cell
}

function copyStyleFromSource(sheetDoc: Document, targetCell: Element, sourceColumn: number, rowNumber: number) {
  const sourceCell = findCell(sheetDoc, sourceColumn, rowNumber)
  const styleId = sourceCell?.getAttribute('s')
  if (styleId) targetCell.setAttribute('s', styleId)
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

function updateWorksheetDimension(sheetDoc: Document, mapping: BeerTemplateMapping, writtenRowCount: number) {
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

function findColumn(rowValues: { col: number, value: string }[], matcher: RegExp) {
  return rowValues.find((cell) => matcher.test(cell.value))?.col ?? null
}

function getCellReferenceColumn(reference: string) {
  return reference.match(/^[A-Z]+/i)?.[0] ?? ''
}

function getCellReferenceRow(reference: string) {
  const match = reference.match(/\d+$/)
  return match ? Number(match[0]) : null
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

function hasAnyBeerPrice(row: BeerTabPreviewRow) {
  return [
    row.draft10ozPrice,
    row.draft16ozPrice,
    row.canPrice,
    row.can24ozPrice,
    row.bottlePrice,
  ].some((value) => value !== null)
}

function hasDraftBeerPrice(row: BeerTabPreviewRow) {
  return row.draft10ozPrice !== null || row.draft16ozPrice !== null
}

function centsToDollars(cents: number | null) {
  return cents === null ? null : cents / 100
}

function formatNumberForCell(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
