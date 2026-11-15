import {roles,keys,requireThat,effectivePermissions,marker} from '../src/qcUatRolePermissions.mjs'

function pureTests(){let n=0;const eq=(a,b)=>{requireThat(JSON.stringify(a)===JSON.stringify(b),'MISMATCH');n++};const reject=(f,code)=>{let e;try{f()}catch(x){e=x.message}eq(e,code)};
eq(keys.length,21);eq(roles.length,7);for(const r of roles)eq(Object.keys(effectivePermissions(r)).length,21);
eq(effectivePermissions('owner').data_company,'edit');eq(effectivePermissions('asisten').qc_fertilizer,'edit');eq(effectivePermissions('manager').qc_spraying,'none');eq(effectivePermissions('admin').qc_records,'edit');eq(effectivePermissions('mandor_spraying').qc_fertilizer,'none');eq(effectivePermissions('mandor_fertilizer').qc_spraying,'none');eq(effectivePermissions('pengunjung').qc_records,'view');
eq(effectivePermissions('mandor_spraying',{qc_spraying:'none'}).qc_spraying,'none');eq(effectivePermissions('mandor_spraying',{qc_spraying:'none'},{qc_spraying:'view'}).qc_spraying,'view');eq(effectivePermissions('pengunjung',{}, {qc_spraying:'edit'}).qc_spraying,'edit');eq(marker('owner',{}, {},false).enabled,false);
reject(()=>effectivePermissions('unknown'),'UNKNOWN_ROLE');reject(()=>effectivePermissions('owner',{wrong:'edit'}),'UNKNOWN_PERMISSION');reject(()=>effectivePermissions('owner',{qc_records:'admin'}),'INVALID_MODE');reject(()=>effectivePermissions('owner',null),'INVALID_PERMISSION_MAP');reject(()=>effectivePermissions('owner',JSON.parse('{"__proto__":"edit"}')),'UNKNOWN_PERMISSION');reject(()=>effectivePermissions('owner',{get qc_records(){return 'edit'}}),'UNKNOWN_PERMISSION');reject(()=>marker('owner',{}, {},1),'INVALID_ENABLED');return n}

console.log('SUCCESS: '+pureTests()+' synthetic role permission checks (offline)')
