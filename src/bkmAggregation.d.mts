export type BkmSource=Record<string,unknown>&{id:string}
export type BkmMaterial={code:string;name:string;unit:string;hi:number;shi:number|null}
export type BkmCandidate={id:string;company:string;pid:string;wo:string;operationCode:string;description:string;area:number|null;hk:number|null;uom:string;target:number|null;hi:number|null;shi:number|null;progress:number|null;notes:string;warnings:string[];conflict:boolean;actualIds:string[];material:BkmMaterial[]}
export function buildBkmCandidates(input:{date:string;daily?:BkmSource[];actual?:BkmSource[];history?:BkmSource[];monthly?:BkmSource[];paddocks?:BkmSource[];materials?:BkmSource[]}):BkmCandidate[]
export function bkmAvailableCandidates(candidates:BkmCandidate[],companyCode:string,wo:string,selectedIds?:string[],currentId?:string):BkmCandidate[]
