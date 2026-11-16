import assert from 'node:assert/strict'
import {stripTypeScriptTypes} from 'node:module'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/firestoreStore.ts',import.meta.url),'utf8')
// Node 22.13+/23.2+ includes native type stripping; no project compiler API.
// Extract only the contiguous mapper declarations, not firestoreStore imports.
assert.equal(typeof stripTypeScriptTypes,'function','NODE_NATIVE_TYPE_STRIPPING_REQUIRED')
const startMarker='function qcActualArea(record:QcRecord)'
const endMarker='export async function mirrorQcActualToFirestore'
assert.equal(source.split(startMarker).length,2,'ACTUAL_MAPPER_START_CHANGED')
assert.equal(source.split(endMarker).length,2,'ACTUAL_MAPPER_END_CHANGED')
const start=source.indexOf(startMarker),end=source.indexOf(endMarker)
assert.ok(start>=0&&end>start,'ACTUAL_MAPPER_SOURCE_BOUNDARY')
const picked=source.slice(start,end).trim()
const names=['qcActualArea','qcActualEligible','qcActualReportId','qcActualMaterials','buildQcActualPayload']
assert.deepEqual([...picked.matchAll(/^(?:export )?function (\w+)\(/gm)].map(m=>m[1]),names,'ACTUAL_MAPPER_SOURCE_CHANGED')
assert.doesNotMatch(picked,/\b(?:import\s*(?:\(|[{*'"])|require\s*\(|fetch\s*\(|process\.|globalThis\.)/,'ACTUAL_MAPPER_UNEXPECTED_DEPENDENCY')
const code="const firebaseAuth={currentUser:{email:'synthetic@example.test'}};const serverTimestamp=()=>({fixtureTimestamp:true});\n"+picked
const compiled=stripTypeScriptTypes(code,{mode:'strip'})
const loaded=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
assert.deepEqual(Object.keys(loaded),['buildQcActualPayload'])
const {buildQcActualPayload}=loaded
export {buildQcActualPayload}
