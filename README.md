# JLPT N1 錯題分析 PWA

這個工具用 Google Sheet 當主要資料來源，PWA 負責讀取資料、顯示錯題分析、錯題字卡和考試日前的日期推演。

## Google Sheet 欄位

建立 Google Sheet 後，第一列請使用 `google-sheet-template.csv` 的欄位：

```text
記錄日期,考題回次,大項,題型,題號,錯誤內容,讀音/原句,正解/意思,我的答案,錯誤原因,標籤,複習狀態,下次複習日,備註
```

建議把這幾欄做成下拉選單：

- `大項`：單字語彙、文法、讀解、聽解
- `複習狀態`：未複習、已複習一次、一週後再測 OK、一週後再測錯、已掌握
- `錯誤原因`：單字不熟、漢字讀音不熟、文法句型不熟、接續判斷錯、語感混淆、看太快、定位錯誤、推論過度、聽不出關鍵字、聽到內容但來不及選、被干擾選項騙、粗心

## 連接 Google Sheet

Google Sheet 是唯一要維護的資料來源。PWA 不要求你編輯 CSV；它只是用 Google Sheet 對外提供的表格資料來產生儀表板。

PWA 只需要貼上一個 Google Sheet 連結。支援：

- Google Sheet 一般分享網址
- Google Sheet「發布到網路」產生的 CSV 連結

建議方式：

1. 建立一張 Google Sheet，第一列使用下方欄位。
2. 在 Google Sheet 維護錯題資料。
3. Google Sheet 選擇「檔案」→「共用」→「發布到網路」。
4. 把那張表的網址貼到 PWA 的「Google Sheet 連結」。
5. 之後新增錯題都在 Google Sheet 做，PWA 按右上角刷新讀取最新資料。

私人 Google Sheet 不能直接由純前端 PWA 讀取；若要維持私人權限，需要另外做 Apps Script 或 Google API OAuth。

## 儀表板功能

- 四大項錯題分布
- 錯誤原因排行
- 題型弱項排行
- 錯題字卡瀏覽
- 標記已掌握
- 大項、錯誤原因篩選

## 直接從 PWA 更新複習狀態

GitHub Pages 不能直接讀寫私人 Google Sheet，所以手機/電腦共用資料建議用 Google Apps Script Web App。PWA 會透過它讀取同一張 Sheet，也會用它寫回複習狀態。

設定方式：

1. 打開你的 Google Sheet。
2. 選「擴充功能」→「Apps Script」。
3. 把 `apps-script/Code.gs` 的內容貼進去。
4. 可選：在 Apps Script 的「專案設定」→「指令碼屬性」新增 `UPDATE_TOKEN`，值填一段你自己知道的密碼。
5. 按「部署」→「新增部署作業」→ 類型選「網頁應用程式」。
6. 執行身分選「我」，存取權選「知道連結的任何人」。
7. 複製 Web App URL，貼到 PWA 的「資料來源與寫入設定」。
8. 如果有設定 `UPDATE_TOKEN`，同一段密碼也填到 PWA 的「更新密碼」。

之後 PWA 會優先透過 Apps Script 同步資料；點「標記已掌握」會更新 Google Sheet 的 `複習狀態` 欄位。

## 讓手機和電腦看到同一份資料

每台裝置的瀏覽器都有自己的本機設定。設定好 Google Sheet 和 Apps Script 後，請在 PWA 按「複製儀表板連結」，再用那個連結開手機或電腦。這個連結會帶著同一張 Google Sheet 的設定，所以兩邊會讀同一份資料。

## 本機啟動

在此資料夾啟動靜態伺服器後開啟：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

網址：

```text
http://127.0.0.1:4173/index.html
```
