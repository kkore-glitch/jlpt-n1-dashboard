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
  "聽到內容但來不及選",
  "被干擾選項騙",
  "粗心"
];
const LEGACY_LISTENING_LATE_REASON = "\u807d\u5f97\u61c2\u4f46\u4f86\u4e0d\u53ca\u9078";

const STORAGE_KEY = "jlpt-n1-tracker-config";
const CACHE_KEY = "jlpt-n1-tracker-last-csv";
const LOCAL_STATUS_OVERRIDES_KEY = "jlpt-n1-status-overrides";
const SAMPLE_URL = "./google-sheet-template.csv";
const DEFAULT_SHEET_SOURCE = "https://docs.google.com/spreadsheets/d/1zL9Jog4muHGFrwnNM8NkfEQ9nSuOi9XeQ1CymxKG2g4/edit?gid=0#gid=0";
const MASTERED_STATUS = "已掌握";
const UNMASTERED_STATUS = "未複習";

const $ = (id) => document.getElementById(id);
let allRecords = [];
let currentRecords = [];
let selectedRow = null;
let cardTouchStartX = null;

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
    reason: normalizeReason(record[HEADERS.reason] || "未分類"),
    tags: record[HEADERS.tags] || "",
    status: record[HEADERS.status] || "未複習",
    reviewDateText: record[HEADERS.reviewDate] || "",
    reviewDate: parseDate(record[HEADERS.reviewDate]),
    note: record[HEADERS.note] || ""
  };
}

