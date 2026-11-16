import React,{useCallback,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {RecordReport,downloadExcel} from './report-extracted'
import {setPhotos,pause,resume,setSession} from './fixtures.mjs'
import '../src/styles.css'
import '../src/theme.css'
import '../src/field-ui.css'
if(location.origin!=='http://127.0.0.1:4785')throw Error('REPORT_LAB_ORIGIN')
function Lab(){
 const [record,setRecord]=useState(null),[rows,setRows]=useState([])
 const close=useCallback(()=>setRecord(null),[])
 globalThis.reportLab={show:setRecord,setRows,setPhotos,pause,resume,setSession}
 return <main><p>Isolated source-derived QC report lab</p><button onClick={()=>void downloadExcel(rows)}>Export Excel QC</button>{record&&<RecordReport record={record} onClose={close}/>}</main>
}
createRoot(document.getElementById('root')).render(<Lab/>)
