import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bkmRealization,bkmManualCandidate,bkmValidQuantity} from '../src/bkmRealization.mjs'
const candidate={wo:'934',hi:4,shi:20.02,target:23.03,conflict:false}
test('Manual HI replaces same-day Actual and SHI is remaining balance',()=>{
 const r=bkmRealization(candidate,6)
 assert.ok(Math.abs(r.prior-16.02)<1e-8)
 assert.equal(r.hi,6)
 assert.ok(Math.abs(r.balance-1.01)<1e-8)
 assert.ok(Math.abs(r.progress-22.02/23.03*100)<1e-8)
 const zero=bkmRealization(candidate,0)
 assert.equal(zero.hi,0)
 assert.ok(Math.abs(zero.balance-7.01)<1e-8)
 assert.equal(bkmRealization(candidate,null).hi,4)
})
test('Over actual never yields negative remaining balance, achievement may exceed 100%',()=>{
 const r=bkmRealization(candidate,10)
 assert.equal(r.balance,0);assert.ok(r.progress>100)
})
test('No WO or missing cumulative source cannot invent a target balance',()=>{
 for(const c of [{...candidate,wo:''},{...candidate,shi:null},{...candidate,target:0},{...candidate,conflict:true}]){
  const r=bkmRealization(c,5);assert.equal(r.balance,null);assert.equal(r.progress,null)
 }
 const manual=bkmManualCandidate('GPA',{pid:'J-012',area:25,company:'GPA'},{id:'op-107241',operationCode:'107241',description:'Top Dressing C',uom:'Ha'})
 assert.equal(manual.target,null);assert.equal(manual.area,25);assert.equal(manual.wo,'');assert.equal(manual.operationCode,'107241')
 assert.equal(bkmRealization(manual,8).hi,8)
})
test('Optional quantities accept zero but not negative, infinite or non-number values',()=>{
 for(const v of [null,undefined,0,1.25])assert.equal(bkmValidQuantity(v),true)
 for(const v of [-1,Infinity,NaN,'1'])assert.equal(bkmValidQuantity(v),false)
})

test('New manual HI stays blank until entered; zero is explicit; historical values are preserved',()=>{
 const blank=bkmRealization(candidate,null,true)
 assert.equal(blank.hi,null);assert.equal(blank.balance,null);assert.equal(blank.progress,null)
 assert.equal(blank.prior,16.02)
 assert.equal(bkmRealization(candidate,0,true).hi,0)
 assert.ok(Math.abs(bkmRealization(candidate,2.5,true).balance-4.51)<1e-8)
 assert.equal(bkmRealization(candidate,null).hi,4)
})
