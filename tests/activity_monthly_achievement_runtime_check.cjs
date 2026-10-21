const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {transformSync}=require('esbuild')

const source=fs.readFileSync(path.join(__dirname,'..','src','activityAchievement.ts'),'utf8')
const transformed=transformSync(source,{loader:'ts',format:'cjs',target:'es2020'}).code
const localModule={exports:{}}
new Function('module','exports',transformed)(localModule,localModule.exports)
const {calculateMonthlyActivityAchievement}=localModule.exports

const month=(description,target=5.94,manual=0,override={})=>({
  planLineId:'MP-01',pid:'JAGF-1-A-001',activity:'Knockdown',
  description,targetAreaHa:target,manualActualAreaHa:manual,cancelled:false,...override,
})
const actual=(id,description,area=5.94,override={})=>({
  id,monthlyPlanLineId:'MP-01',pid:'JAGF-1-A-001',
  activity:'Knockdown',description,actualAreaHa:area,...override,
})
let stats=calculateMonthlyActivityAchievement('Knockdown',[month('Knockdown')],[actual('a1','Knockdown')])
assert.equal(stats.plan,5.94)
assert.equal(stats.actual,5.94)
assert.equal(stats.percentage,100)
assert.equal(stats.remaining,0)
assert.equal(stats.planRecords,1)
assert.equal(stats.actualRecords,1)

// Repeated DAILY schedules are absent from the monthly inputs and never
// increase the target beyond one month plan line.
stats=calculateMonthlyActivityAchievement('Knockdown',[month('Knockdown')],[actual('a1','Knockdown')])
assert.equal(stats.percentage,100)

// Add manual progress exactly once, avoid double-counting repeated Firestore ids.
stats=calculateMonthlyActivityAchievement('Knockdown',[month('Knockdown',5.94,1)],[
  actual('a1','Knockdown',4.94),actual('a1','Knockdown',4.94)])
assert.equal(stats.actual,5.94)
assert.equal(stats.actualRecords,1)
assert.equal(stats.manual,1)
assert.equal(stats.percentage,100)

// Shared PID + plan ID across descriptions must not misallocate Actual.
const lines=[
  month('Insecticide A',10,0,{activity:'Insecticide'}),
  month('Insecticide C',20,0,{activity:'Insecticide'}),
]
stats=calculateMonthlyActivityAchievement('Insecticide',lines,[
  actual('r1','Insecticide A',8,{activity:'Insecticide'}),
  actual('r2','Insecticide C',17,{activity:'Insecticide'}),
  actual('r3','Insecticide',3,{activity:'Insecticide'}),
])
assert.equal(stats.plan,30)
assert.equal(stats.actual,25)
assert.equal(stats.actualRecords,2)
assert.equal(stats.unmatchedActualRecords,1)

// Week-filtered monthly target still disambiguates against other plan lines.
stats=calculateMonthlyActivityAchievement('Insecticide',[lines[1]],[
  actual('r1','Insecticide A',8,{activity:'Insecticide'}),
  actual('r2','Insecticide C',17,{activity:'Insecticide'})
],lines)
assert.equal(stats.plan,20)
assert.equal(stats.actual,17)

// Different paddock cannot contaminate chosen monthly plan.
stats=calculateMonthlyActivityAchievement('Knockdown',[month('Knockdown')],[
  actual('other','Knockdown',4,{pid:'JAGF-1-A-002'})
])
assert.equal(stats.actual,0)
assert.equal(stats.percentage,0)

// Do not claim 0 percent when no monthly target is available.
stats=calculateMonthlyActivityAchievement('Knockdown',[],[actual('a1','Knockdown')])
assert.equal(stats.plan,0)
assert.equal(stats.percentage,null)

// Cancelled monthly plan lines are excluded, even with historic Actual.
stats=calculateMonthlyActivityAchievement('Knockdown',[month('Knockdown',5.94,0,{cancelled:true})],[actual('a1','Knockdown')])
assert.equal(stats.plan,0)
assert.equal(stats.actual,0)

console.log('Monthly activity attainment unit cases: OK')
