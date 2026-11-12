// Build an explicit save intent from actual QC form controls. Empty photo inputs
// never mean delete. Existing revision must come from the record opened in UI.
export function buildQcFormSaveIntent(record, options) {
  const {baseRevision,isNew,removeMain=false,removeScan=false,removedHoldIds=[],previousHoldIds=[],replaceHoldIds=[]}=options;
  if(!isNew && (typeof baseRevision!=='string'||!baseRevision))throw Error('QC_BASE_REVISION_REQUIRED');
  if(typeof record.clientRevision!=='string'||!record.clientRevision)throw Error('QC_NEW_REVISION_REQUIRED');
  const changes=[];
  function add(kind,value,remove,holdId){
    const slot=holdId===undefined?{kind}:{kind,holdId};
    if(remove)changes.push({...slot,action:'remove'});
    else if(typeof value==='string'&&value.startsWith('data:image/'))changes.push({...slot,action:'replace',dataUrl:value});
  }
  add('main',record.photoBase64,removeMain);
  add('scan',record.scanReportPhotoBase64,removeScan);
  const holds=Array.isArray(record.holdIntervals)?record.holdIntervals:[];
  const currentIds=new Set(holds.map(h=>h.holdId));
  const removed=new Set([...removedHoldIds,...previousHoldIds.filter(id=>!currentIds.has(id))]);
  const replace=new Set(replaceHoldIds);
  for(const h of holds){
    if(!h.holdId||typeof h.holdId!=='string')throw Error('QC_HOLD_ID_REQUIRED');
    if(!removed.has(h.holdId)&&(isNew||replace.has(h.holdId)))add('hold',h.photoBase64,false,h.holdId);
  }
  for(const holdId of removed)add('hold','',true,holdId);
  return {baseRevision:isNew?null:baseRevision,changes};
}
