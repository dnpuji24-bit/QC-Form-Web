/**
 * QC Form Web API v46
 * Deploy as a Web App from the Apps Script project bound to "Application QC Form".
 * Execute as: Me. Access: Anyone.
 *
 * Security model:
 * - Passwords are salted SHA-256 hashes (legacy plaintext is upgraded at login).
 * - Every private endpoint requires a short-lived server-issued bearer token.
 * - Permissions are enforced here; the browser UI is not trusted.
 */
var QC = {
  VERSION: '46.0.0',
  SESSION_SECONDS: 21600,
  SHEETS: {
    USERS: 'Users', LOGS: 'Activity_Logs', CLOUD: 'Cloud_Monitoring',
    SPRAY: 'Form QC Spray', FERT: 'Form QC Fertilizer', DATA: 'Data', PLAN: 'Plan', BAHAN: 'Bahan'
  },
  ROLES: ['owner', 'manager', 'admin', 'asisten', 'mandor_spraying', 'mandor_fertilizer', 'pengunjung'],
  SPRAY_HEADERS: ['Date','Start Time','End Time','Shift','Status','Name','Name of Assistan','Paddock','Variety','Area (Ha)','Unit','No. Unit','Dropper','Droplet Size','Nozzle','Height (m)','Row Spacing (m)','Speed (Km/Jam)','Type','Activity','Deskripsi','Pesticide 1','Dosage','Pesticide 2','Dosage','Pesticide 3','Dosage','Pesticide 4','Dosage','Adjuvant','Adjuvant Dosage (mL/L)','Estimated Usage Pesticide 1','Estimated Usage Pesticide 2','Estimated Usage Pesticide 3','Estimated Usage Pesticide 4','Estimated Usage Adjuvant','Actual Usage Pesticide 1','Actual Usage Pesticide 2','Actual Usage Pesticide 3','Actual Usage Pesticide 4','Actual Usage Adjuvant','Water Rate','Water Quality','Actual Usage','Wind Speed (Km/jam)','Temperature (°C)','Humidity (NRC)','Delta T (°C)','Weather Condition','Noted*','Foto QC (Link Drive)','Record ID (Sistem)'],
  FERT_HEADERS: ['Tanggal','Shift','Name','Name of Assistan','Status','Start Time ','End Time','Paddock','Unit','No. Unit','Type','Activity','Jenis Pupuk','Dosis (Kg/Ha)','Status Hose','Pengisian Ke -','Jumlah (Kg)','Hasil Kerja (Ha)','Dosis Aktual (Kg/ha)','Perataan Pupuk','Catatan','Foto QC (Link Drive)','Record ID (Sistem)'],
  USER_HEADERS: ['Timestamp','Username','Password','FullName','Role','Status','ApprovedBy','ApprovedAt','Notes','Email','PasswordHash','Salt','AllowedForm','UpdatedAt'],
  CLOUD_HEADERS: ['LastUpdated','RecordID','FormType','Date','Shift','Mandor','Assistan','Paddock','Status','SaveType','SummaryDetails','RecordJSON','PhotoLink','UpdatedBy'],
  LOG_HEADERS: ['Timestamp','Username','FullName','Role','ActionType','Description','IP_Device']
};

function doGet(e) { return route_((e && e.parameter) || {}, 'GET'); }
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return output_({ok:false,error:'INVALID_JSON',message:'Format permintaan tidak valid.'}); }
  return route_(body, 'POST');
}

