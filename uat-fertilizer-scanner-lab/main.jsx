import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import FertilizerReportScanner,{parseFertilizerReportText} from '../src/FertilizerReportScanner'
import {state,master,defaults,rawText} from './fixtures.mjs'
if(location.origin!=='http://127.0.0.1:4796')throw Error('SCANNER_LAB_ORIGIN')
const user={username:'uat-fertilizer',firebaseUid:'uat-fertilizer',role:'mandor_fertilizer'}
function Lab(){
 const [generation,setGeneration]=useState(0),[open,setOpen]=useState(true)
 globalThis.scanLab={snapshot:()=>structuredClone(state),mode:(ai,ocr='ok')=>{state.ai=ai;state.ocr=ocr},reset:()=>{state.ai='ok';state.ocr='ok';state.calls=[];state.feedback=[];state.applied=[];setOpen(true);setGeneration(v=>v+1)},parse:()=>parseFertilizerReportText(rawText,master,defaults,88)}
 return <main>{open?<FertilizerReportScanner key={generation} user={user} master={master} defaults={defaults} onClose={()=>setOpen(false)} onApply={(result,mode,file)=>{state.applied.push({result:structuredClone(result),mode,name:file.name,size:file.size});setOpen(false)}}/>:<p>Scanner closed</p>}</main>
}
createRoot(document.getElementById('root')).render(<Lab/>)
