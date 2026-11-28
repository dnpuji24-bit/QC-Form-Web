// The stored legacy candidate.shi is cumulative actual, not the displayed SHI.
export function bkmRealization(candidate,hiOverride,manualOnly=false){
 if(!candidate)return {hi:null,balance:null,progress:null,prior:null}
 // New manual rows distinguish an empty HI from an entered zero. Legacy snapshots retain their source default.
 const hi=hiOverride==null?(manualOnly?null:candidate.hi):hiOverride
 const prior=candidate.shi==null||candidate.hi==null?null:Math.max(0,candidate.shi-candidate.hi)
 const target=candidate.target
 if(candidate.conflict||!candidate.wo||prior==null||hi==null||target==null||target<=0)return {hi,balance:null,progress:null,prior}
 const completed=prior+hi
 return {hi,balance:Math.max(0,target-completed),progress:completed/target*100,prior}
}
export function bkmManualCandidate(company,paddock,activity){
 return {id:JSON.stringify(['manual',company,paddock.pid,activity.operationCode]),company,pid:paddock.pid,wo:'',
 operationCode:activity.operationCode,description:activity.description,area:paddock.area,hk:null,uom:activity.uom||'Ha',target:null,hi:null,shi:null,progress:null,notes:'',warnings:[],conflict:false,actualIds:[],material:[]}
}
export function bkmValidQuantity(value){return value==null||(typeof value==='number'&&Number.isFinite(value)&&value>=0)}
