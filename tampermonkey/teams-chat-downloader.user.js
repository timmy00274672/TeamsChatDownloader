// ==UserScript==
// @name         Teams Chat Downloader (DOM local)
// @namespace    https://github.com/rahulmasal/TeamsChatDownloader
// @version      1.4.0
// @description  Local DOM-only chat export with date ranges, batching and checkpoints.
// @author       Rahul Masal; local adaptation
// @match        https://teams.microsoft.com/*
// @match        https://teams.cloud.microsoft/*
// @match        https://teams.live.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

/* Images already rendered by Teams: read canvas when permitted, otherwise crop a tab screenshot. No media requests. */
(function(root){
'use strict';
const pngBlob=canvas=>new Promise((resolve,reject)=>{try{canvas.toBlob(b=>b?resolve(b):reject(Error('圖片轉換失敗')),'image/png');}catch(e){reject(e);}});
const frame=()=>new Promise(resolve=>{const timer=setTimeout(resolve,500);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));});
const unavailable=message=>Object.assign(Error(message),{captureUnavailable:true});
function candidates(body){return [...(body.querySelector('[data-message-content]')||body).querySelectorAll('img')].filter(e=>{
 const r=e.getBoundingClientRect();return !e.closest('[itemtype*="Emoji"],[data-tid*="emoji"],.emojione,[data-is-emoji="true"]')&&(r.width>=32&&r.height>=32||e.naturalWidth>=64&&e.naturalHeight>=64);
});}
function describe(e,index){const source=e.currentSrc||e.src||'';let digest=2166136261;for(let i=0;i<source.length;i++)digest=Math.imul(digest^source.charCodeAt(i),16777619);return {index,identity:e.id||((source.startsWith('data:')?'data-image:'+String(digest>>>0):source)||String(index)),alt:e.alt||e.getAttribute('aria-label')||'圖片',url:/^(https?:|blob:)/.test(e.currentSrc||e.src)?e.currentSrc||e.src:null};}
class MediaStore{
 async db(){if(!this.connection)this.connection=await new Promise((resolve,reject)=>{const request=indexedDB.open('teams-chat-downloader-local-media-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('images');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return this.connection;}
 async transaction(mode,action){const db=await this.db();return new Promise((resolve,reject)=>{const tx=db.transaction('images',mode),request=action(tx.objectStore('images'));tx.oncomplete=()=>resolve(request.result??null);tx.onerror=()=>reject(tx.error||Error('圖片儲存失敗'));tx.onabort=()=>reject(tx.error||Error('圖片儲存中斷'));});}
 async put(job,file,blob){await this.transaction('readwrite',s=>s.put(blob,job+':'+file));}
 async get(job,file){return this.transaction('readonly',s=>s.get(job+':'+file));}
}
async function filename(chat,message,index){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(chat+'\0'+message));const prefix=[...new Uint8Array(bytes)].slice(0,10).map(x=>x.toString(16).padStart(2,'0')).join('');return `images/${prefix}_${index+1}.png`;}
function cropRect(e){
 let r=e.getBoundingClientRect(),left=0,top=0,right=innerWidth,bottom=innerHeight;
 for(let p=e.parentElement;p;p=p.parentElement){const css=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(css.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}if(/auto|scroll|hidden|clip/.test(css.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}}
 if(r.width<1||r.height<1||r.left<left-1||r.top<top-1||r.right>right+1||r.bottom>bottom+1)throw Error('圖片未完整顯示，已保留來源連結');
 for(const [x,y]of [[r.left+2,r.top+2],[r.right-2,r.top+2],[r.left+2,r.bottom-2],[r.right-2,r.bottom-2],[(r.left+r.right)/2,(r.top+r.bottom)/2]]){const hit=document.elementFromPoint(x,y);if(!hit||!(hit===e||hit.contains(e)))throw Error('圖片被其他面板遮住，已保留連結');}
 return {x:Math.max(0,r.left),y:Math.max(0,r.top),width:r.width,height:r.height,viewWidth:innerWidth,viewHeight:innerHeight};
}
async function capture(e,provider,check=()=>{}){
 check();if(!e.isConnected)throw Error('圖片已離開頁面，請續抓重試');
 if(!e.complete||!e.naturalWidth){await Promise.race([new Promise(resolve=>{e.addEventListener('load',resolve,{once:true});e.addEventListener('error',resolve,{once:true});}),new Promise(r=>setTimeout(r,2500))]);}
 check();if(!e.complete||!e.naturalWidth)throw Error('圖片尚未載入，已保留連結');
 if(e.naturalWidth*e.naturalHeight<=24000000){try{const canvas=document.createElement('canvas');canvas.width=e.naturalWidth;canvas.height=e.naturalHeight;canvas.getContext('2d').drawImage(e,0,0);return {blob:await pngBlob(canvas),method:'rendered-canvas'};}catch{/* Cross-origin pixels require a user-authorized tab capture. */}}
 if(!provider?.capture)throw unavailable('圖片擷取未啟用，請先啟用再續抓');
 const scrollers=[];for(let p=e.parentElement;p;p=p.parentElement)if(p.scrollHeight>p.clientHeight||p.scrollWidth>p.clientWidth)scrollers.push([p,p.scrollTop,p.scrollLeft]);
 const originalStyle=e.getAttribute('style'),originalWindow=[scrollX,scrollY];
 try{
  e.style.setProperty('max-width',Math.floor(innerWidth*.65)+'px','important');e.style.setProperty('max-height',Math.floor(innerHeight*.45)+'px','important');e.style.setProperty('width','auto','important');e.style.setProperty('height','auto','important');e.style.setProperty('object-fit','contain','important');
  e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});await frame();await new Promise(r=>setTimeout(r,150));check();if(!e.isConnected)throw Error('捲動時圖片被回收，請續抓重試');
  const blob=await provider.capture(()=>{check();return cropRect(e);});check();return {blob,method:'tab-screenshot'};
 }finally{if(originalStyle===null)e.removeAttribute('style');else e.setAttribute('style',originalStyle);for(const [p,top,left]of scrollers){p.scrollTop=top;p.scrollLeft=left;}window.scrollTo(...originalWindow);await frame();}
}
class TabCapture{
 constructor({hide=()=>()=>{},onState=()=>{}}={}){Object.assign(this,{hide,onState});this.stream=null;this.video=null;this.marker=null;}
 get ready(){return !!this.stream?.getVideoTracks().some(t=>t.readyState==='live');}
 async enable(){
  this.stop();if(!navigator.mediaDevices?.getDisplayMedia||!root.CropTarget?.fromElement)throw Error('此 Chrome 不支援分頁圖片擷取，請改用擴充套件');
  // Called only by a direct click on the enable button: Chrome presents its own tab picker.
  const stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser',frameRate:10},audio:false,preferCurrentTab:true,selfBrowserSurface:'include'});
  try{const track=stream.getVideoTracks()[0];if(track.getSettings().displaySurface!=='browser'||!track.cropTo)throw Error('請只選目前的 Teams 瀏覽器分頁，不要選整個螢幕或視窗');
   // A CropTarget from this document must belong to the captured tab. A different tab rejects.
   this.marker=document.createElement('div');this.marker.setAttribute('aria-hidden','true');this.marker.style.cssText='position:fixed;inset:0;pointer-events:none;background:transparent;z-index:-2147483647';document.documentElement.append(this.marker);const target=await CropTarget.fromElement(this.marker);await track.cropTo(target);
   this.stream=stream;this.video=document.createElement('video');this.video.muted=true;this.video.playsInline=true;this.video.srcObject=stream;await this.video.play();track.addEventListener('ended',()=>this.stop(),{once:true});this.onState(true);
  }catch(e){for(const t of stream.getTracks())t.stop();this.stream=null;this.video=null;this.marker?.remove();this.marker=null;throw e;}
 }
 stop(){this.marker?.remove();this.marker=null;const stream=this.stream;this.stream=null;for(const t of stream?.getTracks()||[])t.stop();if(this.video){this.video.pause();this.video.srcObject=null;this.video=null;}this.onState(false);}
 async capture(rectangle){
  if(!this.ready)throw unavailable('此圖片受網頁限制，請按「啟用圖片擷取」、選擇此 Teams 分頁後續抓；文字進度已保存');
  const restore=this.hide();
  try{await frame();const video=this.video;if(!video)throw unavailable('圖片擷取已停止');
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(unavailable('沒有收到新的分頁畫面，請重新啟用圖片擷取')),5000);video.requestVideoFrameCallback(()=>{clearTimeout(timer);resolve();});});
   const r=rectangle(),sx=video.videoWidth/r.viewWidth,sy=video.videoHeight/r.viewHeight;if(!sx||!sy)throw unavailable('分頁影像尚未就緒');
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(r.width*sx));canvas.height=Math.max(1,Math.round(r.height*sy));canvas.getContext('2d').drawImage(video,r.x*sx,r.y*sy,r.width*sx,r.height*sy,0,0,canvas.width,canvas.height);return pngBlob(canvas);
  }finally{restore();}
 }
}
function blobFromDataURL(data){const raw=atob(data.split(',')[1]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:'image/png'});}
function extensionCapture(){return {ready:true,async capture(rectangle){const r=await chrome.runtime.sendMessage({action:'capture-image',rect:rectangle()});if(!r?.ok)throw unavailable(r?.error||'無法擷取圖片，請保持 Teams 分頁在前景並重新點擴充套件');return blobFromDataURL(r.dataURL);}};}
root.TeamsChatImages={MediaStore,TabCapture,candidates,describe,filename,capture,extensionCapture,blobFromDataURL};
})(globalThis);

