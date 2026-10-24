const assert=require('node:assert/strict')
const path=require('node:path')
const {fertilizerChoices,suggestedFertilizerName,fertilizerChoiceByName}=require(path.join(__dirname,'../src/qcFertilizerProducts.ts'))

const plan={materials:[
 {material:'NK 20-30',dosePerHa:450,doseUnit:'Kg/Ha',unit:'Kg'},
 {material:'Fosfat (N: 18%, P2O5: 46%)',dosePerHa:150,doseUnit:'Kg/Ha',unit:'Kg'},
]}
const products=[
 {materialName:'NK 20:30',activeIngredient:'NK 20-30',unit:'Kg',category:'FERTILIZER',active:true},
 {materialName:'HX-DAP',activeIngredient:'Fosfat (N:18%, P2O5:46%)',unit:'Kg',category:'FERTILIZER',active:true},
 {materialName:'DISABLED',activeIngredient:'NK 20-30',unit:'Kg',category:'FERTILIZER',active:false},
 {materialName:'SPRAY-CHEM',activeIngredient:'NK 20-30',unit:'Liter',category:'HERBICIDE',active:true},
]
const options=fertilizerChoices(plan,products,true)
assert.deepEqual(options.map(x=>x.name),['NK 20:30','HX-DAP'])
assert.deepEqual(options.map(x=>x.dosePerHa),[450,150])
assert.equal(options.every(x=>x.commercial),true)
assert.equal(fertilizerChoiceByName('HX-DAP',options)?.dosePerHa,150)
assert.equal(suggestedFertilizerName(plan.materials[0],options,true),'NK 20:30')
assert.equal(suggestedFertilizerName(plan.materials[0],options,false),'')
const alternatives=fertilizerChoices(plan,[...products,{materialName:'NK Alternative',activeIngredient:'NK 20-30',unit:'Kg',category:'FERTILIZER',active:true}],true)
assert.equal(suggestedFertilizerName(plan.materials[0],alternatives,true),'')
assert.ok(alternatives.some(x=>x.name==='NK Alternative'))
const fallback=fertilizerChoices(plan,[],true)
assert.deepEqual(fallback.map(x=>x.name),['NK 20-30','Fosfat (N: 18%, P2O5: 46%)'])
assert.equal(fallback.every(x=>!x.commercial),true)
assert.deepEqual(fertilizerChoices(plan,products,false),[])
console.log('QC Fertilizer trade-name resolution / dose / multi-brand fallback: OK')