function route_(req, method) {
  try {
    var action = clean_(req.action, 60);
    if (action === 'health') return output_({ok:true,version:QC.VERSION,time:new Date().toISOString()});
    if (action === 'masterData' && method === 'GET') return output_({ok:true,data:getMasterData_()});
    if (action === 'login') return output_(login_(req));
    if (action === 'register') return output_(register_(req));

    var session = requireSession_(req.token);
    if (action === 'logout') { CacheService.getScriptCache().remove('session:' + req.token); return output_({ok:true}); }
    if (action === 'me') return output_({ok:true,user:publicUser_(session)});
    if (action === 'records') return output_({ok:true,records:listCloud_(session)});
    if (action === 'users') { requireRole_(session,['owner']); return output_({ok:true,users:listUsers_()}); }
    if (action === 'logs') { requireRole_(session,['owner','manager','admin','asisten']); return output_({ok:true,logs:listLogs_()}); }
    if (action === 'syncRecord') return output_(syncRecord_(session, req.record || req.data));
    if (action === 'finalizeRecord') return output_(finalizeRecord_(session, req.record || req.data));
    if (action === 'deleteRecord') return output_(deleteRecord_(session, req.recordId));
    if (action === 'approveUser') { requireRole_(session,['owner']); return output_(approveUser_(session,req)); }
    if (action === 'rejectUser') { requireRole_(session,['owner']); return output_(rejectUser_(session,req)); }
    if (action === 'changePassword') return output_(changePassword_(session,req));
    return output_({ok:false,error:'UNKNOWN_ACTION',message:'Aksi tidak dikenal.'});
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    var message = String(err && err.message ? err.message : err);
    return output_({ok:false,error:message.indexOf('AUTH_')===0 ? message : 'SERVER_ERROR',message:message.indexOf('AUTH_')===0 ? authMessage_(message) : 'Server gagal memproses permintaan.'});
  }
}

function setupSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, QC.SHEETS.USERS, QC.USER_HEADERS, 1);
  ensureSheet_(ss, QC.SHEETS.LOGS, QC.LOG_HEADERS, 1);
  ensureSheet_(ss, QC.SHEETS.CLOUD, QC.CLOUD_HEADERS, 1);
  ensureSheet_(ss, QC.SHEETS.SPRAY, QC.SPRAY_HEADERS, detectSprayHeaderRow_(ss.getSheetByName(QC.SHEETS.SPRAY)));
  ensureSheet_(ss, QC.SHEETS.FERT, QC.FERT_HEADERS, 1);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PHOTO_FOLDER_ID')) {
    var it = DriveApp.getFoldersByName('QC Form Photos');
    var folder = it.hasNext() ? it.next() : DriveApp.createFolder('QC Form Photos');
    props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  }
  return 'QC Form API v' + QC.VERSION + ' siap.';
}

function login_(req) {
  rateLimit_('login:' + clean_(req.username,100).toLowerCase(), 12, 300);
  var username = clean_(req.username,100).toLowerCase();
  var password = String(req.password || '');
  if (!username || password.length < 4) return {ok:false,error:'INVALID_CREDENTIALS',message:'Username/email atau kata sandi salah.'};
  var found = findUser_(username);
  if (!found || String(found.data.Status || '').toUpperCase() !== 'APPROVED') return {ok:false,error:'INVALID_CREDENTIALS',message:'Akun tidak ditemukan, belum disetujui, atau kata sandi salah.'};
  var valid = false;
  if (found.data.PasswordHash && found.data.Salt) valid = constantEqual_(hashPassword_(password,found.data.Salt), String(found.data.PasswordHash));
  else valid = constantEqual_(String(found.data.Password || ''), password);
  if (!valid) { log_(null, {username:username,fullName:'-',role:'-'}, 'LOGIN_FAILED', 'Login ditolak', req.deviceInfo); return {ok:false,error:'INVALID_CREDENTIALS',message:'Akun tidak ditemukan, belum disetujui, atau kata sandi salah.'}; }
  if (!found.data.PasswordHash) upgradeLegacyPassword_(found,password);
  var token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
  var user = normalizeUser_(found.data);
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(user), QC.SESSION_SECONDS);
  log_(null,user,'LOGIN','Login berhasil',req.deviceInfo);
  return {ok:true,token:token,expiresIn:QC.SESSION_SECONDS,user:publicUser_(user)};
}