/* Rendered-DOM readers for the local Teams build. */
(function(root){
// Runs only against the rendered DOM. Never reads application stores or network traffic.
function readMessages() {
  const visible = e => !!e && e.getClientRects().length > 0;
  return [...document.querySelectorAll('[id^="message-body-"]')].filter(visible).map((body, index) => {
    const id = body.getAttribute('data-mid') || body.id.slice('message-body-'.length);
    const byId = prefix => document.getElementById(prefix + id);
    const content = byId('content-') || body.querySelector('[data-message-content]');
    const time = byId('timestamp-');
    const author = byId('author-');
    const links = [...(content || body).querySelectorAll('a[href]')].map(a => ({text: a.innerText || a.getAttribute('aria-label') || '', url: a.href})).filter(a => /^https?:/.test(a.url));
    const attachments = byId('attachments-') || body.querySelector('[data-tid="file-attachment-grid"]');
    if (attachments) {
      for (const a of attachments.querySelectorAll('a[href]')) if (/^https?:/.test(a.href)) links.push({text: a.innerText || a.getAttribute('aria-label') || '', url: a.href});
      const text = attachments.innerText.trim();
      if (text) links.push({text, url: null});
    }
    const images = [...(content || body).querySelectorAll('img')].map(e => e.alt || e.getAttribute('aria-label') || '圖片');
    // A quoted reply is part of the body; preserve the quote text and DOM target, if exposed.
    const quote = content?.querySelector('[data-track-module-name="messageQuotedReply"], [data-tid*="quoted"], [data-reply-to-id], blockquote');
    const parent = body.getAttribute('data-reply-to-id') || quote?.getAttribute('data-reply-to-id') || quote?.getAttribute('data-message-id') || null;
    return {id: id || null, author: author?.innerText?.trim() || null, rawTime: time?.getAttribute('datetime') || time?.getAttribute('aria-label') || time?.textContent || null,
      time: time?.getAttribute('datetime') || null,
      text: [content?.innerText?.trim() || '', ...images.map(x=>'[圖片：'+x+']')].filter(Boolean).join('\n') || body.innerText.trim(),
      images: root.TeamsChatImages ? root.TeamsChatImages.candidates(body).map(root.TeamsChatImages.describe) : [],
      links, parent, quote: quote?.getAttribute('aria-label') || quote?.innerText || null, index,
      truncated: [...body.querySelectorAll('button')].some(b=>visible(b) && /^(see more|read more|show more|顯示更多|查看更多|閱讀更多|展开|展開)$/i.test((b.innerText || b.getAttribute('aria-label') || '').trim()))};
  });
}
function readRail() {
  const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const tree = [...document.querySelectorAll('[role="tree"]')].find(visible);
  if (!tree) return {items: [], folders: [], top: null, bottom: null, loading: true};
  const items = [...tree.querySelectorAll('[role="treeitem"][data-item-type="chat"], [role="treeitem"][data-item-type="muted-chat"]')].filter(visible).map(e => {
    const value = e.getAttribute('data-fui-tree-item-value');
    const title = e.querySelector('[id^="title-chat-list-item_"]');
    const id = title?.id.slice('title-chat-list-item_'.length) || value?.split('|').at(-1);
    const name = title?.innerText?.trim();
    return {key: id, name, value, type:'chat', latest: e.querySelector('time[datetime]')?.getAttribute('datetime') || null};
  }).filter(e=>e.key && e.name);
  const folders = [...tree.querySelectorAll('[role="treeitem"][data-conversation-folder="true"][aria-expanded="false"]')].filter(visible).map(e=>e.getAttribute('data-fui-tree-item-value'));
  return {items, folders, top: tree.scrollTop, bottom: tree.scrollHeight - tree.clientHeight - tree.scrollTop, loading: !!tree.querySelector('[role="progressbar"], [aria-busy="true"]'),
    filtered: [...document.querySelectorAll('[aria-checked="true"], [aria-pressed="true"]')].filter(e=>visible(e) && /^(Unread|Chats|Meeting chats|未讀|聊天|會議聊天|未读|会议聊天)$/i.test((e.getAttribute('aria-label') || e.innerText || '').trim())).map(e=>e.getAttribute('aria-label') || e.innerText),
    moreValues: [...tree.querySelectorAll('[role="treeitem"][data-fui-tree-item-value$="load-next-page"]')].filter(visible).map(e=>e.getAttribute('data-fui-tree-item-value')),
    moreLabels: [...tree.querySelectorAll('button,[role="treeitem"]')].filter(e=>visible(e) && /^(show more|see more|load more|show all|顯示更多|查看更多|載入更多|显示更多|加载更多|See all chats|所有聊天)$/i.test(e.innerText.trim())).map(e=>e.innerText.trim())};
}
function readPane() {
  const visible = e => !!e && e.getClientRects().length > 0;
  const root = document.querySelector('[data-tid="app-layout-area--main"]') || document.body;
  const viewport = [...root.querySelectorAll('[data-tid="message-pane-list-viewport"]')].find(visible);
  const header = document.querySelector('[data-tid="chat-header"]') || document.querySelector('[id^="chat-header-"]');
  const title = document.querySelector('[data-tid="chat-title"]')?.innerText?.trim();
  const busy = [...root.querySelectorAll('[role="progressbar"], [aria-busy="true"]')].some(visible);
  const text = root.innerText || '';
  const startMarker = /(?:This is the beginning of (?:your |the )?(?:chat|conversation)|This is the start of (?:your |the )?(?:chat|conversation)|這是.*(?:聊天|對話)的開頭|这是.*(?:聊天|对话)的开头)/i.test(text);
  const empty = /(?:No messages (?:yet|here)|There are no messages|Start a conversation|尚無訊息|還沒有訊息|暂无消息|尚無聊天記錄)/i.test(text);
  const replies = [...root.querySelectorAll('button')].filter(e=>visible(e) && /(?:\d+ replies|View thread|Open thread|\d+ 則回覆|查看討論串|\d+ 条回复)/i.test(e.getAttribute('aria-label') || e.innerText || '')).length;
  return {title, headerId: header?.id || null, viewport: !!viewport, top: viewport?.scrollTop ?? null, bottom: viewport ? viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop : null, busy, startMarker, empty, replies};
}

root.TeamsChatDOM={readMessages,readRail,readPane};
})(globalThis);

