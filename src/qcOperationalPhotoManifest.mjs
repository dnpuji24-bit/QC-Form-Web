// Candidate for the Firestore-only save transport. Not enabled by the live UI.
// Immutable photo IDs are derived from bytes + slot, scoped by record path.
// An explicit remove is different from an empty file input on correction.
export async function prepareOperationalPhotoManifest({recordId, uploaderUid, previous={}, changes=[]}) {
  const valid = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(s);
  if (!valid(recordId) || !valid(uploaderUid)) throw Error('Invalid QC record or Firebase UID');
  const manifest = {...previous}, uploads = [], touched = new Set();
  const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  for (const change of changes) {
    const slot = change.kind === 'hold' && valid(change.holdId) ? 'hold_'+change.holdId : change.kind;
    if (!['main','scan'].includes(slot) && !(change.kind==='hold' && valid(change.holdId))) throw Error('Invalid photo slot');
    if (touched.has(slot)) throw Error('Duplicate photo slot');
    touched.add(slot);
    if (change.action === 'keep') continue;
    if (change.action === 'remove') { delete manifest[slot]; continue; }
    if (change.action !== 'replace') throw Error('Invalid photo operation');
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(change.dataUrl || '');
    if (!match) throw Error('Unsupported photo format');
    const bytes = Uint8Array.from(atob(match[2]), x=>x.charCodeAt(0));
    if (!bytes.length || bytes.length > 2097152) throw Error('Photo exceeds 2 MB or is empty');
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('');
    const slotHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(slot))), b=>b.toString(16).padStart(2,'0')).join('');
    const photoId = slotHash.slice(0,24)+'_'+sha256;
    const reference = {photoId, provider:'supabase', bucket:'qc-photos', objectPath:uploaderUid+'/qc/'+recordId+'/'+photoId+'.'+extensions[match[1]], uploaderUid, kind:change.kind, contentType:match[1], sha256, size:bytes.length, ...(change.kind==='hold'?{holdId:change.holdId}:{})};
    manifest[slot] = reference;
    uploads.push({slot,reference,bytes});
  }
  return {manifest, uploads};
}
// Keep historical Drive references intact; never send binary payloads to Firestore.
export function stripOperationalPhotoPayload(record) {
  const {photoBase64,scanReportPhotoBase64,...rest}=record;
  return {...rest, ...(Array.isArray(record.holdIntervals)?{holdIntervals:record.holdIntervals.map(({photoBase64,...hold})=>hold)}:{}), ...(Array.isArray(record.downtimeList)?{downtimeList:record.downtimeList.map(({photoBase64,...hold})=>hold)}:{})};
}