function register_(req) {
  rateLimit_('register', 20, 3600);
  var username = clean_(req.username,50).toLowerCase();
  var email = clean_(req.email,120).toLowerCase();
  var fullName = clean_(req.fullName,100);
  var password = String(req.password || '');
  var requested = normalizeRole_(req.role);
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) return {ok:false,error:'VALIDATION',message:'Username minimal 3 karakter; gunakan huruf, angka, titik, garis bawah, atau tanda minus.'};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {ok:false,error:'VALIDATION',message:'Email tidak valid.'};
  if (fullName.length < 3 || password.length < 8) return {ok:false,error:'VALIDATION',message:'Nama minimal 3 karakter dan kata sandi minimal 8 karakter.'};
  if (findUser_(username) || findUser_(email)) return {ok:false,error:'DUPLICATE',message:'Username atau email sudah terdaftar.'};
  if (['owner','manager','admin'].indexOf(requested)>=0) requested='pengunjung';
  var sh = getSheet_(QC.SHEETS.USERS), map = headerMap_(sh,1), salt = newSalt_();
  var row = blankRow_(sh.getLastColumn());
  setBy_(row,map,'Timestamp',new Date()); setBy_(row,map,'Username',username); setBy_(row,map,'Password','');
  setBy_(row,map,'FullName',fullName); setBy_(row,map,'Role',requested); setBy_(row,map,'Status','PENDING');
  setBy_(row,map,'Notes','Pendaftaran dari web'); setBy_(row,map,'Email',email);
  setBy_(row,map,'PasswordHash',hashPassword_(password,salt)); setBy_(row,map,'Salt',salt);
  setBy_(row,map,'AllowedForm',allowedForm_(requested)); setBy_(row,map,'UpdatedAt',new Date());
  sh.appendRow(row); log_(null,{username:username,fullName:fullName,role:requested},'REGISTER','Pendaftaran akun baru',req.deviceInfo);
  return {ok:true,message:'Pendaftaran terkirim dan menunggu persetujuan Owner.'};
}

function requireSession_(token) {
  token = String(token || ''); if (!token) throw new Error('AUTH_REQUIRED');
  var cache = CacheService.getScriptCache(), raw = cache.get('session:' + token);
  if (!raw) throw new Error('AUTH_EXPIRED');
  cache.put('session:' + token, raw, QC.SESSION_SECONDS);
  return JSON.parse(raw);
}
function requireRole_(user, roles) { if (roles.indexOf(normalizeRole_(user.role)) < 0) throw new Error('AUTH_FORBIDDEN'); }
function canInput_(u,type) { var r=normalizeRole_(u.role); return r==='owner'||r==='asisten'||(r==='mandor_spraying'&&type==='spray')||(r==='mandor_fertilizer'&&type==='fertilizer'); }
function canDelete_(u) { return ['owner','manager','admin','asisten'].indexOf(normalizeRole_(u.role))>=0; }

function syncRecord_(user, rec) {
  rec = validateRecord_(rec); if (!canInput_(user,rec.formType)) throw new Error('AUTH_FORBIDDEN');
  rec.inputtedBy=user.username; rec.inputtedByName=user.fullName; rec.updatedAt=new Date().toISOString();
  upsertCloud_(rec,user); log_(null,user,'SYNC_DRAFT','Sinkronisasi '+rec.formType+' '+rec.paddock,rec.deviceInfo);
  return {ok:true,recordId:rec.id,updatedAt:rec.updatedAt};
}

function finalizeRecord_(user, rec) {
  rec=validateRecord_(rec); if(!canInput_(user,rec.formType)) throw new Error('AUTH_FORBIDDEN');
  rec.inputtedBy=user.username; rec.inputtedByName=user.fullName; rec.saveType='uploaded'; rec.uploadedAt=new Date().toISOString();
  var result = rec.formType==='fertilizer' ? writeFertilizer_(rec) : writeSpray_(rec);
  upsertCloud_(rec,user); log_(null,user,'UPLOAD_'+rec.formType.toUpperCase(),'Upload '+rec.paddock,rec.deviceInfo);
  return {ok:true,recordId:rec.id,rows:result};
}

function deleteRecord_(user,id) {
  if(!canDelete_(user)) throw new Error('AUTH_FORBIDDEN'); id=clean_(id,120); if(!id) throw new Error('Record ID wajib diisi.');
  var lock=LockService.getScriptLock(); lock.waitLock(20000);
  try { deleteById_(getSheet_(QC.SHEETS.CLOUD),id,2,2); deleteById_(getSheet_(QC.SHEETS.SPRAY),id,52,detectSprayHeaderRow_(getSheet_(QC.SHEETS.SPRAY))+1); deleteById_(getSheet_(QC.SHEETS.FERT),id,23,2); }
  finally { lock.releaseLock(); }
  log_(null,user,'DELETE_RECORD','Hapus record '+id,''); return {ok:true};
}

