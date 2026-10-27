const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
async function fixture({checkpoint=null,format=null,loading=false}={}){
 const elements=[],listeners={},timers=[],starts=[],downloads=[],storage=new Map();
 if(format)storage.set('teams-dom-export-v2-format',format);
 let ready=!loading,resolveStart;
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.style={};this.value='';this.checked=false;elements.push(this);}
  setAttribute(k,v){this.attrs[k]=v;if(k==='checked')this.checked=true;if(k==='value')this.value=v;}
  append(...children){this.children.push(...children);if(this.tag==='select'&&!this.value){const option=children.find(c=>c.tag==='option');if(option)this.value=option.value;}}
  attachShadow(){return {append:()=>{},getElementById:id=>elements.find(e=>e.attrs.id===id)};}
  getClientRects(){return ready?[{}]:[];}
  click(){if(this.tag==='a')downloads.push(this.download);else this.onclick?.();}
 }
 const profile=new Element('button'),rail=new Element('div');
 const document={createElement:t=>new Element(t),createTextNode:t=>t,documentElement:new Element('html'),querySelector:q=>q.includes('me-control-avatar')?profile:q.includes('role="tree"')?rail:null};
 let scanner;
 class Scanner{
  constructor(options){this.options=options;this.running=false;this.job=null;scanner=this;}
  async start(options){
   this.running=true;starts.push(options);this.job={...options,id:'fresh',created:Date.now(),status:'running',conversations:[]};
   if(this.hold)await new Promise(r=>resolveStart=r);
   this.job.status='partial';this.running=false;await this.options.onTerminal(this.job);
  }
  async resume(job){this.job={...job};this.job.status='partial';await this.options.onTerminal(this.job);}
  stop(){}
 }
 global.TeamsChatDOM={};require('../shared-utils.js');
 const location={hostname:'teams.cloud.microsoft',pathname:'/v2/',search:'',hash:''};
 const context={document,location,history:{state:{},replaceState(_s,_t,url){location.hash=url.includes('#')?'#'+url.split('#')[1]:'';}},
 TeamsChatUtils:{...TeamsChatUtils,Scanner,identify:async()=>{}},TeamsChatImages:{MediaStore:class{async put(){} async get(){return null;}},TabCapture:class{stop(){}}},
 TeamsChatArchive:{build:async()=>new Blob(['fixture'])},TeamsChatFormats:{format:()=>''},Blob,URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},
 GM_getValue:async(k,f)=>k==='teams-dom-export-v2'?checkpoint:storage.get(k)??f,GM_setValue:async(k,v)=>storage.set(k,v),
 setTimeout:f=>{timers.push(f);},setInterval:f=>{timers.push(f);},Date,console};
 context.window={addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(fs.readFileSync('scripts/userscript-panel.js','utf8'),context);
 const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
 await flush();
 return {scanner,starts,downloads,location,listeners,timers,storage,flush,$:id=>elements.find(e=>e.attrs.id===id),ready:()=>ready=true,release:()=>resolveStart?.()};
}
test('loaded panel defaults to ZIP, persists preference and manual Start does not autodownload',async()=>{
 const f=await fixture();assert.equal(f.$('format').value,'zip');
 f.$('format').value='json';await f.$('format').onchange();assert.equal(f.storage.get('teams-dom-export-v2-format'),'json');
 await f.$('start').onclick();assert.equal(f.starts[0].format,'json');assert.equal(f.downloads.length,0);
 const restored=await fixture({format:'html'});assert.equal(restored.$('format').value,'html');
});
test('hash arriving on loaded Teams starts fresh over terminal checkpoint and downloads once',async()=>{
 const f=await fixture({checkpoint:{status:'partial',created:1,id:'old'}});
 f.location.hash='#teams-export=all&autodownload=1';f.listeners.hashchange();await f.flush();
 assert.equal(f.starts.length,1);assert.equal(f.location.hash,'');assert.equal(f.scanner.job.id,'fresh');assert.ok(f.scanner.job.created>1);
 assert.equal(f.downloads.length,1);assert.match(f.downloads[0],/\.zip$/);
 await f.scanner.options.onInterrupt(f.scanner.job);assert.equal(f.downloads.length,1);
});
test('hash remains while waiting or blocked and polling retries SPA changes',async()=>{
 const f=await fixture({loading:true});
 f.location.hash='#teams-export=all&autodownload=1';f.listeners.hashchange();await f.flush();
 assert.ok(f.location.hash);assert.equal(f.starts.length,0);f.listeners.hashchange();await f.flush();assert.ok(f.location.hash);
 f.ready();for(const callback of [...f.timers])callback();await f.flush();assert.equal(f.starts.length,1);
 f.scanner.running=true;f.location.hash='#teams-export=all&autodownload=1';f.listeners.popstate();await f.flush();assert.ok(f.location.hash);
 f.scanner.running=false;for(const callback of [...f.timers])callback();await f.flush();assert.equal(f.starts.length,2);assert.equal(f.location.hash,'');
});
test('startup resume with missing format restores ZIP and shares terminal download guard',async()=>{
 const f=await fixture({checkpoint:{version:2,id:'resume',created:1,status:'running',autodownload:true,range:{from:1,to:1000},conversations:[]}});
 assert.equal(f.$('format').value,'zip');assert.equal(f.downloads.length,1);assert.equal(f.starts.length,0);
 await f.scanner.options.onTerminal(f.scanner.job);assert.equal(f.downloads.length,1);
});
