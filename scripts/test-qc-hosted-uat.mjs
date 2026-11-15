import assert from 'node:assert/strict'
import {createInterface} from 'node:readline/promises'
import {chromium} from 'playwright'

const preview = new URL(process.argv[2] ?? '')
assert.equal(preview.protocol, 'https:')
assert.match(preview.hostname, /^daily-plan-and-report-unm--qc-cutover-[a-z0-9-]+\.web\.app$/)
assert.equal(preview.pathname, '/react/')
const project = 'daily-plan-and-report-unm'
const supabase = 'https://tcmtqgbpafwciaflgsaa.supabase.co'
const upload = supabase + '/functions/v1/qc-photo-upload-uat'
const signer = supabase + '/functions/v1/qc-photo-sign-uat'
const timeout = 300_000
const errors = new Set()
const input = createInterface({input: process.stdin, output: process.stdout})
let browser

async function openPortal() {
  const context = await browser.newContext({serviceWorkers: 'block'})
  await context.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    const target = url.href + (url.hostname === 'firestore.googleapis.com' ? request.postData() ?? '' : '')
    if (/script\.google(?:usercontent)?\.com|mcfwnstdfhhtcbksgrlj\.supabase\.co|projects(?:%2F|\/)form-qc-unm/i.test(target)) {
      errors.add(url.hostname)
      return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  await page.goto(preview.href)
  await page.getByLabel('Email', {exact:true}).waitFor()
  return page
}

function loginResponse(page) {
  return page.waitForResponse(r => new URL(r.url()).hostname === 'identitytoolkit.googleapis.com' &&
    r.url().includes('accounts:signInWithPassword') && r.ok(), {timeout})
}

async function verifiedLogin(response) {
  const {idToken, localId} = await (await response).json()
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url'))
  assert.equal(payload.aud, project)
  assert.equal(payload.sub, localId)
  return {idToken, localId}
}

try {
  browser = await chromium.launch({headless:false})
  const page = await openPortal()
  const firstLogin = loginResponse(page)
  console.log('Masuk dengan akun UAT yang punya izin Spraying dan Data QC.')
  const first = await verifiedLogin(firstLogin)
  const uploaded = page.waitForResponse(r => r.url() === upload && r.ok() &&
    r.request().method() === 'POST' && r.request().postDataJSON()?.kind === 'main', {timeout})
  console.log('Isi Spraying dengan Daily Plan sintetis, luas aktual 1 Ha dan satu foto utama. Klik Simpan Semua Unit.')
  const uploadResponse = await uploaded
  const {recordId} = uploadResponse.request().postDataJSON()
  const {photoId, bucket} = await uploadResponse.json()
  assert.match(recordId, /^qc-v2-/)
  assert.match(photoId, /^[a-f0-9]{24}_[a-f0-9]{64}$/)
  assert.equal(bucket, 'qc-photos-uat')
  console.log('PASS: foto utama diunggah melalui Edge Function ke bucket UAT.')
  await input.question('Buka Data QC, klik Upload untuk record tadi, lalu pastikan baris menampilkan Uploaded. Tekan Enter di terminal. ')
  const documents = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/dailyplan/documents/'
  async function readDocument(path) {
    const response = await fetch(documents + path, {
      headers:{Authorization:'Bearer ' + first.idToken},
      redirect:'error', signal:AbortSignal.timeout(15_000),
    })
    assert.equal(response.status, 200, 'Firestore staging ' + path)
    return (await response.json()).fields
  }
  const [qc, actual] = await Promise.all([
    readDocument('qc_records/' + recordId),
    readDocument('daily_reports/qcactual_' + recordId),
  ])
  assert.equal(qc.saveType.stringValue, 'uploaded')
  assert.equal(qc.firestoreSaveState.stringValue, 'confirmed')
  assert.equal(actual.qcRecordId.stringValue, recordId)
  assert.equal(actual.dailyPlanId.stringValue, qc.dailyPlanId.stringValue)
  assert.equal(Number(actual.actualAreaHa.integerValue ?? actual.actualAreaHa.doubleValue), 1)
  console.log('PASS: QC uploaded dan Actual 1 Ha terkait dengan QC serta Daily Plan yang sama.')
  await page.reload()
  await page.getByText('Firebase Authentication', {exact:true}).waitFor({state:'hidden'})
  const signed = page.waitForResponse(r => r.url() === signer && r.ok() &&
    r.request().method() === 'POST' && r.request().postDataJSON()?.photoId === photoId, {timeout})
  const downloaded = page.waitForResponse(r => r.url().startsWith(supabase + '/storage/v1/object/sign/qc-photos-uat/') &&
    new URL(r.url()).pathname.includes(photoId) && r.ok(), {timeout})
  console.log('Setelah reload, buka Laporan untuk record yang sama.')
  await Promise.all([signed, downloaded])
  const photo = page.getByRole('dialog').getByRole('img',{name:'Foto QC',exact:true})
  await photo.waitFor({timeout})
  assert.ok(await photo.evaluate(img => img.decode().then(() => img.naturalWidth > 0)))
  console.log('PASS: sesi bertahan dan Laporan membuka foto dari Supabase UAT setelah reload.')
  const deniedPage = await openPortal()
  const secondLogin = loginResponse(deniedPage)
  console.log('Masuk di tab baru dengan akun UAT aktif tanpa izin Data QC.')
  const second = await verifiedLogin(secondLogin)
  assert.notEqual(first.localId, second.localId)
  const status = await deniedPage.evaluate(async ({signer, recordId, photoId, idToken}) => {
    const res = await fetch(signer, {
      method:'POST',
      headers:{Authorization:'Bearer ' + idToken, 'Content-Type':'application/json'},
      body:JSON.stringify({recordId, photoId}),
    })
    return res.status
  }, {signer, recordId, photoId, idToken:second.idToken})
  assert.equal(status, 403)
  assert.equal(errors.size, 0, 'Permintaan terlarang: ' + [...errors].join(', '))
  console.log('PASS: signer menolak akun tanpa izin (403), dan browser tidak mencoba endpoint produksi atau Apps Script.')
} catch (error) {
  console.error('FAIL: ' + String(error.message).split('\n')[0])
  process.exitCode = 1
} finally {
  input.close()
  await browser?.close()
}
