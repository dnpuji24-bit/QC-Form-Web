import assert from 'node:assert/strict'
import {roleDefinition} from '../src/qcUatCustomRoles.mjs'
import {registrationSubmit,registrationReview,registrationActivate,registrationPending,registrationDecide,registrationComplete,verifyRegistrationRow} from '../src/qcUatCustomRoleRegistration.mjs'
const role=roleDefinition({name:'Planning Reader',permissions:{data_plan_summary:'view'}})
const approvedRole=roleDefinition({name:'QC Inspector',permissions:{qc_records:'view'}})
const uid='uat-new',owner='uat-owner'
const q={requestedRoleId:role.id},pending=registrationPending(uid,q)
const review={targetUid:uid,expectedRevision:0,decision:'approve',approvedRoleId:approvedRole.id}
const approved=registrationDecide(pending,review,owner),activated=registrationComplete(approved,{expectedRevision:1},uid)
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)},deny=(fn,code)=>assert.throws(fn,{message:code})
check('request accepts custom role only without permission payload',()=>{assert.deepEqual(registrationSubmit(q),q);for(const requestedRoleId of ['owner','asisten','custom-../owner','unknown'])deny(()=>registrationSubmit({requestedRoleId}),'CUSTOM_ROLE_REQUIRED');deny(()=>registrationSubmit({...q,permissions:{qc_spraying:'edit'}}),'INVALID_REGISTRATION_REQUEST')})
check('pending registration is isolated, without effective grants',()=>{assert.deepEqual(pending,{testOnly:true,workspace:'cutover',uid,status:'pending',revision:0,requestedRoleId:role.id,approvedRoleId:null,reviewedBy:null});assert.ok(!Object.hasOwn(pending,'permissions'))})
check('Owner can explicitly approve a different catalog role',()=>{assert.equal(approved.approvedRoleId,approvedRole.id);assert.equal(approved.requestedRoleId,role.id);assert.equal(approved.status,'approved');assert.equal(approved.reviewedBy,owner)})
check('self review rejected and stale revision rejected',()=>{deny(()=>registrationDecide(pending,review,uid),'REGISTRATION_NOT_PENDING');deny(()=>registrationReview({...review,expectedRevision:1}),'INVALID_REGISTRATION_REVIEW');deny(()=>registrationDecide(approved,review,owner),'REGISTRATION_NOT_PENDING')})
check('reject is terminal and must not contain selected permission role',()=>{const x=registrationDecide(pending,{...review,decision:'reject',approvedRoleId:null},owner);assert.equal(x.status,'rejected');deny(()=>registrationComplete(x,{expectedRevision:1},uid),'REGISTRATION_NOT_APPROVED');deny(()=>registrationReview({...review,decision:'reject'}),'INVALID_REGISTRATION_REVIEW')})
check('activation uses approved role, not caller supplied custom role',()=>{assert.equal(activated.approvedRoleId,approvedRole.id);assert.equal(activated.status,'activated');assert.equal(activated.revision,2);deny(()=>registrationActivate({expectedRevision:1,roleId:role.id}),'INVALID_REGISTRATION_ACTIVATION')})
check('unapproved or wrong revision cannot activate',()=>{deny(()=>registrationComplete(pending,{expectedRevision:1},uid),'REGISTRATION_NOT_APPROVED');deny(()=>registrationComplete(approved,{expectedRevision:0},uid),'INVALID_REGISTRATION_ACTIVATION');deny(()=>registrationComplete(activated,{expectedRevision:1},uid),'REGISTRATION_NOT_APPROVED')})
check('tampered records reject forged grants or status and reviewers',()=>{for(const bad of [{...pending,permissions:{qc_spraying:'edit'}},{...pending,status:'approved'},{...approved,reviewedBy:uid},{...activated,revision:1},{...approved,approvedRoleId:'owner'}])deny(()=>verifyRegistrationRow(bad,uid),'INVALID_REGISTRATION_ROW')})
check('request UID bound to trusted identity and no arbitrary path',()=>{deny(()=>registrationPending('../prod',q),'INVALID_REGISTRATION_ROW');deny(()=>verifyRegistrationRow(pending,'uat-other'),'INVALID_REGISTRATION_ROW');deny(()=>registrationReview({...review,targetUid:'../users'}),'INVALID_REGISTRATION_REVIEW')})
console.log('SUCCESS: '+n+' custom role registration contract checks (offline)')
