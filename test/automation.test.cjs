const {test}=require('node:test');const assert=require('node:assert/strict');
global.TeamsChatDOM={};require('../shared-utils.js');require('../export-formats.js');require('../archive.js');
const u=TeamsChatUtils,f=TeamsChatFormats;
test('previous weekday uses Taipei calendar, including weekends and year boundary',()=>{
 for(const [now,from] of [['2026-10-26T00:00:00+08:00','2026-10-23'],['2026-10-27T12:00:00+08:00','2026-10-26'],['2026-10-24T12:00:00+08:00','2026-10-23'],['2026-10-25T12:00:00+08:00','2026-10-23'],['2026-01-01T06:00:00+08:00','2025-12-31']]){
 const r=u.defaultAutoRange(Date.parse(now));assert.equal(r.from,Date.parse(from+'T07:00:00+08:00'));assert.equal(r.to,Date.parse(now));
 }
});
test('hash opt in, defaults, encoded offsets and invalid ranges',()=>{
 const now=Date.parse('2026-10-27T12:00:00+08:00');assert.equal(u.parseAutoHash('#from=x',now),null);
 const r=u.parseAutoHash('#teams-export=all&autodownload=1',now);assert.equal(r.scope,'all');assert.equal(r.mode,'range');assert.equal(r.format,'zip');assert.equal(r.autodownload,true);assert.equal(Date.parse(r.from),u.defaultAutoRange(now).from);
 assert.equal(u.parseAutoHash('#teams-export=all&from=2026-10-26T07:00:00%2B08:00',now).from,'2026-10-25T23:00:00.000Z');
 assert.throws(()=>u.parseAutoHash('#teams-export=all&from=bad',now));assert.throws(()=>u.parseAutoHash('#teams-export=all&format=exe',now));
});
test('skip only valid activity strictly before all-chat range',()=>{
 const job={scope:'all',mode:'range',range:{from:Date.parse('2026-10-26T00:00Z')}};
 for(const latest of [null,'bad','2026-10-26T00:00Z','2026-10-27T00:00Z'])assert.equal(u.skipBeforeRange(job,{latest}),false);
 assert.equal(u.skipBeforeRange(job,{latest:'2026-10-25T00:00Z'}),true);
 assert.equal(u.skipBeforeRange({...job,scope:'current'},{latest:'2026-10-25T00:00Z'}),false);
});
const from=Date.parse('2026-10-26T00:00Z');
const job=()=>({id:'synthetic',created:from,updated:from+120000,status:'complete',captureImages:false,mode:'range',range:{from,to:from+3600000},warnings:[],discovery:{status:'complete'},conversations:[{name:'Synthetic chat',status:'complete',attempts:1,warnings:[],messages:[{key:'1',timestamp:from,sender:'A',text:'引用原文：Begin quote old text End quote\nNew   reply',images:[{status:'link-only'}]},{key:'2',timestamp:null,sender:'A',text:'unknown'},{key:'3',timestamp:from+3600000,sender:'A',text:'excluded'}]},{name:'Inactive',status:'skipped',skipReason:'skipped: last activity before range',messages:[],warnings:[]}]});
test('compact filters unknown/end times, condenses quotes and reports skips',()=>{
 const text=f.compact(job());assert.match(text,/skipped=1 active=1 in-range msgs=1 no-time=1 partial chats=0/);assert.match(text,/10\/26 08:00 A: ↩ New reply \[img\]/);assert.doesNotMatch(text,/old text|excluded|unknown|## Inactive/);assert.match(text,/duration=2.0 min/);
 assert.equal(f.compactText({text:'Name 10/26/2026 1:00 PM quoted body response',quote:'quoted body'}),'↩ response');assert.ok(f.compactText({text:'a'.repeat(500)}).length<=300);
});
test('ZIP contains compact, chat, report and skipped conversations',async()=>{
 const blob=await TeamsChatArchive.build(job(),{get:async()=>null});const bytes=Buffer.from(await blob.arrayBuffer());for(const name of ['compact.txt','chat.txt','report.json'])assert.ok(bytes.includes(Buffer.from(name)));assert.ok(bytes.includes(Buffer.from('"status": "skipped"')));
});
test('execute skips before opening and accepts skipped as successful completion',async()=>{
 const s=new u.Scanner();s.job={...job(),scope:'all',conversations:[s.newConversation({key:'old',latest:'2026-10-25T00:00Z'})]};s.discover=async()=>{};s.open=async()=>assert.fail('must not open');await s.execute();assert.equal(s.job.status,'complete');assert.equal(s.job.conversations[0].status,'skipped');assert.equal(s.summary().conversations[0].skipReason,'skipped: last activity before range');
});
