// Unit Dispatch role and audit rules; local emulator only, no production writes.
import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,getDoc,updateDoc,serverTimestamp} from 'firebase/firestore'

const projectId='demo-qc-unit-dispatch'
const environment=await initializeTestEnvironment({
  projectId,
  firestore:{host:'127.0.0.1',port:8085,
    rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}
})
const unitId='stool-splitter-ss004'
const actors=[['mandor-unit','mandor_spraying'],['asisten-unit','asisten'],['owner-unit','owner']]
try{
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore()
    for(const [uid,role] of actors)await setDoc(doc(db,'users',uid),{active:true,username:uid,role,status:'approved'})
    await setDoc(doc(db,'master_units','stool-splitter'),{name:'Stool Splitter',active:true})
    await setDoc(doc(db,'master_unit_numbers',unitId),{name:'SS004',parentUnitId:'stool-splitter',parentUnitName:'Stool Splitter',active:true})
  })
  const mandor=environment.authenticatedContext('mandor-unit').firestore()
  const asisten=environment.authenticatedContext('asisten-unit').firestore()
  const noAuth=environment.unauthenticatedContext().firestore()
  function event(uid,type){
    return{unitId,unitCode:'SS004',type,effectiveMinute:29925600,date:'2026-11-22',shift:'1',
      note:'Test unit condition report',actorUid:uid,actorName:uid,createdAt:serverTimestamp()}
  }
  const report=doc(mandor,'unit_events','ue-mandor-breakdown')
  await assertSucceeds(setDoc(report,event('mandor-unit','BREAKDOWN')))
  assert.equal((await getDoc(report)).data().type,'BREAKDOWN')
  await assertFails(setDoc(doc(mandor,'unit_events','ue-mandor-ready'),event('mandor-unit','READY')))
  await assertFails(setDoc(doc(mandor,'unit_events','ue-mandor-other-actor'),event('asisten-unit','BREAKDOWN')))
  await assertFails(updateDoc(report,{note:'Tamper'}))
  await assertFails(getDoc(doc(noAuth,'unit_events','ue-mandor-breakdown')))
  await assertSucceeds(setDoc(doc(asisten,'unit_events','ue-maintenance'),event('asisten-unit','MAINTENANCE')))
  await assertSucceeds(setDoc(doc(asisten,'unit_events','ue-ready'),event('asisten-unit','READY')))
  await assertSucceeds(setDoc(doc(asisten,'unit_events','ue-out-of-service'),event('asisten-unit','OUT_OF_SERVICE')))
  function assignment(uid,startMinute=29925600,endMinute=29925900){
    return{unitId,unitCode:'SS004',workGroupId:'daily-1',date:'2026-11-22',shift:'1',
      startTime:'08:00',endTime:'13:00',startMinute,endMinute,activity:'Stool Splitting',
      woNumber:'',pids:['A-007'],status:'ASSIGNED',replacesAssignmentId:'',
      createdByUid:uid,createdBy:uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}
  }
  await assertFails(setDoc(doc(mandor,'unit_assignments','ua-mandor'),assignment('mandor-unit')))
  await assertFails(setDoc(doc(asisten,'unit_assignments','ua-invalid'),assignment('asisten-unit',29925900,29925600)))
  const allocated=doc(asisten,'unit_assignments','ua-valid')
  await assertSucceeds(setDoc(allocated,assignment('asisten-unit')))
  await assertSucceeds(updateDoc(allocated,{status:'WORKING',updatedByUid:'asisten-unit',updatedAt:serverTimestamp()}))
  await assertSucceeds(updateDoc(allocated,{notes:'Pindah ke paddock A-007',updatedByUid:'asisten-unit',updatedAt:serverTimestamp()}))
  await assertFails(updateDoc(allocated,{unitId:'arbitrary',updatedByUid:'asisten-unit',updatedAt:serverTimestamp()}))
  process.stdout.write('PASS: direct Ready/Breakdown/Maintenance, Asisten dispatch remarks, immutable assignment identity\n')
}finally{await environment.cleanup()}
