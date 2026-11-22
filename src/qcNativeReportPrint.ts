/**
 * Printable QC report: native browser pagination, not a sliced canvas.
 * The same authenticated, verified images already shown in RecordReport are
 * cloned into an isolated print document; no new storage requests or writes.
 * Browser Print -> "Save as PDF" preserves selectable text and table rows.
 */

export const QC_REPORT_PRINT_CSS = String.raw`
@page{size:A4 portrait;margin:13mm 12mm 15mm}
html,body{width:auto!important;height:auto!important;margin:0!important;padding:0!important;background:#fff!important;color:#14243b!important}
body{font:9.2pt/1.45 Arial,"Helvetica Neue",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
*,*::before,*::after{box-sizing:border-box}
.report-sheet{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;border-radius:0!important;background:transparent!important;overflow:visible!important}
.report-title{display:flex;justify-content:space-between;align-items:flex-start;gap:5mm;border-bottom:.5mm solid #244b8d;padding:0 0 4mm;margin:0 0 5mm;break-inside:avoid-page;page-break-inside:avoid}
.report-title small{display:block;letter-spacing:.11em;color:#475569;font-size:8pt;font-weight:700}
.report-title h2{font-size:16pt;line-height:1.18;margin:1mm 0}
.report-title p{margin:1mm 0 0;color:#475569;font-size:8.5pt}
.report-title>strong{font-size:9pt;color:#244b8d}
.qc-print-info-table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0 2mm;margin:0 0 4mm}
.qc-print-info-table tbody,.qc-print-info-table tr{break-inside:auto}
.qc-print-info-table tr{break-inside:avoid-page;page-break-inside:avoid}
.qc-print-info-table td{vertical-align:top;width:50%;border:0!important;padding:0 1.2mm!important;background:transparent!important}
.qc-print-field{display:block;min-height:13mm;padding:2.2mm 2.8mm;border:.25mm solid #bdc9d9;border-radius:2mm;background:transparent;break-inside:avoid-page;page-break-inside:avoid}
.qc-print-field span{display:block;font-size:7pt;text-transform:uppercase;letter-spacing:.045em;color:#61718b;margin:0 0 1mm}
.qc-print-field strong{display:block;font-size:9.2pt;line-height:1.35;white-space:normal;overflow-wrap:anywhere;word-break:break-word;font-weight:700}
.report-section{display:block;margin:4mm 0 0;padding:3.5mm;border:.25mm solid #bdc9d9;border-radius:2mm;background:transparent!important;overflow:visible!important;break-inside:avoid-page;page-break-inside:avoid}
.report-section h3{color:#244b8d;font-size:11pt;margin:0 0 3mm;line-height:1.25;break-after:avoid-page}
.report-section p{margin:1.5mm 0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font-size:8.8pt}
.qc-print-notes{break-inside:avoid-page;page-break-inside:avoid}
.qc-print-table-section{border:0!important;padding:0!important;break-inside:auto!important;page-break-inside:auto!important}
.qc-print-table-section h3{padding-bottom:2mm;border-bottom:.2mm solid #bdc9d9;margin-bottom:2mm}
.report-table{width:100%!important;max-width:100%!important;overflow:visible!important;border:0!important}
.report-table table{width:100%!important;min-width:0!important;max-width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;border:.25mm solid #bdc9d9!important}
.report-table thead{display:table-header-group!important}
.report-table tbody{display:table-row-group}
.report-table tr{break-inside:avoid-page!important;page-break-inside:avoid!important}
.report-table th,.report-table td{padding:2.2mm 1mm!important;border:.2mm solid #bdc9d9!important;font-size:7.5pt!important;line-height:1.32!important;vertical-align:top!important;text-align:left!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important}
.report-table th{color:#274672;font-weight:700;background:transparent!important}
.report-table td{color:#263649;background:transparent!important}
.report-hold-item{border:.25mm solid #bdc9d9;border-radius:2mm;margin:0;padding:2.5mm;background:transparent!important;break-inside:avoid-page;page-break-inside:avoid}
.qc-print-split-hold{margin-top:4mm}
.qc-print-split-hold h3{margin-bottom:2mm}
.report-photo{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:132mm!important;object-fit:contain!important;object-position:center!important;margin:3mm auto 0!important;padding:1.5mm!important;border:.25mm solid #bdc9d9!important;border-radius:2mm;background:transparent!important;break-inside:avoid-page;page-break-inside:avoid}
.report-photo.hold-photo{max-height:78mm!important}
.report-footer{margin:5mm 0 0!important;border-top:.2mm solid #bdc9d9;padding:2mm 0 0;text-align:right;font-size:7pt;color:#64748b;break-inside:avoid}
.muted{color:#64748b}
img{print-color-adjust:exact;-webkit-print-color-adjust:exact}
`;

