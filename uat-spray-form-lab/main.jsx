import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import SprayForm from '../src/SprayForm'
import {flushDraftWrite,loadDraft} from '../src/draftStore'
import {fixtureUid,fixtureDate,operationalQueuedRecords} from './fixtures.mjs'
if(location.origin!=='http://127.0.0.1:4685')throw Error('SPRAY_FORM_LAB_ORIGIN')
const user={username:'uat-spray',firebaseUid:fixtureUid,fullName:'Synthetic Mandor',role:'mandor_spraying'}
const master={names:['Mandor A','Mandor B'],assistants:['Asisten A'],shifts:['1','2'],unitMap:{'Boom Sprayer':['SP001','SP002','SP003']}}
let saved=[]
function Lab(){
 const [records,setRecords]=useState([]),[generation,setGeneration]=useState(0),[count,setCount]=useState(0)
 globalThis.sprayLab={getSaved:()=>structuredClone(saved),queue:operationalQueuedRecords,waitDraft:()=>flushDraftWrite('spray:'+fixtureUid),readDraft:()=>loadDraft('spray:'+fixtureUid),editFixture:rows=>{setRecords(rows);setGeneration(v=>v+1)}}
 return <main><p>Actual SprayForm — local synthetic capture only</p><p id="saved-count">{count}</p><SprayForm key={generation} token="synthetic-no-network" user={user} master={master} initialRecords={records} onSaved={rows=>{saved=structuredClone(rows);setCount(rows.length)}} /></main>
}
createRoot(document.getElementById('root')).render(<Lab/>)
