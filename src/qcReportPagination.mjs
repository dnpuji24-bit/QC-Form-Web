/**
 * Slice a full-height html2canvas report into A4-sized image bands.
 * Keep photographic sections whole when they can fit on a single page.
 *
 * Positions are in screenshot pixels, not CSS pixels. We deliberately avoid
 * inventing blank or missing pixels: each source row appears on exactly one page.
 */
export function paginateReportImage(totalHeight, pageHeight, keepTogether = []) {
  if (!Number.isFinite(totalHeight) || !Number.isFinite(pageHeight) ||
      totalHeight <= 0 || pageHeight < 1) throw new Error('Invalid report dimensions')
  const height = Math.ceil(totalHeight)
  const capacity = Math.floor(pageHeight)
  const protectedRanges = keepTogether
    .filter(range => range && Number.isFinite(range.top) && Number.isFinite(range.bottom))
    .map(range => ({
      top: Math.max(0, Math.min(height, Math.floor(range.top))),
      bottom: Math.max(0, Math.min(height, Math.ceil(range.bottom)))
    }))
    .filter(range => range.bottom > range.top && range.bottom - range.top <= capacity)
    .sort((a, b) => a.top - b.top)

  const pages = []
  let start = 0
  while (start < height) {
    let end = Math.min(height, start + capacity)
    if (end < height) {
      // Prefer the earliest start of any photo block crossing this page edge.
      // Starting at the photo section also keeps its caption on the same page.
      const crossing = protectedRanges.filter(range =>
        range.top > start && range.top < end && range.bottom > end)
      if (crossing.length) end = crossing[0].top
    }
    if (end <= start) end = Math.min(height, start + capacity)
    pages.push({ start, end })
    start = end
  }
  return pages
}
