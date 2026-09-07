from pathlib import Path
import json

code_path = Path('Code.gs')
s = code_path.read_text(encoding='utf-8')

def replace_once(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'Patch anchor not found: {label}')
    s = s.replace(old, new, 1)

s = s.replace('QC Form Web API v46.2.2', 'QC Form Web API v46.3.0', 1)
replace_once("VERSION: '46.2.2'", "VERSION: '46.3.0'", 'version')
replace_once(
    "USER_HEADERS: ['Timestamp','Username','Password','FullName','Role','Status','ApprovedBy','ApprovedAt','Notes','Email','PasswordHash','Salt','AllowedForm','UpdatedAt']",
    "USER_HEADERS: ['Timestamp','Username','Password','FullName','Role','Status','ApprovedBy','ApprovedAt','Notes','Email','PasswordHash','Salt','AllowedForm','UpdatedAt','FirebaseUID','FirebaseStatus']",
    'user headers'
)
replace_once(
    "  if (!found.data.PasswordHash) upgradeLegacyPassword_(found,password);\n  var token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');\n  var user = normalizeUser_(found.data);",
    "  if (!found.data.PasswordHash) upgradeLegacyPassword_(found,password);\n  var firebaseState={ok:false,status:'skipped'};\n  try { firebaseState=ensureFirebaseIdentity_(found,password,true); found=findUser_(username)||found; }\n  catch(firebaseErr){ console.warn('Firebase provisioning login dilewati: '+firebaseErr); firebaseState={ok:false,status:'error',message:String(firebaseErr)}; }\n  var token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');\n  var user = normalizeUser_(found.data);\n  if(firebaseState.ok && firebaseState.backfillRecommended) safeBackfillUserRecords_(user.username,150);",
    'login provisioning'
)
replace_once(
    "  return {ok:true,token:token,expiresIn:QC.SESSION_SECONDS,user:publicUser_(user)};",
    "  return {ok:true,token:token,expiresIn:QC.SESSION_SECONDS,user:publicUser_(user),firebase:firebaseState};",
    'login response'
)
replace_once(
    "  var sh = getSheet_(QC.SHEETS.USERS), map = headerMap_(sh,1), salt = newSalt_();",
    "  var sh = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(),QC.SHEETS.USERS,QC.USER_HEADERS,1), map = headerMap_(sh,1), salt = newSalt_();",
    'register ensure headers'
)
replace_once(
    "  sh.appendRow(row); log_(null,{username:username,fullName:fullName,role:requested},'REGISTER','Pendaftaran akun baru',req.deviceInfo);\n  return {ok:true,message:'Pendaftaran terkirim dan menunggu persetujuan Owner.'};",
    "  sh.appendRow(row);\n  var firebaseState={ok:false,status:'pending'};\n  try { firebaseState=ensureFirebaseIdentity_(findUser_(username),password,false); }\n  catch(firebaseErr){ console.warn('Firebase provisioning register tertunda: '+firebaseErr); firebaseState={ok:false,status:'error',message:String(firebaseErr)}; }\n  log_(null,{username:username,fullName:fullName,role:requested},'REGISTER','Pendaftaran akun baru | Firebase '+(firebaseState.ok?'siap':'tertunda'),req.deviceInfo);\n  return {ok:true,message:firebaseState.ok?'Pendaftaran terkirim, akun Firebase dibuat otomatis, dan menunggu persetujuan Owner.':'Pendaftaran terkirim dan menunggu persetujuan Owner. Firebase akan dicoba lagi otomatis saat login.',firebase:firebaseState};",
    'register provisioning'
)
replace_once(
    "  upsertCloud_(rec,user); log_(null,user,'SYNC_DRAFT','Sinkronisasi '+rec.formType+' '+rec.paddock,rec.deviceInfo);\n  return {ok:true,recordId:rec.id,updatedAt:rec.updatedAt,photoDriveUrl:rec.photoDriveUrl||''};",
    "  upsertCloud_(rec,user); var firestoreSynced=safeMirrorRecordToFirestore_(rec); log_(null,user,'SYNC_DRAFT','Sinkronisasi '+rec.formType+' '+rec.paddock+' | Firestore '+(firestoreSynced?'OK':'pending'),rec.deviceInfo);\n  return {ok:true,recordId:rec.id,updatedAt:rec.updatedAt,photoDriveUrl:rec.photoDriveUrl||'',firestoreSynced:firestoreSynced};",
    'draft server mirror'
)
replace_once(
    "  log_(null,user,'UPLOAD_'+rec.formType.toUpperCase(),'Upload/koreksi '+rec.paddock,rec.deviceInfo);\n  return {ok:true,recordId:rec.id,rows:result,photoDriveUrl:rec.photoDriveUrl||''};",
    "  var firestoreSynced=safeMirrorRecordToFirestore_(rec);\n  log_(null,user,'UPLOAD_'+rec.formType.toUpperCase(),'Upload/koreksi '+rec.paddock+' | Firestore '+(firestoreSynced?'OK':'pending'),rec.deviceInfo);\n  return {ok:true,recordId:rec.id,rows:result,photoDriveUrl:rec.photoDriveUrl||'',firestoreSynced:firestoreSynced};",
    'upload server mirror'
)
replace_once(
    "  log_(null,user,'DELETE_RECORD','Hapus record '+id,''); return {ok:true};",
    "  var firestoreDeleted=safeDeleteRecordFromFirestore_(id);\n  log_(null,user,'DELETE_RECORD','Hapus record '+id+' | Firestore '+(firestoreDeleted?'OK':'pending'),''); return {ok:true,firestoreSynced:firestoreDeleted};",
    'delete server mirror'
)
replace_once(
    "  sh.getRange(row,map.ApprovedAt).setValue(new Date()); if(map.AllowedForm) sh.getRange(row,map.AllowedForm).setValue(allowedForm_(role)); if(map.UpdatedAt) sh.getRange(row,map.UpdatedAt).setValue(new Date());\n  log_(null,admin,status+'_USER',status+' @'+found.data.Username+' sebagai '+role,''); return {ok:true};",
    "  sh.getRange(row,map.ApprovedAt).setValue(new Date()); if(map.AllowedForm) sh.getRange(row,map.AllowedForm).setValue(allowedForm_(role)); if(map.UpdatedAt) sh.getRange(row,map.UpdatedAt).setValue(new Date());\n  var firebaseSynced=safeSyncFirebaseProfile_(findUser_(String(found.data.Username||'')));\n  log_(null,admin,status+'_USER',status+' @'+found.data.Username+' sebagai '+role+' | Firebase '+(firebaseSynced?'OK':'pending'),''); return {ok:true,firebaseSynced:firebaseSynced};",
    'approval profile sync'
)
replace_once(
    "  if(found.map.UpdatedAt) found.sheet.getRange(found.row,found.map.UpdatedAt).setValue(new Date());\n  log_(null,admin,'CHANGE_ROLE','Role @'+username+' diubah menjadi '+role,'');",
    "  if(found.map.UpdatedAt) found.sheet.getRange(found.row,found.map.UpdatedAt).setValue(new Date());\n  var firebaseSynced=safeSyncFirebaseProfile_(findUser_(username));\n  log_(null,admin,'CHANGE_ROLE','Role @'+username+' diubah menjadi '+role+' | Firebase '+(firebaseSynced?'OK':'pending'),'');",
    'role profile sync'
)
replace_once(
    "    found.sheet.deleteRow(found.row);\n    CacheService.getScriptCache().put('revoked:'+username,'1',QC.SESSION_SECONDS);",
    "    safeDisableFirebaseProfile_(found);\n    found.sheet.deleteRow(found.row);\n    CacheService.getScriptCache().put('revoked:'+username,'1',QC.SESSION_SECONDS);",
    'delete profile disable'
)
replace_once(
    "  if(nextUsername)migrateCloudOwner_(oldUsername,nextUsername);\n  sh.getRange(row,map.Status).setValue('APPROVED');",
    "  if(nextUsername)migrateCloudOwner_(oldUsername,nextUsername);\n  safeSyncFirebaseProfile_(findUser_(nextUsername||oldUsername));\n  sh.getRange(row,map.Status).setValue('APPROVED');",
    'account change profile sync'
)
replace_once(
    "function normalizeUser_(o){return{username:String(o.Username||'').toLowerCase(),email:String(o.Email||''),fullName:String(o.FullName||o.Username||''),role:normalizeRole_(o.Role),status:String(o.Status||''),allowedForm:String(o.AllowedForm||allowedForm_(o.Role))};}\nfunction publicUser_(u){return{username:u.username,email:u.email,fullName:u.fullName,role:u.role,status:u.status,allowedForm:u.allowedForm};}",
    "function normalizeUser_(o){return{username:String(o.Username||'').toLowerCase(),email:String(o.Email||''),fullName:String(o.FullName||o.Username||''),role:normalizeRole_(o.Role),status:String(o.Status||''),allowedForm:String(o.AllowedForm||allowedForm_(o.Role)),firebaseUid:String(o.FirebaseUID||''),firebaseStatus:String(o.FirebaseStatus||'')};}\nfunction publicUser_(u){return{username:u.username,email:u.email,fullName:u.fullName,role:u.role,status:u.status,allowedForm:u.allowedForm,firebaseUid:u.firebaseUid||'',firebaseStatus:u.firebaseStatus||''};}",
    'public firebase status'
)
code_path.write_text(s, encoding='utf-8')