function normalizeReason(value) {
  return String(value || "").trim() === LEGACY_LISTENING_LATE_REASON
    ? "聽到內容但來不及選"
    : value;
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

function renderDonut(id, entries, total, colorByLabel = null, centerLabel = "題") {
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

function daysUntilTarget(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseDate(targetDate) || new Date(2026, 11, 6);
  return Math.max(0, Math.ceil((target - today) / 86400000));
}

function isMastered(record) {
  return record.status === MASTERED_STATUS;
}

function getUnmasteredRecords(records) {
  return records.filter((record) => !isMastered(record));
}

function renderFlashcards(records) {
  const root = $("flashcardGrid");
  if (!root) return;

  const sorted = [...records].sort((a, b) => {
    const am = isMastered(a) ? 1 : 0;
    const bm = isMastered(b) ? 1 : 0;
    if (am !== bm) return am - bm;
    return (b.date || 0) - (a.date || 0);
  });

  setText("cardCount", `${sorted.length} 張`);
  if (!sorted.length) {
    root.innerHTML = `<div class="empty">沒有符合條件的字卡</div>`;
    return;
  }

  root.innerHTML = sorted.map((record) => {
    const selected = record._rowNumber === selectedRow && !isMastered(record) ? " is-selected" : "";
    const mastered = isMastered(record) ? " is-mastered" : "";
    return `
      <article class="flashcard summary-card${selected}${mastered}" data-view-row="${record._rowNumber || ""}">
        <div class="summary-card-main">
          <div class="flashcard-meta">${escapeHtml([record.section, record.type].filter(Boolean).join("｜") || "未分類")}</div>
          <div class="summary-card-title">${escapeHtml(record.item || "-")}</div>
          <div class="summary-card-answer">${escapeHtml(record.answer || "-")}</div>
        </div>
        <div class="flashcard-footer">
          <span class="status-chip">${isMastered(record) ? "已掌握" : "未掌握"}</span>
          ${renderMasteryAction(record)}
        </div>
      </article>
    `;
  }).join("");
}

function renderMasteryAction(record) {
  if (!record._rowNumber) return "";
  if (isMastered(record)) {
    return `<button class="mastery-button secondary" type="button" data-row="${record._rowNumber}" data-status="${UNMASTERED_STATUS}">未掌握</button>`;
  }
  return `<button class="mastery-button" type="button" data-row="${record._rowNumber}" data-status="${MASTERED_STATUS}">已掌握</button>`;
}

function renderReviewCarousel(records) {
  const root = $("errorDetail");
  if (!root) return;
  const reviewRecords = getUnmasteredRecords(records);
  if (!reviewRecords.length) {
    selectedRow = null;
    setText("detailMeta", "沒有未掌握項目");
    root.innerHTML = `<div class="empty">目前沒有未掌握的字卡。</div>`;
    return;
  }

  if (!selectedRow || !reviewRecords.some((record) => record._rowNumber === selectedRow)) {
    selectedRow = reviewRecords[0]._rowNumber;
  }

  const index = Math.max(0, reviewRecords.findIndex((item) => item._rowNumber === selectedRow));
  const record = reviewRecords[index];
  setText("detailMeta", `${index + 1}/${reviewRecords.length}｜${record.section}｜${record.type}`);
  root.innerHTML = `
    <div class="review-carousel">
      <button class="carousel-button" type="button" data-carousel="prev" aria-label="上一張">‹</button>
      <div class="review-card">
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
          <div class="mastery-row">
            <span class="status-chip">未掌握</span>
            ${renderMasteryAction(record)}
          </div>
        </div>
      </div>
      <button class="carousel-button" type="button" data-carousel="next" aria-label="下一張">›</button>
    </div>
  `;
}

function changeReviewCard(direction) {
  const reviewRecords = getUnmasteredRecords(currentRecords);
  if (!reviewRecords.length) return;
  const currentIndex = Math.max(0, reviewRecords.findIndex((record) => record._rowNumber === selectedRow));
  const nextIndex = (currentIndex + direction + reviewRecords.length) % reviewRecords.length;
  selectedRow = reviewRecords[nextIndex]._rowNumber;
  renderReviewCarousel(currentRecords);
  renderFlashcards(currentRecords);
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
  const sectionMap = countBy(records, "section");
  const reasonMap = countBy(records, "reason");
  const typeMap = countBy(records, "type");
  const sectionEntries = topEntries(sectionMap, 8, SECTION_ORDER);

  setText("totalErrors", total);
  setText("openErrors", open);
  setText("masteredErrors", mastered);
  setText("daysLeft", `${daysUntilTarget(targetDate)} 天`);
  setText("strongWeakLabel", sectionEntries[0] ? `最多：${sectionEntries[0][0]}` : "");

  renderDonut("sectionBars", sectionEntries, total, SECTION_COLORS, "題");
  renderBars("reasonBars", topEntries(reasonMap, 8), total);
  renderDonut("typeBars", topEntries(typeMap, 8), total, null, "題");
  renderReasonInsight(records);
  renderReviewCarousel(records);
  renderFlashcards(records);
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
    reason: $("reasonFilter")?.value || ""
  };
}

function applyFilters(records) {
  const filters = getFilters();
  return records.filter((record) => {
    if (filters.section && record.section !== filters.section) return false;
    if (filters.reason && record.reason !== filters.reason) return false;
    return true;
  });
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
    sheetSource: saved.sheetSource || saved.csvUrl || DEFAULT_SHEET_SOURCE,
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
    allRecords = applyLocalStatusOverrides(allRecords);
    render(applyFilters(allRecords), config.targetDate);
    setText("syncStatus", `已同步 ${allRecords.length} 筆`);
  } catch (error) {
    if (!config.updateEndpoint) {
      $("setupPanel").hidden = false;
      $("settingsPanel").open = true;
    }
    const cached = readCachedRecords();
    if (cached.length) {
      allRecords = applyLocalStatusOverrides(cached);
      render(applyFilters(allRecords), config.targetDate);
      setText("syncStatus", `同步失敗，使用快取 ${allRecords.length} 筆`);
      return;
    }
    allRecords = [];
    render([], config.targetDate);
    setText("syncStatus", "同步失敗：請發布 CSV 或填 Web App URL");
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

function applyLocalStatusOverrides(records) {
  const overrides = JSON.parse(localStorage.getItem(LOCAL_STATUS_OVERRIDES_KEY) || "{}");
  return records.map((record) => {
    const localStatus = overrides[record._rowNumber];
    return localStatus ? { ...record, status: localStatus } : record;
  });
}

function saveLocalStatusOverride(row, status) {
  const overrides = JSON.parse(localStorage.getItem(LOCAL_STATUS_OVERRIDES_KEY) || "{}");
  overrides[row] = status;
  localStorage.setItem(LOCAL_STATUS_OVERRIDES_KEY, JSON.stringify(overrides));
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

  ["sectionFilter", "reasonFilter"].forEach((id) => {
    $(id)?.addEventListener("input", rerenderFromState);
  });

  $("clearFiltersBtn")?.addEventListener("click", () => {
    $("sectionFilter").value = "";
    $("reasonFilter").value = "";
    rerenderFromState();
  });

  document.addEventListener("click", (event) => {
    const carouselButton = event.target.closest("[data-carousel]");
    if (carouselButton) {
      changeReviewCard(carouselButton.dataset.carousel === "next" ? 1 : -1);
      return;
    }

    const button = event.target.closest("[data-row][data-status]");
    if (button) {
      updateStatus(Number(button.dataset.row), button.dataset.status);
      return;
    }

    const viewButton = event.target.closest(".flashcard[data-view-row]");
    if (viewButton) {
      const targetRow = Number(viewButton.dataset.viewRow);
      if (currentRecords.some((record) => record._rowNumber === targetRow && !isMastered(record))) {
        selectedRow = targetRow;
        renderReviewCarousel(currentRecords);
      }
      renderFlashcards(currentRecords);
      return;
    }
  });

  $("errorDetail")?.addEventListener("touchstart", (event) => {
    cardTouchStartX = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });

  $("errorDetail")?.addEventListener("touchend", (event) => {
    if (cardTouchStartX == null) return;
    const endX = event.changedTouches[0]?.clientX ?? cardTouchStartX;
    const diff = endX - cardTouchStartX;
    cardTouchStartX = null;
    if (Math.abs(diff) < 45) return;
    changeReviewCard(diff < 0 ? 1 : -1);
  }, { passive: true });
}

async function updateStatus(row, status) {
  const config = readConfigFromForm();
  if (!config.updateEndpoint) {
    saveLocalStatusOverride(row, status);
    allRecords = allRecords.map((record) => record._rowNumber === row ? { ...record, status } : record);
    rerenderFromState();
    setText("syncStatus", `本機已標記：${status}`);
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
