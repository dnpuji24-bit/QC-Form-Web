import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {Script} from 'node:vm'
const root=new URL('../public/react/',import.meta.url)
const read=name=>readFileSync(new URL(name,root),'utf8')
const sw=read('sw.js'),html=read('index.html')
new Script(sw)
const match=sw.match(/const APP_SHELL = (\[[^\n]+\]);/)
assert.ok(match,'Generated app-shell asset list required')
const assets=JSON.parse(match[1])
assert.ok(assets.includes('/react/')&&assets.includes('/react/manifest.webmanifest'))
assert.ok(assets.length>3,'No build chunks in app shell')
for(const name of assets){
 assert.ok(name.startsWith('/react/'))
 if(name!=='/react/')assert.ok(existsSync(new URL(name.slice('/react/'.length),root)),'Missing '+name)
}
for(const found of html.matchAll(/(?:src|href)="(\/react\/assets\/[^"]+)"/g)){
 assert.ok(assets.includes(found[1]),'Uncached index asset '+found[1])
}
assert.match(sw,/const CACHE = "qc-react-build-[0-9a-f]{16}";/)
console.log('PASS: app shell includes '+assets.length+' current static files and every index entry asset')
