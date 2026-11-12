import assert from 'node:assert/strict'
import {summarizeLegacyQueue as summarize,strictLegacyOwner as own} from '../src/qcLegacyQueueInventory.mjs'
const item=(a,b)=>({ownerUsername:a,record:{inputtedBy:b}})
const rows=[item('Alice','alice'),item('','Alice'),item('bob','bob'),item('',''),item('alice','bob')]
let n=0
const check=(label,fn)=>{fn();n++;console.log('PASS: '+label)}
check('case normalized matching',()=>assert.equal(own(rows[0],' ALICE '),true))
check('historical label candidate visible',()=>assert.equal(own(rows[1],'alice'),true))
check('other account excluded',()=>assert.equal(own(rows[2],'alice'),false))
check('missing owner excluded',()=>assert.equal(own(rows[3],'alice'),false))
check('conflicting owner excluded',()=>assert.equal(own(rows[4],'alice'),false))
check('missing session excludes every job',()=>assert.equal(rows.some(x=>own(x,'')),false))
check('inventory counts every job',()=>assert.deepEqual(summarize(rows,'alice'),{total:5,own:2,other:1,unattributed:1,conflicting:1}))
check('inventory never mutates jobs',()=>{const before=JSON.stringify(rows);summarize(rows,'alice');assert.equal(JSON.stringify(rows),before)})
console.log('SUCCESS: '+n+' legacy queue inventory checks passed (no network, no writes)')
