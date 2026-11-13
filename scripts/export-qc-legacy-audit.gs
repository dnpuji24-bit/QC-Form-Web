// Manual, owner-only export in the bound Apps Script editor. Do NOT expose as web action.
// Creates a private Drive file; no changes to the source sheets or Firestore.
function exportQcLegacyAuditSnapshot() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw Error('Bound spreadsheet required');
  var log=ss.getSheetByName('Activity_Logs'),requests=ss.getSheetByName('Account_Change_Requests');
  if(!log||!requests)throw Error('Required source sheet missing; inspect before cutover');
  function read(sheet,required,select){
    var values=sheet.getDataRange().getValues(),headers=values[0].map(String);
    required.forEach(function(k){if(headers.indexOf(k)<0||headers.indexOf(k)!==headers.lastIndexOf(k))throw Error('Invalid source header '+k)});
    return values.slice(1).map(function(row,index){
      if(row.every(function(v){return v===''||v===null}))return null;
      var o={};required.forEach(function(k){o[k]=row[headers.indexOf(k)]});
      return select(o,index+2);
    }).filter(function(x){return x!==null});
  }
  function iso(v){if(!(v instanceof Date)||isNaN(v.getTime()))throw Error('Non-date timestamp; inspect source row');return v.toISOString()}
  function str(v){return v===null||v===undefined?'':String(v)}
  var logs=read(log,['Timestamp','Username','FullName','Role','ActionType','Description','IP_Device'],function(o,row){
    return {row:row,Timestamp:iso(o.Timestamp),Username:str(o.Username),FullName:str(o.FullName),Role:str(o.Role),ActionType:str(o.ActionType),Description:str(o.Description),IP_Device:str(o.IP_Device)};
  });
  // Never export password hash, salt, password, token, or free-form request notes.
  var accountRequests=read(requests,['RequestID','Timestamp','Username','RequestType','Status'],function(o,row){
    return {row:row,requestId:str(o.RequestID),timestamp:iso(o.Timestamp),username:str(o.Username),requestType:str(o.RequestType),status:str(o.Status)};
  });
  var result={schemaVersion:1,sourceId:ss.getId(),logSheetId:String(log.getSheetId()),exportedAt:new Date().toISOString(),logs:logs,accountRequests:accountRequests};
  var file=DriveApp.createFile('qc-legacy-audit-'+Date.now()+'.json',JSON.stringify(result),'application/json');
  console.log('Export created in Drive. Logs: '+logs.length+'; account requests: '+accountRequests.length+'. Do not share or commit this file.');
  return file.getId();
}
