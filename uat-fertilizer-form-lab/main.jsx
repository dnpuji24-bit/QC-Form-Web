import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import FertilizerForm from '../src/FertilizerForm'
import {flushDraftWrite,loadDraft} from '../src/draftStore'
import {fixtureUid,fixtureDate,operationalQueuedRecords} from './fixtures.mjs'
if(location.origin!=='http://127.0.0.1:4795')throw Error('SPRAY_FORM_LAB_ORIGIN')
const user={username:'uat-fertilizer',firebaseUid:fixtureUid,fullName:'Synthetic Mandor',role:'mandor_fertilizer'}
const master={names:['Mandor A','Mandor B'],assistants:['Asisten A'],shifts:['1','2'],unitMap:{'Stool Splitter':['SS001','SS002','SS003']}}
let saved=[]
function Lab(){
 const [records,setRecords]=useState([]),[generation,setGeneration]=useState(0),[count,setCount]=useState(0)
 globalThis.fertLab={getSaved:()=>structuredClone(saved),queue:operationalQueuedRecords,waitDraft:()=>flushDraftWrite('fertilizer:'+fixtureUid),readDraft:()=>loadDraft('fertilizer:'+fixtureUid),editFixture:rows=>{setRecords(rows);setGeneration(v=>v+1)}}
 return <main><p>Actual FertilizerForm — local synthetic capture only</p><p id="saved-count">{count}</p><FertilizerForm key={generation} token="synthetic-no-network" user={user} master={master} initialRecords={records} onSaved={rows=>{saved=structuredClone(rows);setCount(rows.length)}} /></main>
}
createRoot(document.getElementById('root')).render(<Lab/>)