/** Normalize the on-screen report for the browser's native A4 pagination.
 * Each pair of information cells becomes an actual table row: browsers won't
 * slice it across pages. Long notes have their own framed section.
 */
export function preparePrintableQcReport(root: HTMLElement, doc: Document): HTMLElement {
  const copy = root.cloneNode(true) as HTMLElement
  copy.removeAttribute('id')
  copy.classList.remove('report-export-capture')
  const grid = copy.querySelector('.report-grid')
  if (grid) {
    const fields = Array.from(grid.children)
    const info = doc.createElement('table')
    info.className = 'qc-print-info-table'
    const tbody = doc.createElement('tbody')
    info.append(tbody)
    const normal: Element[] = []
    const notes: Element[] = []
    for (const field of fields) {
      const label = field.querySelector('span')?.textContent?.trim().toLowerCase() || ''
      if (label === 'catatan') notes.push(field)
      else normal.push(field)
    }
    for (let i = 0; i < normal.length; i += 2) {
      const tr = doc.createElement('tr')
      for (const field of normal.slice(i, i + 2)) {
        const td = doc.createElement('td')
        field.classList.add('qc-print-field')
        td.append(field)
        tr.append(td)
      }
      if (tr.children.length === 1) tr.append(doc.createElement('td'))
      tbody.append(tr)
    }
    grid.replaceWith(info)
    let after: Element = info
    for (const field of notes) {
      const section = doc.createElement('section')
      section.className = 'report-section qc-print-notes'
      const heading = doc.createElement('h3')
      heading.textContent = 'Catatan'
      const paragraph = doc.createElement('p')
      paragraph.textContent = field.querySelector('strong')?.textContent || '-'
      section.append(heading, paragraph)
      after.after(section)
      after = section
    }
  }
  for (const section of Array.from(copy.querySelectorAll<HTMLElement>('.report-section'))) {
    if (section.querySelector('.report-table')) section.classList.add('qc-print-table-section')
    const holdItems = Array.from(section.children).filter(child => child.classList.contains('report-hold-item'))
    if (holdItems.length > 1) {
      const heading = section.querySelector('h3')
      for (const item of holdItems) {
        const block = doc.createElement('section')
        block.className = 'report-section qc-print-split-hold'
        if (heading) block.append(heading.cloneNode(true))
        block.append(item)
        section.before(block)
      }
      section.remove()
    }
  }
  return copy
}

function waitForPrintImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve()
  if (image.complete && image.naturalWidth === 0) return Promise.reject(new Error('Foto laporan belum dapat dibuka.'))
  return new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => reject(new Error('Foto laporan gagal dimuat untuk PDF.')), { once: true })
  })
}

/** Opens the system print dialog; choose "Save as PDF" for a selectable A4 PDF. */
export async function printQcReportA4(root: HTMLElement, fileName: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', 'Print QC A4')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none'
  document.body.append(frame)
  try {
    const doc = frame.contentDocument
    const printWindow = frame.contentWindow
    if (!doc || !printWindow) throw new Error('Pratinjau cetak tidak tersedia.')
    doc.open()
    doc.write('<!doctype html><html lang="id"><head><meta charset="utf-8"></head><body></body></html>')
    doc.close()
    doc.title = fileName.replace(/[^A-Za-z0-9_. -]+/g, '_')
    const style = doc.createElement('style')
    style.textContent = QC_REPORT_PRINT_CSS
    doc.head.append(style)
    const printable = preparePrintableQcReport(root, doc)
    doc.body.append(printable)
    await Promise.all(Array.from(doc.querySelectorAll<HTMLImageElement>('img')).map(waitForPrintImage))
    if (doc.fonts) await doc.fonts.ready
    await new Promise<void>(resolve => printWindow.requestAnimationFrame(() => resolve()))
    const release = () => { if (frame.isConnected) frame.remove() }
    printWindow.addEventListener('afterprint', release, { once: true })
    printWindow.focus()
    printWindow.print()
    // Some browsers do not emit afterprint on subframes. Leave the temporary
    // print document available long enough to complete Save as PDF.
    window.setTimeout(release, 180_000)
  } catch (error) {
    frame.remove()
    throw error
  }
}
