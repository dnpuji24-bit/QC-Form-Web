// Pure synthetic Owner permission policy. The trusted caller must derive context from verified token and current transaction reads.
import {roles,keys,effectivePermissions} from './qcUatRolePermissions.mjs'

export function requireThat(ok,code){if(!ok)throw Error(code)}

function permissionMap(v){requireThat(v&&Object.getPrototypeOf(v)===Object.prototype,'INVALID_PERMISSION_MAP');const result={};for(const k of Reflect.ownKeys(v)){requireThat(typeof k==='string'&&keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'),'UNKNOWN_PERMISSION');requireThat(['none','view','edit'].includes(v[k]),'INVALID_MODE');result[k]=v[k]}return result}

function sid(v){requireThat(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_UID');return v}

function revision(v){requireThat(Number.isSafeInteger(v)&&v>=0&&v<1000000,'INVALID_POLICY_REVISION');return v}

function isolated(m){return !!m&&m.testOnly===true&&m.workspace==='cutover'&&roles.includes(m.role)}

export function ownerPermissionChange(input,context){
  requireThat(input&&Object.getPrototypeOf(input)===Object.prototype&&Object.keys(input).length===3&&['targetUid','expectedRevision','patch'].every(k=>Object.hasOwn(input,k)),'INVALID_REQUEST');
  const uid=sid(context.actorUid),targetUid=sid(input.targetUid),actor=context.actor,target=context.target;
  requireThat(context.claim===true&&isolated(actor)&&actor.enabled===true&&actor.role==='owner'&&!context.actorProductionProfile,'OWNER_REQUIRED');
  requireThat(uid!==targetUid,'SELF_PERMISSION_CHANGE_DENIED');
  requireThat(isolated(target)&&target.role!=='owner'&&!context.targetProductionProfile,'TARGET_NOT_ELIGIBLE');
  const expectedRevision=revision(input.expectedRevision),currentRevision=revision(target.policyRevision);
  requireThat(expectedRevision===currentRevision,'PERMISSION_REVISION_CONFLICT');
  const patch=permissionMap(input.patch);
  requireThat(Object.keys(patch).length>0,'EMPTY_PERMISSION_PATCH');
  const previous=permissionMap(target.manualOverrides);
  const manualOverrides={...previous,...patch};
  const permissions=effectivePermissions(target.role,permissionMap(target.roleOverrides),manualOverrides);
  const policyRevision=currentRevision+1;
  return {next:{...target,manualOverrides,permissions,policyRevision},audit:{testOnly:true,workspace:'cutover',actorUid:uid,targetUid,previousRevision:currentRevision,revision:policyRevision,patch}};
}