function approveUser_(admin,req) { return updateApproval_(admin,req,'APPROVED'); }
function rejectUser_(admin,req) { return updateApproval_(admin,req,'REJECTED'); }
function updateApproval_(admin,req,status) {
  var found=findUser_(clean_(req.username,100).toLowerCase()); if(!found) return {ok:false,error:'NOT_FOUND',message:'Pengguna tidak ditemukan.'};
  var role=normalizeRole_(req.role || found.data.Role); if(QC.ROLES.indexOf(role)<0) role='pengunjung';
  var map=found.map,sh=found.sheet,row=found.row;
  sh.getRange(row,map.Role).setValue(role); sh.getRange(row,map.Status).setValue(status); sh.getRange(row,map.ApprovedBy).setValue(admin.username);
  sh.getRange(row,map.ApprovedAt).setValue(new Date()); if(map.AllowedForm) sh.getRange(row,map.AllowedForm).setValue(allowedForm_(role)); if(map.UpdatedAt) sh.getRange(row,map.UpdatedAt).setValue(new Date());
  log_(null,admin,status+'_USER',status+' @'+found.data.Username+' sebagai '+role,''); return {ok:true};
}

function changePassword_(user,req) {
  var found=findUser_(user.username), oldPass=String(req.oldPassword||''), next=String(req.newPassword||'');
  if(!found || next.length<8) return {ok:false,error:'VALIDATION',message:'Kata sandi baru minimal 8 karakter.'};
  var valid=found.data.PasswordHash ? constantEqual_(hashPassword_(oldPass,found.data.Salt),String(found.data.PasswordHash)) : constantEqual_(String(found.data.Password||''),oldPass);
  if(!valid) return {ok:false,error:'INVALID_CREDENTIALS',message:'Kata sandi lama salah.'};
  upgradeLegacyPassword_(found,next); log_(null,user,'CHANGE_PASSWORD','Kata sandi diperbarui',''); return {ok:true};
}

function listUsers_() { var sh=getSheet_(QC.SHEETS.USERS),map=headerMap_(sh,1),values=dataRows_(sh,2); return values.map(function(r){return publicUser_(normalizeUser_(rowObject_(r,map)));}); }
function listLogs_() { var sh=getSheet_(QC.SHEETS.LOGS),map=headerMap_(sh,1),rows=dataRows_(sh,2); return rows.slice(-300).reverse().map(function(r){return rowObject_(r,map);}); }
function listCloud_(user) { var sh=getSheet_(QC.SHEETS.CLOUD),map=headerMap_(sh,1),rows=dataRows_(sh,2),out=[]; rows.forEach(function(r){var o=rowObject_(r,map),rec={};try{rec=JSON.parse(o.RecordJSON||o.PhotoLink||'{}');}catch(e){} if(!rec.id) rec={id:o.RecordID,formType:o.FormType,date:o.Date,shift:o.Shift,name:o.Mandor,nameOfAssistan:o.Assistan,paddock:o.Paddock,status:o.Status,saveType:o.SaveType}; if(normalizeRole_(user.role).indexOf('mandor_')===0 && rec.inputtedBy!==user.username) return; out.push(rec);}); return out; }

function upsertCloud_(rec,user) {
  var sh=getSheet_(QC.SHEETS.CLOUD),map=headerMap_(sh,1),row=findRow_(sh,map.RecordID,rec.id,2),photo=savePhoto_(rec);
  rec.photoBase64=''; var values=blankRow_(sh.getLastColumn());
  setBy_(values,map,'LastUpdated',new Date());setBy_(values,map,'RecordID',rec.id);setBy_(values,map,'FormType',rec.formType);setBy_(values,map,'Date',rec.date);setBy_(values,map,'Shift',rec.shift);setBy_(values,map,'Mandor',rec.name);setBy_(values,map,'Assistan',rec.nameOfAssistan);setBy_(values,map,'Paddock',rec.paddock);setBy_(values,map,'Status',rec.status);setBy_(values,map,'SaveType',rec.saveType||'draft');setBy_(values,map,'SummaryDetails',(rec.activity||rec.type||'')+' | '+(rec.area||0)+' Ha');setBy_(values,map,'RecordJSON',JSON.stringify(rec));setBy_(values,map,'PhotoLink',photo||rec.photoDriveUrl||'');setBy_(values,map,'UpdatedBy',user.username);
  if(row) sh.getRange(row,1,1,values.length).setValues([values]); else sh.appendRow(values);
}

