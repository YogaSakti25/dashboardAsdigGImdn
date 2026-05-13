const SHEET_ID = "1jyQQo9ZZC_p4_mdlE2MASYwPjt6Q0EqaJRcWphor0Aw";
const GID = "0";
const CSV_URL = `https://docs.google.com/spreadsheets/d/1jyQQo9ZZC_p4_mdlE2MASYwPjt6Q0EqaJRcWphor0Aw/edit?gid=0#gid=0`;

let rawData = [];
let selectedUpt = "SEMUA";
let charts = {};

const fmt = new Intl.NumberFormat("id-ID");

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quote = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];

    if (c === '"' && quote && n === '"') {
      cell += '"';
      i++;
    } else if (c === '"') {
      quote = !quote;
    } else if (c === "," && !quote) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (cell || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (c === "\r" && n === "\n") i++;
    } else {
      cell += c;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = (rows[0] || []).map(h => h.trim());
  return rows.slice(1).filter(r => r.some(Boolean)).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h || `Kolom ${i + 1}`] = (r[i] || "").trim());
    return obj;
  });
}

function get(row, candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const found = keys.find(k => normalize(k) === normalize(candidate));
    if (found) return row[found];
  }
  for (const candidate of candidates) {
    const found = keys.find(k => normalize(k).includes(normalize(candidate)));
    if (found) return row[found];
  }
  return "";
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getType(row) { return get(row, ["#", "Jenis", "Type Asset"]); }
function getIdEqp(row) { return get(row, ["Ideq", "Ideqp", "IdEqp", "Id Eqp"]); }
function getIdLoc(row) { return get(row, ["Idloc", "IdLoc", "Id Loc"]); }
function getUpt(row) { return get(row, ["Upt", "UPT"]); }
function getGi(row) { return get(row, ["Gi", "GI"]); }
function getBay(row) { return get(row, ["Bay"]); }
function getPhasa(row) { return get(row, ["Phasa"]); }
function getVoltage(row) { return get(row, ["Daya/Tegangan", "Tegangan", "Level Tegangan"]); }
function getMerek(row) { return get(row, ["Merek"]); }
function getTipe(row) { return get(row, ["Tipe"]); }
function getSerial(row) { return get(row, ["Serial Id", "Serial ID"]); }
function getTahunBuat(row) { return get(row, ["Tahun Buat"]); }
function getTahunOperasi(row) { return get(row, ["Tahun Operasi"]); }
function getMtu(row) { return get(row, ["Mtu", "MTU"]); }
function getStatusPeralatan(row) { return get(row, ["Status Peralatan"]); }
function getCriticality(row) { return get(row, ["Criticality Gi", "Criticality GI", "Criticality"]); }
function getJustifikasi(row) { return get(row, ["Justifikasi Prioritas", "Justifikasi"]); }
function getStatusUsia(row) { return get(row, ["Status Usia"]); }
function getRtl(row) { return get(row, ["Rencana Tindak Lanjut", "RTL"]); }
function getTglInspeksi(row) { return get(row, ["Tgl Inspeksi", "Tanggal Inspeksi"]); }
function getStatusHi(row) { return get(row, ["Status Hi", "Status HI"]); }
function getPriority(row) { return get(row, ["Priority", "Prioritas"]); }
function getNilaiHi(row) { return numberFromText(get(row, ["Nilai Hi", "Nilai HI"])); }

