// Direct regression for the real shared form save-intent builder.
// Pure local data; no browser, SDK, credentials, or network.
import assert from 'node:assert/strict'
import {buildQcFormSaveIntent} from '../src/qcFormSaveIntent.mjs'

const image='data:image/png;base64,AQID'
const record=(extra={})=>({clientRevision:'r2',holdIntervals:[],...extra})
const edit={isNew:false,baseRevision:'r1'}
const fresh={isNew:true}
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)}
check('manual new QC has no scan intent',()=>{
 assert.deepEqual(buildQcFormSaveIntent(record(),fresh),{baseRevision:null,changes:[]})
})
check('historical scan URL and metadata do not create replacement or deletion',()=>{
 const old=record({scanReportDriveUrl:'https://drive.google.com/file/d/fixture/view',scanConfidence:91,scanRawText:'legacy',scanReportPhotoBase64:'',operationalPhotoManifest:{scan:{objectPath:'synthetic'}}})
 const before=structuredClone(old)
 assert.deepEqual(buildQcFormSaveIntent(old,edit),{baseRevision:'r1',changes:[]})
 assert.deepEqual(old,before)
})
check('recovered local draft scan attachment remains saveable',()=>{
 assert.deepEqual(buildQcFormSaveIntent(record({scanReportPhotoBase64:image}),fresh).changes,[{kind:'scan',action:'replace',dataUrl:image}])
})
check('manual new main and HOLD attachments still create independent intents',()=>{
 const intent=buildQcFormSaveIntent(record({photoBase64:image,holdIntervals:[{holdId:'h1',photoBase64:image}]}),fresh)
 assert.deepEqual(intent.changes,[{kind:'main',action:'replace',dataUrl:image},{kind:'hold',holdId:'h1',action:'replace',dataUrl:image}])
})
check('existing main and scan empty inputs leave both historical slots untouched',()=>{
 const intent=buildQcFormSaveIntent(record({photoBase64:'',scanReportPhotoBase64:''}),edit)
 assert.deepEqual(intent.changes,[])
})
check('explicit main removal does not remove historical scan',()=>{
 assert.deepEqual(buildQcFormSaveIntent(record(),{...edit,removeMain:true}).changes,[{kind:'main',action:'remove'}])
})
check('legacy explicit scan removal affects only scan',()=>{
 assert.deepEqual(buildQcFormSaveIntent(record({scanReportPhotoBase64:image}),{...edit,removeScan:true}).changes,[{kind:'scan',action:'remove'}])
})
check('HOLD correction keeps untouched HOLD and scan, removes missing HOLD once',()=>{
 const intent=buildQcFormSaveIntent(record({holdIntervals:[{holdId:'h1',photoBase64:image},{holdId:'h2',photoBase64:image}]}),{...edit,previousHoldIds:['h1','h2','h3'],replaceHoldIds:['h2'],removedHoldIds:['h3']})
 assert.deepEqual(intent.changes,[{kind:'hold',holdId:'h2',action:'replace',dataUrl:image},{kind:'hold',holdId:'h3',action:'remove'}])
 assert.equal(intent.baseRevision,'r1')
})
check('missing correction base revision rejected',()=>{
 assert.throws(()=>buildQcFormSaveIntent(record(),{isNew:false}),/QC_BASE_REVISION_REQUIRED/)
})
check('missing new revision rejected',()=>{
 assert.throws(()=>buildQcFormSaveIntent({holdIntervals:[]},fresh),/QC_NEW_REVISION_REQUIRED/)
})
check('HOLD without stable identity rejected',()=>{
 assert.throws(()=>buildQcFormSaveIntent(record({holdIntervals:[{photoBase64:image}]}),fresh),/QC_HOLD_ID_REQUIRED/)
})
console.log('SUCCESS: '+n+' QC form save intent checks passed (offline, no writes)')