/* Local DOM-only scanner. No fetch/XHR, tokens, application stores or remote selectors. */
(function(root){
'use strict';
const {readMessages,readRail,readPane}=root.TeamsChatDOM;
const validHost=host=>['teams.microsoft.com','teams.cloud.microsoft','teams.live.com'].includes(host);
const knownTime=value=> typeof value==='string' && /(Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
function parseDate(value){
 const local=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(value||'');
 const input=local?`${local[1]}T${local[2]}:${local[3]||'00'}+08:00`:value;
 if(!knownTime(input))throw Error('請輸入有效日期時間；未帶時區時使用台北時間');
 const t=Date.parse(input);
 if(local && new Date(t+28800000).toISOString().slice(0,19)!==`${local[1]}T${local[2]}:${local[3]||'00'}`)throw Error('日期時間無效');
 if(!local){const d=new Date(value.slice(0,10)+'T00:00:00Z');if(d.toISOString().slice(0,10)!==value.slice(0,10))throw Error('日期無效');}
 return t;
}
function makeRange(input={},now=Date.now()){
 const to=input.to?parseDate(input.to):now;
 const from=input.from?parseDate(input.from):to-86400000;
 if(from>=to)throw Error('開始時間必須早於結束時間');
 return {from,to,timezone:'Asia/Taipei'};
}
// Most recent prior Monday–Friday calendar day, at 07:00 in Taipei.
function defaultAutoRange(now=Date.now()){
 const day=new Date(now+28800000);day.setUTCHours(7,0,0,0);
 do{day.setUTCDate(day.getUTCDate()-1);}while([0,6].includes(day.getUTCDay()));
 return {from:day.getTime()-28800000,to:now,timezone:'Asia/Taipei'};
}
function parseAutoHash(hash,now=Date.now()){
 const p=new URLSearchParams(hash.replace(/^#/,''));if(p.get('teams-export')!=='all')return null;
 const defaults=defaultAutoRange(now),range=makeRange({from:p.get('from')||new Date(defaults.from).toISOString(),to:p.get('to')||new Date(now).toISOString()});
 const format=p.get('format')||'zip';if(!['zip','txt','json','csv','html'].includes(format))throw Error('不支援的匯出格式');
 return {scope:'all',mode:'range',from:new Date(range.from).toISOString(),to:new Date(range.to).toISOString(),format,autodownload:p.get('autodownload')==='1'};
}
function skipBeforeRange(job,c){return job.scope==='all'&&job.mode==='range'&&knownTime(c.latest)&&Date.parse(c.latest)<job.range.from;}
function current(){
 const pane=readPane();
 if(!pane.headerId)throw Error('請先開啟一個 Teams 聊天；此版本略過頻道');
 return {key:pane.headerId.slice('chat-header-'.length),name:pane.title||'未命名聊天',type:'chat'};
}
let verifiedProfile=null;
const emailFrom=text=>text?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase()||null;
function profile(){const trigger=document.querySelector('[data-tid="me-control-avatar-trigger"]');const avatar=document.querySelector('[data-tid="me-control-avatar"]');return {trigger,fingerprint:(avatar?.getAttribute('aria-label')||'')+'|'+(trigger?.innerText||'')};}
function account(){
 const p=profile();if(!p.trigger||!p.trigger.getClientRects().length)return null;
 const dialog=document.querySelector('[data-tid="me-control-menu-dialog"]');
 const email=emailFrom(p.trigger.getAttribute('aria-label'))||(dialog?.getClientRects().length?emailFrom(dialog.innerText):null);
 if(email){verifiedProfile={...p,email};return email;}
 return verifiedProfile?.trigger===p.trigger&&verifiedProfile.fingerprint===p.fingerprint?verifiedProfile.email:null;
}
async function identify(){
 const p=profile();if(!p.trigger)throw Error('請先登入 Teams 並等待聊天介面載入');
 const direct=emailFrom(p.trigger.getAttribute('aria-label'));if(direct){verifiedProfile={...p,email:direct};return direct;}
 const alreadyOpen=!!document.querySelector('[data-tid="me-control-menu-dialog"]')?.getClientRects().length;
 if(!alreadyOpen)p.trigger.click();
 try{for(let i=0;i<25;i++){const dialog=document.querySelector('[data-tid="me-control-menu-dialog"]');const email=dialog?.getClientRects().length?emailFrom(dialog.innerText):null;if(email){verifiedProfile={...profile(),email};return email;}await new Promise(r=>setTimeout(r,200));}throw Error('無法從帳號面板確認登入帳號');}
 finally{if(!alreadyOpen&&document.querySelector('[data-tid="me-control-menu-dialog"]')?.getClientRects().length)p.trigger.click();}
}
function matches(c,query){return [...document.querySelectorAll(query)].filter(e=>e.getClientRects().length);}
function tree(){return matches(null,'[role="tree"]')[0];}
function item(value){return [...document.querySelectorAll('[role="treeitem"]')].find(e=>e.getAttribute('data-fui-tree-item-value')===value);}
function expand(value){const e=item(value);if(!e)throw Error('清單資料夾已變更');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true}));}
function buttonText(e){return (e.getAttribute('aria-label')||e.innerText||'').trim();}
const stopped=()=>Object.assign(Error('已停止，可續抓'),{stopped:true});
function prepare(input={}){
 if(!validHost(location.hostname))throw Error('此網頁不是支援的 Teams 網址');
  const a=account();if(!a)throw Error('請先登入 Teams 並等待聊天介面載入');
  if(!['current','all'].includes(input.scope||'all')||!['range','visible','history'].includes(input.mode||'range'))throw Error('不支援的掃描範圍');
  const mode=input.mode||'range',scope=mode==='range'?(input.scope||'all'):'current';
  const initial=scope==='current'?[current()]:[];
 return {a,mode,scope,initial,range:makeRange(input)};
}
class Scanner{
 constructor({save=async()=>{},delay=900,maxSteps=2000,onUpdate=()=>{},loginTimeout=600000,captureProvider=null,mediaStore=null}={}){Object.assign(this,{save,delay,maxSteps,onUpdate,loginTimeout,captureProvider});this.mediaStore=mediaStore||(root.TeamsChatImages?new root.TeamsChatImages.MediaStore():null);this.job=null;this.running=false;this.cancelled=false;this.sequence=0;}
 check(){if(this.cancelled)throw stopped();}
 async wait(){this.check();await new Promise(r=>setTimeout(r,this.delay));this.check();}
 summary(){if(!this.job)return null;const j=this.job;return {id:j.id,status:j.status,stage:j.stage,range:j.range,scope:j.scope,mode:j.mode,account:j.account,conversations:j.conversations.map(c=>({key:c.key,name:c.name,status:c.status,count:this.selected(c).length,warnings:c.warnings,error:c.error,latest:c.latest,skipReason:c.skipReason})),count:j.conversations.reduce((n,c)=>n+this.selected(c).length,0),captureImages:j.captureImages,imageCount:j.conversations.reduce((n,c)=>n+this.selected(c).reduce((sum,m)=>sum+(m.images||[]).filter(i=>i.status==='saved').length,0),0),warnings:j.warnings,error:j.error,updated:j.updated};}
 async persist(){if(!this.job)return;this.job.updated=Date.now();this.onUpdate(this.summary());await this.save(this.job);}
 selected(c){return c.messages.filter(m=>m.timestamp===null || this.job.mode==='history'||(m.timestamp>=this.job.range.from&&m.timestamp<this.job.range.to));}
 async auth(){
  const end=Date.now()+this.loginTimeout;
  while(Date.now()<end){this.check();let a=account();if(!a&&profile().trigger){try{a=await identify();}catch{}}if(a){if(a!==this.job.account)throw Error('登入帳號與此匯出不同，已停止');if(this.job.status==='waiting-login'){this.job.status='running';await this.persist();}return;}
   if(this.job.status!=='waiting-login'){this.job.status='waiting-login';await this.persist();}await this.wait();
  }throw Error('等待登入逾時，進度已保留');
 }
 async start(input={}){
  if(this.running)throw Error('已有掃描正在執行');
  this.running=true;this.cancelled=false;
  let prepared;try{await identify();this.check();prepared=prepare(input);if(input.captureImages&&!this.captureProvider)throw Error('請先啟用圖片擷取，並選擇此 Teams 分頁');}catch(e){this.running=false;throw e;}
  const {a,mode,scope,initial,range}=prepared;
  const conversations=initial.map(c=>this.newConversation(c));
  this.job={version:2,id:crypto.randomUUID(),created:Date.now(),account:a,range,scope,mode,captureImages:!!input.captureImages,status:'running',stage:'準備中',discovery:{status:'pending'},warnings:['僅掃描網頁可列舉的聊天；隱藏／封存內容可能不在清單中。','所有頻道依需求排除。'],conversations};
  await this.execute();return this.job;
 }
 newConversation(c){return {...c,status:'pending',messages:[],warnings:[],traversal:{},attempts:0};}
 async resume(job,options={}){
  if(this.running)throw Error('已有掃描正在執行');
  if(!job||job.version!==2)throw Error('沒有可續抓的工作');
  this.running=true;this.cancelled=false;
  try{await identify();this.check();if(account()!==job.account)throw Error('目前登入帳號與進度不同');if((job.captureImages||options.captureImages)&&!this.captureProvider)throw Error('原工作需要圖片擷取，請啟用並選擇此 Teams 分頁後續抓');}catch(e){this.running=false;throw e;}
  this.job=structuredClone(job);if(options.captureImages&&!this.job.captureImages){this.job.captureImages=true;for(const c of this.job.conversations)if(c.status==='complete')c.status='pending';}await this.execute();return this.job;
 }
 stop(){this.cancelled=true;}
 async rail(){
  const buttons=matches(null,'[data-tid="app-bar-wrapper"] button');
  const chat=buttons.find(e=>/^(Chat|聊天)$/i.test(buttonText(e)));
  if(chat)chat.click();
  for(let i=0;i<40&&!tree();i++)await this.wait();
  if(!tree())throw Error('找不到聊天清單，可能尚未載入或 Teams 已改版');
  const filters=matches(null,'[role="toolbar"] [role="checkbox"][aria-checked="true"], [role="toolbar"] [aria-pressed="true"]');
  for(const f of filters)if(/^(Unread|Chats|Meeting chats|未讀|聊天|會議聊天|未读|会议聊天)$/i.test(buttonText(f))){f.click();await this.wait();}
  const search=matches(null,'input').find(e=>/^(Filter by name|依名稱篩選|按名称筛选)$/i.test(e.getAttribute('placeholder')||''));
  if(search?.value)throw Error('請先清除聊天清單的名稱篩選再掃描');
  tree().scrollTop=0;await this.wait();
 }
 async discover(){
  await this.rail();let previous='',stable=0;const expanded=new Set();
  for(let n=0;n<this.maxSteps;n++){
   await this.auth();const r=readRail();if(r.filtered?.length)throw Error('清單仍有啟用中的篩選');
   for(const c of r.items){const existing=this.job.conversations.find(x=>x.key===c.key);if(existing){existing.name=c.name;if(c.latest)existing.latest=c.latest;}else this.job.conversations.push(this.newConversation(c));}
   this.job.stage=`列舉聊天：${this.job.conversations.length} 個`;await this.persist();
   const folder=r.folders.find(v=>!expanded.has(v));
   if(folder){expanded.add(folder);expand(folder);await this.wait();if(item(folder)?.getAttribute('aria-expanded')==='false')throw Error('無法展開聊天資料夾');continue;}
   if(r.moreValues?.length){const e=item(r.moreValues[0]);e.scrollIntoView({block:'nearest'});e.click();await this.wait();continue;}
   if(r.moreLabels?.length){const e=matches(null,'[role="tree"] button,[role="tree"] [role="treeitem"]').find(e=>e.innerText.trim()===r.moreLabels[0]);if(!e)throw Error('無法展開更多聊天');e.click();await this.wait();continue;}
   const signature=JSON.stringify([r.items.map(x=>x.key),r.top,r.bottom]);
   stable=!r.loading&&r.bottom!==null&&r.bottom<=2&&signature===previous?stable+1:0;
   if(stable>=4){this.job.discovery={status:this.job.conversations.length?'complete':'partial',boundary:'observed-stable-bottom'};return;}
   previous=signature;tree().scrollTop+=tree().clientHeight*.7;await this.wait();
  }this.job.discovery={status:'partial',warning:'列舉達到捲動上限，可能有未發現聊天'};
 }
 async open(c){
  await this.rail();let previous='',stable=0;
  for(let n=0;n<this.maxSteps;n++){
   await this.auth();const r=readRail(),found=r.items.find(x=>x.key===c.key);
   if(found){item(found.value).click();for(let i=0;i<40;i++){await this.wait();const p=readPane();if(p.headerId==='chat-header-'+c.key&&p.viewport)return;}throw Error('聊天訊息未載入');}
   if(r.folders[0]){expand(r.folders[0]);await this.wait();continue;}
   if(r.moreValues?.length){const e=item(r.moreValues[0]);e.scrollIntoView({block:'nearest'});e.click();await this.wait();continue;}
   const signature=JSON.stringify([r.items.map(x=>x.key),r.top,r.bottom]);stable=r.bottom<=2&&signature===previous?stable+1:0;if(stable>=4)break;
   previous=signature;tree().scrollTop+=tree().clientHeight*.7;await this.wait();
  }throw Error('此聊天已不在可讀取清單中');
 }
 async capture(c){
  await this.auth();
  if(readPane().headerId!=='chat-header-'+c.key)throw Error('聊天已切換；停止以免混入其他聊天');
  for(let i=0;i<50;i++){
   const more=matches(null,'[id^="message-body-"] button').find(e=>/^(see more|read more|show more|顯示更多|查看更多|閱讀更多|展开|展開)$/i.test(buttonText(e)));
   if(!more)break;more.click();await this.wait();
  }
  const raw=readMessages(),pane=readPane();
  if(pane.replies)c.warnings.push('此聊天含獨立討論串，尚未展開，結果部分完成');
  for(const m of raw){
   const time=knownTime(m.time)?Date.parse(m.time):null;
   const identity=m.id?'id:'+m.id:'uncertain:'+this.job.id+':'+(++this.sequence);
   const converted={id:m.id,key:identity,sender:m.author||'作者不明',authorMissing:!m.author,timestamp:time,rawTime:m.rawTime,text:m.text,attachments:m.links||[],parent:m.parent,quote:m.quote,uncertainIdentity:!m.id};
   const old=c.messages.find(x=>x.key===identity);
   converted.images=(m.images||[]).map(image=>{const prior=old?.images?.find(x=>x.index===image.index&&x.identity===image.identity&&x.url===image.url);return prior?{...image,...prior}:{...image,status:'link-only'};});
   if(old)Object.assign(old,converted);else c.messages.push(converted);
   if(m.truncated)c.warnings.push('部分訊息未展開全文');
   if(!m.id)c.warnings.push('部分訊息沒有穩定識別值，保留可能重複的紀錄');
  }
  if(this.job.captureImages)await this.captureImages(c,raw);
  c.warnings=[...new Set(c.warnings)];await this.persist();return {raw:readMessages(),pane:readPane()};
 }
 async captureImages(c,raw){
  if(!root.TeamsChatImages||!this.mediaStore)throw Error('圖片模組尚未載入，請更新後重新整理');
  for(const item of raw){
   const m=item.id?c.messages.find(x=>x.id===item.id):c.messages.find(x=>x.text===item.text&&x.sender===(item.author||'作者不明'));
   if(!m||!this.selected(c).includes(m))continue;
   const body=document.getElementById('message-body-'+item.id);if(!body)continue;
   const elements=root.TeamsChatImages.candidates(body);
   for(const image of m.images||[]){
    this.check();if(image.status==='saved')continue;
    const e=elements[image.index];if(!e)continue;const r=e.getBoundingClientRect(),view=this.viewport().getBoundingClientRect();if(r.bottom<=view.top||r.top>=view.bottom)continue;
    this.job.stage=`保存圖片：${c.name} / ${m.id||'未識別訊息'} / ${image.index+1}`;
    const check=()=>{this.check();if(readPane().headerId!=='chat-header-'+c.key)throw Error('聊天已切換；停止以免混入其他聊天');};
    try{check();const {blob,method}=await root.TeamsChatImages.capture(e,this.captureProvider,check);check();const file=await root.TeamsChatImages.filename(c.key,m.key,image.index);await this.mediaStore.put(this.job.id,file,blob);Object.assign(image,{file,status:'saved',method,bytes:blob.size,error:null});}
    catch(error){Object.assign(image,{status:'failed',error:error.message});if(error.stopped||error.captureUnavailable||/已切換/.test(error.message))throw error;}
    await this.persist();
   }
  }
 }
 viewport(){const e=matches(null,'[data-tid="message-pane-list-viewport"]')[0];if(!e)throw Error('找不到聊天捲動區');return e;}
 async scan(c){
  if(this.job.mode==='visible'){
   const {pane}=await this.capture(c);c.status='partial';c.warnings.push('只讀取目前已載入畫面，未掃描全部歷史');c.traversal={snapshot:true};return;
  }
  let previous='',stable=0,bottom=false,lower=false;
  for(let i=0;i<this.maxSteps;i++){
   const {raw,pane}=await this.capture(c);const signature=JSON.stringify([raw.map(m=>m.id||m.text),pane.bottom]);
   stable=!pane.busy&&pane.bottom!==null&&pane.bottom<=2&&signature===previous?stable+1:0;
   if(stable>=3){bottom=true;c.traversal.upper='observed-stable-bottom';break;}
   previous=signature;this.viewport().scrollTop=this.viewport().scrollHeight;await this.wait();
  }
  previous='';stable=0;
  for(let i=0;i<this.maxSteps;i++){
   const {raw,pane}=await this.capture(c),dated=raw.filter(m=>knownTime(m.time));
   const ordered=dated.every((m,i)=>!i||Date.parse(dated[i-1].time)<=Date.parse(m.time));
   // System events and grouped messages may lack datetime. Keep them as unknown,
   // but do not let them prevent the dated, ordered timeline reaching its boundary.
   if(this.job.mode==='range'&&!pane.busy&&ordered&&dated.some(m=>Date.parse(m.time)<this.job.range.from)){lower=true;c.traversal.lower='crossed-range-start';break;}
   if(!pane.busy&&(pane.startMarker||pane.empty)){lower=true;c.traversal.lower=pane.empty?'explicit-empty':'explicit-start';break;}
   const signature=JSON.stringify([raw.map(m=>m.id||m.text),pane.top]);stable=!pane.busy&&pane.top!==null&&pane.top<=2&&signature===previous?stable+1:0;
   if(stable>=4){c.traversal.lower='observed-stable-top';c.warnings.push('頂部已穩定，但沒有明確歷史起始標記，無法確認更早內容完整載入');break;}
   previous=signature;this.viewport().scrollTop-=this.viewport().clientHeight*.65;await this.wait();
  }
  if(this.job.captureImages&&this.selected(c).some(m=>(m.images||[]).some(image=>image.status!=='saved')))c.warnings.push('部分圖片未保存，TXT 已保留連結與原因；可啟用圖片擷取後續抓');
  if(!bottom)c.warnings.push('未確認最新訊息的底部邊界');
  if(!lower&&!c.traversal.lower)c.warnings.push('尚未覆蓋開始時間，達到捲動上限');
  if(c.messages.some(m=>m.timestamp===null))c.warnings.push('部分紀錄缺少完整時間，未判定是否在範圍內');
  if(c.messages.some(m=>m.authorMissing))c.warnings.push('部分紀錄缺少作者');
  c.warnings=[...new Set(c.warnings)];
  if(c.traversal.lower==='crossed-range-start')c.reason='stopped early: reached messages older than range';
  const rangeCovered=bottom&&c.traversal.lower==='crossed-range-start';
  const blocking=c.warnings.filter(w=>!w.startsWith('部分紀錄缺少完整時間')&&!(rangeCovered&&w==='部分紀錄缺少作者'));
  c.status=bottom&&lower&&!blocking.length?'complete':'partial';
 }
 async execute(){
  this.running=true;this.cancelled=false;this.job.status='running';this.job.error=null;
  try{
   await this.persist();
   if(this.job.scope==='all')await this.discover();else this.job.discovery={status:'complete',scope:'current'};
   for(let i=0;i<this.job.conversations.length;i++){
    this.check();const c=this.job.conversations[i];if(c.status==='complete')continue;
    if(skipBeforeRange(this.job,c)){c.status='skipped';c.skipReason='skipped: last activity before range';c.error=c.skipReason;await this.persist();continue;}
    if(c.status==='skipped'){c.status='pending';c.skipReason=null;}
    this.job.stage=`${i+1}/${this.job.conversations.length}：${c.name}`;
    c.status='running';c.error=null;c.warnings=[];await this.persist();
    for(let attempt=0;attempt<3;attempt++){
     c.attempts++;
     try{
      if(this.job.scope==='all')await this.open(c);else if(current().key!==c.key)throw Error('請回到原本的聊天再續抓');
      await this.scan(c);c.error=null;break;
     }catch(e){c.status='failed';c.error=e.message;await this.persist();if(e.stopped||e.captureUnavailable||/帳號|已切換|原本的聊天/.test(e.message))throw e;if(attempt<2)await this.wait();}
    }await this.persist();
   }
   this.job.status=this.job.discovery.status==='complete'&&this.job.conversations.length&&this.job.conversations.every(c=>['complete','skipped'].includes(c.status))?'complete':'partial';this.job.stage='掃描結束';await this.persist();
  }catch(e){this.job.status=e.stopped?'interrupted':'failed';this.job.error=e.message;try{await this.persist();}catch{};}
  finally{this.running=false;this.onUpdate(this.summary());}
 }
}
root.TeamsChatUtils={Scanner,parseDate,makeRange,defaultAutoRange,parseAutoHash,skipBeforeRange,validHost,current,account,identify,prepare};
})(globalThis);