function numberFromText(value) {
  const n = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function age(row) {
  const year = numberFromText(getTahunOperasi(row)) || numberFromText(getTahunBuat(row));
  const now = new Date().getFullYear();
  if (!year || year < 1900 || year > now) return null;
  return now - year;
}

function voltageGroup(row) {
  const value = String(getVoltage(row) || Object.values(row).join(" ")).toLowerCase();
  if (value.includes("500")) return "500 kV";
  if (value.includes("150")) return "150 kV";
  if (value.includes("70")) return "70 kV";
  if (value.includes("20")) return "20 kV ke bawah";
  return "Lainnya";
}

function ageGroup(row) {
  const explicit = normalize(getStatusUsia(row)).toUpperCase();
  if (explicit) return explicit;

  const a = age(row);
  if (a === null) return "TIDAK ADA DATA";
  if (a >= 30) return "SANGAT TUA";
  if (a >= 15) return "TUA";
  return "MUDA";
}

function criticalityGroup(row) {
  const s = normalize(getCriticality(row)).toUpperCase();
  if (s.includes("EXTREME")) return "EXTREME";
  if (s.includes("TINGGI") || s.includes("HIGH")) return "TINGGI";
  if (s.includes("SEDANG") || s.includes("MEDIUM")) return "SEDANG";
  if (s.includes("RENDAH") || s.includes("LOW")) return "RENDAH";
  return s || "KOSONG";
}

function priorityFlags(row) {
  const text = normalize([getJustifikasi(row), getRtl(row), getStatusUsia(row), getCriticality(row)].join(" "));
  return {
    poor: text.includes("poor"),
    fair: text.includes("fair"),
    critical: text.includes("critical"),
    extreme: text.includes("extreme"),
    sf6: text.includes("sf6"),
    closing: text.includes("closing time"),
    opening: text.includes("opening time"),
    mechanic: text.includes("mekanik") || text.includes("penggerak") || text.includes("hidrolis"),
    hasRtl: !!getRtl(row)
  };
}

function riskScore(row) {
  let score = 0;

  const c = criticalityGroup(row);
  const u = ageGroup(row);
  const f = priorityFlags(row);
  const statusHi = normalize(getStatusHi(row));
  const priority = normalize(getPriority(row));
  const nilaiHi = getNilaiHi(row);

  // Criticality GI
  if (c === "EXTREME") score += 40;
  else if (c === "TINGGI") score += 30;
  else if (c === "SEDANG") score += 15;
  else if (c === "RENDAH") score += 5;

  // Status Usia
  if (u === "SANGAT TUA") score += 30;
  else if (u === "TUA") score += 20;
  else if (u === "MUDA") score += 5;

  // Status HI dari kolom database
  if (statusHi.includes("critical")) score += 40;
  else if (statusHi.includes("poor")) score += 30;
  else if (statusHi.includes("fair")) score += 15;
  else if (statusHi.includes("good")) score += 5;

  // Priority dari kolom database
  if (priority.includes("p1") || priority.includes("prioritas 1") || priority === "1") score += 30;
  else if (priority.includes("p2") || priority.includes("prioritas 2") || priority === "2") score += 20;
  else if (priority.includes("p3") || priority.includes("prioritas 3") || priority === "3") score += 10;

  // Nilai HI
  if (nilaiHi >= 80) score += 30;
  else if (nilaiHi >= 60) score += 20;
  else if (nilaiHi >= 40) score += 10;

  // Keyword anomali dari Justifikasi / RTL
  if (f.critical) score += 25;
  if (f.poor) score += 18;
  if (f.fair) score += 8;
  if (f.sf6) score += 20;
  if (f.closing) score += 12;
  if (f.opening) score += 8;
  if (f.mechanic) score += 15;
  if (f.hasRtl) score += 10;

  const a = age(row);
  if (a) score += Math.min(20, Math.floor(a / 2));

  return score;
}

function priorityLabel(row) {
  const priority = getPriority(row);
  if (priority) return priority;

  const statusHi = normalize(getStatusHi(row));
  if (statusHi.includes("critical")) return "PRIORITAS 1";
  if (statusHi.includes("poor")) return "PRIORITAS 2";
  if (statusHi.includes("fair")) return "PRIORITAS 3";

  const score = riskScore(row);
  if (score >= 90) return "PRIORITAS 1";
  if (score >= 65) return "PRIORITAS 2";
  if (score >= 40) return "PRIORITAS 3";
  return "MONITORING";
}

function filteredData() {
  const q = document.getElementById("searchBox")?.value?.toLowerCase() || "";
  const gi = document.getElementById("filterGi")?.value || "SEMUA";
  const voltage = document.getElementById("filterVoltage")?.value || "SEMUA";

  return rawData.filter(r => {
    const uptMatch = selectedUpt === "SEMUA" || getUpt(r) === selectedUpt;
    const giMatch = gi === "SEMUA" || getGi(r) === gi;
    const voltageMatch = voltage === "SEMUA" || voltageGroup(r) === voltage;
    const qMatch = Object.values(r).join(" ").toLowerCase().includes(q);
    return uptMatch && giMatch && voltageMatch && qMatch;
  });
}

function countBy(data, fn) {
  const result = {};
  data.forEach(r => {
    const key = fn(r) || "Kosong";
    result[key] = (result[key] || 0) + 1;
  });
  return result;
}

function pct(n, total) {
  return total ? ((n / total) * 100).toFixed(2).replace(".", ",") + "%" : "0%";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateHero() {
  setText("lastUpdate", new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }));
  setText("heroTotal", `${fmt.format(rawData.length)} Peralatan`);
}

