import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { buildToastExportFiles } from './toast-export'
import { buildPopulatedToastTemplateWorkbook } from './toast-template-workbook'
import type { NormalizedMenuItem } from './types'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const WORKBOOK_PATH = 'xl/workbook.xml'
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels'
const SPREADSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const DATA_ROW_BUFFER = 20

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

export async function buildPopulatedToastTemplateWorkbookWithLiquorAsync({
  templateArrayBuffer,
  items,
}: {
  templateArrayBuffer: ArrayBuffer
  items: NormalizedMenuItem[]
}) {
  const beerPopulatedWorkbook = buildPopulatedToastTemplateWorkbook({ templateArrayBuffer, items })
  const beerWorkbookBuffer = await beerPopulatedWorkbook.arrayBuffer()
  const workbookPackage = readWorkbookPackage(beerWorkbookBuffer)

  populateLiquorSheet(workbookPackage, items)

  return new Blob([zipSync(workbookPackage.files, { level: 6 })], { type: XLSX_MIME })
}

function populateLiquorSheet(workbookPackage: WorkbookPackage, items: NormalizedMenuItem[]) {
  const liquorRows = getLiquorRows(items)
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

function getLiquorRows(items: NormalizedMenuItem[]): LiquorRow[] {
  const liquorFile = buildToastExportFiles(items).find((file) => file.id === 'liquor')
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
  if (key.includes('WHISKEY') || key.includes('BOURBON') || key === 'BOURB WHISK') return 'WHISKEY/BOURBON'
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