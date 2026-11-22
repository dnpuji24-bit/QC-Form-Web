// Firestore emulator test: one immutable Work Order header, multiple Monthly lines.
// This test never contacts the production Firebase project.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,writeBatch,serverTimestamp,getDoc,updateDoc} from 'firebase/firestore'

const environment=await initializeTestEnvironment({
  projectId:'demo-qc-shared-wo',
  firestore:{host:'127.0.0.1',port:8085,rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}
})
try{
  await environment.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),'users','asisten-wo'),{active:true,status:'approved',username:'asisten-wo',role:'asisten'})
  })
  const db=environment.authenticatedContext('asisten-wo').firestore()
  const wo='WO_931',date='2026-11-23'
  function monthly(planLineId,pid,shift,day){
    return{planLineId,woNumber:wo,companyCode:'GPA',monthKey:'2026-11',week:'W4',pid,activity:'Top Dressing',plannedShift:shift,plannedDate:day,targetAreaHa:5,createdAt:serverTimestamp()}
  }
  const batch=writeBatch(db)
  batch.set(doc(db,'monthly_plans','MP-GPA-202611-0001'),monthly('MP-GPA-202611-0001','JAGF-2-J-007','ALL',date))
  batch.set(doc(db,'monthly_plans','MP-GPA-202611-0002'),monthly('MP-GPA-202611-0002','JAGF-3-L-005','2','2026-11-25'))
  batch.set(doc(db,'work_orders',wo),{
    woNumber:wo,planLineId:'MP-GPA-202611-0001',companyCode:'GPA',
    pid:'JAGF-2-J-007',activity:'Top Dressing',coaCode:'60100302',plannedShift:'ALL',createdAt:serverTimestamp()
  })
  await assertSucceeds(batch.commit())
  assert.equal((await getDoc(doc(db,'work_orders',wo))).data().planLineId,'MP-GPA-202611-0001')
  await assertSucceeds(setDoc(doc(db,'monthly_plans','MP-GPA-202611-0003'),monthly('MP-GPA-202611-0003','JAGF-2-J-007','1','2026-11-24')))
  await assertFails(updateDoc(doc(db,'work_orders',wo),{planLineId:'MP-GPA-202611-0003'}))
  process.stdout.write('PASS shared WO: ALL shift, two Monthly lines, later third line, immutable WO header\n')
}finally{await environment.cleanup()}