function writeSpray_(rec) {
  var rows=[rec]; (rec.holdIntervals||[]).forEach(function(h,i){var x=JSON.parse(JSON.stringify(rec));x.id=rec.id+'_hold_'+(i+1);x.status='Hold';x.startTime=h.start;x.endTime=h.end;x.area=0;x.windSpeed=h.windSpeed;x.temperature=h.temperature;x.humidity=h.humidity;x.deltaT=h.deltaT;x.weatherCondition=h.weather;x.noted='[HOLD '+(i+1)+'] '+(h.reason||'Jeda Lapangan')+(h.note?' - '+h.note:'');x.photoBase64=h.photoBase64||'';rows.push(x);});
  var sh=getSheet_(QC.SHEETS.SPRAY),headerRow=detectSprayHeaderRow_(sh); ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(),QC.SHEETS.SPRAY,QC.SPRAY_HEADERS,headerRow);
  rows.forEach(function(r){var photo=savePhoto_(r),v=[r.date,r.startTime,r.endTime,r.shift,r.status||'Working',r.name,r.nameOfAssistan,r.paddock,r.variety,num_(r.area),r.unit,r.noUnit,r.dropper,num_(r.dropletSize),r.nozzle,num_(r.height),num_(r.rowSpacing),num_(r.speed),r.type,r.activity,r.deskripsi,r.pesticide1,num_(r.dosage1),r.pesticide2,num_(r.dosage2),r.pesticide3,num_(r.dosage3),r.pesticide4,num_(r.dosage4),r.adjuvant,num_(r.adjuvantDosage),num_(r.estUsagePesticide1),num_(r.estUsagePesticide2),num_(r.estUsagePesticide3),num_(r.estUsagePesticide4),num_(r.estUsageAdjuvant),num_(r.actUsagePesticide1),num_(r.actUsagePesticide2),num_(r.actUsagePesticide3),num_(r.actUsagePesticide4),num_(r.actUsageAdjuvant),num_(r.waterRate),r.waterQuality,num_(r.actualUsage),num_(r.windSpeed),num_(r.temperature),num_(r.humidity),num_(r.deltaT),r.weatherCondition,r.noted,photo||r.photoDriveUrl||'',r.id];upsertRow_(sh,v,52,r.id,headerRow+1);}); return rows.length;
}

function writeFertilizer_(rec) {
  var fills=(rec.pengisianList&&rec.pengisianList.length)?rec.pengisianList:[{}],sh=getSheet_(QC.SHEETS.FERT);ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(),QC.SHEETS.FERT,QC.FERT_HEADERS,1);
  fills.forEach(function(p,i){var id=rec.id+(fills.length>1?'_p'+(i+1):''),hasil=num_(p.hasilKerja||rec.hasilKerja),jumlah=num_(p.jumlah||rec.jumlah),actual=num_(p.dosisAktual||rec.dosisAktual);if((actual===''||actual===0)&&hasil>0)actual=Math.round(jumlah/hasil*100)/100;var photo=savePhoto_(rec),v=[rec.date,rec.shift,rec.name,rec.nameOfAssistan,rec.status||'Working',rec.status==='Hold'?rec.startTime:'',rec.status==='Hold'?rec.endTime:'',rec.paddock,rec.unit,rec.noUnit,rec.type||'Fertilizer',rec.activity,rec.jenisPupuk||rec.material,num_(rec.dosis),rec.statusHose,p.pengisianKe||rec.pengisianKe||i+1,jumlah,hasil,actual,num_(p.pemerataanPupuk||rec.pemerataanPupuk),rec.catatan||rec.noted,photo||rec.photoDriveUrl||'',id];upsertRow_(sh,v,23,id,2);});return fills.length;
}

