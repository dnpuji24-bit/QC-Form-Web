import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,getDoc,setDoc,updateDoc,writeBatch,serverTimestamp} from 'firebase/firestore'
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')
const env=await initializeTestEnvironment({
 projectId:'demo-qc-native-owner-access',
 firestore:{host:'127.0.0.1',port:8085,rules}
})
const keys=['qc_dashboard','qc_spraying','qc_fertilizer','qc_records','qc_logs','qc_settings',
 'data_plan_summary','data_plan_monthly','data_plan_monthly_import','data_plan_daily','data_plan_daily_import',
 'data_plan_actual','data_plan_actual_import','data_plan_reconciliation','data_master_paddock_list',
 'data_master_paddock_import','data_master_activity_list','data_master_activity_manage',
 'data_master_activity_resources','data_master_activity_import','data_company','data_unit_dispatch','data_master_employees']
const permissions=Object.fromEntries(keys.map(k=>[k,'view']))
const audit=(actorUid,action,target,before,after)=>({actorUid,action,target,before,after,createdAt:serverTimestamp()})
const auditDoc=(db,id)=>doc(db,'qc_admin_audit',id)
const id=number=>'ua_'+String(number).padStart(32,'0')
const ownerUid='owner-owner-access',managerUid='target-manager-access',mandorUid='mandor-access'
try{
 await env.withSecurityRulesDisabled(async context=>{
   const db=context.firestore()
   await setDoc(doc(db,'users',ownerUid),{role:'owner',username:'owner',status:'approved',active:true,fullName:'Owner'})
   await setDoc(doc(db,'users',managerUid),{role:'manager',username:'manager',status:'approved',active:true,fullName:'Manager'})
   await setDoc(doc(db,'users',mandorUid),{role:'mandor_fertilizer',username:'mandor',status:'approved',active:true,fullName:'Mandor'})
 })
 const owner=env.authenticatedContext(ownerUid).firestore()
 const manager=env.authenticatedContext(managerUid).firestore()
 const mandor=env.authenticatedContext(mandorUid).firestore()
 const managerRef=doc(owner,'users',managerUid)
 const ownerRef=doc(owner,'users',ownerUid)
 const addUserChange=(db,target,props,auditId,action,before,after)=>{
   const batch=writeBatch(db)
   batch.update(doc(db,'users',target),{...props,adminUpdatedAt:serverTimestamp(),adminUpdatedBy:ownerUid,adminAuditId:auditId})
   batch.set(auditDoc(db,auditId),audit(ownerUid,action,target,before,after))
   return batch.commit()
 }
 // Neither a regular user nor an Owner can bypass append-only audit.
 await assertFails(updateDoc(doc(manager,'users',managerUid),{role:'owner'}))
 await assertFails(updateDoc(managerRef,{role:'asisten'}))
 await assertFails(addUserChange(owner,ownerUid,{role:'manager'},id(1),'setRole','owner','manager'))
 await assertFails(addUserChange(owner,managerUid,{role:'owner'},id(2),'setRole','manager','owner'))
 await assertFails(addUserChange(owner,managerUid,{email:'fake@demo.invalid'},id(3),'setRole','manager','asisten'))
 await assertFails(setDoc(auditDoc(owner,id(4)),audit(ownerUid,'setRole',managerUid,'manager','asisten')))
 // Owner role change; audit must be atomically present and immutable.
 await assertSucceeds(addUserChange(owner,managerUid,{role:'asisten'},id(5),'setRole','manager','asisten'))
 assert.equal((await getDoc(managerRef)).data().role,'asisten')
 const savedAudit=await getDoc(auditDoc(owner,id(5)))
 assert.equal(savedAudit.data().target,managerUid)
 await assertFails(updateDoc(auditDoc(owner,id(5)),{before:'owner'}))
 await assertFails(updateDoc(doc(mandor,'users',managerUid),{role:'admin'}))
 // Active status means application access, not disabling Firebase Auth account.
 await assertSucceeds(addUserChange(owner,managerUid,{active:false},id(6),'setActive','active','inactive'))
 assert.equal((await getDoc(managerRef)).data().active,false)
 await assertFails(getDoc(doc(manager,'role_access','manager')))
 await assertSucceeds(addUserChange(owner,managerUid,{active:true},id(7),'setActive','inactive','active'))
 // Complete and validated role template. Cannot edit the Owner role.
 const template=(db,roleId,entry,idValue)=>{
   const batch=writeBatch(db)
   batch.set(doc(db,'role_access',roleId),{role:roleId,permissions:entry,updatedAt:serverTimestamp(),updatedBy:ownerUid,adminAuditId:idValue})
   batch.set(auditDoc(db,idValue),audit(ownerUid,'setPermissions',roleId,'template','updated'))
   return batch.commit()
 }
 await assertSucceeds(template(owner,'asisten',permissions,id(8)))
 assert.equal((await getDoc(doc(owner,'role_access','asisten'))).data().permissions.qc_records,'view')
 await assertFails(template(owner,'owner',permissions,id(9)))
 await assertFails(template(owner,'manager',{...permissions,qc_records:'root'},id(10)))
 await assertFails(template(owner,'manager',{qc_records:'edit'},id(11)))
 await assertFails(template(mandor,'manager',permissions,id(12)))
 await assertFails(updateDoc(ownerRef,{role:'manager'}))
 await assertFails(updateDoc(doc(owner,'role_access','asisten'),{role:'owner'}))
 process.stdout.write('PASS: Owner-only audited role/status and role templates; no Owner takeover or unauthorized writes\n')
}finally{await env.cleanup()}
