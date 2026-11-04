# Teams Chat Downloader — 本機 DOM 修正版

以 [rahulmasal/TeamsChatDownloader](https://github.com/rahulmasal/TeamsChatDownloader) 為基礎修正，保留 Chrome 擴充套件、單檔 Tampermonkey 及 TXT／JSON／CSV／HTML 匯出形式。**本機版只讀 Teams 已載入網頁，不呼叫 Graph 或 Teams 內部 API，略過所有頻道。**

此為本機修改版，尚未送回上游，也不代表上游官方版本。

## v1.3.1：指定時段停止條件修正

- 畫面混有缺少時間的紀錄時，仍依可確認且依序排列的訊息時間判斷是否跨過開始時間，避免為此一直向前捲動。
- 缺少時間的紀錄仍保留並將結果標為部分完成，不會猜測其日期。

## v1.3：TXT 與圖片分開保存

預設勾選「保存圖片」，下載格式預設為 **ZIP：TXT＋獨立圖片**。解壓縮後包含：

```text
chat.txt
report.json
images/
  <聊天與訊息識別值>_1.png
```

TXT 每則訊息會標示 `圖片檔案：images/檔名.png` 及頁面可取得的圖片連結。圖片失敗或快取遺失會標明原因，不會把不存在的檔案當成成功。普通 TXT 選項只下載文字；需要圖片檔時請選 ZIP。

**Tampermonkey 使用方式：** 更新單檔腳本、重新整理 Teams 後，可以先直接掃描。大多數已載入的圖片可直接存下；若顯示圖片受限制，按「啟用圖片擷取（需要時）」，在 Chrome 分享選擇器中只選目前的 Teams 分頁，再按「續抓本機進度」。分享的畫面只在本機裁切，不傳送到 Teams 會議或外部服務；掃描結束／停止後會關閉擷取。

**Chrome 擴充套件：** 更新並重新載入擴充套件及 Teams 分頁，勾選圖片即可。讀取圖片受限制時使用 Chrome 的分頁畫面裁切，期間請保持正在匯出的 Teams 分頁在前景。無需新增 all_urls、相機或麥克風權限。

舊的純文字工作可勾選圖片後按續抓，工具會保留原時間範圍並重新檢查聊天以補圖片；單純下載舊工作不會自動補抓圖片。

圖片存成 PNG：能直接讀取時使用已載入像素；受限時保存顯示畫面的裁切，因此不保證取得原始檔或原始解析度，GIF／動畫只保存當下影格。檔案附件仍僅保留名稱與連結，不下載文件。

二進位圖片保存在 Teams 網站的本機 IndexedDB，文字進度只存檔名等資訊，避免大型圖片塞滿擴充套件／GM 進度。清除 Teams 網站資料可能使尚未下載的圖片快取消失；這時 ZIP 報告會標記遺失，需要重新掃描。ZIP 不透過第三方函式庫或服務產生。

## 已修正

- 加入實際使用的 `https://teams.cloud.microsoft/`，更新新版訊息內容、作者、datetime 與聊天清單的讀取方式。
- 每次捲動即累積訊息，避免 Teams 虛擬清單回收 DOM 後，只匯出最後一個畫面的內容。
- 用穩定訊息 ID 去重，保留相同文字的不同訊息；時間缺失不再填入目前時間。
- 預設最近 24 小時，可指定開始與結束；日期未帶時區時固定使用台北時間，包含開始、不含結束。
- 支援目前聊天或全部可列舉聊天，包含群組、靜音及會議聊天；展開資料夾與 See more。
- 增加停止、本機進度與續抓。單一聊天失敗最多重試三次，再繼續下一個。
- 匯出含每個聊天的完整度與錯誤，未知時間紀錄另行標示。引文、圖片描述、附件名稱及頁面可取得的連結會保留。
- 移除執行期下載 GitHub 選擇器與 Google Fonts；修正版不向第三方服務傳送訊息。

## 方式一：Chrome 擴充套件（建議）

1. 在 Chrome 開啟 `chrome://extensions/`，啟用「開發人員模式」。
2. 按「載入未封裝項目」，選取 `/Users/timchen/workspace/TeamsChatDownloader`。
3. 重新整理 Teams 網頁，開啟任一聊天。安裝前已開啟的 Teams 分頁也必須重新整理。
4. 點擴充套件圖示，選「所有聊天（略過頻道）」或「目前聊天」。
5. 確認時間後按「掃描指定時段」。完成後選 TXT，按「下載目前結果」。

也可以先用「目前已載入畫面」快速檢查格式；此模式不代表指定時段完整匯出，會明列部分完成。「目前聊天全部歷史」不套用日期範圍。

掃描工作由 Teams 分頁中的程式執行；關閉擴充套件面板不會中止。按「停止」後可下載目前結果，再按「續抓」。重新整理 Teams 後，同一分頁的本機進度可以續抓。續抓會保留原帳號與時間範圍，不採用新填入的日期。

擴充套件進度按 Chrome 分頁 ID 分開儲存在 `chrome.storage.local`。關閉分頁、重開瀏覽器、解除安裝或清除擴充套件資料後，不保證可再以原分頁續抓。跨分頁續抓與進度檔匯入不是本版功能。

## 方式二：Tampermonkey 單檔腳本

在已安裝 Tampermonkey 的 Chrome 中新增腳本，將 `tampermonkey/teams-chat-downloader.user.js` 全文貼入並儲存；重新整理 Teams 後，右下角會出現「Teams 匯出」按鈕。也可在 Tampermonkey 的匯入功能選擇這個檔案。

腳本與擴充套件使用相同掃描引擎。進度保存在這個 userscript 的本機 GM 儲存空間；關閉面板仍可掃描，重新整理後可續抓。單檔腳本一次只操作一個分頁；避免在兩個 Teams 分頁同時啟動，因為它們共用腳本進度。

**只選一種方式使用。不要同時在同一 Teams 分頁執行擴充套件和 userscript。**

## 範圍與完整度

- 支援這個帳號實際使用的新版 Teams 網頁結構。舊版介面或未驗證的 Teams Live 結構可能需要再調整；讀不到時會報錯。
- 只操作聊天清單可列舉的內容；隱藏、封存、已刪除及權限外資料不保證可取得。所有頻道排除。
- 掃描可能將聊天標為已讀。期間不要切換這個 Teams 分頁的聊天，也不要同時執行另一份掃描。日常使用可在另一個分頁進行。
- Teams 網頁本身仍會正常連線載入資料。工具不自行呼叫 Teams API、不讀取登入 token、不開啟訊息內連結、不下載文件附件、不做圖片 OCR。已載入的圖片另存 PNG，不自行請求媒體網址。
- 會議系統紀錄可能缺少作者或完整時間：這些紀錄保留並註明範圍不明，報告維持部分完成。獨立討論串尚未展開；一般引文回覆保留原文。
- 到達指定開始時間，或遇到明確歷史起始／空白標記，才有機會標為掃描完成。只有穩定捲動頂部卻無起始標記時仍為部分完成，不宣稱稽核備份完整性。
- 每階段最多捲動 2000 次，每步約 900ms；達上限會部分完成。大量聊天可能需數十分鐘。
- 本機進度可能包含指定時間外的邊界前後文。下載檔僅保留範圍內及時間不明紀錄。Chrome 本機儲存額度不足時會停止並顯示失敗，記憶體中的目前結果仍可下載；不要重新整理分頁。

## 開發與測試

測試需 Node.js、已安裝 Google Chrome，以及 Python 3（用標準 ZIP 讀取器核對壓縮檔）。安裝擴充套件或單檔腳本不需要 Node.js 或 Python。

```sh
cd /Users/timchen/workspace/TeamsChatDownloader
npm ci
npm run build
npm test
```

`dom.js` 讀取頁面；`shared-utils.js` 負責日期、批次、捲動與進度；`content.js` 連接擴充套件訊息與儲存；`export-formats.js` 提供各種格式。單檔腳本由 `npm run build` 產生，請勿直接修改生成檔。

測試使用本機模擬 Teams 頁面驗證日期邊界、DOM 回收、ID 去重、批次含靜音聊天、載入更多、局部失敗、停止與續抓、帳號變更，以及未知時間輸出；圖片測試驗證 PNG、ZIP 完整性、TXT 檔名對應、快取遺失、跨來源裁切、畫面分享中止與不同縮放比例。測試不需要登入，也不呼叫 Teams API。

原本 `graph-exporter/` 保留為上游獨立工具，**本修正版不載入、不執行該目錄**；它不是無 API 的方案。原始 README 可在 Git 歷史的上游版本查看。

沿用上游 MIT 授權，保留 LICENSE。

### Automated daily export (userscript v1.4.0)

Open Teams with `#teams-export=all&from=2026-10-26T07:00:00%2B08:00&to=2026-10-27T12:00:00%2B08:00&format=zip&autodownload=1`
appended to the URL. `from` and `to` are optional; defaults are the previous
Monday–Friday calendar day at 07:00 Asia/Taipei and now. Monday uses Friday;
Saturday and Sunday also use Friday. Encode `+` in ISO offsets as `%2B` (or use `Z`).
`format` defaults to ZIP; omit `autodownload=1` to leave the results for manual download.
The trigger waits for the Teams interface/login and consumes the hash before starting.
**Alt+Shift+E** starts the same default range, all chats, with automatic ZIP download.
The panel remains available to stop the scan; interrupted/partial jobs also download.
Automatic image capture uses the existing local capture path; restricted images may
require enabling capture manually and resuming.

All-chat range scans skip opening chats with a valid list activity time strictly
before the range start. Missing/invalid activity times are scanned normally.
Skipped chats remain in `report.json` with their status and reason. ZIPs include
`compact.txt`: Taipei timestamps, in-range messages only, condensed replies and
image markers, plus counts for skipped chats, unknown times and image results.

### v1.4.1 restart resilience

The observed idle reset is explained by the missing startup checkpoint loader in
v1.4.0: clearing the opt-in hash left no startup trigger after a script restart.
The reason Teams restarted remains an unproven hypothesis (SPA navigation or a
storage failure). Hash consumption now preserves `history.state` and any trailing
router fragment, without assigning location. Opening each chat no longer clicks
the Chat app button when its tree is already present.

Full snapshots (including messages) now live in IndexedDB alongside image blobs;
GM storage holds metadata, download intent and the latest 150 progress events.
A snapshot is committed before its GM pointer. Existing inline GM checkpoints
remain readable. Startup waits for Teams and resumes running/waiting jobs and
interrupted jobs with unfinished chats. Stop retains progress; 清除進度 abandons
the checkpoint pointer after scanning stops. Old local blobs are retained.

Errors and a five-minute no-persist watchdog retain diagnostics and attempt partial
ZIP downloads for automatic jobs. Page exit also attempts a partial download;
browsers may cancel asynchronous work during unload, so the durable checkpoint
and download after resume are the fallback. A download still depends on browser
download permissions. The panel and ZIP expose `progress-log.json`.

Verify with a synthetic chat: trigger an automatic ZIP export, reload mid-scan
once a checkpoint exists, confirm the original range and download intent resume,
then Stop and inspect the partial ZIP's report/log. Test 清除進度 after Stop and
confirm a subsequent reload stays idle. Test with image capture disabled unless
screen capture is explicitly needed; screen sharing cannot survive a reload.
