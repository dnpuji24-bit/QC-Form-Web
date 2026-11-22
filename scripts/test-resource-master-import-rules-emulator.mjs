import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,getDoc,updateDoc,serverTimestamp} from 'firebase/firestore'
const env=await initializeTestEnvironment({
  projectId:'demo-qc-resource-import',
  firestore:{host:'127.0.0.1',port:8085,rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}
})
try{
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore()
    for(const [uid,role] of [['owner-resource','owner'],['asisten-resource','asisten'],['mandor-resource','mandor_spraying']]){
      await setDoc(doc(db,'users',uid),{active:true,status:'approved',role,username:uid})
    }
  })
  const owner=env.authenticatedContext('owner-resource').firestore()
  const asisten=env.authenticatedContext('asisten-resource').firestore()
  const mandor=env.authenticatedContext('mandor-resource').firestore()
  const employee=(uid)=>({
    fullName:'KARYAWAN UJI',employeeId:'',jobTitle:'Operator Tractor',
    createdByUid:uid,createdAt:serverTimestamp()
  })
  await assertSucceeds(setDoc(doc(owner,'master_employees','sample-e1'),employee('owner-resource')))
  assert.equal((await getDoc(doc(owner,'master_employees','sample-e1'))).data().employeeId,'')
  await assertSucceeds(getDoc(doc(asisten,'master_employees','sample-e1')))
  await assertFails(setDoc(doc(asisten,'master_employees','sample-e2'),employee('asisten-resource')))
  await assertFails(getDoc(doc(mandor,'master_employees','sample-e1')))
  await assertSucceeds(setDoc(doc(asisten,'master_unit_numbers','stool-splitter-tr001g'),{
    name:'TR001G',parentUnitName:'STOOL SPLITTER',parentUnitId:'import-unit-stool-splitter',
    implement:'STOOL SPLITTER',active:true,importNeedsInspection:true,createdByUid:'asisten-resource'
  }))
  await assertFails(setDoc(doc(mandor,'master_unit_numbers','stool-splitter-tr002g'),{
    name:'TR002G',parentUnitName:'STOOL SPLITTER',active:true
  }))
  await assertSucceeds(setDoc(doc(owner,'master_resource_import_logs','import-u1'),{
    kind:'unit',createdByUid:'owner-resource',createdAt:serverTimestamp()
  }))
  await assertFails(setDoc(doc(mandor,'master_resource_import_logs','import-u2'),{
    kind:'unit',createdByUid:'mandor-resource',createdAt:serverTimestamp()
  }))
  await assertFails(updateDoc(doc(owner,'master_resource_import_logs','import-u1'),{kind:'employee'}))
  process.stdout.write('PASS: Employee import access, unit writes, append-only audit and no Mandor HR access\n')
}finally{await env.cleanup()}