function getMasterData_() {
  var ss=SpreadsheetApp.getActiveSpreadsheet(),out={names:[],assistants:[],statuses:[],shifts:[],unitMap:{},dropper:[],nozzles:[],waterQualities:[],weatherConditions:[],varieties:[],plans:[],materials:[]};
  var d=ss.getSheetByName(QC.SHEETS.DATA); if(d){var vals=dataRows_(d,2);vals.forEach(function(r){pushUnique_(out.names,r[0]);pushUnique_(out.assistants,r[1]);pushUnique_(out.statuses,r[2]);pushUnique_(out.shifts,r[3]);if(r[4]){if(!out.unitMap[r[4]])out.unitMap[r[4]]=[];pushUnique_(out.unitMap[r[4]],r[5]);}pushUnique_(out.dropper,r[6]);pushUnique_(out.nozzles,r[7]);pushUnique_(out.varieties,r[8]);pushUnique_(out.waterQualities,r[12]);pushUnique_(out.weatherConditions,r[13]);});}
  var p=ss.getSheetByName(QC.SHEETS.PLAN);if(p){var pv=p.getDataRange().getDisplayValues();for(var i=1;i<pv.length;i++){if(pv[i][5])out.plans.push({description:pv[i][4],paddock:pv[i][5],area:pv[i][6],variety:pv[i][7],status:pv[i][8],activity:pv[i][13],type:pv[i][14]});}}
  var b=ss.getSheetByName(QC.SHEETS.BAHAN);if(b){var bv=b.getDataRange().getDisplayValues();for(var j=1;j<bv.length;j++){if(bv[j][2])out.materials.push({description:bv[j][0],slot:bv[j][1],material:bv[j][2],unit:bv[j][3],dosage:bv[j][4]});}}
  return out;
}

