const HEADERS = {
  date: "記錄日期",
  exam: "考題回次",
  section: "大項",
  type: "題型",
  no: "題號",
  item: "錯誤內容",
  reading: "讀音/原句",
  answer: "正解/意思",
  mine: "我的答案",
  reason: "錯誤原因",
  tags: "標籤",
  status: "複習狀態",
  reviewDate: "下次複習日",
  note: "備註"
};

const SECTION_ORDER = ["單字語彙", "文法", "讀解", "聽解"];
const SECTION_COLORS = {
  "單字語彙": "#2563a8",
  "文法": "#0f766e",
  "讀解": "#b88316",
  "聽解": "#e85d4f"
};
const STATUS_COLORS = {
  "未複習": "#e85d4f",
  "已複習一次": "#b88316",
  "一週後再測 OK": "#0f766e",
  "一週後再測錯": "#b94f4f",
  "已掌握": "#2563a8"
};
const STATUS_ORDER = ["未複習", "已複習一次", "一週後再測錯", "一週後再測 OK", "已掌握"];
const ERROR_REASONS = [
  "單字不熟",
  "漢字讀音不熟",
  "文法句型不熟",
  "接續判斷錯",
  "語感混淆",
  "看太快",
  "定位錯誤",
  "推論過度",
  "聽不出關鍵字",
  "聽得懂但來不及選",
  "被干擾選項騙",
  "粗心"
];

const STORAGE_KEY = "jlpt-n1-tracker-config";
const CACHE_KEY = "jlpt-n1-tracker-last-csv";
const SAMPLE_URL = "./google-sheet-template.csv";

const $ = (id) => document.getElementById(id);
let allRecords = [];
let currentRecords = [];
let selectedRow = null;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const clean = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    const next = clean[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells, rowIndex) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = cells[index] || "";
    });
    item._rowNumber = rowIndex + 2;
    return item;
  });
}

