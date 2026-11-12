import { operationalQueueId, processOperationalQcJob } from './qcOperationalSaveTransport.mjs'

// Dedicated DB: never clear, migrate, or replay the legacy Spreadsheet queue.
export function openOperationalQueue(factory=globalThis.indexedDB) {
  return new Promise((resolve,reject)=>{
    if (!factory) return reject(Error('IndexedDB unavailable'));
    const req=factory.open('qc_operational_queue_v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('jobs',{keyPath:'id'});
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(Error('Operational queue database blocked'));
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(db)};
  });
}
async function transaction(factory,mode,run) {
  const db=await openOperationalQueue(factory);
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('jobs',mode);let result;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(tx.error||Error('Queue transaction aborted'));
      tx.onerror=()=>reject(tx.error||Error('Queue transaction failed'));
      try {run(tx.objectStore('jobs'),value=>{result=value})}
      catch(error){tx.abort();reject(error)}
    });
  } finally {db.close()}
}
export async function enqueueOperationalJob(job,factory) {
  const id=operationalQueueId(job.uploaderUid,job.record.id,job.record.clientRevision);
  if (!Array.isArray(job.changes)||!['syncRecord','finalizeRecord'].includes(job.action))throw Error('Invalid job');
  const next={...structuredClone(job),id,createdAt:Date.now()};
  return transaction(factory,'readwrite',(store,done)=>{
    const req=store.get(id);
    req.onsuccess=()=>{
      if(req.result){done(req.result);return}
      store.add(next);done(next);
    };
  });
}
export async function listOperationalJobs(uid,factory) {
  if (!uid) throw Error('Authenticated UID required');
  return transaction(factory,'readonly',(store,done)=>{
    const req=store.getAll();
    req.onsuccess=()=>done(req.result.filter(j=>j.uploaderUid===uid).sort((a,b)=>a.createdAt-b.createdAt));
  });
}
const running=new Map();
export function flushOperationalJobs(uid,deps,factory) {
  if (!uid) return Promise.reject(Error('Authenticated UID required'));
  const workerKey=uid+':'+(deps.scope||'default');
  if(running.has(workerKey))return running.get(workerKey);
  const run=async()=>{
    let sent=0;const blocked=new Set();const failures=[];
    for(const job of (await listOperationalJobs(uid,factory)).filter(j=>deps.acceptJob?deps.acceptJob(j):true)){
      if(await deps.currentUid()!==uid)break;
      if(blocked.has(job.record.id))continue;
      try{
        const result=await processOperationalQcJob(job,deps);
        if(result.status!=='confirmed')throw Error('Unconfirmed commit');
        await transaction(factory,'readwrite',(store)=>store.delete(job.id));
        sent++;
      }catch(error){blocked.add(job.record.id);failures.push({id:job.id,error:String(error?.message||error)})}
    }
    return {sent,left:(await listOperationalJobs(uid,factory)).filter(j=>deps.acceptJob?deps.acceptJob(j):true).length,failures};
  };
  // Web Locks serialize workers across tabs when available. Backend CAS remains mandatory.
  const promise=(globalThis.navigator?.locks?globalThis.navigator.locks.request('qc-operational-'+uid,run):run()).finally(()=>running.delete(workerKey));
  running.set(workerKey,promise);return promise;
}

 // A session is accepted locally in one IndexedDB transaction, never partially.
export async function enqueueOperationalBatch(jobs,factory) {
  if(!Array.isArray(jobs)||!jobs.length)throw Error('Empty QC batch');
  const uid=jobs[0].uploaderUid, ids=new Set();
  const rows=jobs.map(job=>{
    if(job.uploaderUid!==uid||ids.has(job.record.id)||!Array.isArray(job.changes)||!['syncRecord','finalizeRecord'].includes(job.action))throw Error('Invalid QC batch');
    ids.add(job.record.id);
    return {...structuredClone(job),id:operationalQueueId(uid,job.record.id,job.record.clientRevision),createdAt:Date.now()};
  });
  return transaction(factory,'readwrite',(store,done)=>{
    const req=store.getAll();
    req.onsuccess=()=>{
      if(req.result.some(j=>j.uploaderUid===uid&&ids.has(j.record.id))){
        store.transaction.abort();return;
      }
      for(const row of rows)store.add(row);
      done(rows);
    };
  });
}
