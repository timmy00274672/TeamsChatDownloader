const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
global.TeamsChatDOM={};require('../shared-utils.js');require('../export-formats.js');require('../archive.js');const u=TeamsChatUtils;
const job=()=>({version:2,id:'synthetic',status:'running',stage:'掃描',created:1,range:{from:0,to:100},mode:'range',warnings:[],discovery:{status:'pending'},autodownload:true,format:'txt',conversations:[{name:'Fixture',status:'pending',messages:[{key:'1',timestamp:10,text:'Synthetic'}],warnings:[]}]});
test('checkpoint snapshots separate payload and metadata, migrate legacy and clear',async()=>{let meta;const data=new Map();const cp=new u.Checkpoints({put:async(id,k,v)=>data.set(id+k,v),get:async(id,k)=>data.get(id+k)},async()=>meta,async v=>{meta=v;});const j=job();await cp.save(j);j.conversations[0].messages=[];assert.equal(meta.conversations,undefined);assert.equal((await cp.load()).conversations[0].messages.length,1);assert.equal((await cp.load()).autodownload,true);await cp.clear();assert.equal(await cp.load(),null);meta=job();assert.equal(await cp.load(),meta);});
test('failed payload write preserves old checkpoint',async()=>{let meta=job();const cp=new u.Checkpoints({put:async()=>{throw Error('quota');}},async()=>meta,async v=>{meta=v;});await assert.rejects(cp.save(job()),/quota/);assert.equal(meta.checkpoint,undefined);});
test('resume only unfinished non-abandoned jobs',()=>{const j=job();for(const status of ['running','waiting-login','interrupted'])assert.ok(u.resumable({...j,status}));for(const status of ['complete','failed','partial'])assert.equal(u.resumable({...j,status}),false);assert.equal(u.resumable({...j,abandoned:true}),false);assert.equal(u.resumable({...j,status:'interrupted',conversations:[{status:'complete'}]}),false);});
test('rolling log, visible diagnostics and ZIP log',async()=>{const j=job();for(let i=0;i<200;i++){j.stage='stage '+i;u.logProgress(j,null,i);}u.logProgress(j,Error('fixture failure'),201);assert.equal(j.progressLog.length,150);assert.equal(j.lastError,'fixture failure');assert.ok(j.lastProgressAt.endsWith('Z'));const text=u.statusText({...j,count:1});assert.match(text,/聊天 1（略過 0）｜訊息 1/);assert.match(text,/fixture failure/);assert.doesNotMatch(text,/messages/);const zip=await TeamsChatArchive.build(j,{});assert.ok(Buffer.from(await zip.arrayBuffer()).includes(Buffer.from('progress-log.json')));});
test('all terminal jobs download ZIP exactly once',async()=>{for(const status of ['interrupted','failed','partial','complete']){let count=0;const j={...job(),status};await Promise.all([u.autoDownload(j,async t=>{assert.equal(t,'zip');count++;}),u.autoDownload(j,()=>assert.fail('duplicate'))]);assert.equal(count,1);assert.ok(j.downloadedAt);}await u.autoDownload({...job(),autodownload:false},()=>assert.fail());});
test('strip preserves SPA fragment and never assigns location hash',()=>{assert.equal(u.strippedURL({pathname:'/v2/',search:'?x=1',hash:'#teams-export=all&autodownload=1#router'}),'/v2/?x=1#router');assert.equal(u.strippedURL({pathname:'/',search:'',hash:'#router'}),'/#router');const s=fs.readFileSync('scripts/userscript-panel.js','utf8');assert.doesNotMatch(s,/location\.(hash|href)\s*=/);assert.match(s,/replaceState\(history.state/);});
test('interrupt keeps payload and invokes partial download hook once',async()=>{let downloads=0;const scanner=new u.Scanner({onInterrupt:j=>u.autoDownload(j,async t=>{assert.equal(t,'zip');downloads++;})});scanner.job=job();scanner.running=true;await scanner.interrupt(Error('watchdog'));await scanner.interrupt(Error('again'));assert.equal(downloads,1);assert.equal(scanner.job.status,'interrupted');assert.equal(scanner.job.conversations[0].messages.length,1);assert.throws(()=>scanner.check(),/watchdog/);});
test('panel ignores global page errors and keeps pagehide interruption',()=>{const s=fs.readFileSync('scripts/userscript-panel.js','utf8');assert.doesNotMatch(s,/window\s*\.\s*addEventListener\s*\(\s*['"](?:error|unhandledrejection)['"]/);assert.match(s,/window\.addEventListener\('pagehide',\(\)=>void interrupted\(/);assert.match(s,/scanner\.job\.abandoned=true;await checkpoints\.clear\(\);scanner\.job=null/);});
test('execute preserves completed all-chat discovery and initializes current-chat discovery',async()=>{for(const scope of ['all','current']){const scanner=new u.Scanner();const discovery={status:'complete',boundary:'observed-stable-bottom'};scanner.job={...job(),scope,discovery,conversations:[]};scanner.discover=async()=>assert.fail('completed discovery must not repeat');await scanner.execute();assert.equal(scanner.job.error,null);if(scope==='all')assert.equal(scanner.job.discovery,discovery);else assert.deepEqual(scanner.job.discovery,{status:'complete',scope:'current'});}});
test('progress coalesces stages and retains current chat between states',()=>{
 const j=job();j.currentChatIndex=1;
 u.logProgress(j,null,1);j.conversations[0].status='complete';u.logProgress(j,null,2);
 assert.equal(j.progressLog.length,1);assert.equal(j.progressLog[0].repeat,2);
 assert.equal(j.progressLog[0].chatIndex,1);assert.equal(j.progressLog[0].chatName,'Fixture');
});
test('execute terminal hook covers partial, complete, failed and interruption',async()=>{
 for(const outcome of ['partial','complete','failed','interrupted']){
  let downloads=0;const s=new u.Scanner({onTerminal:j=>u.autoDownload(j,async()=>downloads++)});
  s.job={...job(),scope:'all',discovery:{status:'complete'}};
  s.open=async()=>{if(outcome==='failed')throw Error('帳號 fixture');};s.wait=async()=>{};
  s.scan=async c=>{if(['failed','interrupted'].includes(outcome))throw Object.assign(Error(outcome),{stopped:outcome==='interrupted'});c.status=outcome;};
  const before=Date.now();await s.execute();
  assert.equal(s.job.status,outcome);assert.equal(downloads,1);assert.ok(s.job.startedAt>=before);
  if(outcome==='partial'||outcome==='failed')assert.ok(s.job.conversations[0].reason);
 }
});
test('range crossing completes without bottom while real warnings remain partial',async()=>{
 for(const warning of [null,'此聊天含獨立討論串，尚未展開，結果部分完成']){
  const s=new u.Scanner({maxSteps:1});s.job={...job(),range:{from:100,to:200}};
  const c=s.job.conversations[0];c.traversal={};c.messages=[{timestamp:null,authorMissing:true}];c.warnings=warning?[warning]:[];
  s.capture=async()=>({raw:[{time:'1970-01-01T00:00:00.010Z'}],pane:{busy:false,bottom:99}});
  s.viewport=()=>({scrollHeight:100});s.wait=async()=>{};
  await s.scan(c);s.ensureReason(c);
  assert.equal(c.status,warning?'partial':'complete');assert.ok(c.reason);assert.ok(c.warnings.includes('未確認最新訊息的底部邊界'));
 }
});
test('autodownload ignores active jobs, handles empty terminal exports and retries errors',async()=>{
 const j={...job(),conversations:[]};await u.autoDownload(j,()=>assert.fail());
 j.status='partial';await assert.rejects(u.autoDownload(j,async()=>{throw Error('download failed');}));
 assert.equal(j.autoDownloadDone,false);await u.autoDownload(j,async()=>{});assert.equal(j.autoDownloadDone,true);
});
test('message timestamps use labels, plausible ids and continuation fallback',()=>{
 const id='1793700000000';assert.equal(u.messageTime({id}).timestamp,Number(id));assert.equal(u.messageTime({id}).timestampSource,'message-id');
 const pm=u.messageTime({timeLabels:['invalid','2026/11/4 下午 3:05'],id});const am=u.messageTime({rawTime:'2026/11/4 上午 3:05'});assert.equal(pm.timestampSource,'time-label');assert.equal(pm.timestamp-am.timestamp,12*3600000);
 assert.equal(pm.timestamp,Date.parse('2026-11-04T07:05:00Z'));assert.equal(am.timestamp,Date.parse('2026-11-03T19:05:00Z'));
 assert.equal(u.messageTime({rawTime:'2026/2/30 PM 3:05'}).timestamp,null);assert.equal(u.messageTime({rawTime:'2026/11/4 PM 3:05:60'}).timestamp,null);
 assert.equal(u.messageTime({time:'2026-11-04T00:00:00Z',id}).timestampSource,'datetime');
 assert.deepEqual(u.messageTime({id:'bad'}, {timestamp:42}),{timestamp:42,timestampSource:'inherited',timestampInferred:true});
 assert.equal(u.messageTime({id:'1000000000000',author:'Alice'}).timestamp,null);
});
test('skipped chats share a retained progress entry',()=>{
 const j=job();j.conversations=Array.from({length:200},()=>({status:'pending'}));
 for(const c of j.conversations){c.status='skipped';j.stage='略過聊天';u.logProgress(j);j.stage='other '+j.conversations.indexOf(c);u.logProgress(j);}
 assert.equal(j.progressLog.filter(e=>e.stage==='略過聊天').length,1);assert.equal(j.progressLog.find(e=>e.stage==='略過聊天').count,200);assert.equal(j.progressLog.length,150);
});
test('stable top and benign warnings complete, but truncation and scroll cap remain partial',async()=>{
 for(const kind of ['benign','truncated','cap']){
  const s=new u.Scanner({maxSteps:kind==='cap'?1:6});s.job={...job(),mode:'history',captureImages:true};const c=s.job.conversations[0];c.messages=[{timestamp:null,authorMissing:true,images:[{status:'failed'}]}];c.warnings=kind==='truncated'?['部分訊息未展開全文']:[];
  s.capture=async()=>({raw:[],pane:{busy:false,bottom:0,top:0}});s.viewport=()=>({scrollHeight:100,clientHeight:100,scrollTop:0});s.wait=async()=>{};
  await s.scan(c);assert.equal(c.status,kind==='benign'?'complete':'partial');
 }
});
