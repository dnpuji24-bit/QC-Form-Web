import type {User} from './types'
export function resolveFirebaseProfile(identity:{uid:string;email:string|null},profile:Record<string,unknown>|undefined,template:Record<string,unknown>|undefined,keys:string[]):User