function toCsvUrl(config) {
  const source = config.sheetSource || config.csvUrl || "";
  if (!source) return "";
  if (source.includes("output=csv") || source.includes("format=csv")) return source;
  if (source.includes("/pubhtml")) return source.replace("/pubhtml", "/pub").replace(/([?&])single=true&?/, "$1").replace(/[?&]$/, "") + "?output=csv";
  if (source.includes("/pub?")) return source.includes("?") ? `${source}&output=csv` : `${source}?output=csv`;

  const id = source.match(/\/spreadsheets\/d\/([^/?#]+)/)?.[1];
  if (!id) return source;
  const gid = source.match(/[?#&]gid=([0-9]+)/)?.[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

function toSheetUrl(source) {
  if (!source) return "";
  const id = source.match(/\/spreadsheets\/d\/([^/?#]+)/)?.[1];
  const gid = source.match(/[?#&]gid=([0-9]+)/)?.[1];
  if (!id) return source;
  return `https://docs.google.com/spreadsheets/d/${id}/edit${gid ? `#gid=${gid}` : ""}`;
}

function getSheetGid(source) {
  return source.match(/[?#&]gid=([0-9]+)/)?.[1] || "";
}

function encodeConfigValue(value) {
  return btoa(encodeURIComponent(value || ""));
}

function decodeConfigValue(value) {
  try {
    return decodeURIComponent(atob(value || ""));
  } catch {
    return "";
  }
}

function getUrlConfig() {
  const params = new URLSearchParams(location.search);
  return {
    sheetSource: decodeConfigValue(params.get("sheet")),
    updateEndpoint: decodeConfigValue(params.get("api")),
    updateToken: decodeConfigValue(params.get("token")),
    targetDate: params.get("date") || ""
  };
}

function buildDashboardLink(config) {
  const params = new URLSearchParams();
  if (config.sheetSource) params.set("sheet", encodeConfigValue(config.sheetSource));
  if (config.updateEndpoint) params.set("api", encodeConfigValue(config.updateEndpoint));
  if (config.updateToken) params.set("token", encodeConfigValue(config.updateToken));
  if (config.targetDate) params.set("date", config.targetDate);
  return `${location.origin}${location.pathname}?${params.toString()}`;
}

function parseDate(value) {
  if (!value) return null;
  const normalized = String(value).trim().replaceAll(".", "/").replaceAll("-", "/");
  const parts = normalized.split("/").map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  if (!date) return "";
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function normalizeRecord(record) {
  return {
    _rowNumber: record._rowNumber,
    dateText: record[HEADERS.date] || "",
    date: parseDate(record[HEADERS.date]),
    exam: record[HEADERS.exam] || "",
    section: record[HEADERS.section] || "未分類",
    type: record[HEADERS.type] || "未分類",
    no: record[HEADERS.no] || "",
    item: record[HEADERS.item] || "",
    reading: record[HEADERS.reading] || "",
    answer: record[HEADERS.answer] || "",
    mine: record[HEADERS.mine] || "",
    reason: record[HEADERS.reason] || "未分類",
    tags: record[HEADERS.tags] || "",
    status: record[HEADERS.status] || "未複習",
    reviewDateText: record[HEADERS.reviewDate] || "",
    reviewDate: parseDate(record[HEADERS.reviewDate]),
    note: record[HEADERS.note] || ""
  };
}

function countBy(records, key) {
  return records.reduce((map, record) => {
    const value = record[key] || "未分類";
    map.set(value, (map.get(value) || 0) + 1);
    return map;
  }, new Map());
}

function topEntries(map, limit = 8, preferredOrder = null) {
  const entries = [...map.entries()];
  entries.sort((a, b) => {
    if (preferredOrder) {
      const ai = preferredOrder.indexOf(a[0]);
      const bi = preferredOrder.indexOf(b[0]);
      if (ai >= 0 && bi >= 0) return ai - bi;
    }
    return b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant");
  });
  return entries.slice(0, limit);
}

function setText(id, value) {
  $(id).textContent = value;
}

function renderBars(id, entries, total, colorByLabel = null) {
  const root = $(id);
  root.innerHTML = "";
  if (!entries.length || total === 0) {
    root.innerHTML = `<div class="empty">沒有資料</div>`;
    return;
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);
  entries.forEach(([label, count]) => {
    const percent = Math.round((count / total) * 100);
    const width = Math.max(3, Math.round((count / max) * 100));
    const color = colorByLabel?.[label] || "#31546b";
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label">${escapeHtml(label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${color}"></div></div>
      <div class="bar-value">${count}｜${percent}%</div>
    `;
    root.appendChild(row);
  });
}

function renderDonut(id, entries, total, colorByLabel = null, centerLabel = "總數") {
  const root = $(id);
  root.innerHTML = "";
  if (!entries.length || total === 0) {
    root.innerHTML = `<div class="empty">沒有資料</div>`;
    return;
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = entries.map(([label, count], index) => {
    const length = (count / total) * circumference;
    const color = colorByLabel?.[label] || chartColor(index);
    const dash = `${Math.max(0, length - 1)} ${circumference}`;
    const segment = `
      <circle class="donut-segment" cx="58" cy="58" r="${radius}"
        stroke="${color}" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"></circle>
    `;
    offset += length;
    return segment;
  }).join("");

  const legend = entries.map(([label, count], index) => {
    const percent = Math.round((count / total) * 100);
    const color = colorByLabel?.[label] || chartColor(index);
    return `
      <div class="donut-legend-row">
        <span class="legend-dot" style="background:${color}"></span>
        <span class="legend-label">${escapeHtml(label)}</span>
        <strong>${count}</strong>
        <span>${percent}%</span>
      </div>
    `;
  }).join("");

  root.innerHTML = `
    <div class="donut-layout">
      <svg class="donut-svg" viewBox="0 0 116 116" role="img" aria-label="${escapeHtml(centerLabel)}">
        <circle class="donut-base" cx="58" cy="58" r="${radius}"></circle>
        ${segments}
        <text x="58" y="54" text-anchor="middle" class="donut-total">${total}</text>
        <text x="58" y="72" text-anchor="middle" class="donut-label">${escapeHtml(centerLabel)}</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>
  `;
}

function chartColor(index) {
  return ["#0f766e", "#2563a8", "#e85d4f", "#b88316", "#6854a3", "#b94a48", "#5b7c86", "#3f6b4f"][index % 8];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function renderTrend(records) {
  const root = $("trendChart");
  const dated = records.filter((record) => record.date).sort((a, b) => a.date - b.date);
  if (!dated.length) {
    root.innerHTML = `<div class="empty">沒有日期資料</div>`;
    return;
  }

  const groups = new Map();
  dated.forEach((record) => {
    const week = startOfWeek(record.date);
    const key = week.toISOString().slice(0, 10);
    groups.set(key, (groups.get(key) || 0) + 1);
  });
  const points = [...groups.entries()].slice(-10);
  const max = Math.max(...points.map(([, count]) => count), 1);
  const width = 720;
  const height = 230;
  const pad = { left: 36, right: 18, top: 22, bottom: 38 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const coords = points.map(([key, count], index) => {
    const x = pad.left + (points.length === 1 ? plotW / 2 : (plotW / (points.length - 1)) * index);
    const y = pad.top + plotH - (count / max) * plotH;
    return { key, count, x, y };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${pad.left},${pad.top + plotH} ${line} ${pad.left + plotW},${pad.top + plotH}`;

  root.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="每週錯題趨勢">
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="#d9dedc" />
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="#d9dedc" />
      <polygon points="${area}" fill="rgba(15,118,110,.12)"></polygon>
      <polyline points="${line}" fill="none" stroke="#0f766e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${coords.map((point) => `
        <circle cx="${point.x}" cy="${point.y}" r="5" fill="#e85d4f"></circle>
        <text x="${point.x}" y="${point.y - 10}" text-anchor="middle" class="trend-axis">${point.count}</text>
        <text x="${point.x}" y="${height - 12}" text-anchor="middle" class="trend-axis">${Number(point.key.slice(5,7))}/${Number(point.key.slice(8,10))}</text>
      `).join("")}
    </svg>
  `;
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function daysUntilTarget(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseDate(targetDate) || new Date(2026, 11, 6);
  return Math.max(0, Math.ceil((target - today) / 86400000));
}

function renderStatusBreakdown(records) {
  const map = countBy(records, "status");
  const entries = topEntries(map, 8, STATUS_ORDER);
  renderDonut("statusBars", entries, records.length, STATUS_COLORS, "狀態");
}

function renderStudyMix(records) {
  const root = $("studyMix");
  if (!root) return;
  const map = countBy(records.filter((record) => record.status !== "已掌握"), "section");
  const entries = topEntries(map, 4, SECTION_ORDER);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  root.innerHTML = "";
  if (!total) {
    root.innerHTML = `<div class="empty">沒有未掌握項目</div>`;
    return;
  }

  entries.forEach(([label, count]) => {
    const percent = Math.round((count / total) * 100);
    const row = document.createElement("div");
    row.className = "mix-row";
    row.innerHTML = `
      <div>${escapeHtml(label)}</div>
      <div class="mix-pill"><span style="width:${percent}%;background:${SECTION_COLORS[label] || "#4f6f52"}"></span></div>
      <strong>${percent}%</strong>
    `;
    root.appendChild(row);
  });
}

function renderTables(records) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = getDueRecords(records)
    .sort((a, b) => (a.reviewDate || today) - (b.reviewDate || today))
    .slice(0, 8);

  setText("reviewCount", `${due.length} 項`);
  $("reviewRows").innerHTML = due.length
    ? due.map((record) => `
      <tr>
        <td>${escapeHtml(record.dateText)}</td>
        <td>${escapeHtml(record.section)}</td>
        <td>${escapeHtml(record.item)}</td>
        <td>${escapeHtml(record.reason)}</td>
        <td><span class="status-chip">${escapeHtml(record.status)}</span></td>
        <td>${escapeHtml(record.reviewDateText)}</td>
        <td>${renderViewAction(record)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="empty">沒有到期項目</td></tr>`;

  const recent = [...records]
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .slice(0, 10);
  $("recentRows").innerHTML = recent.length
    ? recent.map((record) => `
      <tr>
        <td>${escapeHtml(record.dateText)}</td>
        <td>${escapeHtml(record.exam)}</td>
        <td>${escapeHtml(record.type)}</td>
        <td>${escapeHtml(record.item)}</td>
        <td>${escapeHtml(record.answer)}</td>
        <td><span class="status-chip">${escapeHtml(record.status)}</span></td>
        <td>${renderViewAction(record)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="empty">沒有資料</td></tr>`;
}

function renderViewAction(record) {
  if (!record._rowNumber) return "";
  return `<button class="view-button" type="button" data-view-row="${record._rowNumber}">查看</button>`;
}

function renderStatusActions(record) {
  if (!record._rowNumber) return "";
  return `
    <div class="status-actions">
      <button type="button" data-row="${record._rowNumber}" data-status="已掌握">標記已掌握</button>
      <button type="button" data-row="${record._rowNumber}" data-status="已複習一次">已複習一次</button>
      <button type="button" data-row="${record._rowNumber}" data-status="一週後再測錯">再測錯</button>
    </div>
  `;
}

function renderErrorDetail(records) {
  const root = $("errorDetail");
  if (!root) return;
  if (!records.length) {
    selectedRow = null;
    setText("detailMeta", "沒有資料");
    root.innerHTML = `<div class="empty">選擇一筆錯題後，這裡會顯示完整內容。</div>`;
    return;
  }

  if (!selectedRow || !records.some((record) => record._rowNumber === selectedRow)) {
    selectedRow = records[0]._rowNumber;
  }

  const record = records.find((item) => item._rowNumber === selectedRow);
  setText("detailMeta", `${record.exam || "未標回次"}｜${record.section}｜${record.type}`);
  root.innerHTML = `
    <div class="detail-main">
      <span>錯誤內容</span>
      <strong>${escapeHtml(record.item || "-")}</strong>
    </div>
    <div class="detail-grid">
      ${detailItem("正解/意思", record.answer)}
      ${detailItem("讀音/原句", record.reading)}
      ${detailItem("我的答案", record.mine)}
      ${detailItem("錯誤原因", record.reason)}
      ${detailItem("標籤", record.tags)}
      ${detailItem("備註", record.note)}
    </div>
    <div class="detail-status">
      <span class="status-chip">${escapeHtml(record.status)}</span>
      ${renderStatusActions(record)}
    </div>
  `;
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `;
}

function render(records, targetDate) {
  currentRecords = records;
  const total = records.length;
  const mastered = records.filter((record) => record.status === "已掌握").length;
  const open = total - mastered;
  const due = getDueRecords(records).length;
  const sectionMap = countBy(records, "section");
  const reasonMap = countBy(records, "reason");
  const typeMap = countBy(records, "type");
  const sectionEntries = topEntries(sectionMap, 8, SECTION_ORDER);

  setText("totalErrors", total);
  setText("openErrors", open);
  setText("dueReviews", due);
  setText("daysLeft", `${daysUntilTarget(targetDate)} 天`);
  setText("strongWeakLabel", sectionEntries[0] ? `最多：${sectionEntries[0][0]}` : "");

  renderDonut("sectionBars", sectionEntries, total, SECTION_COLORS, "大項");
  renderBars("reasonBars", topEntries(reasonMap, 8), total);
  renderDonut("typeBars", topEntries(typeMap, 8), total, null, "題型");
  renderTrend(records);
  renderStatusBreakdown(records);
  renderReasonInsight(records);
  renderErrorDetail(records);
  renderTables(records);
}

function setSetupVisibility(config) {
  const panel = $("setupPanel");
  if (!panel) return;
  panel.hidden = Boolean(config.sheetSource);
  const settings = $("settingsPanel");
  if (settings) settings.open = !config.sheetSource;
}

function getFilters() {
  return {
    section: $("sectionFilter")?.value || "",
    status: $("statusFilter")?.value || "",
    reason: $("reasonFilter")?.value || "",
    keyword: ($("keywordFilter")?.value || "").trim().toLowerCase()
  };
}

function applyFilters(records) {
  const filters = getFilters();
  return records.filter((record) => {
    if (filters.section && record.section !== filters.section) return false;
    if (filters.status && record.status !== filters.status) return false;
    if (filters.reason && record.reason !== filters.reason) return false;
    if (!filters.keyword) return true;
    const haystack = [record.item, record.answer, record.tags, record.reason, record.type, record.exam, record.note]
      .join(" ")
      .toLowerCase();
    return haystack.includes(filters.keyword);
  });
}

function getDueRecords(records) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return records
    .filter((record) => record.status !== "已掌握")
    .filter((record) => !record.reviewDate || record.reviewDate <= today);
}

function renderReasonInsight(filteredRecords) {
  const selectedReason = $("reasonFilter")?.value || "";
  const panel = $("reasonInsight");
  if (!panel) return;
  panel.hidden = !selectedReason;
  if (!selectedReason) return;

  const reasonRecords = filteredRecords.filter((record) => record.reason === selectedReason);
  const topSection = topEntries(countBy(reasonRecords, "section"), 1)[0]?.[0] || "-";
  const topType = topEntries(countBy(reasonRecords, "type"), 1)[0]?.[0] || "-";
  const examples = reasonRecords.slice(0, 5).map((record) => `
    <span>${escapeHtml(record.item || record.answer || record.type)}</span>
  `).join("");

  setText("reasonTitle", selectedReason);
  setText("reasonCount", `${reasonRecords.length} 筆`);
  setText("reasonSection", `常見大項 ${topSection}`);
  setText("reasonType", `常見題型 ${topType}`);
  $("reasonExamples").innerHTML = examples || `<span>目前篩選條件下沒有資料</span>`;
}

function rerenderFromState() {
  const config = readConfigFromForm();
  render(applyFilters(allRecords), config.targetDate);
}

function getConfig() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  const fromUrl = getUrlConfig();
  const config = {
    sheetSource: saved.sheetSource || saved.csvUrl || "",
    targetDate: saved.targetDate || "2026-12-06",
    updateEndpoint: saved.updateEndpoint || "",
    updateToken: saved.updateToken || ""
  };
  if (fromUrl.sheetSource) config.sheetSource = fromUrl.sheetSource;
  if (fromUrl.updateEndpoint) config.updateEndpoint = fromUrl.updateEndpoint;
  if (fromUrl.updateToken) config.updateToken = fromUrl.updateToken;
  if (fromUrl.targetDate) config.targetDate = fromUrl.targetDate;
  return config;
}

function setConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function fillConfig(config) {
  $("sheetSource").value = config.sheetSource;
  $("targetDate").value = config.targetDate;
  $("updateEndpoint").value = config.updateEndpoint || "";
  $("updateToken").value = config.updateToken || "";
}

function readConfigFromForm() {
  return {
    sheetSource: $("sheetSource").value.trim(),
    targetDate: $("targetDate").value || "2026-12-06",
    updateEndpoint: $("updateEndpoint").value.trim(),
    updateToken: $("updateToken").value.trim()
  };
}

async function loadData(config, useSample = false) {
  const url = useSample ? SAMPLE_URL : toCsvUrl(config);
  setSetupVisibility(config);
  if (!url && !config.updateEndpoint) {
    allRecords = [];
    render([], config.targetDate);
    setText("syncStatus", "尚未連結");
    return;
  }
  setText("syncStatus", "同步中");
  try {
    if (config.updateEndpoint && !useSample) {
      allRecords = await readRowsFromAppsScript(config);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ type: "json", rows: allRecords }));
    } else {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const csv = await response.text();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ type: "csv", csv }));
      allRecords = parseCsv(csv).map(normalizeRecord).filter((record) => record.dateText || record.item);
    }
    render(applyFilters(allRecords), config.targetDate);
    setText("syncStatus", `已同步 ${allRecords.length} 筆`);
  } catch (error) {
    const cached = readCachedRecords();
    if (cached.length) {
      allRecords = cached;
      render(applyFilters(allRecords), config.targetDate);
      setText("syncStatus", `同步失敗，使用快取 ${allRecords.length} 筆`);
      return;
    }
    allRecords = [];
    render([], config.targetDate);
    setText("syncStatus", "同步失敗：請檢查設定");
  }
}

function readRowsFromAppsScript(config) {
  return new Promise((resolve, reject) => {
    const callbackName = `jlptRead_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script read timeout"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();
      if (!payload?.ok) {
        reject(new Error(payload?.error || "Apps Script read failed"));
        return;
      }
      const rows = (payload.rows || [])
        .map(normalizeRecord)
        .filter((record) => record.dateText || record.item);
      resolve(rows);
    };

    const endpoint = new URL(config.updateEndpoint);
    endpoint.searchParams.set("action", "read");
    endpoint.searchParams.set("callback", callbackName);
    endpoint.searchParams.set("gid", getSheetGid(config.sheetSource));
    if (config.updateToken) endpoint.searchParams.set("token", config.updateToken);
    script.onerror = () => {
      cleanup();
      reject(new Error("Apps Script script load failed"));
    };
    script.src = endpoint.toString();
    document.head.appendChild(script);
  });
}

function readCachedRecords() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return [];
  try {
    const parsed = JSON.parse(cached);
    if (parsed.type === "json") return parsed.rows || [];
    if (parsed.type === "csv") return parseCsv(parsed.csv).map(normalizeRecord).filter((record) => record.dateText || record.item);
  } catch {
    return parseCsv(cached).map(normalizeRecord).filter((record) => record.dateText || record.item);
  }
  return [];
}

function bindEvents() {
  $("saveSourceBtn").addEventListener("click", () => {
    const config = readConfigFromForm();
    setConfig(config);
    const settings = $("settingsPanel");
    if (settings && config.sheetSource) settings.open = false;
    loadData(config);
  });

  $("reloadBtn").addEventListener("click", () => {
    const config = readConfigFromForm();
    setConfig(config);
    loadData(config);
  });

  $("openSheetBtn")?.addEventListener("click", () => {
    const config = readConfigFromForm();
    const sheetUrl = toSheetUrl(config.sheetSource);
    if (sheetUrl) window.open(sheetUrl, "_blank", "noopener");
  });

  $("copyDashboardLinkBtn")?.addEventListener("click", async () => {
    const config = readConfigFromForm();
    setConfig(config);
    const link = buildDashboardLink(config);
    try {
      await navigator.clipboard.writeText(link);
      setText("syncStatus", "已複製連結");
    } catch {
      prompt("複製這個儀表板連結", link);
    }
  });

  $("targetDate").addEventListener("change", () => {
    const config = readConfigFromForm();
    setConfig(config);
    rerenderFromState();
  });

  ["sectionFilter", "statusFilter", "reasonFilter", "keywordFilter"].forEach((id) => {
    $(id)?.addEventListener("input", rerenderFromState);
  });

  $("clearFiltersBtn")?.addEventListener("click", () => {
    $("sectionFilter").value = "";
    $("statusFilter").value = "";
    $("reasonFilter").value = "";
    $("keywordFilter").value = "";
    rerenderFromState();
  });

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-row]");
    if (viewButton) {
      selectedRow = Number(viewButton.dataset.viewRow);
      renderErrorDetail(currentRecords);
      document.querySelector(".detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const button = event.target.closest("[data-row][data-status]");
    if (!button) return;
    updateStatus(Number(button.dataset.row), button.dataset.status);
  });
}

async function updateStatus(row, status) {
  const config = readConfigFromForm();
  if (!config.updateEndpoint) {
    alert("請先在「資料來源與寫入設定」貼上 Apps Script Web App URL。");
    return;
  }

  const body = new URLSearchParams({
    row: String(row),
    status,
    gid: getSheetGid(config.sheetSource),
    token: config.updateToken || ""
  });

  setText("syncStatus", "更新中");
  try {
    await fetch(config.updateEndpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    allRecords = allRecords.map((record) => record._rowNumber === row ? { ...record, status } : record);
    rerenderFromState();
    setText("syncStatus", `已更新：${status}`);
  } catch (error) {
    setText("syncStatus", "更新失敗");
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then((registration) => registration.update());
}

const initialConfig = getConfig();
fillConfig(initialConfig);
bindEvents();
loadData(initialConfig);