function validateRecord_(r){if(!r||typeof r!=='object')throw new Error('Data record tidak valid.');var x=JSON.parse(JSON.stringify(r));x.id=clean_(x.id,120)||('qc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8));x.formType=x.formType==='fertilizer'?'fertilizer':'spray';x.date=clean_(x.date,10);x.paddock=clean_(x.paddock,100);x.name=clean_(x.name,100);if(!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!x.paddock||!x.name)throw new Error('Tanggal, mandor, dan paddock wajib diisi.');return x;}
function getSheet_(name){var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);if(!sh)throw new Error('Sheet '+name+' tidak ditemukan. Jalankan setupSystem().');return sh;}
function ensureSheet_(ss,name,headers,row){var sh=ss.getSheetByName(name)||ss.insertSheet(name);row=row||1;if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());sh.getRange(row,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#dcfce7');return sh;}
function detectSprayHeaderRow_(sh){if(!sh)return 2;for(var r=1;r<=Math.min(5,sh.getLastRow()||1);r++){if(String(sh.getRange(r,1).getDisplayValue()).toLowerCase()==='date')return r;}return 2;}
function headerMap_(sh,row){var h=sh.getRange(row,1,1,sh.getLastColumn()).getDisplayValues()[0],m={};h.forEach(function(v,i){if(v)m[String(v).trim()]=i+1;});return m;}
function dataRows_(sh,start){var n=sh.getLastRow()-start+1;return n>0?sh.getRange(start,1,n,sh.getLastColumn()).getValues():[];}
function rowObject_(r,map){var o={};Object.keys(map).forEach(function(k){o[k]=r[map[k]-1];});return o;}
function setBy_(row,map,key,val){if(map[key])row[map[key]-1]=val;}
function blankRow_(n){return Array.apply(null,Array(n)).map(function(){return '';});}
function findUser_(key){var sh=getSheet_(QC.SHEETS.USERS),map=headerMap_(sh,1),rows=dataRows_(sh,2),needle=String(key||'').toLowerCase();for(var i=0;i<rows.length;i++){var o=rowObject_(rows[i],map);if(String(o.Username||'').toLowerCase()===needle||String(o.Email||'').toLowerCase()===needle)return{sheet:sh,map:map,row:i+2,data:o};}return null;}
function normalizeUser_(o){return{username:String(o.Username||'').toLowerCase(),email:String(o.Email||''),fullName:String(o.FullName||o.Username||''),role:normalizeRole_(o.Role),status:String(o.Status||''),allowedForm:String(o.AllowedForm||allowedForm_(o.Role))};}
function publicUser_(u){return{username:u.username,email:u.email,fullName:u.fullName,role:u.role,status:u.status,allowedForm:u.allowedForm};}
function normalizeRole_(r){r=String(r||'pengunjung').toLowerCase().replace(/\s+/g,'_');if(r==='mandor')return'mandor_spraying';if(r==='admin_staff')return'admin';if(r==='asisten_lapangan')return'asisten';return r;}
function allowedForm_(r){r=normalizeRole_(r);return r==='mandor_spraying'?'spray':r==='mandor_fertilizer'?'fertilizer':['owner','asisten'].indexOf(r)>=0?'all':'none';}
function upgradeLegacyPassword_(f,password){var salt=newSalt_();if(f.map.Password)f.sheet.getRange(f.row,f.map.Password).setValue('');if(f.map.PasswordHash)f.sheet.getRange(f.row,f.map.PasswordHash).setValue(hashPassword_(password,salt));if(f.map.Salt)f.sheet.getRange(f.row,f.map.Salt).setValue(salt);if(f.map.UpdatedAt)f.sheet.getRange(f.row,f.map.UpdatedAt).setValue(new Date());}
function newSalt_(){return Utilities.getUuid().replace(/-/g,'');}
function hashPassword_(p,s){var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s)+':'+String(p),Utilities.Charset.UTF_8);return bytes.map(function(b){var v=(b<0?b+256:b).toString(16);return v.length===1?'0'+v:v;}).join('');}
function constantEqual_(a,b){a=String(a);b=String(b);var d=a.length^b.length,n=Math.max(a.length,b.length);for(var i=0;i<n;i++)d|=(a.charCodeAt(i%Math.max(1,a.length))^b.charCodeAt(i%Math.max(1,b.length)));return d===0;}
function rateLimit_(key,max,seconds){var c=CacheService.getScriptCache(),k='rate:'+key,n=Number(c.get(k)||0)+1;if(n>max)throw new Error('Terlalu banyak percobaan. Coba lagi beberapa menit.');c.put(k,String(n),seconds);}
function findRow_(sh,col,val,start){if(!col)return 0;var n=sh.getLastRow()-start+1;if(n<=0)return 0;var a=sh.getRange(start,col,n,1).getDisplayValues();for(var i=0;i<a.length;i++)if(String(a[i][0])===String(val))return i+start;return 0;}
function upsertRow_(sh,values,idCol,id,start){var row=findRow_(sh,idCol,id,start);if(row)sh.getRange(row,1,1,values.length).setValues([values]);else sh.appendRow(values);}
function deleteById_(sh,id,col,start){var rows=[];for(var r=start;r<=sh.getLastRow();r++){var v=String(sh.getRange(r,col).getDisplayValue());if(v===id||v.indexOf(id+'_')===0)rows.push(r);}for(var i=rows.length-1;i>=0;i--)sh.deleteRow(rows[i]);}
function savePhoto_(rec){var b=String(rec.photoBase64||'');if(b.length<100)return'';var m=b.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!m)throw new Error('Format foto tidak didukung.');var bytes=Utilities.base64Decode(m[2]);if(bytes.length>2000000)throw new Error('Foto maksimal 2 MB.');var ext=m[1]==='image/png'?'.png':m[1]==='image/webp'?'.webp':'.jpg',folder=DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID')),name='QC_'+rec.formType+'_'+clean_(rec.paddock,40).replace(/[^a-z0-9_-]/gi,'_')+'_'+Date.now()+ext;return folder.createFile(Utilities.newBlob(bytes,m[1],name)).getUrl();}
function log_(ss,u,type,desc,device){try{var sh=(ss||SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(QC.SHEETS.LOGS);if(sh)sh.appendRow([new Date(),u.username||'',u.fullName||'',u.role||'',type,desc,clean_(device,150)]);}catch(e){console.error(e);}}
function clean_(v,n){return String(v===undefined||v===null?'':v).trim().slice(0,n||500);}
function num_(v){if(v===undefined||v===null||v==='')return'';if(typeof v==='number')return v;var n=Number(String(v).replace(',','.'));return isFinite(n)?n:'';}
function pushUnique_(a,v){if(v!==''&&v!==null&&v!==undefined&&a.indexOf(String(v))<0)a.push(String(v));}
function authMessage_(e){return e==='AUTH_REQUIRED'?'Silakan login.':e==='AUTH_EXPIRED'?'Sesi berakhir. Silakan login kembali.':'Anda tidak memiliki izin untuk tindakan ini.';}
function output_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
