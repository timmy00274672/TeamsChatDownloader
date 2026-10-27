/* Isolated extension bridge. Checkpoints are extension-local, per browser tab. */
(function(){
'use strict';
let launching=false;
const mediaStore=new TeamsChatImages.MediaStore();
let storageKey=null,scanner=new TeamsChatUtils.Scanner({mediaStore,captureProvider:TeamsChatImages.extensionCapture(),save:async job=>{
 if(!storageKey)throw Error('缺少本機工作識別值');
 await chrome.storage.local.set({[storageKey]:job});
}});
chrome.runtime.onMessage.addListener((request,sender,respond)=>{
 if(sender.id!==chrome.runtime.id)return;
 const answer=async()=>{
  if(!Number.isInteger(request.tabId))throw Error('缺少分頁識別值');
  const key='teams-dom-job:'+request.tabId;
  if(storageKey&&storageKey!==key)throw Error('分頁識別值不符');
  storageKey=key;
  switch(request.action){
   case 'start':
    if(scanner.running||launching)throw Error('已有掃描正在執行');
    launching=true;
    try { await TeamsChatUtils.identify(); TeamsChatUtils.prepare(request.options); } finally { launching=false; }
    // Preflight completed before launching; a detached task survives popup closure.
    scanner.start(request.options).catch(error=>console.error('Teams DOM export:',error.message));
    return {ok:true};
   case 'resume':{
    if(scanner.running||launching)throw Error('已有掃描正在執行');
    launching=true;
    let saved;
    try {
    saved=scanner.job||(await chrome.storage.local.get(key))[key];
    if(!saved)throw Error('此分頁沒有可續抓的工作');
    await TeamsChatUtils.identify();
    if(TeamsChatUtils.account()!==saved.account)throw Error('登入帳號與進度不同');
    } finally { launching=false; }
    scanner.resume(saved,request.options).catch(error=>console.error('Teams DOM export:',error.message));return {ok:true};
   }
   case 'stop':scanner.stop();return {ok:true};
   case 'status':{
    const saved=scanner.job||(await chrome.storage.local.get(key))[key];
    if(!scanner.job&&saved){scanner.job=saved;if(['running','waiting-login'].includes(saved.status)){scanner.job.status='interrupted';scanner.job.error='網頁曾重新載入，請按續抓';}}
    return {ok:true,running:scanner.running||launching,summary:scanner.summary()};
   }
   case 'archive':{const job=scanner.job||(await chrome.storage.local.get(key))[key];if(!job)throw Error('尚無匯出資料');const blob=await TeamsChatArchive.build(job,mediaStore),url=URL.createObjectURL(blob);setTimeout(()=>URL.revokeObjectURL(url),120000);return {ok:true,url,filename:`teams-chat-${new Date(job.created).toISOString().slice(0,10)}.zip`};}
   case 'result':return {ok:true,job:scanner.job||(await chrome.storage.local.get(key))[key]||null};
   default:throw Error('不支援的操作');
  }
 };
 answer().then(respond).catch(error=>respond({ok:false,error:error.message}));return true;
});
})();