function updateKpi(data) {
  const total = data.length;
  const extreme = data.filter(r => criticalityGroup(r) === "EXTREME").length;
  const oldAsset = data.filter(r => ageGroup(r) === "TUA").length;
  const veryOld = data.filter(r => ageGroup(r) === "SANGAT TUA").length;
  const rtl = data.filter(r => getRtl(r)).length;

  setText("totalAsset", fmt.format(total));
  setText("extreme", fmt.format(extreme));
  setText("oldAsset", fmt.format(oldAsset));
  setText("veryOldAsset", fmt.format(veryOld));
  setText("rtlAsset", fmt.format(rtl));

  setText("extremePct", `${pct(extreme, total)} dari total`);
  setText("oldPct", `${pct(oldAsset, total)} dari total`);
  setText("veryOldPct", `${pct(veryOld, total)} dari total`);
  setText("rtlPct", `${pct(rtl, total)} dari total`);
}

function chartColors(labels) {
  return labels.map(label => {
    const x = normalize(label);
    if (x.includes("extreme") || x.includes("sangat") || x.includes("prioritas 1")) return "#ef4444";
    if (x.includes("tinggi") || x.includes("tua") || x.includes("prioritas 2")) return "#f97316";
    if (x.includes("sedang") || x.includes("fair") || x.includes("prioritas 3")) return "#eab308";
    if (x.includes("rendah") || x.includes("muda") || x.includes("normal")) return "#16a34a";
    if (x.includes("500")) return "#ef4444";
    if (x.includes("150")) return "#0b63f6";
    if (x.includes("70")) return "#7c3aed";
    if (x.includes("20")) return "#16a34a";
    return "#64748b";
  });
}

function makeChart(id, type, labels, data) {
  if (charts[id]) charts[id].destroy();
  const colors = chartColors(labels);

  charts[id] = new Chart(document.getElementById(id), {
    type,
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: type === "bar" ? 0 : 2,
        borderRadius: type === "bar" ? 10 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: type === "bar" ? "bottom" : "right" }
      },
      scales: type === "bar" ? { y: { beginAtZero: true } } : undefined
    }
  });
}

function renderCharts(data) {
  const criticality = countBy(data, criticalityGroup);
  makeChart("criticalityChart", "doughnut", Object.keys(criticality), Object.values(criticality));

  const usia = countBy(data, ageGroup);
  makeChart("ageChart", "doughnut", Object.keys(usia), Object.values(usia));

  const voltage = countBy(data, voltageGroup);
  makeChart("voltageChart", "bar", Object.keys(voltage), Object.values(voltage));
}

function renderFilters() {
  const upts = ["SEMUA", ...new Set(rawData.map(getUpt).filter(Boolean))].sort((a, b) => {
    if (a === "SEMUA") return -1;
    if (b === "SEMUA") return 1;
    return a.localeCompare(b);
  });

  const gis = ["SEMUA", ...new Set(rawData.map(getGi).filter(Boolean))].sort((a, b) => {
    if (a === "SEMUA") return -1;
    if (b === "SEMUA") return 1;
    return a.localeCompare(b);
  });

  const voltages = ["SEMUA", "500 kV", "150 kV", "70 kV", "20 kV ke bawah", "Lainnya"];

  document.getElementById("filterUpt").innerHTML = upts.map(u => `<option value="${escapeHtml(u)}">${u === "SEMUA" ? "Semua UPT" : escapeHtml(u)}</option>`).join("");
  document.getElementById("filterGi").innerHTML = gis.map(g => `<option value="${escapeHtml(g)}">${g === "SEMUA" ? "Semua GI" : escapeHtml(g)}</option>`).join("");
  document.getElementById("filterVoltage").innerHTML = voltages.map(v => `<option value="${escapeHtml(v)}">${v === "SEMUA" ? "Semua Tegangan" : escapeHtml(v)}</option>`).join("");

  document.getElementById("filterUpt").value = selectedUpt;
  document.getElementById("filterUpt").onchange = e => {
    selectedUpt = e.target.value;
    renderAll();
  };
  document.getElementById("filterGi").onchange = renderAll;
  document.getElementById("filterVoltage").onchange = renderAll;
}

