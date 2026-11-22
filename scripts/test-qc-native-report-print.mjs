import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Stable implementation checks for a native, selectable-text print document.
// Visual output still needs a real browser print-preview regression.
const printSource=readFileSync(new URL('../src/qcNativeReportPrint.ts',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')

test('PDF uses a native A4 print document rather than sliced screenshots',()=>{
  assert.match(printSource,/@page\{size:A4 portrait/)
  assert.match(printSource,/printWindow\.print\(\)/)
  assert.match(app,/await printQcReportA4\(sheet,/)
  assert.doesNotMatch(app,/paginateReportImage\(image\.height/)
})

test('10+ fertilizer fillings flow as genuine table rows with repeated header',()=>{
  assert.match(printSource,/thead\{display:table-header-group!important\}/)
  assert.match(printSource,/\.report-table tr\{break-inside:avoid-page!important/)
  assert.match(printSource,/\.qc-print-table-section\{[^}]*break-inside:auto!important/)
  assert.match(app,/fills\.map\(\(f,i\)=><tr key=\{i\}>/)
  assert.match(app,/<thead><tr>/)
})

test('notes, paired fields, hold photos and main photos have print-safe frames',()=>{
  assert.match(printSource,/if \(label === 'catatan'\) notes\.push\(field\)/)
  assert.match(printSource,/const tr = doc\.createElement\('tr'\)/)
  assert.match(printSource,/grid\.replaceWith\(info\)/)
  assert.match(printSource,/section\.className = 'report-section qc-print-notes'/)
  assert.match(printSource,/block\.className = 'report-section qc-print-split-hold'/)
  assert.match(printSource,/max-height:132mm!important/)
  assert.match(printSource,/max-height:78mm!important/)
  assert.match(printSource,/object-fit:contain!important/)
})

test('print clones authenticated report without altering Firestore or Supabase',()=>{
  assert.match(printSource,/root\.cloneNode\(true\)/)
  assert.match(printSource,/await Promise\.all\(Array\.from\(doc\.querySelectorAll<HTMLImageElement>\('img'\)\)/)
  assert.doesNotMatch(printSource,/firebase deploy|fetch\(|supabase\.storage|setDoc\(|updateDoc\(/)
})
