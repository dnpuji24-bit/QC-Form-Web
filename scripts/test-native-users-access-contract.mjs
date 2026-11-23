import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Users & Access offers searchable spreadsheet-style controls and separate Owner confirmation',()=>{
 const ui=read('src/NativeUsersAccess.tsx')
 for(const token of ['Cari pengguna','Filter Role','Simpan Role','Nonaktifkan','Hak Akses Role','Simpan Permission Role','Registrasi','Riwayat']){
   assert.ok(ui.includes(token),token)
 }
 assert.match(ui,/saveNativeUserRole\(/)
 assert.match(ui,/saveNativeUserActive\(/)
 assert.match(ui,/saveNativeRolePermissions\(/)
 assert.match(ui,/setMessage\(success\)/)
 assert.doesNotMatch(ui,/disabled=\{busy\|\|!endpoint\|\|!roles\[u\.uid\]\}/)
})
test('Owner writes require session, audit and Firestore transaction without service account',()=>{
 const service=read('src/nativeOwnerAccess.ts'),rules=read('firestore.rules')
 assert.match(service,/readApprovedFirebaseSession\(\)/)
 assert.match(service,/runTransaction\(db,async tx=>/)
 assert.match(service,/qc_admin_audit/)
 assert.match(service,/getDocFromServer/)
 assert.doesNotMatch(service,/GOOGLE_SERVICE_ACCOUNT_JSON|setCustomUserClaims|firebase-admin/)
 assert.match(rules,/allow update: if validOwnerUserChange\(uid\)/)
 assert.match(rules,/allow update: if validPermissionTemplate\(roleId\)/)
 assert.match(rules,/adminAuditMatches\(/)
 assert.match(rules,/allow update, delete: if false;/)
})
test('role permission catalog is complete and only supported values are accepted',()=>{
 const access=read('src/accessControl.ts')
 const src=read('firestore.rules')
 const roles=read('src/qcNativeRegistration.ts')
 const keys=[...access.matchAll(/\{key:'([^']+)',group:/g)].map(m=>m[1])
 assert.equal(keys.length,new Set(keys).size)
 for(const k of keys)assert.ok(src.includes("'"+k+"'"),'missing '+k)
 for(const role of ['manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']){
   assert.ok(roles.includes("'"+role+"'"))
   assert.ok(src.includes("'"+role+"'"))
 }
 assert.match(src,/modes\.values\(\)\.hasOnly\(\['none','view','edit'\]\)/)
})
test('new-account provisioning remains closed without trusted admin endpoint',()=>{
 const src=read('src/NativeUsersAccess.tsx')
 assert.match(src,/Menunggu aktivasi backend/)
 assert.match(src,/Layanan aktivasi akun baru belum dikonfigurasi/)
 assert.doesNotMatch(src,/command\(\{action:'setRole'/)
})
