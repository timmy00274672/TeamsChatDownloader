/* Popup is a control panel; the content script owns the long-lived scan. */
'use strict';
const $=id=>document.getElementById(id);
const actionButtons=['scanBtn','scanFullBtn','scanVisibleBtn','resumeBtn'];
let tabId=null,working=false,polling=false;
const localInput=t=>new Date(t+28800000).toISOString().slice(0,19);
$('from').value=localInput(Date.now()-86400000);$('to').value=localInput(Date.now());
function status(text,error=false){$('status').className='status '+(error?'status-error':'status-info');$('status').querySelector('.status-text').textContent=text;}
async function send(action,options){
 if(tabId===null)throw Error('請在 Teams 聊天分頁開啟此擴充套件');
 let r;try{r=await chrome.tabs.sendMessage(tabId,{action,options,tabId});}catch{throw Error('無法連接 Teams。安裝／更新擴充套件後，請重新整理 Teams 分頁。');}
 if(!r?.ok)throw Error(r?.error||'沒有收到掃描回覆');return r;
}
function show(summary,running){
 working=running;
 for(const id of actionButtons)$(id).disabled=running;
 $('stopBtn').disabled=!running;$('resumeBtn').disabled=running||!summary||summary.status==='complete';
 $('downloadBtn').disabled=!summary||!summary.conversations.length;
 if(!summary){status('選擇時間範圍後開始掃描');return;}
 $('activeRange').textContent='目前結果範圍：'+TeamsChatFormats.time(summary.range.from)+' ～ '+TeamsChatFormats.time(summary.range.to)+(summary.mode==='history'?'（全部歷史，不限日期）':'');
 const labels={running:'掃描中',complete:'掃描完成',partial:'部分完成',interrupted:'已停止／可續抓',failed:'掃描失敗', 'waiting-login':'等待重新登入'};
 status(`${labels[summary.status]||summary.status}：${summary.stage||''}${summary.error?' — '+summary.error:''}`,summary.status==='failed');
 $('messageCount').hidden=false;$('countText').textContent=`${summary.conversations.length} 個聊天，${summary.count} 則（含時間不明項目）`;
 $('messages').replaceChildren();
 for(const c of summary.conversations){const e=document.createElement('div');e.className='message-preview';const title=document.createElement('strong');title.textContent=`${c.name} — ${{complete:'已完成',partial:'部分完成',pending:'待處理',running:'掃描中',failed:'讀取失敗'}[c.status]||c.status} (${c.count})`;const p=document.createElement('p');p.textContent=[...c.warnings,c.error||''].filter(Boolean).join('；');e.append(title,p);$('messages').append(e);}
}
async function poll(){if(polling||tabId===null)return;polling=true;try{const r=await send('status');show(r.summary,r.running);}catch(e){status(e.message,true);}finally{polling=false;}}
async function start(mode){try{if(working)return;const opts={scope:$('scope').value,mode,from:$('from').value,to:$('to').value};if(!opts.from||!opts.to)throw Error('請填寫開始與結束時間');await send('start',opts);await poll();}catch(e){status(e.message,true);}}
$('scanBtn').onclick=()=>start('range');$('scanFullBtn').onclick=()=>start('history');$('scanVisibleBtn').onclick=()=>start('visible');
$('resumeBtn').onclick=async()=>{try{await send('resume');await poll();}catch(e){status(e.message,true);}};
$('stopBtn').onclick=async()=>{try{await send('stop');await poll();}catch(e){status(e.message,true);}};
$('downloadBtn').onclick=async()=>{
 let url;
 try{const {job}=await send('result');const type=$('formatSelect').value;const content=TeamsChatFormats.format(job,type);url=URL.createObjectURL(new Blob([content],{type:{txt:'text/plain',json:'application/json',csv:'text/csv',html:'text/html'}[type]+';charset=utf-8'}));
 await chrome.downloads.download({url,filename:`teams-chat-${new Date(job.created).toISOString().slice(0,10)}.${type}`,saveAs:true});status('已開始下載；完整度請見檔案內的逐聊天狀態。');
 }catch(e){status(e.message,true);}finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),60000);}
};
(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});let host;try{host=new URL(tab.url).hostname;}catch{}if(!['teams.microsoft.com','teams.cloud.microsoft','teams.live.com'].includes(host)){status('請先開啟 Teams 網頁聊天',true);return;}tabId=tab.id;await poll();setInterval(poll,1500);})();
