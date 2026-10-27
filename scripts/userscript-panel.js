/* Standalone local userscript panel. Checkpoints use this userscript's GM storage only. */
(function(){
'use strict';
const key='teams-dom-export-v2';
const launcher=document.createElement('button');launcher.textContent='Teams 匯出';launcher.style.cssText='position:fixed;right:16px;bottom:18px;z-index:2147483646;padding:10px;border-radius:8px;background:#6264a7;color:white;border:0;cursor:pointer';document.documentElement.append(launcher);
const host=document.createElement('div');host.style.cssText='position:fixed;right:16px;top:80px;z-index:2147483647;width:360px;max-height:80vh;overflow:auto;display:none';document.documentElement.append(host);const shadow=host.attachShadow({mode:'open'});
function node(tag,attrs={},...children){const e=document.createElement(tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);for(const c of children)e.append(typeof c==='string'?document.createTextNode(c):c);return e;}
const style=node('style',{},':host{font:14px system-ui;color:#eee}section{padding:18px;background:#20202c;border:1px solid #777;border-radius:12px}input,select,button{box-sizing:border-box;font:inherit;padding:7px;margin:5px 0;width:100%}p{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#bbb}');
shadow.append(style,node('section',{},
 node('button',{id:'close'},'關閉面板（掃描繼續）'),node('h3',{},'Teams Chat Downloader · DOM'),
 node('label',{},'範圍',node('select',{id:'scope'},node('option',{value:'all'},'所有聊天（略過頻道）'),node('option',{value:'current'},'目前聊天'))),
 node('label',{},'開始（台北時間）',node('input',{id:'from',type:'datetime-local',step:'1'})),
 node('label',{},'結束（不含）',node('input',{id:'to',type:'datetime-local',step:'1'})),
 node('button',{id:'start'},'掃描指定時段'),node('button',{id:'history'},'目前聊天全部歷史'),node('button',{id:'resume'},'續抓本機進度'),node('button',{id:'stop'},'停止'),
 node('label',{},'格式',node('select',{id:'format'},...['txt','json','csv','html'].map(t=>node('option',{},t)))),
 node('button',{id:'download'},'下載目前結果'),node('p',{id:'status'},'預設最近 24 小時'),
 node('small',{},'掃描可能將聊天標為已讀。請勿切換此分頁的聊天；重新整理後可續抓。資料只存於本機 userscript 儲存空間。')
));
const $=id=>shadow.getElementById(id),local=t=>new Date(t+28800000).toISOString().slice(0,19);
$('from').value=local(Date.now()-86400000);$('to').value=local(Date.now());
const scanner=new TeamsChatUtils.Scanner({save:job=>GM_setValue(key,job),onUpdate:s=>{$('status').textContent=`${s.status}：${s.stage}\n${s.conversations.length} 個聊天，${s.count} 則\n${s.error||''}`;for(const id of ['start','history','resume'])$(id).disabled=scanner.running;}});
launcher.onclick=()=>{host.style.display=host.style.display==='none'?'block':'none';};$('close').onclick=()=>host.style.display='none';
const run=mode=>scanner.start({scope:$('scope').value,mode,from:$('from').value,to:$('to').value}).catch(e=>$('status').textContent=e.message);
$('start').onclick=()=>run('range');$('history').onclick=()=>run('history');$('stop').onclick=()=>scanner.stop();
$('resume').onclick=async()=>{try{const job=scanner.job||await GM_getValue(key,null);await scanner.resume(job);}catch(e){$('status').textContent=e.message;}};
$('download').onclick=async()=>{try{const job=scanner.job||await GM_getValue(key,null),type=$('format').value;const blob=new Blob([TeamsChatFormats.format(job,type)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`teams-chat-${new Date(job.created).toISOString().slice(0,10)}.${type}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){$('status').textContent=e.message;}};
})();