/* Shared by the popup and standalone userscript. */
(function(root){
'use strict';
const time=value=>value===null?'時間不明':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value))+' +08:00';
function exportObject(job){
 const conversations=job.conversations.map(c=>({...c,messages:c.messages.filter(m=>m.timestamp===null||job.mode==='history'||(m.timestamp>=job.range.from&&m.timestamp<job.range.to)).sort((a,b)=>(a.timestamp??Infinity)-(b.timestamp??Infinity)||a.key.localeCompare(b.key))}));
 return {...job,note:'僅反映已載入網頁的掃描結果；時間不明訊息未確認是否在指定範圍內。',conversations,messageCount:conversations.reduce((n,c)=>n+c.messages.length,0)};
}
function text(job){
 const j=exportObject(job),lines=['Teams 聊天匯出',`狀態：${j.status}`,`範圍：${time(j.range.from)} ≤ 訊息時間 < ${time(j.range.to)}`,`模式：${j.mode}；${j.messageCount} 則（含時間不明紀錄）`,j.note,...j.warnings,j.discovery.warning||'',j.error||'',''];
 if(j.mode==='history')lines.push('本次匯出目前聊天全部可讀取歷史，不套用時間範圍。','');
 for(const c of j.conversations){
  lines.push(`=== ${c.name} ===`,`狀態：${c.status}`,...c.warnings,c.error||'','');
  for(const m of c.messages){lines.push(`[${time(m.timestamp)}] ${m.sender}`,m.text);
   if(m.parent)lines.push('回覆目標：'+m.parent);else if(m.quote)lines.push('引用原文：'+m.quote);
   if(m.timestamp===null)lines.push('[時間不明：未判定是否位於範圍內] 原始時間：'+(m.rawTime||'頁面未提供'));
   if(m.uncertainIdentity)lines.push('[識別不確定，可能重複]');
   for(const image of m.images||[]){if(image.status==='saved'&&image.file)lines.push('圖片檔案：'+image.file);else lines.push('圖片未保存：'+(image.error||'尚未擷取'));if(image.url)lines.push('圖片連結：'+image.url);}
   for(const a of m.attachments||[])lines.push('連結／附件：'+(a.text||'')+' '+(a.url||''));lines.push('');
  }
 }return lines.join('\n');
}
function compactText(message){
 let value=String(message.text||''),reply=!!(message.quote||message.parent);
 value=value.replace(/引用原文[：:]?\s*Begin quote[\s\S]*?End quote/gi,()=>{reply=true;return '';});
 value=value.replace(/Begin quote[\s\S]*?End quote/gi,()=>{reply=true;return '';});
 value=value.split(/\r?\n/).filter((line,index,lines)=>{
  if(/^\s*引用原文[：:]/.test(line)||(/^\s*.{1,80}?\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[AP]M\b/i.test(line)&&lines.slice(index+1).some(s=>s.trim()))){reply=true;return false;}return true;
 }).join(' ');
 // Teams copied reply headers repeat the author, date and quoted text.
 value=value.replace(/^(?:\s*[^\n]{1,80}?\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[AP]M\s+)([\s\S]*)$/i,(_,rest)=>{reply=true;return message.quote?rest.replace(message.quote,''):rest;});
 value=value.replace(/\s+/g,' ').trim();if(value.length>300)value=value.slice(0,299)+'…';
 return (reply?'↩ ':'')+value+((message.images||[]).length?' [img]':'');
}
function compact(job){
 const j=exportObject(job),cs=j.conversations,inRange=m=>Number.isFinite(m.timestamp)&&m.timestamp>=j.range.from&&m.timestamp<j.range.to;
 const active=cs.filter(c=>c.messages.some(inRange));let images={saved:0,missing:0};
 for(const c of cs)for(const m of c.messages)for(const i of m.images||[])images[i.status==='saved'?'saved':'missing']++;
 images=j.imageReport||images;
 const duration=Math.max(0,((j.updated||j.created)-j.created)/60000);
 const lines=[`status=${j.status} chats scanned=${cs.filter(c=>c.attempts>0||['complete','partial','failed','running'].includes(c.status)).length} skipped=${cs.filter(c=>c.status==='skipped').length} active=${active.length} in-range msgs=${cs.reduce((n,c)=>n+c.messages.filter(inRange).length,0)} no-time=${cs.reduce((n,c)=>n+c.messages.filter(m=>m.timestamp===null).length,0)} partial chats=${cs.filter(c=>c.status==='partial').length} images saved=${images.saved} missing=${images.missing} duration=${Number.isFinite(duration)?duration.toFixed(1):'0.0'} min`];
 for(const c of active){lines.push('',`## ${String(c.name).replace(/\s+/g,' ')}`);for(const m of c.messages.filter(inRange)){const t=time(m.timestamp);lines.push(`${t.slice(5,10).replace('-','/')} ${t.slice(11,16)} ${String(m.sender||'作者不明').replace(/\s+/g,' ')}: ${compactText(m)}`);}}
 return lines.join('\n');
}
function csv(job){
 const quote=s=>'"'+String(s??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const rows=[['Chat','Time (Asia/Taipei)','Sender','Text','Attachments','Reply','Status']];
 for(const c of exportObject(job).conversations)for(const m of c.messages)rows.push([c.name,time(m.timestamp),m.sender,m.text,(m.attachments||[]).map(a=>(a.text||'')+' '+(a.url||'')).join('\n'),m.parent||m.quote||'',c.status]);
 return '\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n');
}
function html(job){const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');return '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Teams 聊天匯出</title><style>body{font:15px system-ui;max-width:1000px;margin:30px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}</style><pre>'+esc(text(job))+'</pre></html>';}
function format(job,type){if(!job)throw Error('尚無匯出資料');switch(type){case 'json':return JSON.stringify(exportObject(job),null,2);case 'csv':return csv(job);case 'html':return html(job);default:return text(job);}}
root.TeamsChatFormats={format,exportObject,time,compact,compactText};
})(globalThis);