function renderTabs() {
  const upts = ["SEMUA", ...new Set(rawData.map(getUpt).filter(Boolean))].sort((a, b) => {
    if (a === "SEMUA") return -1;
    if (b === "SEMUA") return 1;
    return a.localeCompare(b);
  });

  document.getElementById("uptTabs").innerHTML = upts.map(u => `
    <button class="tab ${selectedUpt === u ? "active" : ""}" onclick="selectUpt('${escapeJs(u)}')">
      ${u === "SEMUA" ? "Semua UPT" : escapeHtml(u)}
    </button>
  `).join("");
}

function selectUpt(upt) {
  selectedUpt = upt;
  document.getElementById("filterUpt").value = upt;
  renderAll();
}

function renderUptTable() {
  const upts = [...new Set(rawData.map(getUpt).filter(Boolean))].sort();

  const rows = upts.map(upt => {
    const d = rawData.filter(r => getUpt(r) === upt);
    const extreme = d.filter(r => criticalityGroup(r) === "EXTREME").length;
    const tinggi = d.filter(r => criticalityGroup(r) === "TINGGI").length;
    const tua = d.filter(r => ageGroup(r) === "TUA").length;
    const sangatTua = d.filter(r => ageGroup(r) === "SANGAT TUA").length;
    const rtl = d.filter(r => getRtl(r)).length;

    return `
      <tr>
        <td><b>${escapeHtml(upt)}</b></td>
        <td class="red"><b>${fmt.format(extreme)}</b></td>
        <td class="orange"><b>${fmt.format(tinggi)}</b></td>
        <td>${fmt.format(tua)}</td>
        <td class="yellow"><b>${fmt.format(sangatTua)}</b></td>
        <td class="green"><b>${fmt.format(rtl)}</b></td>
        <td><b>${fmt.format(d.length)}</b></td>
      </tr>
    `;
  }).join("");

  document.getElementById("uptTable").innerHTML = `
    <thead>
      <tr>
        <th>UPT</th>
        <th>Extreme</th>
        <th>Tinggi</th>
        <th>Tua</th>
        <th>Sangat Tua</th>
        <th>Ada RTL</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function badge(text, className = "badge-gray") {
  return `<span class="badge ${className}">${escapeHtml(text || "-")}</span>`;
}

function criticalityBadge(value) {
  const v = normalize(value);
  if (v.includes("extreme")) return badge(value, "badge-red");
  if (v.includes("tinggi") || v.includes("high")) return badge(value, "badge-orange");
  if (v.includes("sedang") || v.includes("medium")) return badge(value, "badge-yellow");
  if (v.includes("rendah") || v.includes("low")) return badge(value, "badge-green");
  return badge(value, "badge-gray");
}

function usiaBadge(value) {
  const v = normalize(value);
  if (v.includes("sangat tua")) return badge(value, "badge-red");
  if (v.includes("tua")) return badge(value, "badge-orange");
  if (v.includes("muda")) return badge(value, "badge-green");
  return badge(value, "badge-gray");
}

function priorityBadge(value) {
  if (value === "PRIORITAS 1") return badge(value, "badge-red");
  if (value === "PRIORITAS 2") return badge(value, "badge-orange");
  if (value === "PRIORITAS 3") return badge(value, "badge-yellow");
  return badge(value, "badge-blue");
}

function statusHiBadge(value) {
  const v = normalize(value);
  if (v.includes("critical")) return badge(value, "badge-red");
  if (v.includes("poor")) return badge(value, "badge-orange");
  if (v.includes("fair")) return badge(value, "badge-yellow");
  if (v.includes("good")) return badge(value, "badge-green");
  return badge(value || "-", "badge-gray");
}

function renderPriorityTable(data) {
  const rows = [...data]
    .sort((a, b) => riskScore(b) - riskScore(a))
    .slice(0, 20)
    .map((r, i) => `
      <tr>
        <td><b>${i + 1}</b></td>
        <td>${escapeHtml(getUpt(r) || "-")}</td>
        <td><b>${escapeHtml(getGi(r) || "-")}</b></td>
        <td>${escapeHtml(getBay(r) || "-")}</td>
        <td>${escapeHtml(getPhasa(r) || "-")}</td>
        <td>${escapeHtml(voltageGroup(r))}</td>
        <td>${escapeHtml([getMerek(r), getTipe(r)].filter(Boolean).join(" / ") || "-")}</td>
        <td>${criticalityBadge(criticalityGroup(r))}</td>
        <td>${usiaBadge(ageGroup(r))}</td>
        <td>${statusHiBadge(getStatusHi(r))}</td>
        <td>${priorityBadge(priorityLabel(r))}</td>
        <td><b>${getNilaiHi(r) || "-"}</b></td>
        <td><b>${riskScore(r)}</b></td>
        <td class="wrap">${escapeHtml(getJustifikasi(r) || "-")}</td>
      </tr>
    `).join("");

  document.getElementById("priorityTable").innerHTML = `
    <thead>
      <tr>
        <th>No</th>
        <th>UPT</th>
        <th>GI</th>
        <th>Bay</th>
        <th>Phasa</th>
        <th>Tegangan</th>
        <th>Merek/Tipe</th>
        <th>Criticality</th>
        <th>Usia</th>
        <th>Status HI</th>
        <th>Priority</th>
        <th>Nilai HI</th>
        <th>Skor</th>
        <th>Justifikasi</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderVoltage(data) {
  const voltages = ["500 kV", "150 kV", "70 kV", "20 kV ke bawah"];
  document.getElementById("voltageGrid").innerHTML = voltages.map(v => {
    const d = data.filter(r => voltageGroup(r) === v);
    const total = d.length || 1;
    const extreme = d.filter(r => criticalityGroup(r) === "EXTREME").length;
    const tinggi = d.filter(r => criticalityGroup(r) === "TINGGI").length;
    const tua = d.filter(r => ageGroup(r) === "TUA").length;
    const sangatTua = d.filter(r => ageGroup(r) === "SANGAT TUA").length;

    return `
      <div class="card voltage-card" style="box-shadow:none;">
        <h3>${escapeHtml(v)}<span class="unit">${fmt.format(d.length)} unit</span></h3>
        <div class="bar-stack">
          <div class="seg-red" style="width:${extreme / total * 100}%"></div>
          <div class="seg-orange" style="width:${tinggi / total * 100}%"></div>
          <div class="seg-yellow" style="width:${sangatTua / total * 100}%"></div>
          <div class="seg-green" style="width:${tua / total * 100}%"></div>
        </div>
        <div class="legend">
          <span><i class="dot seg-red"></i>Extreme ${fmt.format(extreme)}</span>
          <span><i class="dot seg-orange"></i>Tinggi ${fmt.format(tinggi)}</span>
          <span><i class="dot seg-yellow"></i>Sangat Tua ${fmt.format(sangatTua)}</span>
          <span><i class="dot seg-green"></i>Tua ${fmt.format(tua)}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderDatabaseTable(data) {
  const rows = data.slice(0, 200).map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(getIdEqp(r) || "-")}</td>
      <td><b>${escapeHtml(getUpt(r) || "-")}</b></td>
      <td>${escapeHtml(getGi(r) || "-")}</td>
      <td>${escapeHtml(getBay(r) || "-")}</td>
      <td>${escapeHtml(getPhasa(r) || "-")}</td>
      <td>${escapeHtml(voltageGroup(r))}</td>
      <td>${escapeHtml(getMerek(r) || "-")}</td>
      <td>${escapeHtml(getTipe(r) || "-")}</td>
      <td>${escapeHtml(getTahunOperasi(r) || "-")}</td>
      <td>${escapeHtml(getTglInspeksi(r) || "-")}</td>
      <td>${criticalityBadge(criticalityGroup(r))}</td>
      <td>${usiaBadge(ageGroup(r))}</td>
      <td>${statusHiBadge(getStatusHi(r))}</td>
      <td>${priorityBadge(priorityLabel(r))}</td>
      <td><b>${getNilaiHi(r) || "-"}</b></td>
      <td class="wrap">${escapeHtml(getJustifikasi(r) || "-")}</td>
    </tr>
  `).join("");

  document.getElementById("databaseTable").innerHTML = `
    <thead>
      <tr>
        <th>No</th>
        <th>IdEqp</th>
        <th>UPT</th>
        <th>GI</th>
        <th>Bay</th>
        <th>Phasa</th>
        <th>Tegangan</th>
        <th>Merek</th>
        <th>Tipe</th>
        <th>Tahun Operasi</th>
        <th>Tgl Inspeksi</th>
        <th>Criticality</th>
        <th>Usia</th>
        <th>Status HI</th>
        <th>Priority</th>
        <th>Nilai HI</th>
        <th>Justifikasi</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderRtlTable(data) {
  const rows = data
    .filter(r => getRtl(r))
    .sort((a, b) => riskScore(b) - riskScore(a))
    .slice(0, 100)
    .map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><b>${escapeHtml(getGi(r) || "-")}</b></td>
        <td>${escapeHtml(getBay(r) || "-")}</td>
        <td>${escapeHtml(getPhasa(r) || "-")}</td>
        <td>${criticalityBadge(criticalityGroup(r))}</td>
        <td>${usiaBadge(ageGroup(r))}</td>
        <td>${priorityBadge(priorityLabel(r))}</td>
        <td class="wrap">${escapeHtml(getJustifikasi(r) || "-")}</td>
        <td class="wrap">${escapeHtml(getRtl(r) || "-")}</td>
      </tr>
    `).join("");

  document.getElementById("rtlTable").innerHTML = `
    <thead>
      <tr>
        <th>No</th>
        <th>GI</th>
        <th>Bay</th>
        <th>Phasa</th>
        <th>Criticality</th>
        <th>Usia</th>
        <th>Prioritas</th>
        <th>Justifikasi</th>
        <th>Rencana Tindak Lanjut</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="9">Belum ada data RTL pada filter ini.</td></tr>`}</tbody>
  `;
}

function exportCSV() {
  const data = filteredData();
  const headers = ["UPT", "GI", "Bay", "Phasa", "Tegangan", "Merek", "Tipe", "Tahun Operasi", "Tgl Inspeksi", "Criticality", "Status Usia", "Status HI", "Priority", "Nilai HI", "Skor Risiko", "Justifikasi", "Rencana Tindak Lanjut"];
  const rows = data.map(r => [
    getUpt(r), getGi(r), getBay(r), getPhasa(r), voltageGroup(r), getMerek(r), getTipe(r),
    getTahunOperasi(r), getTglInspeksi(r), criticalityGroup(r), ageGroup(r), getStatusHi(r), priorityLabel(r), getNilaiHi(r), riskScore(r),
    getJustifikasi(r), getRtl(r)
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(value => `"${String(value || "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export-dashboard-ahi-mtu.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function renderAll() {
  renderTabs();
  const data = filteredData();
  updateHero();
  updateKpi(data);
  renderUptTable();
  renderCharts(data);
  renderPriorityTable(data);
  renderVoltage(data);
  renderDatabaseTable(data);
  renderRtlTable(data);
}

async function loadData() {
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error("Gagal membaca spreadsheet. Pastikan akses Google Sheet = Anyone with the link - Viewer.");
    const text = await res.text();
    rawData = parseCSV(text);
    selectedUpt = document.getElementById("filterUpt")?.value || "SEMUA";
    renderFilters();
    renderAll();
  } catch (err) {
    alert(err.message);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

loadData();
