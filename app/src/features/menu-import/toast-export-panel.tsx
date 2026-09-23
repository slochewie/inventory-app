import { downloadCsv, type ToastExportFile } from './toast-export'

const PREVIEW_ROW_LIMIT = 10

export function ToastExportPanelView({ files }: { files: ToastExportFile[] }) {
  const totalRows = files.reduce((total, file) => total + file.rowCount, 0)

  return (
    <section className="inventory-card inventory-export-panel">
      <div className="inventory-table-heading">
        <div>
          <p className="inventory-kicker">Toast export</p>
          <h2>Generated CSVs</h2>
        </div>
        <p>{totalRows.toLocaleString()} rows staged from currently export-included items.</p>
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
          <div className="inventory-export-preview-table-wrap">
            <table className="inventory-export-preview-table">
              <thead>
                <tr>
                  {headers.map((header, index) => (
                    <th key={`${file.id}-header-${index}`}>{header || `Column ${index + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, rowIndex) => (
                  <tr key={`${file.id}-preview-${rowIndex}`}> 
                    {headers.map((_, columnIndex) => (
                      <td key={`${file.id}-preview-${rowIndex}-${columnIndex}`}>{row[columnIndex] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
