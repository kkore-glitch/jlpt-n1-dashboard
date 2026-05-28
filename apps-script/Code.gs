const STATUS_HEADER = "複習狀態";

function doGet(e) {
  const params = e.parameter || {};
  const token = PropertiesService.getScriptProperties().getProperty("UPDATE_TOKEN") || "";
  if (token && params.token !== token) {
    return jsonp(params.callback, { ok: false, error: "BAD_TOKEN" });
  }

  if (params.action !== "read") {
    return jsonp(params.callback, { ok: false, error: "BAD_ACTION" });
  }

  const sheet = findSheet(params.gid);
  const values = sheet.getDataRange().getValues();
  if (values.length < 1) {
    return jsonp(params.callback, { ok: true, rows: [] });
  }

  const headers = values[0].map((value) => String(value).trim());
  const rows = values.slice(1)
    .map((row, index) => {
      const item = { _rowNumber: index + 2 };
      headers.forEach((header, columnIndex) => {
        item[header] = row[columnIndex] == null ? "" : String(row[columnIndex]);
      });
      return item;
    })
    .filter((item) => Object.keys(item).some((key) => key !== "_rowNumber" && item[key] !== ""));

  return jsonp(params.callback, { ok: true, rows });
}

function doPost(e) {
  const params = e.parameter || {};
  const token = PropertiesService.getScriptProperties().getProperty("UPDATE_TOKEN") || "";
  if (token && params.token !== token) {
    return json({ ok: false, error: "BAD_TOKEN" });
  }

  const row = Number(params.row);
  const status = String(params.status || "").trim();
  if (!row || row < 2 || !status) {
    return json({ ok: false, error: "BAD_REQUEST" });
  }

  const sheet = findSheet(params.gid);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusColumn = headers.indexOf(STATUS_HEADER) + 1;
  if (!statusColumn) {
    return json({ ok: false, error: "STATUS_HEADER_NOT_FOUND" });
  }

  sheet.getRange(row, statusColumn).setValue(status);
  return json({ ok: true, row, status });
}

function findSheet(gid) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!gid) return spreadsheet.getSheets()[0];
  const target = spreadsheet.getSheets().find((sheet) => String(sheet.getSheetId()) === String(gid));
  return target || spreadsheet.getSheets()[0];
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonp(callback, payload) {
  const body = callback
    ? `${callback}(${JSON.stringify(payload)});`
    : JSON.stringify(payload);
  return ContentService
    .createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
