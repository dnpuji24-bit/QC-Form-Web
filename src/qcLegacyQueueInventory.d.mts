export type LegacyQueueInventory={total:number;own:number;other:number;unattributed:number;conflicting:number}
export function summarizeLegacyQueue(items:unknown[],username:string):LegacyQueueInventory
export function strictLegacyOwner(item:unknown,username:string):boolean
