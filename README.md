# JLPT N1 錯題分析 PWA

這個工具用 Google Sheet 當主要資料來源，PWA 負責讀取資料、顯示錯題分析、複習清單和考試日前的日期推演。

## Google Sheet 欄位

建立 Google Sheet 後，第一列請使用 `google-sheet-template.csv` 的欄位：

```text
記錄日期,考題回次,大項,題型,題號,錯誤內容,讀音/原句,正解/意思,我的答案,錯誤原因,標籤,複習狀態,下次複習日,備註
```

建議把這幾欄做成下拉選單：

- `大項`：單字語彙、文法、讀解、聽解
- `複習狀態`：未複習、已複習一次、一週後再測 OK、一週後再測錯、已掌握
- `錯誤原因`：單字不熟、漢字讀音不熟、文法句型不熟、接續判斷錯、語感混淆、看太快、定位錯誤、推論過度、聽不出關鍵字、聽得懂但來不及選、被干擾選項騙、粗心

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
5. 之後新增錯題都在 Google Sheet 做，PWA 按「同步」刷新。

私人 Google Sheet 不能直接由純前端 PWA 讀取；若要維持私人權限，需要另外做 Apps Script 或 Google API OAuth。

## 儀表板功能

- 四大項錯題分布
- 錯誤原因排行
- 題型弱項排行
- 複習狀態分布
- 每週錯題趨勢
- 到期複習清單
- 最近錯題清單
- 大項、複習狀態、關鍵字篩選

## 本機啟動

在此資料夾啟動靜態伺服器後開啟：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

網址：

```text
http://127.0.0.1:4173/index.html
```
