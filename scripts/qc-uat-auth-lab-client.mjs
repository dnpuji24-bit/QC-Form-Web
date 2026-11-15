// Node-only environment guard for the shared demo adapter.
import {assertDemoEnvironment} from './qc-uat-isolation-foundation.mjs'
import {createLabClient,identities} from '../uat-domain-lab/client.mjs'
export {identities}
export function guard(env=process.env){
 assertDemoEnvironment(env)
 if(!/^(127\.0\.0\.1|localhost):9199$/.test(env.FIREBASE_AUTH_EMULATOR_HOST||''))throw Error('AUTH_EMULATOR_REQUIRED')
}
export async function createAuthLabClient(){return createLabClient(guard)}
