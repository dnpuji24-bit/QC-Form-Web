import type {BkmCandidate} from './bkmAggregation.mjs'
export type BkmActivity={id:string;operationCode:string;description:string;uom:string}
export type BkmPaddock={pid:string;company:string;area:number|null}
export function bkmRealization(candidate:BkmCandidate|null,hiOverride?:number|null):{hi:number|null;balance:number|null;progress:number|null;prior:number|null}
export function bkmManualCandidate(company:string,paddock:BkmPaddock,activity:BkmActivity):BkmCandidate
export function bkmValidQuantity(value:unknown):boolean
