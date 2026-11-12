import type { QcRecord } from './types'
export type QcPhotoChange={kind:'main'|'hold'|'scan';action:'keep'|'remove'|'replace';holdId?:string;dataUrl?:string}
export type QcSaveIntent={baseRevision:string|null;changes:QcPhotoChange[]}
export function buildQcFormSaveIntent(record:QcRecord,options:{baseRevision?:string;isNew:boolean;removeMain?:boolean;removeScan?:boolean;removedHoldIds?:string[];previousHoldIds?:string[];replaceHoldIds?:string[]}):QcSaveIntent
