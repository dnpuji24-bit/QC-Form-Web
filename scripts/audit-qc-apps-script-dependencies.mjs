// Static inventory of tracked frontend source. Does not read credentials or call any service.
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const files=execFileSync('git',['ls-files','-z','--','src'],{encoding:'utf8'}).split('\0').filter(f=>/\.(tsx?|[cm]?jsx?)$/.test(f)&&!f.endsWith('.d.ts')&&!f.endsWith('.d.mts'))
const routes={
 login:'Legacy login; native portal uses Firebase Auth',
 register:'Legacy registration; native portal uses Firebase registration',
 me:'Native branch reads approved Firebase profile',
 logout:'Native portal uses Firebase signOut',
 masterData:'Native configuration requires Firestore master flag',
 records:'Firestore first; native configuration requires Firestore-only flag',
 syncRecord:'Legacy QC worker; native operational queue required',
 finalizeRecord:'Legacy QC worker; native operational queue required',
 deleteRecord:'Legacy delete; gated native archive candidate',
 users:'Legacy administration; native Users & Access candidate',
 approveUser:'Legacy administration; native registration review/activation',
 rejectUser:'Legacy administration; native registration rejection',
 updateUserRole:'Legacy administration; native role endpoint',
 updateUserPermissions:'Legacy account permission action; verify parity',
 updateRolePermissions:'Legacy template action; native role template endpoint',
 deleteUser:'Legacy deletion; native deactivation instead',
 requestAccountChange:'Legacy account request; name/username workflow still unresolved',
 accountChangeRequests:'Legacy account requests; historical queue review required',
 decideAccountChange:'Legacy account decision; historical queue review required',
 logs:'Native reads operational audit; historical logs not migrated'
}
const directAliases={accountChangeRequest:'requestAccountChange'}
const rows=[],unknown=[]
const add=(file,sf,node,name,kind)=>{
 const line=sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1
 const status=routes[directAliases[name]||name]||({getApiUrl:'Legacy endpoint configuration',setApiUrl:'Legacy endpoint configuration',literal:'Apps Script URL literal (value not printed)'}[name])
 const row={file,line,kind,action:name,status:status||'REVIEW REQUIRED'}
 rows.push(row);if(!status)unknown.push(row)
}
for(const file of files){
 const source=readFileSync(file,'utf8')
 const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true)
 const apiNames=new Set(file==='src/api.ts'?['api']:[]),qcNames=new Set(),configNames=new Map(),namespaces=new Set()
 for(const st of sf.statements){
  if(!ts.isImportDeclaration(st)||!ts.isStringLiteral(st.moduleSpecifier)||!/(?:^|\/)api(?:\.[cm]?[jt]s)?$/.test(st.moduleSpecifier.text))continue
  const bindings=st.importClause?.namedBindings
  if(bindings&&ts.isNamespaceImport(bindings))namespaces.add(bindings.name.text)
  if(bindings&&ts.isNamedImports(bindings))for(const e of bindings.elements){
   const orig=e.propertyName?.text||e.name.text
   if(orig==='api')apiNames.add(e.name.text)
   else if(orig==='qcApi')qcNames.add(e.name.text)
   else if(['getApiUrl','setApiUrl'].includes(orig))configNames.set(e.name.text,orig)
  }
 }
 function visit(node){
  if(ts.isStringLiteralLike(node)&&/script\.google\.com\/macros\/s\//i.test(node.text))add(file,sf,node,'literal','url')
  if(ts.isCallExpression(node)){
   const fn=node.expression
   if(ts.isIdentifier(fn)&&apiNames.has(fn.text)){
    const arg=node.arguments[0];add(file,sf,node,arg&&ts.isStringLiteralLike(arg)?arg.text:'<dynamic>','direct api')
   }else if(ts.isIdentifier(fn)&&configNames.has(fn.text))add(file,sf,node,configNames.get(fn.text),'configuration')
   else if(ts.isPropertyAccessExpression(fn)||ts.isElementAccessExpression(fn)){
    const receiver=fn.expression
    const member=ts.isPropertyAccessExpression(fn)?fn.name.text:fn.argumentExpression&&ts.isStringLiteralLike(fn.argumentExpression)?fn.argumentExpression.text:'<dynamic>'
    if(ts.isIdentifier(receiver)&&qcNames.has(receiver.text))add(file,sf,node,member,'qcApi')
    else if(ts.isIdentifier(receiver)&&namespaces.has(receiver.text)){
     const arg=node.arguments[0]
     add(file,sf,node,member==='api'?(arg&&ts.isStringLiteralLike(arg)?arg.text:'<dynamic>'):member,'namespace api')
    }else if(ts.isPropertyAccessExpression(receiver)&&ts.isIdentifier(receiver.expression)&&namespaces.has(receiver.expression.text)&&receiver.name.text==='qcApi')add(file,sf,node,member,'namespace qcApi')
   }
  }
  ts.forEachChild(node,visit)
 }
 visit(sf)
}
console.log('Apps Script frontend static inventory — no network, no writes')
console.log('Tracked source files scanned: '+files.length)
for(const row of rows)console.log(row.file+':'+row.line+' | '+row.kind+' | '+row.action+' | '+row.status)
console.log('Call sites and URL literals: '+rows.length+'; unclassified: '+unknown.length)
console.log('Static scope: src only; generated bundles, root legacy web app, server code, dynamic aliases and runtime network not certified by this scan.')
if(!rows.length||unknown.length){console.error('REVIEW: unclassified or missing frontend dependencies');process.exitCode=1}
else console.log('SUCCESS: frontend Apps Script inventory classified (runtime UAT still required)')
