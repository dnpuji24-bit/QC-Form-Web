// Local candidate only. No Firebase/Supabase SDK, secret, or remote endpoint.
export const endpointOrigin='http://127.0.0.1:4485'
export const endpointPaths=Object.freeze({upload:'/api/qc-uat/v1/photo-upload',sign:'/api/qc-uat/v1/photo-sign'})
export function endpointUrl(operation,origin=endpointOrigin){
 if(origin!==endpointOrigin||!Object.hasOwn(endpointPaths,operation))throw Error('UAT_ROUTE_DENIED')
 return endpointOrigin+endpointPaths[operation]
}
export async function callUatEndpoint(operation,body,token,fetcher=globalThis.fetch){
 if(typeof token!=='string'||!token||/\s/.test(token))throw Error('UAT_TOKEN_REQUIRED')
 const response=await fetcher(endpointUrl(operation),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),credentials:'omit',cache:'no-store',redirect:'error'})
 if(response.redirected||response.url!==endpointUrl(operation))throw Error('UAT_RESPONSE_ROUTE_DENIED')
 const data=await response.json()
 if(!response.ok)throw Object.assign(Error(data?.error??'UAT_REQUEST_FAILED'),{status:response.status})
 return data
}
