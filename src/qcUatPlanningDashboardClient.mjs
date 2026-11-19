// Shared isolated browser transport. Never use normal app credentials or a caller-chosen URL.
import {filteredDashboardRequest} from './qcUatPlanningDashboardFilters.mjs'
export const dashboardOrigin='http://127.0.0.1:4597'
export const dashboardPath='/api/qc-uat/v1/planning-dashboard'
export async function fetchPlanningDashboard(input,session,signal){
 if(globalThis.location?.origin!==dashboardOrigin)throw Error('DASHBOARD_ORIGIN_DENIED')
 filteredDashboardRequest(input)
 if(!session||typeof session.token!=='string'||!session.token||session.token.length>16384)throw Error('AUTH_REQUIRED')
 const res=await fetch(dashboardPath,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.token},body:JSON.stringify(input),cache:'no-store',credentials:'omit',redirect:'error',signal})
 const data=await res.json()
 if(!res.ok)throw Error(['AUTH_REQUIRED','ACCESS_DENIED','INVALID_FILTERS','REVIEW_REQUIRED','SCOPE_LIMIT','DASHBOARD_UNAVAILABLE'].includes(data?.error)?data.error:'DASHBOARD_UNAVAILABLE')
 if(data?.testOnly!==true||data.readOnly!==true||Object.keys(input).some(k=>data[k]!==input[k])||!data.monthly?.spray||!data.daily?.fertilizer||!data.sourceDaily?.spray||!Array.isArray(data.executionByForemanShift))throw Error('INVALID_DASHBOARD_RESPONSE')
 return data
}
