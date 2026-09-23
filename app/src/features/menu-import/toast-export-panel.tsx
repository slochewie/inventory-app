import { downloadCsv, type ToastExportFile } from './toast-export'

const PREVIEW_ROW_LIMIT = 10

export function ToastExportPanelView({ files }: { files: ToastExportFile[] }) {
  const downloadRows = files.filter((file) => file.id !== 'review').reduce((total, file) => total + file.rowCount, 0)
  const reviewFile = files.find((file) => file.id === 'review')

  return (
    <section className="inventory-card inventory-export-panel">
      <div className="inventory-table-heading">
        <div>
          <p className="inventory-kicker">Toast export</p>
          <h2>Generated CSVs</h2>
        </div>
        <p>
          {downloadRows.toLocaleString()} Toast rows staged from export-included items
          {reviewFile ? `, plus ${reviewFile.rowCount.toLocaleString()} review/audit rows.` : '.'}
        </p>
      </div>

      <div className="inventory-export-file-grid">
        {files.map((file) => (
          <article key={file.id} className="inventory-export-file-card">
            <div>
              <strong>{file.label}</strong>
              <span>{file.rowCount.toLocaleString()} rows</span>
            </div>
            <p>{file.note}</p>
            <button
              type="button"
              onClick={() => downloadCsv(file.filename, file.rows)}
              disabled={file.rowCount === 0}
            >
              Download {file.filename}
            </button>

            <CsvPreview file={file} />
          </article>
        ))}
      </div>
    </section>
  )
}

function CsvPreview({ file }: { file: ToastExportFile }) {
  const headers = file.rows[0] ?? []
  const previewRows = file.rows.slice(1, PREVIEW_ROW_LIMIT + 1)
  const hiddenRowCount = Math.max(0, file.rowCount - previewRows.length)

  return (
    <details className="inventory-export-preview">
      <summary>
        <span>Preview first rows</span>
        <strong>{headers.length.toLocaleString()} columns</strong>
      </summary>

      {file.rowCount === 0 ? (
        <p className="inventory-export-preview-empty">No rows are currently staged for this CSV.</p>
      ) : (
        <>
          <div className="inventory-export-preview-list" role="table" aria-label={`${file.label} preview`}>
            <div className="inventory-export-preview-header" role="row">
              <span role="columnheader">Row</span>
              <span role="columnheader">Populated CSV cells</span>
            </div>

            {previewRows.map((row, rowIndex) => {
              const populatedCells = getPopulatedCells(headers, row)

              return (
                <div className="inventory-export-preview-row" role="row" key={`${file.id}-preview-${rowIndex}`}>
                  <strong role="cell">{rowIndex + 1}</strong>
                  <div role="cell">
                    {populatedCells.length === 0 ? (
                      <span className="inventory-export-preview-empty-cell">Empty row</span>
                    ) : (
                      populatedCells.map((cell) => (
                        <span key={`${file.id}-${rowIndex}-${cell.index}`} className="inventory-export-preview-cell">
                          <b>{cell.header}</b>
                          <span>{cell.value}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {hiddenRowCount > 0 ? (
            <p className="inventory-export-preview-more">
              Showing {previewRows.length.toLocaleString()} of {file.rowCount.toLocaleString()} rows. Download the CSV for the full export.
            </p>
          ) : null}
        </>
      )}
    </details>
  )
}

function getPopulatedCells(headers: string[], row: string[]) {
  return headers
    .map((header, index) => ({
      header: header || `Column ${index + 1}`,
      value: row[index]?.trim() ?? '',
      index,
    }))
    .filter((cell) => cell.value)
}
