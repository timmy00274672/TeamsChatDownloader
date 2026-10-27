/* Capture only the sending Teams tab. Full frames are cropped in memory and never stored or returned. */
'use strict';
let queue=Promise.resolve(),last=0;
const hostAllowed=url=>{try{return ['teams.cloud.microsoft','teams.microsoft.com','teams.live.com'].includes(new URL(url).hostname);}catch{return false;}};
async function captureImage(sender,r){
 const tab=sender.tab;if(!tab||!hostAllowed(sender.url)||sender.frameId!==0)throw Error('不支援的擷取來源');
 if(!r||!['x','y','width','height','viewWidth','viewHeight'].every(k=>Number.isFinite(r[k]))||r.width<1||r.height<1||r.x<0||r.y<0||r.x+r.width>r.viewWidth+1||r.y+r.height>r.viewHeight+1)throw Error('無效的圖片範圍');
 const active=async()=>{const [current]=await chrome.tabs.query({active:true,windowId:tab.windowId});if(current?.id!==tab.id||!hostAllowed(current.url))throw Error('請保持正在匯出的 Teams 分頁在前景，再續抓圖片');};
 await active();await new Promise(resolve=>setTimeout(resolve,Math.max(0,650-(Date.now()-last))));await active();last=Date.now();
 const data=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});await active();
 const raw=atob(data.split(',')[1]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
 try{const sx=bitmap.width/r.viewWidth,sy=bitmap.height/r.viewHeight,width=Math.round(r.width*sx),height=Math.round(r.height*sy);if(width*height>24000000)throw Error('圖片畫面超過大小上限');
  const canvas=new OffscreenCanvas(width,height);canvas.getContext('2d').drawImage(bitmap,r.x*sx,r.y*sy,r.width*sx,r.height*sy,0,0,width,height);
  const blob=await canvas.convertToBlob({type:'image/png'}),out=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<out.length;i+=32768)binary+=String.fromCharCode(...out.subarray(i,i+32768));return {ok:true,dataURL:'data:image/png;base64,'+btoa(binary)};
 }finally{bitmap.close();}
}
chrome.runtime.onMessage.addListener((request,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||request.action!=='capture-image')return;
 const task=queue.then(()=>captureImage(sender,request.rect));queue=task.catch(()=>{});task.then(respond).catch(e=>respond({ok:false,error:e.message}));return true;
});