helper = r'''/**
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
'''
Path('FirebaseProvisioning.gs').write_text(helper, encoding='utf-8')

manifest = {
    'timeZone': 'Asia/Jayapura',
    'dependencies': {},
    'exceptionLogging': 'STACKDRIVER',
    'runtimeVersion': 'V8',
    'oauthScopes': [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/script.external_request',
        'https://www.googleapis.com/auth/datastore'
    ],
    'webapp': {'executeAs': 'USER_DEPLOYING', 'access': 'ANYONE_ANONYMOUS'}
}
Path('appsscript.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')

app_path=Path('src/App.tsx')
app=app_path.read_text(encoding='utf-8')
anchor="function sameFertilizerSession(a:QcRecord,b:QcRecord){if(a.formType!=='fertilizer'||b.formType!=='fertilizer')return false;const x=String(a.sessionId||''),y=String(b.sessionId||'');return x&&y?x===y:a.id===b.id}\n"
if anchor not in app: raise SystemExit('App merge helper anchor not found')
merge="function mergeRecordLists(existing:QcRecord[],incoming:QcRecord[]){const map=new Map<string,QcRecord>();for(const record of existing)if(record?.id)map.set(record.id,record);for(const record of incoming)if(record?.id)map.set(record.id,{...map.get(record.id),...record});return[...map.values()].sort((a,b)=>String(b.updatedAt||b.createdAt||b.date||'').localeCompare(String(a.updatedAt||a.createdAt||a.date||'')))}\n"
app=app.replace(anchor,anchor+merge,1)
old="stopRecords=subscribeQcRecords(next=>{setRecords(next);setBusy(false)},state=>{if(!state.connected)void refreshRecords()})"
new="stopRecords=subscribeQcRecords(next=>{setRecords(oldRecords=>mergeRecordLists(oldRecords,next));setBusy(false)},state=>{if(!state.connected)void refreshRecords()})"
if old not in app: raise SystemExit('App realtime merge anchor not found')
app=app.replace(old,new,1)
old_login="if(result.user.email)void signInFirebaseBridge(result.user.email,password);onLogin(result.token,result.user)"
new_login="if(result.user.email)await signInFirebaseBridge(result.user.email,password);onLogin(result.token,result.user)"
if old_login not in app: raise SystemExit('App firebase login anchor not found')
app=app.replace(old_login,new_login,1)
app_path.write_text(app,encoding='utf-8')

types_path=Path('src/types.ts')
types=types_path.read_text(encoding='utf-8')
old_types="  allowedForm?: FormType | 'all' | string\n}"
new_types="  allowedForm?: FormType | 'all' | string\n  firebaseUid?: string\n  firebaseStatus?: string\n}"
if old_types not in types: raise SystemExit('User type anchor not found')
types=types.replace(old_types,new_types,1)
types_path.write_text(types,encoding='utf-8')