/* Small ZIP writer (stored entries, UTF-8 names, CRC32). No network or third-party runtime. */
(function(root){
'use strict';
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function header(size){const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);return {bytes,u16:(p,n)=>view.setUint16(p,n,true),u32:(p,n)=>view.setUint32(p,n,true)};}
async function zip(entries){
 const chunks=[],central=[];let offset=0,centralSize=0;
 if(entries.length>65535)throw Error('檔案數超過 ZIP 上限，請縮小匯出時間範圍');
 for(const {name,data}of entries){if(!name||name.startsWith('/')||name.split('/').includes('..'))throw Error('無效 ZIP 檔名');
  const filename=new TextEncoder().encode(name),bytes=data instanceof Blob?new Uint8Array(await data.arrayBuffer()):new TextEncoder().encode(String(data));if(filename.length>65535||bytes.length>0xffffffff||offset+bytes.length+filename.length+30>0xffffffff)throw Error('ZIP 超過 4GB，請縮小時間範圍');
  const checksum=crc(bytes),local=header(30);local.u32(0,0x04034b50);local.u16(4,20);local.u16(6,0x800);local.u16(12,33);local.u32(14,checksum);local.u32(18,bytes.length);local.u32(22,bytes.length);local.u16(26,filename.length);
  chunks.push(local.bytes,filename,bytes);
  const dir=header(46);dir.u32(0,0x02014b50);dir.u16(4,20);dir.u16(6,20);dir.u16(8,0x800);dir.u16(14,33);dir.u32(16,checksum);dir.u32(20,bytes.length);dir.u32(24,bytes.length);dir.u16(28,filename.length);dir.u32(42,offset);central.push(dir.bytes,filename);centralSize+=46+filename.length;offset+=30+filename.length+bytes.length;
 }
 const end=header(22);end.u32(0,0x06054b50);end.u16(8,entries.length);end.u16(10,entries.length);end.u32(12,centralSize);end.u32(16,offset);return new Blob([...chunks,...central,end.bytes],{type:'application/zip'});
}
async function build(job,store){
 const j=structuredClone(root.TeamsChatFormats.exportObject(job)),entries=[],seen=new Set();let saved=0,missing=0;
 if(!j.captureImages)j.warnings.push('此工作未啟用圖片保存；ZIP 只包含文字與原有連結。若需圖片，請啟用圖片擷取後按續抓或重新掃描。');
 for(const c of j.conversations)for(const m of c.messages)for(const image of m.images||[]){
  if(image.status==='saved'&&image.file&&!seen.has(image.file)){
   const blob=await store.get(j.id,image.file);if(blob){entries.push({name:image.file,data:blob});seen.add(image.file);saved++;}
   else{image.status='missing';image.error='本機圖片快取已不存在，需啟用圖片後重新掃描';missing++;c.status='partial';}
  }else if(image.status!=='saved'&&j.captureImages)missing++;
 }
 j.imageReport={saved,missing};if(missing){j.status='partial';j.warnings.push(`${missing} 張圖片未保存，請查看各訊息的圖片連結與原因。`);}
 entries.unshift({name:'compact.txt',data:root.TeamsChatFormats.compact(j)},{name:'chat.txt',data:root.TeamsChatFormats.format(j,'txt')},{name:'report.json',data:JSON.stringify(j,null,2)});
 return zip(entries);
}
root.TeamsChatArchive={zip,build};
})(globalThis);

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
 node('button',{id:'download'},'下載目前結果'),node('p',{id:'status'},'預設最近 24 小時'),
 node('small',{},'掃描可能將聊天標為已讀。請勿切換此分頁的聊天；重新整理後可續抓。資料只存於本機 userscript 儲存空間。')
));
const $=id=>shadow.getElementById(id),local=t=>new Date(t+28800000).toISOString().slice(0,19);
$('from').value=local(Date.now()-86400000);$('to').value=local(Date.now());
const mediaStore=new TeamsChatImages.MediaStore();
const captureSession=new TeamsChatImages.TabCapture({hide:()=>{const previous=[host.style.visibility,launcher.style.visibility];host.style.visibility='hidden';launcher.style.visibility='hidden';return ()=>{host.style.visibility=previous[0];launcher.style.visibility=previous[1];};},onState:ready=>{$('enableImages').textContent=ready?'圖片擷取已啟用':'啟用圖片擷取（需要時）';}});
const scanner=new TeamsChatUtils.Scanner({mediaStore,captureProvider:captureSession,save:job=>GM_setValue(key,job),onUpdate:s=>{$('status').textContent=`${s.status}：${s.stage}\n${s.conversations.length} 個聊天，${s.count} 則，已保存圖片 ${s.imageCount||0} 張\n${s.error||''}`;for(const id of ['start','history','resume','enableImages','saveImages'])$(id).disabled=scanner.running;if(!scanner.running)captureSession.stop();}});
$('enableImages').onclick=async()=>{try{await captureSession.enable();$('status').textContent='圖片擷取已啟用，現在可以開始掃描。';}catch(e){$('status').textContent='無法啟用圖片擷取：'+e.message;}};
window.addEventListener('pagehide',()=>captureSession.stop());
launcher.onclick=()=>{host.style.display=host.style.display==='none'?'block':'none';};$('close').onclick=()=>host.style.display='none';
const run=mode=>scanner.start({scope:$('scope').value,mode,from:$('from').value,to:$('to').value,captureImages:$('saveImages').checked}).catch(e=>$('status').textContent=e.message);
$('start').onclick=()=>run('range');$('history').onclick=()=>run('history');$('stop').onclick=()=>scanner.stop();
$('resume').onclick=async()=>{try{const job=scanner.job||await GM_getValue(key,null);await scanner.resume(job,{captureImages:$('saveImages').checked});}catch(e){$('status').textContent=e.message;}};
async function download(type){try{const job=scanner.job||await GM_getValue(key,null);const blob=type==='zip'?await TeamsChatArchive.build(job,mediaStore):new Blob([TeamsChatFormats.format(job,type)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`teams-chat-${new Date(job.created).toISOString().slice(0,10)}.${type}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),120000);}catch(e){$('status').textContent=e.message;}}
$('download').onclick=()=>download($('format').value);
let autoPending=false;
async function autoRun(options,consumeHash=false){
 if(autoPending||scanner.running)return;autoPending=true;host.style.display='block';
 try{
  $('status').textContent='自動匯出：等待 Teams 聊天介面／登入…';
  const end=Date.now()+600000;
  while(true){
   if(Date.now()>end)throw Error('等待 Teams 聊天介面逾時');
   const profile=document.querySelector('[data-tid="me-control-avatar-trigger"]');
   if(profile?.getClientRects().length&&document.querySelector('[role="tree"],[data-tid="app-bar-wrapper"]')){try{await TeamsChatUtils.identify();break;}catch{}}
   await new Promise(r=>setTimeout(r,500));
  }
  if(scanner.running)return;
  if(consumeHash)history.replaceState(history.state,'',location.pathname+location.search);
  $('scope').value='all';$('from').value=local(Date.parse(options.from));$('to').value=local(Date.parse(options.to));$('format').value=options.format;
  // Automatic runs use local DOM image capture; never request screen sharing here.
  const previous=scanner.job;
  try{await scanner.start({...options,captureImages:$('saveImages').checked});}
  finally{if(options.autodownload&&scanner.job&&scanner.job!==previous)await download(options.format);}
 }catch(e){$('status').textContent=e.message;}finally{autoPending=false;}
}
function hashTrigger(){try{const options=TeamsChatUtils.parseAutoHash(location.hash);if(options)void autoRun(options,true);}catch(e){host.style.display='block';$('status').textContent=e.message;}}
window.addEventListener('hashchange',hashTrigger);
// Alt+Shift+E: previous weekday 07:00 Taipei through now, all chats, ZIP download.
window.addEventListener('keydown',event=>{if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.code==='KeyE'&&!event.repeat&&!event.isComposing){event.preventDefault();const r=TeamsChatUtils.defaultAutoRange();void autoRun({scope:'all',mode:'range',from:new Date(r.from).toISOString(),to:new Date(r.to).toISOString(),format:'zip',autodownload:true});}});
hashTrigger();
})();
