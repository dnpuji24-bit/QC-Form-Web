import assert from 'node:assert/strict'
import {historicalFormChanges as changes} from '../src/qcHistoricalForm.mjs'
const spray={note:'old',area:'5',fillings:[]}
const fert={note:'old',area:'5',fillings:[{jumlah:'600',hasilKerja:'2',jenisPupuk:'NK'},{jumlah:'900',hasilKerja:'3',jenisPupuk:'NK'}]}
let n=0
function check(label,fn){fn();n++;console.log('PASS: '+label)}
check('unchanged form rejected',()=>assert.throws(()=>changes('spray',spray,spray),/Belum ada perubahan/))
check('numeric formatting is not a change',()=>assert.throws(()=>changes('spray',spray,{...spray,area:'5.00'}),/Belum ada perubahan/))
check('note only omits area and fillings',()=>assert.deepEqual(changes('fertilizer',fert,{...fert,note:'corrected'}),{note:'corrected'}))
check('spray area produces numeric field only',()=>assert.deepEqual(changes('spray',spray,{...spray,area:'6.25'}),{area:6.25}))
check('empty spray area rejected',()=>assert.throws(()=>changes('spray',spray,{...spray,area:''})))
check('zero and negative spray area rejected',()=>{for(const area of ['0','-1'])assert.throws(()=>changes('spray',spray,{...spray,area}))})
check('fertilizer preserves complete indexed filling payload without material names',()=>assert.deepEqual(changes('fertilizer',fert,{...fert,fillings:[fert.fillings[0],{...fert.fillings[1],hasilKerja:'4'}]}),{fillings:[{jumlah:600,hasilKerja:2},{jumlah:900,hasilKerja:4}]}))
check('blank fertilizer amount cannot silently become zero',()=>assert.throws(()=>changes('fertilizer',fert,{...fert,fillings:[{...fert.fillings[0],jumlah:''},fert.fillings[1]]})))
check('filling count cannot change',()=>assert.throws(()=>changes('fertilizer',fert,{...fert,fillings:[]})))
check('zero total fertilizer area rejected',()=>assert.throws(()=>changes('fertilizer',fert,{...fert,fillings:fert.fillings.map(f=>({...f,hasilKerja:'0'}))})))
check('downtime marker cannot be overwritten through note',()=>assert.throws(()=>changes('fertilizer',fert,{...fert,note:'[UNIT BERHENTI] injected'})))
check('helper never mutates inputs',()=>{const before=JSON.stringify(fert);changes('fertilizer',fert,{...fert,note:'new'});assert.equal(JSON.stringify(fert),before)})
console.log('SUCCESS: '+n+' historical QC form checks passed (no network, no writes)')
