/**
 * Firebase hybrid helpers for QC Form Web API v46.3.0.
 */
var FIREBASE_QC = {
  PROJECT_ID: 'form-qc-unm',
  API_KEY: 'AIzaSyD09IvCxfcjOyf3iAShTRr1XRlLMaQ3HKM'
};

function firebaseAuthCall_(action,payload){
  var url='https://identitytoolkit.googleapis.com/v1/accounts:'+action+'?key='+encodeURIComponent(FIREBASE_QC.API_KEY);
  var response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify(payload||{}),muteHttpExceptions:true});
  var code=response.getResponseCode(),raw=response.getContentText(),data={};
  try{data=JSON.parse(raw||'{}');}catch(e){data={};}
  if(code>=200&&code<300)return{ok:true,data:data};
  var message=String(data&&data.error&&data.error.message||('HTTP_'+code));
  return{ok:false,error:message,code:code,data:data};
}
function firebaseSignInOrCreate_(email,password,displayName){
  email=String(email||'').trim().toLowerCase();password=String(password||'');
  if(!email||password.length<6)return{ok:false,error:'FIREBASE_EMAIL_OR_PASSWORD_INVALID'};
  var signed=firebaseAuthCall_('signInWithPassword',{email:email,password:password,returnSecureToken:true});
  var created=false,result=signed;
  if(!signed.ok){
    var createdResult=firebaseAuthCall_('signUp',{email:email,password:password,returnSecureToken:true});
    if(!createdResult.ok)return{ok:false,error:createdResult.error||signed.error||'FIREBASE_AUTH_FAILED'};
    result=createdResult;created=true;
  }
  var data=result.data||{},uid=String(data.localId||''),idToken=String(data.idToken||'');
  if(!uid||!idToken)return{ok:false,error:'FIREBASE_AUTH_RESPONSE_INCOMPLETE'};
  if(displayName){
    var updated=firebaseAuthCall_('update',{idToken:idToken,displayName:String(displayName).slice(0,100),returnSecureToken:true});
    if(updated.ok&&updated.data&&updated.data.idToken)idToken=String(updated.data.idToken);
  }
  return{ok:true,uid:uid,idToken:idToken,created:created,email:email};
}
function ensureFirebaseIdentity_(found,password,active){
  if(!found)return{ok:false,status:'user_not_found'};
  ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(),QC.SHEETS.USERS,QC.USER_HEADERS,1);
  found=findUser_(String(found.data.Username||found.data.Email||''))||found;
  var email=String(found.data.Email||'').trim().toLowerCase();
  if(!email){markFirebaseIdentity_(found,'','NO_EMAIL');return{ok:false,status:'no_email'};}
  var previousStatus=String(found.data.FirebaseStatus||'');
  var auth=firebaseSignInOrCreate_(email,password,String(found.data.FullName||found.data.Username||''));
  if(!auth.ok){markFirebaseIdentity_(found,String(found.data.FirebaseUID||''),'AUTH_ERROR');return{ok:false,status:'auth_error',message:auth.error};}
  markFirebaseIdentity_(found,auth.uid,'AUTH_READY');
  found=findUser_(String(found.data.Username||email))||found;
  var profileOk=false;
  try{profileOk=syncFirebaseProfileForFound_(found,active===true);}catch(e){console.warn('Firestore profile sync gagal: '+e);}
  markFirebaseIdentity_(found,auth.uid,profileOk?'READY':'AUTH_READY_FIRESTORE_PENDING');
  return{ok:true,status:profileOk?'ready':'firestore_pending',uid:auth.uid,created:auth.created,profileSynced:profileOk,backfillRecommended:auth.created||previousStatus!=='READY'};
}
function markFirebaseIdentity_(found,uid,status){
  if(!found)return;
  var sh=found.sheet,map=headerMap_(sh,1);
  if(map.FirebaseUID&&uid)sh.getRange(found.row,map.FirebaseUID).setValue(uid);
  if(map.FirebaseStatus)sh.getRange(found.row,map.FirebaseStatus).setValue(status||'');
  if(map.UpdatedAt)sh.getRange(found.row,map.UpdatedAt).setValue(new Date());
}
function firebaseProfileObject_(found,activeOverride){
  var o=found.data||{},status=String(o.Status||'').toUpperCase(),active=activeOverride===undefined?status==='APPROVED':Boolean(activeOverride);
  return{active:active,status:status||'PENDING',role:normalizeRole_(o.Role),username:String(o.Username||'').toLowerCase(),email:String(o.Email||'').toLowerCase(),fullName:String(o.FullName||o.Username||''),allowedForm:String(o.AllowedForm||allowedForm_(o.Role)),source:'qc_apps_script',updatedAt:new Date().toISOString()};
}
function syncFirebaseProfileForFound_(found,activeOverride){
  if(!found)return false;
  var fresh=findUser_(String(found.data.Username||found.data.Email||''))||found,uid=String(fresh.data.FirebaseUID||'');
  if(!uid)return false;
  firestorePatchDocument_('users/'+uid,firebaseProfileObject_(fresh,activeOverride));
  return true;
}
function safeSyncFirebaseProfile_(found){try{return syncFirebaseProfileForFound_(found,undefined);}catch(e){console.warn('Firebase profile sync pending: '+e);return false;}}
function safeDisableFirebaseProfile_(found){try{return syncFirebaseProfileForFound_(found,false);}catch(e){console.warn('Firebase profile disable pending: '+e);return false;}}
function cleanRecordForFirestore_(record){
  var clean=JSON.parse(JSON.stringify(record||{}));delete clean.photoBase64;
  if(Array.isArray(clean.holdIntervals))clean.holdIntervals=clean.holdIntervals.map(function(h){var x=JSON.parse(JSON.stringify(h||{}));delete x.photoBase64;return x;});
  clean.serverSyncedAt=new Date().toISOString();clean.syncSource='apps_script_server';return clean;
}
function mirrorRecordToFirestoreServer_(record){if(!record||!record.id)throw new Error('Record Firestore tidak memiliki ID.');firestorePatchDocument_('qc_records/'+String(record.id),cleanRecordForFirestore_(record));return true;}
function safeMirrorRecordToFirestore_(record){try{return mirrorRecordToFirestoreServer_(record);}catch(e){console.warn('Mirror Firestore pending '+String(record&&record.id||'')+': '+e);return false;}}
function safeDeleteRecordFromFirestore_(id){try{firestoreDeleteDocument_('qc_records/'+String(id));return true;}catch(e){console.warn('Delete Firestore pending '+id+': '+e);return false;}}
function safeBackfillUserRecords_(username,limit){
  try{username=String(username||'').toLowerCase();limit=Math.max(1,Math.min(Number(limit)||100,300));var sh=getSheet_(QC.SHEETS.CLOUD),map=headerMap_(sh,1),rows=dataRows_(sh,2),records=[];
    rows.forEach(function(r){var o=rowObject_(r,map),rec={};try{rec=JSON.parse(o.RecordJSON||'{}');}catch(e){}if(rec&&rec.id&&String(rec.inputtedBy||'').toLowerCase()===username)records.push(rec);});
    records=records.slice(-limit);var ok=0;records.forEach(function(rec){if(safeMirrorRecordToFirestore_(rec))ok++;});console.info('Firebase backfill @'+username+': '+ok+'/'+records.length);return ok;
  }catch(e){console.warn('Firebase backfill gagal @'+username+': '+e);return 0;}
}
function firestorePatchDocument_(path,obj){
  var response=UrlFetchApp.fetch(firestoreDocumentUrl_(path),{method:'patch',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:JSON.stringify({fields:firestoreFields_(obj||{})}),muteHttpExceptions:true});
  var code=response.getResponseCode();if(code<200||code>=300)throw new Error('FIRESTORE_PATCH_'+code+': '+response.getContentText().slice(0,500));return true;
}
function firestoreDeleteDocument_(path){var response=UrlFetchApp.fetch(firestoreDocumentUrl_(path),{method:'delete',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true}),code=response.getResponseCode();if(code===404)return true;if(code<200||code>=300)throw new Error('FIRESTORE_DELETE_'+code+': '+response.getContentText().slice(0,500));return true;}
function firestoreDocumentUrl_(path){var safe=String(path||'').split('/').map(function(x){return encodeURIComponent(x);}).join('/');return 'https://firestore.googleapis.com/v1/projects/'+FIREBASE_QC.PROJECT_ID+'/databases/(default)/documents/'+safe;}
function firestoreFields_(obj){var out={};Object.keys(obj||{}).forEach(function(k){var v=obj[k];if(v!==undefined&&typeof v!=='function')out[k]=firestoreValue_(v);});return out;}
function firestoreValue_(value){if(value===null)return{nullValue:null};if(value instanceof Date)return{timestampValue:value.toISOString()};if(typeof value==='boolean')return{booleanValue:value};if(typeof value==='number'){if(!isFinite(value))return{stringValue:String(value)};return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};}if(typeof value==='string')return{stringValue:value};if(Array.isArray(value))return{arrayValue:{values:value.map(firestoreValue_)}};if(typeof value==='object')return{mapValue:{fields:firestoreFields_(value)}};return{stringValue:String(value)};}
function testFirebaseHybridAccess(){var url='https://firestore.googleapis.com/v1/projects/'+FIREBASE_QC.PROJECT_ID+'/databases/(default)/documents/users?pageSize=1';var response=UrlFetchApp.fetch(url,{method:'get',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});return 'Firebase Hybrid Firestore HTTP '+response.getResponseCode()+' | '+response.getContentText().slice(0,300);}
