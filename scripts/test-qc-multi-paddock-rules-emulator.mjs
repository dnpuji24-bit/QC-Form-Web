// Uses only the local Firestore rules emulator, never live Firebase.
import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,writeBatch,setDoc,serverTimestamp,getDoc} from 'firebase/firestore'

const projectId='demo-qc-multi-paddock'
const environment=await initializeTestEnvironment({
  projectId,
  firestore:{host:'127.0.0.1',port:8085,
    rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}
})
const uid='mandor-qc-multi',username='mandor'
try{
  await environment.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),'users',uid),{
      active:true,status:'approved',username,role:'mandor_spraying'
    })
  })
  const db=environment.authenticatedContext(uid).firestore()
  function addQc(batch,id,{multi=true}={}){
    const work1={dailyPlanId:'DP-001',monthlyPlanLineId:'MP-001',woNumber:'WO-001',
      pid:'A-001',areaHa:5}
    const work2={dailyPlanId:'DP-002',monthlyPlanLineId:'MP-002',woNumber:'WO-002',
      pid:'A-002',areaHa:7}
    batch.set(doc(db,'qc_records',id),{
      id,ownerUid:uid,clientRevision:'rev-001',operationalSaveId:'job-001',
      inputtedBy:username,formType:'spray',saveType:'ready',date:'2026-11-22',
      dailyPlanId:'DP-001',monthlyPlanLineId:'MP-001',woNumber:'WO-001',
      paddock:'A-001',actualAreaHa:multi?12:5,multiPaddockMode:multi,
      ...(multi?{paddockWorkById:{work_1:work1,work_2:work2},paddockWorks:[
        {workId:'work_1',...work1,completed:true,materialAllocations:{}},
        {workId:'work_2',...work2,completed:true,materialAllocations:{}}
      ]}:{}),updatedAt:serverTimestamp()
    })
    batch.set(doc(db,'qc_operational_audit',id+':rev-001'),{
      recordId:id,revision:'rev-001',actorUid:uid,username,formType:'spray',
      saveType:'ready',createdAt:serverTimestamp()
    })
  }
  function addActual(batch,id,workId,{day,area,wo,pid,reportId}={}){
    const row=workId==='work_1'?{
      dailyPlanId:'DP-001',monthlyPlanLineId:'MP-001',woNumber:'WO-001',pid:'A-001',areaHa:5
    }:{
      dailyPlanId:'DP-002',monthlyPlanLineId:'MP-002',woNumber:'WO-002',pid:'A-002',areaHa:7
    }
    const actualId=reportId||('qcactual_'+id+'__'+workId)
    batch.set(doc(db,'daily_reports',actualId),{
      actualReportId:actualId,sourceOrigin:'QC',qcRecordId:id,
      qcWorkId:workId,sharedQcParentId:id,inputtedBy:username,
      dailyPlanId:day||row.dailyPlanId,
      monthlyPlanLineId:row.monthlyPlanLineId,
      woNumber:wo||row.woNumber,pid:pid||row.pid,
      actualAreaHa:area??row.areaHa,saveType:'ready',
      date:'2026-11-22',shift:'2'
    })
  }

  // Mandor role cannot directly edit Actual Plan; success proves the QC
  // linking rule itself grants the atomic batch.
  {
    const batch=writeBatch(db),id='qc-v2-good-multi'
    addQc(batch,id)
    addActual(batch,id,'work_1')
    addActual(batch,id,'work_2')
    await assertSucceeds(batch.commit())
    const actual=await getDoc(doc(db,'daily_reports','qcactual_'+id+'__work_2'))
    assert.equal(actual.data().dailyPlanId,'DP-002')
  }

  for(const [label,override] of [
    ['wrong-area',{area:9}],['wrong-daily',{day:'DP-HIJACK'}],
    ['wrong-pid',{pid:'Z-999'}],['wrong-wo',{wo:'WO-OTHER'}],
    ['wrong-id',{reportId:'qcactual_wrong_name'}],
  ]){
    const batch=writeBatch(db),id='qc-v2-denied-'+label
    addQc(batch,id)
    addActual(batch,id,'work_1')
    addActual(batch,id,'work_2',override)
    await assertFails(batch.commit())
    await environment.withSecurityRulesDisabled(async context=>{
      const snap=await getDoc(doc(context.firestore(),'qc_records',id))
      assert.equal(snap.exists(),false,'Denied batch must not leave QC parent '+label)
    })
  }

  // Historical one-to-one QC writing remains permitted.
  {
    const batch=writeBatch(db),id='qc-v2-legacy-single'
    addQc(batch,id,{multi:false})
    batch.set(doc(db,'daily_reports','qcactual_'+id),{
      actualReportId:'qcactual_'+id,sourceOrigin:'QC',qcRecordId:id,
      inputtedBy:username,dailyPlanId:'DP-001',monthlyPlanLineId:'MP-001',
      actualAreaHa:5,shift:'1',date:'2026-11-22'
    })
    await assertSucceeds(batch.commit())
  }
  process.stdout.write('PASS: QC Multi-Paddock rules allow 2 linked Actuals, deny 5 mismatches, preserve 1:1 legacy\n')
}finally{
  await environment.cleanup()
}
