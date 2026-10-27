const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const header=`// ==UserScript==
// @name         Teams Chat Downloader (DOM local)
// @namespace    https://github.com/rahulmasal/TeamsChatDownloader
// @version      1.4.1
// @description  Local DOM-only chat export with date ranges, batching and checkpoints.
// @author       Rahul Masal; local adaptation
// @match        https://teams.microsoft.com/*
// @match        https://teams.cloud.microsoft/*
// @match        https://teams.live.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==
`;
const source=['images.js','dom.js','shared-utils.js','export-formats.js','archive.js','scripts/userscript-panel.js'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
fs.writeFileSync(path.join(root,'tampermonkey/teams-chat-downloader.user.js'),header+'\n'+source);
console.log('Built standalone userscript from the same tested DOM engine.');
