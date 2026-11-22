import assert from 'node:assert/strict'
import { test } from 'node:test'
import { paginateReportImage } from '../src/qcReportPagination.mjs'

function assertLossless(pages, height) {
  assert.equal(pages[0]?.start, 0)
  assert.equal(pages.at(-1)?.end, height)
  for (let i = 0; i < pages.length; i++) {
    assert.ok(pages[i].end > pages[i].start)
    if (i) assert.equal(pages[i].start, pages[i - 1].end)
  }
}

test('photo on second page stays intact on third PDF page', () => {
  const range = { top: 4100, bottom: 5320 }
  const pages = paginateReportImage(5900, 2390, [range])
  assert.deepEqual(pages, [
    { start: 0, end: 2390 },
    { start: 2390, end: 4100 },
    { start: 4100, end: 5900 }
  ])
  assert.ok(pages.some(p => p.start <= range.top && p.end >= range.bottom))
  assertLossless(pages, 5900)
})

test('several HOLD and main-photo blocks are not divided', () => {
  const ranges = [
    { top: 1900, bottom: 2400 },
    { top: 4100, bottom: 5300 },
    { top: 6300, bottom: 6800 }
  ]
  const pages = paginateReportImage(7300, 2300, ranges)
  for (const range of ranges) {
    assert.ok(pages.some(p => p.start <= range.top && p.end >= range.bottom))
  }
  assertLossless(pages, 7300)
})

test('long non-photo report remains lossless without extra pages', () => {
  const pages = paginateReportImage(3900, 2300)
  assert.deepEqual(pages, [{ start: 0, end: 2300 }, { start: 2300, end: 3900 }])
})

test('oversized photo falls back to a safe ordinary slice', () => {
  const pages = paginateReportImage(4300, 2300, [{ top: 500, bottom: 3500 }])
  assertLossless(pages, 4300)
  assert.ok(pages.every(p => p.end - p.start <= 2300))
})

test('invalid bounds and screenshot dimensions are handled defensively', () => {
  assert.throws(() => paginateReportImage(0, 2300), /Invalid report dimensions/)
  assert.throws(() => paginateReportImage(100, 0), /Invalid report dimensions/)
  const pages = paginateReportImage(3000, 2300, [
    { top: -10, bottom: -1 },
    { top: NaN, bottom: 60 },
    { top: 1500, bottom: 1700 }
  ])
  assertLossless(pages, 3000)
})

test('transparent information frames and an entire photo section are never split', () => {
  // Screenshot pixels after applying the report-export-capture layout.
  const groups = [
    { top: 80, bottom: 255 }, // report title frame
    { top: 2150, bottom: 2600 }, // long multiline notes in transparent grid cell
    { top: 2740, bottom: 3300 }, // fertilizer table frame
    { top: 3900, bottom: 5050 }, // main QC photo + caption frame
    { top: 5130, bottom: 5290 }  // footer
  ]
  const pages = paginateReportImage(5450, 2380, groups)
  assertLossless(pages, 5450)
  for(const group of groups) {
    assert.ok(pages.some(p => p.start <= group.top && p.end >= group.bottom),
      'a field/photo frame was divided between PDF pages')
  }
})
