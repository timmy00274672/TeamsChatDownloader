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
