// Emulator-only synthetic domain contract, deliberately not the production schema.
import assert from 'node:assert/strict'
import {candidateRules as foundationRules,workspace} from './qc-uat-isolation-foundation.mjs'
const names=['master_paddocks','master_activities','monthly_plans','daily_plans','qc_records','daily_reports']
const idPattern=/^uat-[a-z0-9-]{1,60}$/
export function uatPath(name,id){
  if(!names.includes(name)||typeof id!=='string'||!idPattern.test(id))throw Error('INVALID_UAT_PATH')
  return ['qc_uat_workspaces',workspace,name,id]
}
const anchor='    match /{document=**} {'
const domain= `    // Synthetic workspace only. These are NOT production payload schemas.
    function uatRole() {
      return get(uatIdentityPath()).data.get('role', '');
    }
    function uatMember() {
      return allowedUatProbe() && uatRole() in ['owner','asisten','mandor_spraying','mandor_fertilizer','pengunjung'];
    }
    function uatPlanner() {
      return uatMember() && uatRole() in ['owner','asisten'];
    }
    function uatQcWriter(form) {
      return uatMember() && (uatRole() in ['owner','asisten']
        || (form == 'spray' && uatRole() == 'mandor_spraying')
        || (form == 'fertilizer' && uatRole() == 'mandor_fertilizer'));
    }
    function uatId(id) { return id is string && id.matches('^uat-[a-z0-9-]{1,60}$'); }
    function uatArea(area) { return area is int && area > 0 && area <= 100000; }
    function uatPath(c, id) {
      return /databases/$(database)/documents/qc_uat_workspaces/cutover/$(c)/$(id);
    }
    function uatBase(id, fields) {
      let d = request.resource.data;
      return uatId(id) && d.keys().hasAll(fields) && d.keys().hasOnly(fields)
        && d.testOnly == true && d.ownerUid == request.auth.uid && d.createdAt == request.time;
    }
    function uatReadable() { return uatMember() && resource.data.testOnly == true; }
    function uatList() { return uatReadable() && request.query.limit != null && request.query.limit <= 100; }
    function uatMaster(c,id) {
      return uatId(id) && exists(uatPath(c,id)) && get(uatPath(c,id)).data.testOnly == true;
    }
    function uatMonthlyLink(d) {
      let m = get(uatPath('monthly_plans',d.monthlyPlanLineId)).data;
      return uatId(d.monthlyPlanLineId) && m.testOnly == true && m.pid == d.pid
        && m.activityId == d.activityId && d.targetArea100 <= m.targetArea100;
    }
    function uatDailyLink(d) {
      let p = get(uatPath('daily_plans',d.dailyPlanId)).data;
      return uatId(d.dailyPlanId) && p.testOnly == true && p.pid == d.pid
        && p.monthlyPlanLineId == d.monthlyPlanLineId && p.formType == d.formType
        && d.actualArea100 <= p.targetArea100;
    }
    function uatPairMatches(a,q,id) {
      return a.testOnly == true && q.testOnly == true
        && a.ownerUid == request.auth.uid && q.ownerUid == request.auth.uid
        && a.qcRecordId == id && a.dailyPlanId == q.dailyPlanId
        && a.monthlyPlanLineId == q.monthlyPlanLineId && a.pid == q.pid
        && a.formType == q.formType && a.actualArea100 == q.actualArea100
        && a.sourceOrigin == 'QC' && a.createdAt == request.time && q.createdAt == request.time;
    }
    match /qc_uat_workspaces/cutover/master_paddocks/{id} {
      allow get: if uatReadable();
      allow list: if uatList();
      allow create: if uatPlanner() && uatBase(id,['testOnly','ownerUid','createdAt','pid','area100'])
        && request.resource.data.pid == id && uatArea(request.resource.data.area100);
      allow update, delete: if false;
    }
    match /qc_uat_workspaces/cutover/master_activities/{id} {
      allow get: if uatReadable();
      allow list: if uatList();
      allow create: if uatPlanner() && uatBase(id,['testOnly','ownerUid','createdAt','formType'])
        && request.resource.data.formType in ['spray','fertilizer'];
      allow update, delete: if false;
    }
    match /qc_uat_workspaces/cutover/monthly_plans/{id} {
      allow get: if uatReadable();
      allow list: if uatList();
      allow create: if uatPlanner() && uatBase(id,['testOnly','ownerUid','createdAt','pid','activityId','targetArea100'])
        && uatArea(request.resource.data.targetArea100)
        && uatMaster('master_paddocks',request.resource.data.pid)
        && uatMaster('master_activities',request.resource.data.activityId)
        && request.resource.data.targetArea100 <= get(uatPath('master_paddocks',request.resource.data.pid)).data.area100;
      allow update, delete: if false;
    }
    match /qc_uat_workspaces/cutover/daily_plans/{id} {
      allow get: if uatReadable();
      allow list: if uatList();
      allow create: if uatPlanner() && uatBase(id,['testOnly','ownerUid','createdAt','pid','activityId','monthlyPlanLineId','targetArea100','formType'])
        && uatArea(request.resource.data.targetArea100)
        && request.resource.data.formType in ['spray','fertilizer']
        && uatMonthlyLink(request.resource.data)
        && get(uatPath('master_activities',request.resource.data.activityId)).data.formType == request.resource.data.formType;
      allow update, delete: if false;
    }
    match /qc_uat_workspaces/cutover/qc_records/{id} {
      allow get: if uatReadable();
      allow list: if uatList();
      allow create: if uatQcWriter(request.resource.data.formType)
        && uatBase(id,['testOnly','ownerUid','createdAt','pid','monthlyPlanLineId','dailyPlanId','formType','actualArea100'])
        && uatArea(request.resource.data.actualArea100) && uatDailyLink(request.resource.data)
        && !exists(uatPath('daily_reports',id))
        && uatPairMatches(getAfter(uatPath('daily_reports',id)).data,request.resource.data,id);
      allow update, delete: if false;
    }
    match /qc_uat_workspaces/cutover/daily_reports/{id} {
      allow get: if uatReadable();
      allow list: if uatList();
      allow create: if uatQcWriter(request.resource.data.formType)
        && uatBase(id,['testOnly','ownerUid','createdAt','pid','monthlyPlanLineId','dailyPlanId','formType','actualArea100','sourceOrigin','qcRecordId'])
        && uatArea(request.resource.data.actualArea100)
        && !exists(uatPath('qc_records',id))
        && uatPairMatches(request.resource.data,getAfter(uatPath('qc_records',id)).data,id);
      allow update, delete: if false;
    }

`
export function domainRules(){
  const base=foundationRules()
  assert.equal(base.split(anchor).length,2,'FOUNDATION_ANCHOR_MISMATCH')
  // A replacement string interprets $' in the Rules regex as the source suffix.
  // Use a callback to preserve literal Rules source, including regex end anchors.
  const next=base.replace(anchor,()=>domain+anchor)
  assert.ok(next.includes(domain),'DOMAIN_LITERAL_INSERTION_MISMATCH')
  assert.equal(next.split(anchor).length,2,'DOMAIN_CATCH_ALL_DUPLICATED')
  assert.ok(next.replace(domain,'')===base,'DOMAIN_SPLICE_MISMATCH')
  return next
}
export function selfTest(){
  const rules=domainRules()
  assert.ok(rules.includes("id.matches('^uat-[a-z0-9-]{1,60}$')"),'DOMAIN_REGEX_ANCHOR_CHANGED')
  assert.equal(rules.split(anchor).length,2,'DOMAIN_CATCH_ALL_DUPLICATED')
  for(const name of names)assert.ok(rules.includes('/qc_uat_workspaces/cutover/'+name+'/{id}'))
  assert.deepEqual(uatPath('qc_records','uat-q1'),['qc_uat_workspaces','cutover','qc_records','uat-q1'])
  for(const args of [['users','uat-a'],['qc_records','real-id'],['qc_records','../uat-a'],['qc_records','uat-A'],['daily_reports','uat-']])assert.throws(()=>uatPath(...args),/INVALID_UAT_PATH/)
  console.log('SUCCESS: synthetic UAT domain path and rules splice checks passed (offline)')
}
