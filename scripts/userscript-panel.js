/* Standalone local userscript panel. Checkpoints use this userscript's GM storage only. */
(function(){
'use strict';
const key='teams-dom-export-v2';
const launcher=document.createElement('button');launcher.textContent='Teams 匯出';launcher.style.cssText='position:fixed;right:16px;bottom:18px;z-index:2147483646;padding:10px;border-radius:8px;background:#6264a7;color:white;border:0;cursor:pointer';document.documentElement.append(launcher);
const host=document.createElement('div');host.style.cssText='position:fixed;right:16px;top:80px;z-index:2147483647;width:360px;max-height:80vh;overflow:auto;display:none';document.documentElement.append(host);const shadow=host.attachShadow({mode:'open'});
function node(tag,attrs={},...children){const e=document.createElement(tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);for(const c of children)e.append(typeof c==='string'?document.createTextNode(c):c);return e;}
const style=node('style',{},':host{font:14px system-ui;color:#eee}section{padding:18px;background:#20202c;border:1px solid #777;border-radius:12px}input[type=checkbox]{width:auto}input,select,button{box-sizing:border-box;font:inherit;padding:7px;margin:5px 0;width:100%}p{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#bbb}');
shadow.append(style,node('section',{},
 node('button',{id:'close'},'關閉面板（掃描繼續）'),node('h3',{},'Teams Chat Downloader · DOM'),
 node('label',{},'範圍',node('select',{id:'scope'},node('option',{value:'all'},'所有聊天（略過頻道）'),node('option',{value:'current'},'目前聊天'))),
 node('label',{},'開始（台北時間）',node('input',{id:'from',type:'datetime-local',step:'1'})),
 node('label',{},'結束（不含）',node('input',{id:'to',type:'datetime-local',step:'1'})),
 node('label',{},node('input',{id:'saveImages',type:'checkbox',checked:''}),' 保存圖片（ZIP 分開存檔）'),node('button',{id:'enableImages'},'啟用圖片擷取（需要時）'),
 node('small',{},'可以先直接掃描。若提示圖片受限制，再啟用擷取並選此 Teams 分頁。圖片僅存本機 PNG，不上傳。'),
 node('button',{id:'start'},'掃描指定時段'),node('button',{id:'history'},'目前聊天全部歷史'),node('button',{id:'resume'},'續抓本機進度'),node('button',{id:'stop'},'停止'),
 node('label',{},'格式',node('select',{id:'format'},...['zip','txt','json','csv','html'].map(t=>node('option',{},t)))),
 node('button',{id:'discard'},'清除進度'),node('button',{id:'log'},'下載進度紀錄'),node('button',{id:'download'},'下載目前結果'),node('p',{id:'status'},'預設最近 24 小時'),
 node('small',{},'掃描可能將聊天標為已讀。請勿切換此分頁的聊天；重新整理後可續抓。資料只存於本機 userscript 儲存空間。')
));
const $=id=>shadow.getElementById(id),local=t=>new Date(t+28800000).toISOString().slice(0,19);
$('from').value=local(Date.now()-86400000);$('to').value=local(Date.now());
const mediaStore=new TeamsChatImages.MediaStore();
const captureSession=new TeamsChatImages.TabCapture({hide:()=>{const previous=[host.style.visibility,launcher.style.visibility];host.style.visibility='hidden';launcher.style.visibility='hidden';return ()=>{host.style.visibility=previous[0];launcher.style.visibility=previous[1];};},onState:ready=>{$('enableImages').textContent=ready?'圖片擷取已啟用':'啟用圖片擷取（需要時）';}});
const checkpoints=new TeamsChatUtils.Checkpoints(mediaStore,()=>GM_getValue(key,null),value=>GM_setValue(key,value));
const scanner=new TeamsChatUtils.Scanner({mediaStore,captureProvider:captureSession,save:job=>checkpoints.save(job),onInterrupt:job=>TeamsChatUtils.autoDownload(job,download),onUpdate:s=>{$('status').textContent=TeamsChatUtils.statusText(s);for(const id of ['start','history','resume','enableImages','saveImages'])$(id).disabled=scanner.running;if(!scanner.running)captureSession.stop();}});
$('enableImages').onclick=async()=>{try{await captureSession.enable();$('status').textContent='圖片擷取已啟用，現在可以開始掃描。';}catch(e){$('status').textContent='無法啟用圖片擷取：'+e.message;}};
window.addEventListener('pagehide',()=>captureSession.stop());
launcher.onclick=()=>{host.style.display=host.style.display==='none'?'block':'none';};$('close').onclick=()=>host.style.display='none';
const run=mode=>{if(autoPending||loadingCheckpoint)return;return scanner.start({scope:$('scope').value,mode,from:$('from').value,to:$('to').value,captureImages:$('saveImages').checked}).catch(e=>$('status').textContent=e.message);};
$('start').onclick=()=>run('range');$('history').onclick=()=>run('history');$('stop').onclick=()=>scanner.stop();
$('resume').onclick=async()=>{if(autoPending||loadingCheckpoint||scanner.running)return;try{const job=scanner.job||await checkpoints.load();await scanner.resume(job,{captureImages:$('saveImages').checked});await TeamsChatUtils.autoDownload(scanner.job,download);}catch(e){$('status').textContent=e.message;}};
async function download(type){try{const job=scanner.job||await checkpoints.load();const blob=type==='zip'?await TeamsChatArchive.build(job,mediaStore):new Blob([TeamsChatFormats.format(job,type)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`teams-chat-${new Date(job.created).toISOString().slice(0,10)}.${type}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),120000);}catch(e){$('status').textContent=e.message;}}
$('download').onclick=()=>download($('format').value);
let autoPending=false,waitCancelled=false,loadingCheckpoint=true;
$('stop').onclick=()=>{waitCancelled=true;scanner.stop();};
$('discard').onclick=async()=>{waitCancelled=true;scanner.stop();if(scanner.running){$('status').textContent='停止中；停止後再按清除進度';return;}if(scanner.job)scanner.job.abandoned=true;await checkpoints.clear();scanner.job=null;$('status').textContent='已清除進度';};
$('log').onclick=async()=>{const job=scanner.job||await checkpoints.load();const url=URL.createObjectURL(new Blob([JSON.stringify(job?.progressLog||[],null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='progress-log.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),120000);};
async function interrupted(error){if(!scanner.running)return;try{await scanner.interrupt(error);}catch(e){$('status').textContent=e.message;}}
// Teams page errors are unrelated to scanner failures; use scanner catches and watchdog.
// SPA soft navigation usually does not fire pagehide. Browsers may cancel asynchronous
// pagehide downloads; persisted snapshots are the fallback.
window.addEventListener('pagehide',()=>void interrupted(Error('頁面離開，進度已保留')));

async function autoRun(options,consumeHash=false,resumeJob=null){
 if(autoPending||loadingCheckpoint||scanner.running)return;autoPending=true;waitCancelled=false;host.style.display='block';
 try{
  $('status').textContent='自動匯出：等待 Teams 聊天介面／登入…';
  const end=Date.now()+600000;
  while(true){
   if(waitCancelled)return;
   if(Date.now()>end)throw Error('等待 Teams 聊天介面逾時');
   const profile=document.querySelector('[data-tid="me-control-avatar-trigger"]');
   if(profile?.getClientRects().length&&document.querySelector('[role="tree"],[data-tid="app-bar-wrapper"]')){try{await TeamsChatUtils.identify();break;}catch{}}
   await new Promise(r=>setTimeout(r,500));
  }
  if(scanner.running)return;
  if(consumeHash)history.replaceState(history.state,'',TeamsChatUtils.strippedURL(location));
  $('scope').value='all';$('from').value=local(Date.parse(options.from));$('to').value=local(Date.parse(options.to));$('format').value=options.format;
  // Automatic runs use local DOM image capture; never request screen sharing here.
  const previous=scanner.job;
  try{if(resumeJob)await scanner.resume(resumeJob);else await scanner.start({...options,captureImages:$('saveImages').checked});}
  finally{if(scanner.job&&scanner.job!==previous)await TeamsChatUtils.autoDownload(scanner.job,download);}
 }catch(e){if(resumeJob){scanner.job=resumeJob;scanner.job.status='interrupted';scanner.job.error=e.message;TeamsChatUtils.logProgress(scanner.job,e);await checkpoints.save(scanner.job);await TeamsChatUtils.autoDownload(scanner.job,download);}$('status').textContent=e.message;}finally{autoPending=false;}
}
function hashTrigger(){try{const options=TeamsChatUtils.parseAutoHash(location.hash);if(options)void autoRun(options,true);}catch(e){host.style.display='block';$('status').textContent=e.message;}}
window.addEventListener('hashchange',hashTrigger);
// Alt+Shift+E: previous weekday 07:00 Taipei through now, all chats, ZIP download.
window.addEventListener('keydown',event=>{if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.code==='KeyE'&&!event.repeat&&!event.isComposing){event.preventDefault();const r=TeamsChatUtils.defaultAutoRange();void autoRun({scope:'all',mode:'range',from:new Date(r.from).toISOString(),to:new Date(r.to).toISOString(),format:'zip',autodownload:true});}});
void (async()=>{try{const job=await checkpoints.load();loadingCheckpoint=false;if(TeamsChatUtils.resumable(job)){const options={...job,from:new Date(job.range.from).toISOString(),to:new Date(job.range.to).toISOString()};await autoRun(options,!!TeamsChatUtils.parseAutoHash(location.hash),job);}else hashTrigger();}catch(e){loadingCheckpoint=false;host.style.display='block';$('status').textContent=e.message;}})();
})();
