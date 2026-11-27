import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,getDoc,updateDoc,deleteDoc,serverTimestamp} from 'firebase/firestore'
const env=await initializeTestEnvironment({projectId:'demo-qc-bkm',firestore:{host:'127.0.0.1',port:8085,rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}})
try{
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore()
  for(const [uid,role] of [['owner1','owner'],['asisten1','asisten'],['asisten2','asisten'],['manager1','manager'],['mandor1','mandor_spraying']])await setDoc(doc(db,'users',uid),{username:uid,active:true,status:'approved',role})
  await setDoc(doc(db,'role_access','manager'),{role:'manager',permissions:{data_plan_actual:'view'}})
 })
 const db=uid=>env.authenticatedContext(uid).firestore()
 const ref=(uid,id='recap1')=>doc(db(uid),'foreman_work_recaps',id)
 const data=uid=>({schemaVersion:1,ownerUid:uid,revision:1,date:'2026-11-27',company:'GPA',division:'UnM',number:'',rows:[{bkm:'',filterWo:'',candidate:{pid:'J-012'}}],createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
 await assertSucceeds(setDoc(ref('asisten1'),data('asisten1')))
 await assertSucceeds(getDoc(ref('asisten1')))
 await assertSucceeds(getDoc(ref('owner1')))
 await assertFails(getDoc(ref('asisten2')))
 await assertFails(getDoc(ref('mandor1')))
 await assertFails(setDoc(ref('manager1','recap2'),data('manager1')))
 await assertFails(setDoc(ref('asisten2','recap2'),data('asisten1')))
 await assertFails(updateDoc(ref('asisten1'),{revision:2,ownerUid:'asisten2',updatedAt:serverTimestamp()}))
 await assertSucceeds(updateDoc(ref('owner1'),{revision:2,number:'BKM-1',updatedAt:serverTimestamp()}))
 await assertFails(updateDoc(ref('asisten1'),{revision:2,number:'stale',updatedAt:serverTimestamp()}))
 await assertFails(deleteDoc(ref('owner1')))
 assert.equal((await getDoc(ref('asisten1'))).data().number,'BKM-1')
 await assertSucceeds(updateDoc(ref('owner1'),{revision:3,materialEntries:[{pid:'J-012',name:'NK',unit:'Kg',hi:15,extra:['ISS-001']}],materialColumns:['No Issue'],updatedAt:serverTimestamp()}))
 await assertFails(updateDoc(ref('owner1'),{revision:4,materialColumns:Array(9).fill('x'),updatedAt:serverTimestamp()}))
 console.log('PASS: BKM snapshot ownership, optional number, edit permission, revision and delete protection')
}finally{await env.cleanup()}
