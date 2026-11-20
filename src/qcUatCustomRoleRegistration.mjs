// UAT registration contract: selecting a custom role only requests Owner review.
// No self-grant, no builtin/owner registration and no production identity.
import {isCustomRoleId} from './qcUatCustomRoles.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const plain=v=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'))
const uid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
export function registrationSubmit(input){
 need(exact(input,['requestedRoleId']),'INVALID_REGISTRATION_REQUEST')
 need(isCustomRoleId(input.requestedRoleId),'CUSTOM_ROLE_REQUIRED')
 return input
}
export function registrationReview(input){
 need(exact(input,['targetUid','expectedRevision','decision','approvedRoleId']),'INVALID_REGISTRATION_REVIEW')
 need(uid(input.targetUid)&&input.expectedRevision===0&&['approve','reject'].includes(input.decision),'INVALID_REGISTRATION_REVIEW')
 need(input.decision==='approve'?isCustomRoleId(input.approvedRoleId):input.approvedRoleId===null,'INVALID_REGISTRATION_REVIEW')
 return input
}
export function registrationActivate(input){
 need(exact(input,['expectedRevision'])&&input.expectedRevision===1,'INVALID_REGISTRATION_ACTIVATION')
 return input
}
export function verifyRegistrationRow(r,id){
 const fields=['testOnly','workspace','uid','status','revision','requestedRoleId','approvedRoleId','reviewedBy']
 need(exact(r,fields)&&r.testOnly===true&&r.workspace==='cutover'&&uid(id)&&r.uid===id&&isCustomRoleId(r.requestedRoleId),'INVALID_REGISTRATION_ROW')
 const expected={pending:0,approved:1,rejected:1,activated:2}
 need(Object.hasOwn(expected,r.status)&&r.revision===expected[r.status],'INVALID_REGISTRATION_ROW')
 if(r.status==='pending')need(r.approvedRoleId===null&&r.reviewedBy===null,'INVALID_REGISTRATION_ROW')
 else need(uid(r.reviewedBy)&&r.reviewedBy!==id&&(r.status==='rejected'?r.approvedRoleId===null:isCustomRoleId(r.approvedRoleId)),'INVALID_REGISTRATION_ROW')
 return r
}
export function registrationPending(uidValue,input){
 registrationSubmit(input)
 const r={testOnly:true,workspace:'cutover',uid:uidValue,status:'pending',revision:0,requestedRoleId:input.requestedRoleId,approvedRoleId:null,reviewedBy:null}
 return verifyRegistrationRow(r,uidValue)
}
export function registrationDecide(before,input,actorUid){
 const q=registrationReview(input),row=verifyRegistrationRow(before,q.targetUid)
 need(row.status==='pending'&&actorUid!==q.targetUid&&uid(actorUid),'REGISTRATION_NOT_PENDING')
 const next={...row,status:q.decision==='approve'?'approved':'rejected',revision:1,approvedRoleId:q.approvedRoleId,reviewedBy:actorUid}
 return verifyRegistrationRow(next,q.targetUid)
}
export function registrationComplete(before,input,uidValue){
 registrationActivate(input)
 const row=verifyRegistrationRow(before,uidValue)
 need(row.status==='approved','REGISTRATION_NOT_APPROVED')
 return verifyRegistrationRow({...row,status:'activated',revision:2},uidValue)
}
