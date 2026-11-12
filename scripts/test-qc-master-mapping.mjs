import assert from 'node:assert/strict'
import {buildQcMasterData as build} from '../src/qcMasterDataMapping.mjs'
const resources={units:[{id:'u1',name:'Sprayer',active:true},{id:'u2',name:'Tractor',active:true},{id:'u3',name:'Inactive',active:false}],unitNumbers:[{name:'SP01',parentUnitId:'u1'},{name:'TR01',parentUnitName:'Tractor'},{name:'SP02',parentUnitId:'u2',parentUnitName:'Sprayer'},{name:'OLD',parentUnitId:'u1',active:false}],foremen:[{name:'A'},{name:'A'},{name:'B',active:false}],assistants:[{name:'C'}],shifts:[{name:'2'},{name:'1'}],droppers:[{name:'Yes'}],nozzles:[{name:'N1'}],waterQualities:[{name:'Clean'}],weatherConditions:[{name:'Sunny'}]}
const materials=[{materialName:'Product A',category:'ADJUVANT',unit:'L'},{materialName:'Product B',category:'FERTILIZER',unit:'KG',active:false}]
const result=build(resources,materials,[{pid:'A-001'},{pid:'A-002',active:false}],[{activity:'Pre Emergence',description:'Pre A'},{activity:'Old',active:false}])
let n=0
const check=(label,fn)=>{fn();n++;console.log('PASS: '+label)}
check('unit IDs take precedence over stale parent names',()=>assert.deepEqual(result.unitMap.Sprayer,['SP01']))
check('parent name fallback only for unlinked unit numbers',()=>assert.deepEqual(result.unitMap.Tractor,['SP02','TR01']))
check('inactive units excluded',()=>assert.equal(result.unitMap.Inactive,undefined))
check('active foremen deduplicated',()=>assert.deepEqual(result.names,['A']))
check('shifts sorted',()=>assert.deepEqual(result.shifts,['1','2']))
check('adjuvant category retained',()=>assert.deepEqual(result.materials,[{material:'Product A',description:'ADJUVANT',slot:'ADJUVANT',unit:'L'}]))
check('no invented dosage',()=>assert.equal(result.materials[0].dosage,undefined))
check('active paddocks and activities only',()=>{assert.deepEqual(result.paddocks,['A-001']);assert.deepEqual(result.activities,['Pre Emergence'])})
check('resource lists preserved',()=>{assert.deepEqual(result.assistants,['C']);assert.deepEqual(result.nozzles,['N1']);assert.deepEqual(result.dropper,['Yes']);assert.deepEqual(result.waterQualities,['Clean']);assert.deepEqual(result.weatherConditions,['Sunny'])})
check('duplicate unit labels fail closed',()=>assert.throws(()=>build({...resources,units:[...resources.units,{id:'u4',name:'Sprayer'}]},[],[],[])))
console.log('SUCCESS: '+n+' QC master mapping checks passed (no network, no writes)')
