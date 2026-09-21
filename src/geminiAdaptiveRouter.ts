export type GeminiAttemptTelemetry={
  model:string
  ok:boolean
  latencyMs:number
  errorKind?:string
  at:number
}

type ModelStats={
  attempts:number
  successes:number
  failures:number
  transientFailures:number
  totalSuccessLatencyMs:number
  lastLatencyMs:number
  lastSuccessAt:number
  lastFailureAt:number
  cooldownUntil:number
  consecutiveTransientFailures:number
  lastErrorKind:string
}

type RouterState={
  version:1
  models:Record<string,ModelStats>
  recent:GeminiAttemptTelemetry[]
}

const STORAGE_KEY='qc_gemini_adaptive_router_v1'
const MAX_RECENT=30

function emptyStats():ModelStats{
  return{
    attempts:0,successes:0,failures:0,transientFailures:0,totalSuccessLatencyMs:0,
    lastLatencyMs:0,lastSuccessAt:0,lastFailureAt:0,cooldownUntil:0,
    consecutiveTransientFailures:0,lastErrorKind:'',
  }
}

function emptyState():RouterState{return{version:1,models:{},recent:[]}}

function canUseStorage(){
  return typeof window!=='undefined'&&typeof window.localStorage!=='undefined'
}

function loadState():RouterState{
  if(!canUseStorage())return emptyState()
  try{
    const raw=window.localStorage.getItem(STORAGE_KEY)
    if(!raw)return emptyState()
    const parsed=JSON.parse(raw) as Partial<RouterState>
    if(parsed.version!==1||!parsed.models)return emptyState()
    return{version:1,models:parsed.models,recent:Array.isArray(parsed.recent)?parsed.recent.slice(-MAX_RECENT):[]}
  }catch{return emptyState()}
}

function saveState(state:RouterState){
  if(!canUseStorage())return
  try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}
}

function unique(items:string[]){
  const out:string[]=[]
  for(const item of items){const value=String(item||'').trim();if(value&&!out.includes(value))out.push(value)}
  return out
}

export function geminiErrorKind(error:unknown){
  const message=error instanceof Error?error.message:String(error||'')
  if(/\b429\b|RESOURCE_EXHAUSTED|high demand/i.test(message))return'busy'
  if(/\b503\b|UNAVAILABLE/i.test(message))return'unavailable'
  if(/\b500\b|INTERNAL/i.test(message))return'server'
  if(/fetch-error|network|failed to fetch/i.test(message))return'network'
  if(/temporar/i.test(message))return'temporary'
  return'other'
}

export function isAdaptiveTransientGeminiError(error:unknown){
  return geminiErrorKind(error)!=='other'
}

function cooldownMs(kind:string,consecutive:number){
  const factor=Math.min(4,Math.max(1,consecutive))
  if(kind==='busy')return 8*60_000*factor
  if(kind==='unavailable'||kind==='server')return 4*60_000*factor
  if(kind==='network'||kind==='temporary')return 90_000*factor
  return 0
}

export function recordGeminiAttempt(model:string,ok:boolean,latencyMs:number,error?:unknown){
  const state=loadState(),stats={...emptyStats(),...(state.models[model]||{})}
  const now=Date.now(),safeLatency=Math.max(0,Math.round(latencyMs||0))
  stats.attempts++
  stats.lastLatencyMs=safeLatency
  if(ok){
    stats.successes++
    stats.totalSuccessLatencyMs+=safeLatency
    stats.lastSuccessAt=now
    stats.cooldownUntil=0
    stats.consecutiveTransientFailures=0
    stats.lastErrorKind=''
  }else{
    stats.failures++
    stats.lastFailureAt=now
    const kind=geminiErrorKind(error)
    stats.lastErrorKind=kind
    if(kind!=='other'){
      stats.transientFailures++
      stats.consecutiveTransientFailures++
      stats.cooldownUntil=Math.max(stats.cooldownUntil,now+cooldownMs(kind,stats.consecutiveTransientFailures))
    }else{
      stats.consecutiveTransientFailures=0
    }
  }
  state.models[model]=stats
  state.recent=[...state.recent,{model,ok,latencyMs:safeLatency,errorKind:ok?undefined:geminiErrorKind(error),at:now}].slice(-MAX_RECENT)
  saveState(state)
}

function modelScore(model:string,index:number,state:RouterState,now:number){
  const stats=state.models[model]
  if(!stats||stats.attempts===0)return 100-index*2
  const reliability=(stats.successes+2)/(stats.attempts+3)
  const avgLatency=stats.successes?stats.totalSuccessLatencyMs/stats.successes:30_000
  const latencyPenalty=Math.min(30,avgLatency/1000)
  const recentSuccessBonus=stats.lastSuccessAt&&now-stats.lastSuccessAt<30*60_000?8:0
  const recentFailurePenalty=stats.lastFailureAt&&now-stats.lastFailureAt<10*60_000?6:0
  return reliability*100-latencyPenalty+recentSuccessBonus-recentFailurePenalty-index*.5
}

export function adaptiveGeminiCandidates(preferred:string){
  const base=unique([preferred,'gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash'])
  const state=loadState(),now=Date.now()
  return base
    .map((model,index)=>{
      const stats=state.models[model]
      const cooling=Boolean(stats&&stats.cooldownUntil>now)
      return{model,index,cooling,score:modelScore(model,index,state,now),cooldownUntil:stats?.cooldownUntil||0}
    })
    .sort((a,b)=>{
      if(a.cooling!==b.cooling)return a.cooling?1:-1
      if(b.score!==a.score)return b.score-a.score
      return a.index-b.index
    })
    .map(item=>item.model)
}

export function getGeminiRouterSummary(){
  const state=loadState(),now=Date.now()
  return Object.entries(state.models).map(([model,stats])=>({
    model,
    attempts:stats.attempts,
    successes:stats.successes,
    failures:stats.failures,
    successRate:stats.attempts?Math.round(stats.successes/stats.attempts*100):0,
    averageSuccessLatencyMs:stats.successes?Math.round(stats.totalSuccessLatencyMs/stats.successes):0,
    lastLatencyMs:stats.lastLatencyMs,
    coolingDown:stats.cooldownUntil>now,
    cooldownUntil:stats.cooldownUntil,
    lastErrorKind:stats.lastErrorKind,
  })).sort((a,b)=>b.successRate-a.successRate||a.averageSuccessLatencyMs-b.averageSuccessLatencyMs)
}
