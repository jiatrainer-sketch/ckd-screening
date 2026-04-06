
// ── FIREBASE CONFIG ───────────────────────────────────────────────────
const FB_URL = 'https://w-medical-ckd-default-rtdb.firebaseio.com';
const RECORDS_KEY = 'ckd_records_wmedical';
const AUDIT_KEY   = 'ckd_audit_wmedical';

async function storageGet(key) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${FB_URL}/${key}.json`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function storageSet(key, value) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${FB_URL}/${key}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
      signal: ctrl.signal
    });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}

// ── STATE ────────────────────────────────────────────────────────────
let records = [];
let currentFilter = 'all';
let isOnline = false;

// ── SYNC STATUS ──────────────────────────────────────────────────────
function setSyncStatus(status) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (status === 'online') {
    dot.className = 'sync-dot online';
    lbl.textContent = 'เชื่อมต่อแล้ว ✓';
    isOnline = true;
    document.getElementById('info-status').textContent = '✅ พร้อมใช้งาน — ข้อมูลจะ sync ทุกเครื่องที่เปิด link นี้';
  } else if (status === 'syncing') {
    dot.className = 'sync-dot syncing';
    lbl.textContent = 'กำลัง sync...';
  } else {
    dot.className = 'sync-dot';
    lbl.textContent = 'ออฟไลน์';
    document.getElementById('info-status').textContent = '⚠️ ไม่สามารถเชื่อมต่อได้ — ข้อมูลจะเก็บในเครื่องนี้ก่อน';
  }
}

// ── INIT ─────────────────────────────────────────────────────────────
async function init() {
  checkPinRequired();
  updateApiKeyStatus();
  updatePinStatus();
  renderList();
  renderDashboard();
  // โหลด Firebase ใน background — ไม่บล็อก UI
  loadRecords();
  setInterval(() => {
    if (document.getElementById('page-records').classList.contains('active') ||
        document.getElementById('page-dashboard').classList.contains('active')) {
      loadRecords();
    }
  }, 30000);
}

async function loadRecords() {
  setSyncStatus('syncing');
  try {
    const data = await storageGet(RECORDS_KEY);
    records = Array.isArray(data) ? data : [];
    setSyncStatus('online');
  } catch {
    setSyncStatus('offline');
  }
  renderList();
  renderDashboard();
}

// ── TABS ─────────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
  if (name === 'records') loadRecords();
  if (name === 'dashboard') loadRecords();
}

// ── RISK SCORE ───────────────────────────────────────────────────────
function calcRisk(age, disease, prot, glc, sbp) {
  let s = 0;
  const a = parseInt(age) || 0;
  if (a >= 60) s += 2; else if (a >= 40) s += 1;
  const d = (disease || '').toLowerCase();
  if (d.includes('dm') || d.includes('เบาหวาน') || d.includes('diabetes')) s += 2;
  if (d.includes('htn') || d.includes('ความดัน') || d.includes('hyper')) s += 2;
  if (d.includes('ckd') || d.includes('ไต')) s += 2;
  if (prot === '3+') s += 3;
  else if (prot === '2+') s += 2;
  else if (prot === '1+') s += 1;
  if (glc && glc !== 'Negative') s += 1;
  const bp = parseInt(sbp) || 0;
  if (bp >= 140) s += 2; else if (bp >= 130) s += 1;
  if (s >= 6) return { level: 'High', color: 'var(--red)', cls: 'risk-high', icon: '🔴', score: s };
  if (s >= 3) return { level: 'Medium', color: 'var(--gold)', cls: 'risk-med', icon: '🟡', score: s };
  return { level: 'Low', color: 'var(--green)', cls: 'risk-low', icon: '🟢', score: s };
}

// ── DIPSTICK ─────────────────────────────────────────────────────────
document.querySelectorAll('.dip-opt').forEach(opt => {
  opt.addEventListener('click', function() {
    const g = this.dataset.g;
    document.querySelectorAll(`.dip-opt[data-g="${g}"]`).forEach(o => o.classList.remove('sel-neg','sel-pos'));
    this.classList.add(this.dataset.pos === 'true' ? 'sel-pos' : 'sel-neg');
    this.querySelector('input').checked = true;
    updateBadge();
  });
});

function getVal(name) {
  const r = document.querySelector(`input[name="${name}"]:checked`);
  return r ? r.value : null;
}

function updateBadge() {
  const prot = getVal('prot'), glc = getVal('glc');
  const sbp  = document.getElementById('inp-sbp').value;
  const age  = document.getElementById('inp-age').value;
  const disease = document.getElementById('inp-disease').value;
  const wrap = document.getElementById('result-badge-wrap');
  const riskWrap = document.getElementById('risk-score-wrap');

  if (!prot && !glc) { wrap.innerHTML = ''; riskWrap.innerHTML = ''; return; }

  const pp = prot && prot !== 'Negative', gp = glc && glc !== 'Negative';
  if (pp || gp) {
    const parts = [];
    if (pp) parts.push(`Protein ${prot}`);
    if (gp) parts.push(`Glucose ${glc}`);
    wrap.innerHTML = `<div class="result-badge badge-pos">⚠️ ผลผิดปกติ: ${parts.join(', ')} — ควรตรวจ Phase 2</div>`;
  } else {
    wrap.innerHTML = `<div class="result-badge badge-neg">✅ ผลปกติ — Protein: Negative, Glucose: Negative</div>`;
  }

  if (prot && glc) {
    const risk = calcRisk(age, disease, prot, glc, sbp);
    riskWrap.innerHTML = `
      <div class="risk-wrap">
        <div style="flex:1">
          <div class="risk-label">CKD Risk Score</div>
          <div class="risk-val ${risk.cls}">${risk.icon} ${risk.level} <span style="font-size:12px;font-weight:400;color:var(--muted)">(${risk.score} pts)</span></div>
        </div>
        ${sbp ? `<div style="text-align:right">
          <div class="risk-label">BP</div>
          <div style="font-weight:700;font-size:14px;color:${parseInt(sbp)>=140?'var(--red)':'var(--green)'}">${sbp}/${document.getElementById('inp-dbp').value||'—'}</div>
        </div>` : ''}
      </div>`;
  }
}

// ── SUBMIT ────────────────────────────────────────────────────────────
async function submitRecord() {
  const fname = document.getElementById('inp-fname').value.trim();
  const lname = document.getElementById('inp-lname').value.trim();
  const age   = document.getElementById('inp-age').value.trim();
  const prot  = getVal('prot');
  const glc   = getVal('glc');

  if (!fname || !lname) { showToast('กรุณากรอกชื่อ-นามสกุล'); return; }
  if (!age)              { showToast('กรุณากรอกอายุ'); return; }
  if (!prot || !glc)     { showToast('กรุณาเลือกผล Dipstick ทั้ง 2 ค่า'); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  showLoading('กำลังบันทึกข้อมูล...');

  const sbp     = document.getElementById('inp-sbp').value.trim();
  const dbp     = document.getElementById('inp-dbp').value.trim();
  const disease = document.getElementById('inp-disease').value.trim();
  const risk    = calcRisk(age, disease, prot, glc, sbp);
  const isPos   = prot !== 'Negative' || glc !== 'Negative';

  const rec = {
    id: Date.now().toString() + Math.random().toString(36).slice(2,6),
    date: new Date().toLocaleDateString('th-TH'),
    time: new Date().toLocaleTimeString('th-TH', {hour:'2-digit',minute:'2-digit'}),
    fname, lname,
    hn:       document.getElementById('inp-hn').value.trim(),
    idNumber: document.getElementById('inp-idnum').value.trim(),
    age, gender: document.getElementById('inp-gender').value,
    phone:   document.getElementById('inp-phone').value.trim(),
    group:   document.getElementById('inp-group').value,
    disease, sbp, dbp,
    note:    document.getElementById('inp-note').value.trim(),
    prot, glc, isPositive: isPos, status: 'new',
    riskLevel: risk.level, riskScore: risk.score,
  };

  const latest = await storageGet(RECORDS_KEY) || [];
  latest.unshift(rec);
  const ok = await storageSet(RECORDS_KEY, latest);
  records = latest;

  hideLoading();
  btn.disabled = false;

  if (!ok) showToast('⚠️ บันทึกเฉพาะในเครื่อง (ไม่มี connection)');

  document.getElementById('suc-icon').textContent  = isPos ? '⚠️' : '✅';
  document.getElementById('suc-title').textContent = isPos ? 'Positive — ควรตรวจ Phase 2' : 'บันทึกสำเร็จ ✓';
  document.getElementById('suc-sub').innerHTML = isPos
    ? `<b>${fname} ${lname}</b><br>Protein: <b style="color:var(--red)">${prot}</b> · Glucose: <b style="color:var(--red)">${glc}</b><br>Risk: <b style="color:${risk.color}">${risk.icon} ${risk.level}</b>${sbp ? `<br>BP: ${sbp}/${dbp||'—'} mmHg` : ''}<br><br>⚡ แนะนำตรวจ Phase 2:<br>UACR + Cr + eGFR`
    : `<b>${fname} ${lname}</b><br>Protein: Negative · Glucose: Negative<br>Risk: <b style="color:${risk.color}">${risk.icon} ${risk.level}</b><br><br>บันทึกเข้าระบบ Shared แล้ว ✓`;
  document.getElementById('success-screen').classList.add('show');
}

function closeSuccess() {
  document.getElementById('success-screen').classList.remove('show');
  ['inp-hn','inp-idnum','inp-fname','inp-lname','inp-age','inp-phone','inp-disease','inp-sbp','inp-dbp','inp-note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('inp-gender').value = '';
  document.getElementById('inp-group').value = 'ทั่วไป';
  document.querySelectorAll('.dip-opt').forEach(o => o.classList.remove('sel-neg','sel-pos'));
  document.querySelectorAll('.dip-opt input').forEach(i => i.checked = false);
  document.getElementById('result-badge-wrap').innerHTML = '';
  document.getElementById('risk-score-wrap').innerHTML = '';
}

// ── LIST ──────────────────────────────────────────────────────────────
function setFilter(f, el) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderList();
}

function getFiltered() {
  const q = (document.getElementById('search-inp')?.value || '').toLowerCase();
  return records.filter(r => {
    const mq = !q || `${r.fname} ${r.lname} ${r.phone||''} ${r.hn||''}`.toLowerCase().includes(q);
    let mf = true;
    if (currentFilter === 'positive')      mf = r.isPositive;
    if (currentFilter === 'negative')      mf = !r.isPositive;
    if (currentFilter === 'phase2-needed') mf = r.isPositive && r.status === 'new';
    if (currentFilter === 'rx')            mf = r.status === 'rx' || r.status === 'done';
    if (currentFilter === 'high-risk')     mf = r.riskLevel === 'High';
    if (currentFilter === 'overdue')       mf = r.isPositive && r.status === 'new' && getDaysSince(r) >= 30;
    return mq && mf;
  });
}

function renderList() {
  const list = document.getElementById('record-list');
  const filtered = getFiltered();

  const need = records.filter(r => r.isPositive && r.status === 'new').length;
  const banner = document.getElementById('phase2-banner');
  banner.style.display = need > 0 ? 'flex' : 'none';
  document.getElementById('phase2-count').textContent = need;

  if (!filtered.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">${records.length ? '🔍' : '📋'}</div>${records.length ? 'ไม่พบข้อมูล' : 'ยังไม่มีข้อมูล<br>เริ่มลงทะเบียนได้เลย'}</div>`;
    return;
  }

  list.innerHTML = filtered.map(r => {
    const pb = r.prot !== 'Negative' ? `<span class="rbadge rbadge-pos">Prot ${r.prot}</span>` : `<span class="rbadge rbadge-neg">Prot NEG</span>`;
    const gb = r.glc  !== 'Negative' ? `<span class="rbadge rbadge-pos">Glc ${r.glc}</span>`  : `<span class="rbadge rbadge-neg">Glc NEG</span>`;
    const sb = r.status==='phase2'?`<span class="rbadge rbadge-phase2">Phase 2 ✓</span>`:r.status==='rx'?`<span class="rbadge rbadge-rx">ได้รับยา ✓</span>`:r.status==='done'?`<span class="rbadge rbadge-neg">Follow-up ✓</span>`:'';
    const aiScanBadge = r.aiScanned ? `<span class="rbadge" style="background:rgba(23,184,153,.12);color:var(--teal)">🤖 AI</span>` : '';
    const riskLvl = r.riskLevel || calcRisk(r.age, r.disease, r.prot, r.glc, r.sbp).level;
    const riskIcon = riskLvl==='High'?'🔴':riskLvl==='Medium'?'🟡':'🟢';
    const riskCls  = riskLvl==='High'?'rbadge-risk-high':riskLvl==='Medium'?'rbadge-risk-med':'rbadge-risk-low';
    const rb = `<span class="rbadge ${riskCls}">${riskIcon} ${riskLvl}</span>`;
    const bpBadge = r.sbp ? `<span class="rbadge ${parseInt(r.sbp)>=140?'rbadge-pos':'rbadge-neg'}">BP ${r.sbp}/${r.dbp||'—'}</span>` : '';

    const apptBadge = r.appointmentDate ? (() => {
      const passed = new Date(r.appointmentDate).getTime() < Date.now() && !['phase2','rx','done'].includes(r.status);
      return `<span class="rbadge" style="background:${passed?'rgba(192,57,43,.12)':'rgba(26,82,118,.1)'};color:${passed?'var(--red)':'var(--blue)'}">📅 ${r.appointmentDate}${passed?' ⚠️':''}</span>`;
    })() : '';

    const stBtns = r.isPositive ? `
      <div class="status-row">
        <button class="status-btn ${['phase2','rx','done'].includes(r.status)?'ap2':''}" onclick="updateStatus('${r.id}','phase2')">Phase 2 ✓</button>
        <button class="status-btn ${['rx','done'].includes(r.status)?'arx':''}" onclick="updateStatus('${r.id}','rx')">ได้รับยา ✓</button>
        <button class="status-btn ${r.status==='done'?'adn':''}" onclick="updateStatus('${r.id}','done')">Follow-up ✓</button>
        <button class="status-btn" style="color:var(--blue);border-color:rgba(26,82,118,.3)" onclick="showApptModal('${r.id}')">📅 นัด</button>
        <button class="status-btn" style="color:var(--teal);border-color:rgba(14,138,116,.3)" onclick="printReferral('${r.id}')">🖨️ ใบส่งตรวจ</button>
        <button class="status-btn" style="color:var(--blue);border-color:rgba(26,82,118,.3)" onclick="exportPatientPDF('${r.id}')">📄 PDF</button>
        <button class="status-btn" style="color:var(--teal);border-color:rgba(14,138,116,.3)" onclick="shareResult('${r.id}')">📤 Line</button>
        <button class="status-btn" style="color:var(--red);border-color:rgba(192,57,43,.3)" onclick="deleteRecord('${r.id}')">🗑️</button>
      </div>` : `
      <div class="status-row">
        <button class="status-btn" style="color:var(--blue);border-color:rgba(26,82,118,.3)" onclick="exportPatientPDF('${r.id}')">📄 PDF</button>
        <button class="status-btn" style="color:var(--teal);border-color:rgba(14,138,116,.3)" onclick="shareResult('${r.id}')">📤 Line</button>
        <button class="status-btn" style="color:var(--red);border-color:rgba(192,57,43,.3)" onclick="deleteRecord('${r.id}')">🗑️ ลบ</button>
      </div>`;

    return `<div class="record-item">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="record-name">${r.fname} ${r.lname}</div>
        ${r.hn ? `<span style="font-size:10px;color:var(--muted);background:var(--bg);padding:2px 8px;border-radius:20px;border:1px solid var(--border)">HN: ${r.hn}</span>` : ''}
      </div>
      <div class="record-meta">อายุ ${r.age} · ${r.gender||'—'} · ${r.group} · ${r.date} ${r.time}</div>
      <div class="record-badges">${pb}${gb}${bpBadge}${rb}${sb}${aiScanBadge}${apptBadge}</div>
      ${r.disease ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">🏥 ${r.disease}</div>` : ''}
      ${r.note ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">📝 ${r.note}</div>` : ''}
      ${stBtns}
    </div>`;
  }).join('');
}

async function updateStatus(id, status) {
  showLoading('กำลังอัปเดต...');
  const latest = await storageGet(RECORDS_KEY) || [];
  const r = latest.find(x => x.id === id);
  if (r) { r.status = status; await storageSet(RECORDS_KEY, latest); records = latest; }
  hideLoading();
  renderList(); renderDashboard();
  showToast('อัปเดตสถานะแล้ว ✓');
}

async function deleteRecord(id) {
  if (!confirm('ลบรายการนี้?')) return;
  showLoading('กำลังลบ...');
  const latest = (await storageGet(RECORDS_KEY) || []).filter(r => r.id !== id);
  await storageSet(RECORDS_KEY, latest);
  records = latest;
  hideLoading();
  renderList(); renderDashboard();
  showToast('ลบแล้ว');
}

// ── DASHBOARD ─────────────────────────────────────────────────────────
function renderDashboard() {
  const src   = getDateFilteredRecords();
  const total = src.length;
  const pos   = src.filter(r => r.isPositive).length;
  const ph2   = src.filter(r => ['phase2','rx','done'].includes(r.status)).length;
  const rx    = src.filter(r => ['rx','done'].includes(r.status)).length;
  renderOverdue(src);

  document.getElementById('d-total').textContent  = total;
  document.getElementById('d-pos').textContent    = pos;
  document.getElementById('d-phase2').textContent = ph2;
  document.getElementById('d-rx').textContent     = rx;

  const pr = total ? Math.round(pos/total*100) : 0;
  const p2r= pos   ? Math.round(ph2/pos*100)   : 0;
  const rxr= ph2   ? Math.round(rx/ph2*100)    : 0;

  document.getElementById('d-pos-rate').textContent = pr+'%';
  document.getElementById('d-p2-rate').textContent  = p2r+'%';
  document.getElementById('d-rx-rate').textContent  = rxr+'%';
  document.getElementById('bar-pos').style.width = pr+'%';
  document.getElementById('bar-p2').style.width  = p2r+'%';
  document.getElementById('bar-rx').style.width  = rxr+'%';

  const rl = ph2*800, rd = ph2*600, rrx = rx*3500;
  document.getElementById('rev-lab').textContent  = '฿'+rl.toLocaleString();
  document.getElementById('rev-doc').textContent  = '฿'+rd.toLocaleString();
  document.getElementById('rev-rx').textContent   = '฿'+rrx.toLocaleString();
  document.getElementById('rev-total').textContent= '฿'+(rl+rd+rrx).toLocaleString();
  renderScanCost();
  updatePinStatus();

  const riskCounts = {High:0, Medium:0, Low:0};
  src.forEach(r => {
    const lvl = r.riskLevel || calcRisk(r.age, r.disease, r.prot, r.glc, r.sbp).level;
    riskCounts[lvl] = (riskCounts[lvl]||0) + 1;
  });
  const rdEl = document.getElementById('risk-dist');
  if (total) {
    rdEl.innerHTML = [['High','🔴','var(--red)'],['Medium','🟡','var(--gold)'],['Low','🟢','var(--green)']].map(([l,ic,c]) => {
      const cnt = riskCounts[l]||0;
      const pct = total ? Math.round(cnt/total*100) : 0;
      return `<div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span>${ic} ${l} Risk</span>
          <span style="font-weight:700;color:${c}">${cnt} คน (${pct}%)</span>
        </div>
        <div style="background:var(--bg);border-radius:20px;height:7px;overflow:hidden">
          <div style="height:100%;background:${c};border-radius:20px;transition:.6s;width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');
  } else {
    rdEl.innerHTML = '<div class="empty" style="padding:12px">ยังไม่มีข้อมูล</div>';
  }

  const groups = {};
  src.forEach(r => {
    if (!groups[r.group]) groups[r.group] = {total:0,pos:0};
    groups[r.group].total++;
    if (r.isPositive) groups[r.group].pos++;
  });
  const gEl = document.getElementById('group-bd');
  gEl.innerHTML = Object.keys(groups).length
    ? Object.entries(groups).map(([g,v]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px">
        <span style="font-size:13px;font-weight:600;color:var(--navy)">${g}</span>
        <span style="font-size:12px;color:var(--muted)">${v.total} คน · Pos <b style="color:var(--red)">${v.pos}</b></span>
      </div>`).join('')
    : '<div class="empty" style="padding:12px">ยังไม่มีข้อมูล</div>';
}

// ── PRINT REFERRAL ────────────────────────────────────────────────────
function printReferral(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  const risk = calcRisk(r.age, r.disease, r.prot, r.glc, r.sbp);
  const w = window.open('', '_blank', 'width=620,height=850');
  w.document.write(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <title>ใบส่งตรวจ Phase 2 — ${r.fname} ${r.lname}</title>
  <style>
    body{font-family:'Sarabun',Arial,sans-serif;padding:24px;max-width:520px;margin:0 auto;color:#1A2A3A}
    h2{color:#0D2B45;margin-bottom:4px;font-size:18px}
    .subtitle{color:#555;font-size:13px;margin-bottom:16px;border-bottom:2px solid #0E8A74;padding-bottom:10px}
    .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee;font-size:14px}
    .label{color:#666;font-size:13px}
    .badge{padding:3px 12px;border-radius:20px;font-weight:bold;font-size:13px;display:inline-block}
    .pos{background:#fde8e8;color:#C0392B}.neg{background:#e8fde8;color:#27AE60}
    .risk-High{background:#fde8e8;color:#C0392B}.risk-Medium{background:#fff3cd;color:#9A7010}.risk-Low{background:#e8fde8;color:#27AE60}
    .order-box{background:#e8f4f8;border-left:4px solid #1A5276;padding:12px 14px;border-radius:6px;font-size:13px;margin-top:16px;line-height:1.8}
    .footer{margin-top:20px;font-size:11px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:10px}
    .print-btn{margin-top:16px;padding:10px 24px;background:#0E8A74;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-family:inherit}
    @media print{.print-btn{display:none}}
  </style></head><body>
  <h2>🏥 W Medical Hospital</h2>
  <div class="subtitle">ใบส่งตรวจยืนยัน Phase 2 — CKD Screening Program</div>
  <div class="row"><span class="label">ชื่อ-นามสกุล</span><b>${r.fname} ${r.lname}</b></div>
  ${r.hn ? `<div class="row"><span class="label">HN</span><b>${r.hn}</b></div>` : ''}
  ${r.idNumber ? `<div class="row"><span class="label">เลข ID</span><b>${r.idNumber}</b></div>` : ''}
  <div class="row"><span class="label">อายุ / เพศ</span>${r.age} ปี / ${r.gender||'—'}</div>
  <div class="row"><span class="label">เบอร์โทร</span>${r.phone||'—'}</div>
  <div class="row"><span class="label">กลุ่ม</span>${r.group}</div>
  <div class="row"><span class="label">โรคประจำตัว</span>${r.disease||'ไม่มี'}</div>
  ${r.sbp ? `<div class="row"><span class="label">Blood Pressure</span><b style="color:${parseInt(r.sbp)>=140?'#C0392B':'#27AE60'}">${r.sbp}/${r.dbp||'—'} mmHg</b></div>` : ''}
  <div class="row"><span class="label">วันที่ตรวจ Phase 1</span>${r.date} ${r.time}</div>
  <div style="margin-top:14px;margin-bottom:6px;font-weight:700;color:#1A5276">ผล Dipstick (Phase 1)</div>
  <div class="row"><span class="label">Protein</span><span class="badge ${r.prot!=='Negative'?'pos':'neg'}">${r.prot}</span></div>
  <div class="row"><span class="label">Glucose</span><span class="badge ${r.glc!=='Negative'?'pos':'neg'}">${r.glc}</span></div>
  <div class="row"><span class="label">CKD Risk Score</span><span class="badge risk-${risk.level}">${risk.icon} ${risk.level} (${risk.score} pts)</span></div>
  ${r.note ? `<div class="row"><span class="label">หมายเหตุ</span>${r.note}</div>` : ''}
  <div class="order-box"><b>🔬 รายการตรวจ Phase 2 ที่แนะนำ:</b><br>
    ☐ Urine Albumin-to-Creatinine Ratio (UACR)<br>
    ☐ Serum Creatinine → eGFR (CKD-EPI 2021)<br>
    ${r.glc!=='Negative'?'☐ HbA1C<br>':''}
    ${r.sbp&&parseInt(r.sbp)>=130?'☐ ติดตาม BP / ประเมิน HTN<br>':''}
    ☐ CBC (ถ้าจำเป็น)
  </div>
  <div class="footer">W Medical Hospital · www.w-medical-hospital.com<br>
  พิมพ์วันที่ ${new Date().toLocaleDateString('th-TH', {year:'numeric',month:'long',day:'numeric'})}</div>
  <br><button class="print-btn" onclick="window.print()">🖨️ พิมพ์ใบส่งตรวจ</button>
  </body></html>`);
  w.document.close();
}

// ── PRINT DASHBOARD PDF ───────────────────────────────────────────────
function printDashboard() {
  const total = records.length;
  const pos   = records.filter(r => r.isPositive).length;
  const ph2   = records.filter(r => ['phase2','rx','done'].includes(r.status)).length;
  const rx    = records.filter(r => ['rx','done'].includes(r.status)).length;
  const pr    = total ? Math.round(pos/total*100) : 0;
  const rl    = ph2*800, rd = ph2*600, rrx = rx*3500;

  const riskCounts = {High:0,Medium:0,Low:0};
  records.forEach(r => { const lvl = r.riskLevel || calcRisk(r.age,r.disease,r.prot,r.glc,r.sbp).level; riskCounts[lvl]=(riskCounts[lvl]||0)+1; });

  const groups = {};
  records.forEach(r => {
    if(!groups[r.group]) groups[r.group]={total:0,pos:0};
    groups[r.group].total++;
    if(r.isPositive) groups[r.group].pos++;
  });

  const w = window.open('','_blank','width=700,height=950');
  w.document.write(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8"><title>รายงาน CKD Screening — W Medical</title>
  <style>
    body{font-family:'Sarabun',Arial,sans-serif;padding:28px;max-width:620px;margin:0 auto;color:#1A2A3A}
    h2{color:#0D2B45;margin-bottom:4px}
    .subtitle{color:#555;font-size:13px;border-bottom:2px solid #0E8A74;padding-bottom:10px;margin-bottom:16px}
    .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
    .stat{background:#f5f8fa;border-radius:10px;padding:14px;text-align:center;border:1px solid #e0e8f0}
    .stat-num{font-size:34px;font-weight:900;line-height:1}
    .stat-label{font-size:11px;color:#666;margin-top:4px}
    h3{color:#1A5276;margin:20px 0 8px;font-size:15px}
    .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee;font-size:14px}
    .rev-total{background:#0D2B45;color:#7FFFD4;padding:12px 16px;border-radius:10px;display:flex;justify-content:space-between;font-weight:bold;margin-top:8px}
    .bar-wrap{margin-bottom:10px}
    .bar-bg{background:#eee;border-radius:20px;height:8px;overflow:hidden;margin-top:4px}
    .bar-fill{height:100%;border-radius:20px}
    .footer{margin-top:24px;font-size:11px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:12px}
    .print-btn{margin-top:16px;padding:10px 24px;background:#0E8A74;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-family:inherit}
    @media print{.print-btn{display:none}}
  </style></head><body>
  <h2>📊 W Medical Hospital</h2>
  <div class="subtitle">รายงานสรุป CKD Screening Program · พิมพ์ ${new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'})}</div>
  <div class="stat-grid">
    <div class="stat"><div class="stat-num" style="color:#1A5276">${total}</div><div class="stat-label">ผู้เข้าร่วมทั้งหมด</div></div>
    <div class="stat"><div class="stat-num" style="color:#C0392B">${pos}</div><div class="stat-label">Positive (${pr}%)</div></div>
    <div class="stat"><div class="stat-num" style="color:#0E8A74">${ph2}</div><div class="stat-label">ตรวจ Phase 2 แล้ว</div></div>
    <div class="stat"><div class="stat-num" style="color:#D4A017">${rx}</div><div class="stat-label">ได้รับยา</div></div>
  </div>
  <h3>⚠️ Risk Distribution</h3>
  ${['High','Medium','Low'].map(l=>{
    const c=l==='High'?'#C0392B':l==='Medium'?'#D4A017':'#27AE60';
    const ic=l==='High'?'🔴':l==='Medium'?'🟡':'🟢';
    const cnt=riskCounts[l]||0;
    const pct=total?Math.round(cnt/total*100):0;
    return `<div class="bar-wrap"><div style="display:flex;justify-content:space-between;font-size:12px"><span>${ic} ${l} Risk</span><span style="font-weight:700;color:${c}">${cnt} คน (${pct}%)</span></div><div class="bar-bg"><div class="bar-fill" style="background:${c};width:${pct}%"></div></div></div>`;
  }).join('')}
  <h3>📈 อัตราการ Convert</h3>
  <div class="row"><span>Positive Rate</span><b style="color:#C0392B">${pr}%</b></div>
  <div class="row"><span>Phase 2 Rate (of Positive)</span><b style="color:#1A5276">${pos?Math.round(ph2/pos*100):0}%</b></div>
  <div class="row"><span>Rx Convert Rate (of Phase 2)</span><b style="color:#D4A017">${ph2?Math.round(rx/ph2*100):0}%</b></div>
  <h3>💰 ประมาณการรายได้</h3>
  <div class="row"><span style="color:#666">Lab Phase 2</span><b>฿${rl.toLocaleString()}</b></div>
  <div class="row"><span style="color:#666">ค่าแพทย์</span><b>฿${rd.toLocaleString()}</b></div>
  <div class="row"><span style="color:#666">ยา/เดือน (recurring)</span><b style="color:#0E8A74">฿${rrx.toLocaleString()}</b></div>
  <div class="rev-total"><span>รวมประมาณการ</span><span>฿${(rl+rd+rrx).toLocaleString()}</span></div>
  <h3>👥</h3>
  ${Object.entries(groups).map(([g,v])=>`<div class="row"><span>${g}</span><span>${v.total} คน · Positive <b style="color:#C0392B">${v.pos}</b></span></div>`).join('')||'<div style="color:#aaa;font-size:13px">ไม่มีข้อมูล</div>'}
  <div class="footer">W Medical Hospital · CKD Screening Program · เอกสารนี้เป็นความลับ</div>
  <br><button class="print-btn" onclick="window.print()">🖨️ พิมพ์ / Save PDF</button>
  </body></html>`;
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── EXPORT CSV ────────────────────────────────────────────────────────
function exportCSV() {
  if (!records.length) { showToast('ยังไม่มีข้อมูล'); return; }
  const h = ['วันที่','เวลา','HN','เลข ID','ชื่อ','นามสกุล','อายุ','เพศ','เบอร์','กลุ่ม','โรคประจำตัว','Systolic BP','Diastolic BP','Protein','Glucose','Positive','Risk Level','Risk Score','สถานะ','AI Scanned','หมายเหตุ'];
  const rows = records.map(r => [r.date,r.time,r.hn||'',r.idNumber||'',r.fname,r.lname,r.age,r.gender,r.phone,r.group,r.disease,r.sbp||'',r.dbp||'',r.prot,r.glc,r.isPositive?'Yes':'No',r.riskLevel||'',r.riskScore||'',r.status,r.aiScanned?'Yes':'No',r.note]);
  const csv = '\uFEFF' + [h,...rows].map(r => r.map(c=>`"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download = `CKD_Screening_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('Export CSV สำเร็จ ✅');
}

// ── HELPERS ───────────────────────────────────────────────────────────
function showLoading(msg) {
  document.getElementById('loading-msg').textContent = msg || 'กำลังโหลด...';
  document.getElementById('loading-overlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('show');
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ════════════════════════════════════════════════════════════════════
//  AI SCAN MODULE
// ════════════════════════════════════════════════════════════════════

const CLAUDE_VISION_PROMPT = `คุณคือผู้ช่วยอ่านผล Dipstick สำหรับการคัดกรอง CKD ที่โรงพยาบาล

จากรูปภาพที่ได้รับ ให้วิเคราะห์ 3 ส่วน:

## 1. บัตรประจำตัว (ID Card / Passport / Work Permit)
- อ่านชื่อ-นามสกุล (ภาษาไทย หรือ ภาษาอังกฤษ)
- อ่านเลข ID (บัตร ปชช. 13 หลัก / Passport number / Work Permit number)
- ระบุประเภทบัตร: thai_id | passport | work_permit | unknown

## 2. Dipstick Strip (CYBOW 2P)
- CYBOW 2P มี 2 pads: Protein (บน) และ Glucose (ล่าง)
- เทียบสีแต่ละ pad กับ color reference chart บนกล่อง CYBOW 2P ที่อยู่ในรูป
- ให้ผลเป็น: Negative / 1+ / 2+ / 3+
- ถ้าไม่เห็นกล่อง CYBOW ให้ประเมินจากสีที่เห็นและ flag ว่า no_reference_chart

## 3. Confidence
- ให้คะแนนความมั่นใจ 0-100 สำหรับแต่ละค่าที่อ่านได้
- ถ้า confidence < 70 ให้ระบุใน flags

ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:
{
  "id_type": "thai_id | passport | work_permit | unknown",
  "id_number": "string or null",
  "first_name": "string or null",
  "last_name": "string or null",
  "protein": "Negative | 1+ | 2+ | 3+",
  "glucose": "Negative | 1+ | 2+ | 3+",
  "confidence": {
    "id": 0-100,
    "protein": 0-100,
    "glucose": 0-100
  },
  "flags": [],
  "notes": "string"
}`;

// AI Scan state
let aiScanData = {
  imageBase64: null,    // full res for API
  imageDataUrl: null,   // for display
  aiResult: null,
  originalAiResult: null,
  duplicateRecord: null,
  lastError: null,
};

// ── Show/hide scan states ─────────────────────────────────────────────
function showScanState(state) {
  ['idle','analyzing','review','duplicate','error'].forEach(s => {
    document.getElementById('scan-'+s).classList.toggle('active', s === state);
  });
}

// ── API Key Management ────────────────────────────────────────────────
function updateApiKeyStatus() {
  const key = localStorage.getItem('anthropic_api_key');
  const statusEl = document.getElementById('api-key-status');
  const setupCard = document.getElementById('api-setup-card');
  if (key) {
    statusEl.innerHTML = `<span style="font-size:11px;color:var(--teal)">🔑 API Key ตั้งค่าแล้ว (${key.slice(0,12)}...)</span>`;
    setupCard.style.display = 'none';
  } else {
    statusEl.innerHTML = `<span style="font-size:11px;color:var(--red)">⚠️ ยังไม่ได้ตั้งค่า API Key</span>`;
    setupCard.style.display = 'block';
  }
}

function toggleApiSetup() {
  const card = document.getElementById('api-setup-card');
  card.style.display = card.style.display === 'none' ? 'block' : 'none';
}

function saveApiKey() {
  const val = document.getElementById('inp-apikey').value.trim();
  if (!val.startsWith('sk-ant-')) {
    showToast('API Key ไม่ถูกต้อง — ต้องขึ้นต้นด้วย sk-ant-');
    return;
  }
  localStorage.setItem('anthropic_api_key', val);
  document.getElementById('inp-apikey').value = '';
  updateApiKeyStatus();
  showToast('บันทึก API Key แล้ว ✓');
}

// ── Image Compression ────────────────────────────────────────────────
function compressImage(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('โหลดรูปไม่ได้')); };
    img.src = url;
  });
}

// ── Handle Capture ────────────────────────────────────────────────────
async function handleScanCapture(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = ''; // reset so same file can be selected again

  try {
    // Compress for API (1200px, 80%)
    const fullDataUrl = await compressImage(file, 1200, 0.8);
    aiScanData.imageBase64 = fullDataUrl.split(',')[1];
    aiScanData.imageDataUrl = fullDataUrl;

    // Show preview while analyzing
    document.getElementById('scan-preview-img').src = fullDataUrl;
    showScanState('analyzing');

    await analyzeWithClaude();
  } catch(err) {
    showScanError('ไม่สามารถโหลดรูปได้', err.message);
  }
}

// ── Call Claude Vision API ────────────────────────────────────────────
async function analyzeWithClaude() {
  const apiKey = localStorage.getItem('anthropic_api_key');
  if (!apiKey) {
    showScanError('ยังไม่ได้ตั้งค่า API Key', 'กรุณาตั้งค่า Anthropic API Key ก่อนใช้งาน AI Scan');
    return;
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: CLAUDE_VISION_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: aiScanData.imageBase64 }
            },
            { type: 'text', text: 'วิเคราะห์รูปนี้และตอบเป็น JSON ตามรูปแบบที่กำหนด' }
          ]
        }]
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI ตอบกลับในรูปแบบที่ไม่รู้จัก');

    const result = JSON.parse(jsonMatch[0]);
    aiScanData.aiResult = result;
    aiScanData.originalAiResult = JSON.parse(JSON.stringify(result));
    incrementScanCount();

    // Check for duplicate by ID number
    if (result.id_number) {
      const dup = records.find(r => r.idNumber && r.idNumber === result.id_number);
      if (dup) {
        aiScanData.duplicateRecord = dup;
        showDuplicateAlert(dup, result);
        return;
      }
    }

    showReview(result);

  } catch(err) {
    let detail = err.message;
    if (detail.includes('401') || detail.includes('invalid x-api-key')) detail = 'API Key ไม่ถูกต้อง กรุณาตรวจสอบ';
    else if (detail.includes('429')) detail = 'ใช้งานเกิน limit กรุณารอสักครู่';
    else if (detail.includes('network') || detail.includes('fetch')) detail = 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต';
    showScanError('AI วิเคราะห์ไม่สำเร็จ', detail);
  }
}

// ── Show Review UI ────────────────────────────────────────────────────
function showReview(result) {
  document.getElementById('scan-review-img').src = aiScanData.imageDataUrl;

  // ID info
  const idTypeMap = { thai_id: 'บัตรประชาชนไทย', passport: 'Passport', work_permit: 'Work Permit', unknown: 'ไม่ระบุ' };
  document.getElementById('rv-idtype').textContent = idTypeMap[result.id_type] || result.id_type || '—';
  document.getElementById('rv-idnum').textContent = result.id_number || '(อ่านไม่ได้)';

  // Confidence badges
  const conf = result.confidence || {};
  document.getElementById('rv-id-conf').innerHTML   = confBadge(conf.id);
  document.getElementById('rv-fname-conf').innerHTML = confBadge(conf.id);
  document.getElementById('rv-prot-conf').innerHTML  = confBadge(conf.protein);
  document.getElementById('rv-glc-conf').innerHTML   = confBadge(conf.glucose);

  // Fill editable fields
  const fnameEl = document.getElementById('rv-fname');
  const lnameEl = document.getElementById('rv-lname');
  fnameEl.value = result.first_name || '';
  lnameEl.value = result.last_name || '';
  if ((conf.id || 100) < 70) { fnameEl.classList.add('field-low-conf'); lnameEl.classList.add('field-low-conf'); }
  else { fnameEl.classList.remove('field-low-conf'); lnameEl.classList.remove('field-low-conf'); }

  // Dipstick
  const protEl = document.getElementById('rv-prot');
  const glcEl  = document.getElementById('rv-glc');
  protEl.value = result.protein || 'Negative';
  glcEl.value  = result.glucose || 'Negative';
  if ((conf.protein || 100) < 70) protEl.classList.add('field-low-conf');
  else protEl.classList.remove('field-low-conf');
  if ((conf.glucose || 100) < 70) glcEl.classList.add('field-low-conf');
  else glcEl.classList.remove('field-low-conf');

  // Flags
  const flags = result.flags || [];
  const flagsWrap = document.getElementById('rv-flags-wrap');
  if (flags.length) {
    const flagLabels = { low_light:'⚠️ แสงน้อย', blurry:'⚠️ รูปเบลอ', strip_expired:'⚠️ Strip อาจหมดอายุ', no_reference_chart:'⚠️ ไม่เห็น color chart', id_not_found:'⚠️ ไม่พบบัตร ID' };
    flagsWrap.innerHTML = `<div class="flags-box">🚩 <b>ข้อสังเกต:</b> ${flags.map(f => flagLabels[f]||f).join(' · ')}</div>`;
  } else {
    flagsWrap.innerHTML = '';
  }

  // Notes
  const notesWrap = document.getElementById('rv-notes-wrap');
  if (result.notes) {
    notesWrap.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-top:6px;padding:8px;background:var(--bg);border-radius:8px">💬 ${result.notes}</div>`;
  } else {
    notesWrap.innerHTML = '';
  }

  showScanState('review');
}

function confBadge(score) {
  if (score == null) return '';
  const cls = score >= 80 ? 'conf-high' : score >= 60 ? 'conf-med' : 'conf-low';
  const icon = score >= 80 ? '✓' : score >= 60 ? '~' : '!';
  return `<span class="conf-badge ${cls}">${icon} ${score}%</span>`;
}

// ── Show Duplicate Alert ──────────────────────────────────────────────
function showDuplicateAlert(dup, aiResult) {
  document.getElementById('dup-info').innerHTML = `
    <div style="font-weight:700;font-size:14px;color:var(--navy);margin-bottom:4px">${dup.fname} ${dup.lname}</div>
    <div style="font-size:12px;color:var(--muted)">เลข ID: ${dup.idNumber}</div>
    <div style="font-size:12px;color:var(--muted)">ลงทะเบียนเมื่อ: ${dup.date} ${dup.time}</div>
    <div style="font-size:12px;color:var(--muted)">กลุ่ม: ${dup.group} · สถานะ: ${dup.status}</div>
    <div style="margin-top:6px;font-size:12px">
      Prot: <b>${dup.prot}</b> · Glucose: <b>${dup.glc}</b> · Risk: <b>${dup.riskLevel}</b>
    </div>`;

  // Still show review data underneath
  showReview(aiResult);
  showScanState('duplicate');
}

function viewDupHistory() {
  if (!aiScanData.duplicateRecord) return;
  showPage('records');
  setTimeout(() => {
    const el = document.getElementById('search-inp');
    if (el) { el.value = aiScanData.duplicateRecord.fname; renderList(); }
  }, 200);
}

async function saveFollowUp() {
  // Confirm as follow-up record linked to existing
  showToast('บันทึก Follow-up — กรุณากรอกข้อมูลในฟอร์ม');
  confirmAIScan(false, true); // isNew=false, isFollowUp=true
}

// ── Confirm AI Scan → Auto-fill Register Form ─────────────────────────
function confirmAIScan(forceNew = false, isFollowUp = false) {
  const result = aiScanData.aiResult;
  if (!result) return;

  // Read (possibly edited) values from review form
  const fname  = document.getElementById('rv-fname').value.trim();
  const lname  = document.getElementById('rv-lname').value.trim();
  const idnum  = result.id_number || '';
  const prot   = document.getElementById('rv-prot').value;
  const glc    = document.getElementById('rv-glc').value;

  // Detect overrides
  const overrides = [];
  if (prot !== aiScanData.originalAiResult?.protein)  overrides.push('protein');
  if (glc  !== aiScanData.originalAiResult?.glucose)  overrides.push('glucose');
  if (fname !== (aiScanData.originalAiResult?.first_name||'')) overrides.push('first_name');
  if (lname !== (aiScanData.originalAiResult?.last_name||''))  overrides.push('last_name');

  // Save audit log (fire-and-forget)
  saveAuditLog({
    scan_id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    scanned_at: new Date().toISOString(),
    scan_mode: 'combined',
    ai_model: 'claude-sonnet-4-20250514',
    ai_result: aiScanData.originalAiResult,
    ai_confidence: aiScanData.originalAiResult?.confidence,
    ai_flags: aiScanData.originalAiResult?.flags || [],
    human_override: overrides.length ? overrides : null,
    confirmed_at: new Date().toISOString(),
    is_follow_up: isFollowUp,
  });

  // Switch to register tab and pre-fill
  showPage('register');

  // Pre-fill fields
  document.getElementById('inp-fname').value  = fname;
  document.getElementById('inp-lname').value  = lname;
  document.getElementById('inp-idnum').value  = idnum;

  // Set dipstick selections
  setDipstickValue('prot', prot);
  setDipstickValue('glc',  glc);
  updateBadge();

  // Add note if follow-up
  if (isFollowUp && aiScanData.duplicateRecord) {
    document.getElementById('inp-note').value = `Follow-up จากการตรวจ ${aiScanData.duplicateRecord.date}`;
  }

  // Mark as AI-scanned (stored when submitting)
  window._pendingAiScan = true;

  showToast('✅ AI อ่านข้อมูลแล้ว — ตรวจสอบและกด "บันทึก"');

  // Reset scan state
  aiScanData = { imageBase64:null, imageDataUrl:null, aiResult:null, originalAiResult:null, duplicateRecord:null, lastError:null };
  showScanState('idle');
}

function setDipstickValue(name, value) {
  document.querySelectorAll(`.dip-opt[data-g="${name}"]`).forEach(opt => {
    opt.classList.remove('sel-neg','sel-pos');
    const input = opt.querySelector('input');
    if (input.value === value) {
      input.checked = true;
      opt.classList.add(opt.dataset.pos === 'true' ? 'sel-pos' : 'sel-neg');
    } else {
      input.checked = false;
    }
  });
}

// ── Audit Log ────────────────────────────────────────────────────────
async function saveAuditLog(entry) {
  try {
    const existing = await storageGet(AUDIT_KEY) || [];
    existing.unshift(entry);
    // Keep last 500 entries
    if (existing.length > 500) existing.splice(500);
    await storageSet(AUDIT_KEY, existing);
  } catch {}
}

// ── Navigation helpers ────────────────────────────────────────────────
function retakeScan() {
  aiScanData = { imageBase64:null, imageDataUrl:null, aiResult:null, originalAiResult:null, duplicateRecord:null, lastError:null };
  showScanState('idle');
  document.getElementById('scan-file-input').value = '';
  resetDipTimer();
}

function retryScan() {
  if (!aiScanData.imageBase64) { retakeScan(); return; }
  document.getElementById('scan-preview-img').src = aiScanData.imageDataUrl;
  showScanState('analyzing');
  analyzeWithClaude();
}

function goManualEntry() {
  // Pre-fill whatever AI managed to read (if any)
  if (aiScanData.aiResult) {
    const r = aiScanData.aiResult;
    if (r.first_name) document.getElementById('inp-fname').value = r.first_name;
    if (r.last_name)  document.getElementById('inp-lname').value = r.last_name;
    if (r.id_number)  document.getElementById('inp-idnum').value = r.id_number;
    if (r.protein) setDipstickValue('prot', r.protein);
    if (r.glucose) setDipstickValue('glc',  r.glucose);
    updateBadge();
  }
  showPage('register');
  showToast('กรอกข้อมูลที่เหลือในฟอร์ม');
}

function showScanError(msg, detail) {
  document.getElementById('scan-error-msg').textContent = msg;
  document.getElementById('scan-error-detail').textContent = detail || '';
  aiScanData.lastError = msg;
  showScanState('error');
}

// ════════════════════════════════════════════════════════════════════
//  PIN LOCK
// ════════════════════════════════════════════════════════════════════
const PIN_STORE = 'ckd_pin_h';
const PIN_SESSION = 'ckd_sess';
let _pinBuf = '';

function _hashPin(p) {
  let h = 5381;
  for (let i = 0; i < p.length; i++) h = (Math.imul(33, h) ^ p.charCodeAt(i)) >>> 0;
  return h.toString(36) + '.' + p.length;
}

function checkPinRequired() {
  if (!localStorage.getItem(PIN_STORE)) return;
  if (sessionStorage.getItem(PIN_SESSION) === '1') return;
  document.getElementById('pin-overlay').classList.add('show');
}

function pinKey(k) {
  const errEl = document.getElementById('pin-error');
  errEl.textContent = '';
  if (k === 'del') {
    _pinBuf = _pinBuf.slice(0, -1);
  } else if (k === 'ok') {
    const stored = localStorage.getItem(PIN_STORE);
    if (!stored || _hashPin(_pinBuf) === stored) {
      sessionStorage.setItem(PIN_SESSION, '1');
      document.getElementById('pin-overlay').classList.remove('show');
      _pinBuf = '';
    } else {
      errEl.textContent = 'PIN ไม่ถูกต้อง ลองอีกครั้ง';
      const box = document.querySelector('.pin-box');
      box.classList.add('pin-shake');
      setTimeout(() => box.classList.remove('pin-shake'), 400);
      _pinBuf = '';
    }
  } else if (_pinBuf.length < 6) {
    _pinBuf += k;
  }
  const d = document.getElementById('pin-display');
  const dots = '●'.repeat(_pinBuf.length);
  const empty = '·'.repeat(Math.max(4 - _pinBuf.length, 0));
  d.textContent = dots + empty;
}

function setNewPin() {
  const p = prompt('กรอก PIN ใหม่ (4–6 หลัก):');
  if (!p) return;
  if (!/^\d{4,6}$/.test(p)) { showToast('PIN ต้องเป็นตัวเลข 4–6 หลัก'); return; }
  const p2 = prompt('ยืนยัน PIN อีกครั้ง:');
  if (p !== p2) { showToast('PIN ไม่ตรงกัน'); return; }
  localStorage.setItem(PIN_STORE, _hashPin(p));
  sessionStorage.setItem(PIN_SESSION, '1');
  updatePinStatus();
  showToast('✅ ตั้ง PIN แล้ว — มีผลครั้งหน้าที่เปิด app');
}

function clearPin() {
  if (!localStorage.getItem(PIN_STORE)) { showToast('ยังไม่ได้ตั้ง PIN'); return; }
  if (!confirm('ยืนยันลบ PIN? ทุกคนจะเข้าได้โดยไม่ต้องใส่รหัส')) return;
  localStorage.removeItem(PIN_STORE);
  updatePinStatus();
  showToast('ลบ PIN แล้ว');
}

function updatePinStatus() {
  const el = document.getElementById('pin-status-text');
  if (!el) return;
  el.textContent = localStorage.getItem(PIN_STORE)
    ? '🔒 ตั้ง PIN แล้ว — ต้องใส่รหัสทุกครั้ง'
    : 'ยังไม่ได้ตั้ง PIN — ทุกคนเข้าได้';
}

// ════════════════════════════════════════════════════════════════════
//  DIPSTICK TIMER
// ════════════════════════════════════════════════════════════════════
let _timerInterval = null;
let _timerSec = 60;

function startDipTimer() {
  _timerSec = 60;
  document.getElementById('timer-idle-view').style.display = 'none';
  document.getElementById('timer-running-view').style.display = 'block';
  document.getElementById('timer-done-view').style.display = 'none';
  document.getElementById('timer-count').textContent = '60';
  const bar = document.getElementById('timer-bar');
  bar.style.background = 'var(--teal)';
  bar.style.width = '100%';

  if (_timerInterval) clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    _timerSec--;
    document.getElementById('timer-count').textContent = _timerSec;
    bar.style.width = (_timerSec / 60 * 100) + '%';
    if (_timerSec <= 10) bar.style.background = 'var(--red)';
    if (_timerSec <= 0) {
      clearInterval(_timerInterval); _timerInterval = null;
      document.getElementById('timer-running-view').style.display = 'none';
      document.getElementById('timer-done-view').style.display = 'block';
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }, 1000);
}

function resetDipTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  document.getElementById('timer-idle-view').style.display = 'block';
  document.getElementById('timer-running-view').style.display = 'none';
  document.getElementById('timer-done-view').style.display = 'none';
  document.getElementById('timer-bar').style.background = 'var(--teal)';
}

// ════════════════════════════════════════════════════════════════════
//  COST TRACKER
// ════════════════════════════════════════════════════════════════════
function incrementScanCount() {
  const n = parseInt(localStorage.getItem('ckd_scan_n') || '0') + 1;
  localStorage.setItem('ckd_scan_n', n);
}

function renderScanCost() {
  const n = parseInt(localStorage.getItem('ckd_scan_n') || '0');
  const el1 = document.getElementById('d-scan-count');
  const el2 = document.getElementById('d-scan-cost');
  if (el1) el1.textContent = n + ' ครั้ง';
  if (el2) el2.textContent = '฿' + (n * 0.28).toFixed(2);
}

// ════════════════════════════════════════════════════════════════════
//  DATE RANGE FILTER
// ════════════════════════════════════════════════════════════════════
function getDateFilteredRecords() {
  const from = document.getElementById('df-from')?.value;
  const to   = document.getElementById('df-to')?.value;
  if (!from && !to) return records;
  return records.filter(r => {
    const ts = parseInt(r.id);
    if (isNaN(ts)) return true;
    const f = from ? new Date(from).getTime() : 0;
    const t = to   ? new Date(to + 'T23:59:59').getTime() : Infinity;
    return ts >= f && ts <= t;
  });
}

function clearDateFilter() {
  document.getElementById('df-from').value = '';
  document.getElementById('df-to').value   = '';
  renderDashboard();
}

// ════════════════════════════════════════════════════════════════════
//  OVERDUE LIST
// ════════════════════════════════════════════════════════════════════
function getDaysSince(r) {
  const ts = parseInt(r.id);
  return isNaN(ts) ? 0 : Math.floor((Date.now() - ts) / 86400000);
}

function renderOverdue(src) {
  const overdue = src.filter(r => r.isPositive && r.status === 'new' && getDaysSince(r) >= 30);
  const card = document.getElementById('overdue-card');
  const el   = document.getElementById('overdue-list');
  const badge = document.getElementById('overdue-count-badge');
  card.style.display = 'block';
  badge.textContent = overdue.length + ' ราย';
  badge.style.background = overdue.length ? 'rgba(192,57,43,.12)' : 'rgba(39,174,96,.12)';
  badge.style.color = overdue.length ? 'var(--red)' : 'var(--green)';
  if (!overdue.length) {
    el.innerHTML = '<div style="text-align:center;padding:10px;font-size:13px;color:var(--green)">✅ ไม่มี Overdue — ติดตามครบทุกราย</div>';
    return;
  }
  el.innerHTML = overdue.map(r => {
    const d = getDaysSince(r);
    return `<div class="overdue-item">
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--navy)">${r.fname} ${r.lname}</div>
        <div style="font-size:11px;color:var(--muted)">${r.date} · Prot ${r.prot} · Glc ${r.glc}</div>
      </div>
      <div style="text-align:right">
        <div class="overdue-days">${d}</div>
        <div style="font-size:9px;color:var(--red)">วันที่แล้ว</div>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════════
//  EXPORT PATIENT PDF (take-home)
// ════════════════════════════════════════════════════════════════════
function exportPatientPDF(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  const risk = calcRisk(r.age, r.disease, r.prot, r.glc, r.sbp);
  const isPos = r.isPositive;
  const w = window.open('', '_blank', 'width=520,height=750');
  w.document.write(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <title>ผลตรวจ CKD — ${r.fname} ${r.lname}</title>
  <style>
    body{font-family:'Sarabun',Arial,sans-serif;padding:20px;max-width:480px;margin:0 auto;color:#1A2A3A}
    .header{background:#0D2B45;color:#fff;padding:14px 16px;border-radius:10px;margin-bottom:16px}
    .header h2{margin:0;font-size:16px;font-weight:900}
    .header p{margin:3px 0 0;font-size:11px;color:#7FB3D3}
    .section{margin-bottom:14px}
    .section-title{font-size:11px;font-weight:700;color:#6B7E8F;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px}
    .row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #f5f5f5}
    .label{color:#6B7E8F}
    .result-box{padding:12px 14px;border-radius:10px;text-align:center;margin:12px 0;font-weight:700;font-size:14px}
    .pos-box{background:#fde8e8;color:#C0392B;border:1px solid #f5c6c6}
    .neg-box{background:#e8fde8;color:#27AE60;border:1px solid #c6f5c6}
    .risk-box{padding:10px;border-radius:8px;text-align:center;margin-bottom:12px;font-size:13px}
    .risk-H{background:#fde8e8;color:#C0392B}.risk-M{background:#fff3cd;color:#9A7010}.risk-L{background:#e8fde8;color:#27AE60}
    .advice{background:#e8f4f8;border-left:4px solid #1A5276;padding:10px 12px;border-radius:6px;font-size:12px;line-height:1.8;margin-bottom:12px}
    .footer{font-size:10px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:10px;margin-top:14px}
    .print-btn{margin-top:12px;padding:9px 20px;background:#0E8A74;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;width:100%}
    @media print{.print-btn{display:none}}
  </style></head><body>
  <div class="header">
    <h2>🏥 W Medical Hospital</h2>
    <p>ผลการตรวจคัดกรองโรคไต (CKD Screening) — เก็บไว้เป็นหลักฐาน</p>
  </div>
  <div class="section">
    <div class="section-title">ข้อมูลผู้รับบริการ</div>
    <div class="row"><span class="label">ชื่อ-นามสกุล</span><b>${r.fname} ${r.lname}</b></div>
    ${r.hn ? `<div class="row"><span class="label">HN</span><b>${r.hn}</b></div>` : ''}
    <div class="row"><span class="label">อายุ / เพศ</span>${r.age} ปี / ${r.gender||'—'}</div>
    <div class="row"><span class="label">วันที่ตรวจ</span>${r.date} เวลา ${r.time}</div>
    ${r.sbp ? `<div class="row"><span class="label">ความดันโลหิต</span><b style="color:${parseInt(r.sbp)>=140?'#C0392B':'#27AE60'}">${r.sbp}/${r.dbp||'—'} mmHg</b></div>` : ''}
  </div>
  <div class="section">
    <div class="section-title">ผล Urine Dipstick</div>
    <div class="result-box ${isPos ? 'pos-box' : 'neg-box'}">
      ${isPos ? '⚠️ ผลผิดปกติ' : '✅ ผลปกติ'}<br>
      <span style="font-size:12px;font-weight:400">Protein: <b>${r.prot}</b> &nbsp;·&nbsp; Glucose: <b>${r.glc}</b></span>
    </div>
    <div class="risk-box risk-${risk.level[0]}">
      ${risk.icon} CKD Risk: <b>${risk.level}</b> &nbsp;(${risk.score} คะแนน)
    </div>
  </div>
  <div class="advice">
    <b>${isPos ? '⚡ คำแนะนำ:' : '✅ คำแนะนำ:'}</b><br>
    ${isPos
      ? `ผลตรวจพบความผิดปกติ <b>ควรมาพบแพทย์</b> เพื่อตรวจยืนยัน Phase 2<br>☐ Urine ACR &nbsp; ☐ Serum Creatinine (eGFR) &nbsp;${r.glc!=='Negative'?'☐ HbA1c':''}`
      : `ผลตรวจปกติดี ดูแลสุขภาพต่อเนื่อง<br>☐ ดื่มน้ำ 2 ลิตร/วัน &nbsp; ☐ ลดเค็ม &nbsp; ☐ ตรวจซ้ำปีละครั้ง`}
  </div>
  <div class="footer">
    W Medical Hospital · www.w-medical-hospital.com<br>
    พิมพ์วันที่ ${new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'})}
  </div>
  <button class="print-btn" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>
  </body></html>`);
  w.document.close();
}

// ════════════════════════════════════════════════════════════════════
//  QR CODE
// ════════════════════════════════════════════════════════════════════
const APP_URL = 'https://jiatrainer-sketch.github.io/ckd-screening';

function showQR() {
  const url = encodeURIComponent(APP_URL);
  document.getElementById('qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${url}&bgcolor=ffffff&color=0D2B45`;
  document.getElementById('qr-url').textContent = APP_URL;
  document.getElementById('qr-modal').classList.add('show');
}

function closeQR() {
  document.getElementById('qr-modal').classList.remove('show');
}

function printQR() {
  const w = window.open('','_blank','width=400,height=500');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QR — CKD Screening</title>
  <style>body{font-family:Arial,sans-serif;text-align:center;padding:30px}h2{color:#0D2B45;margin-bottom:4px}p{color:#555;font-size:12px;margin:4px 0}img{margin:16px 0;border:2px solid #0D2B45;border-radius:8px;padding:8px}
  .url{font-size:11px;color:#0E8A74;word-break:break-all;background:#f0f9f7;padding:8px;border-radius:6px}
  @media print{button{display:none}}</style></head><body>
  <h2>🏥 W Medical Hospital</h2>
  <p>สแกน QR เพื่อเข้าระบบ CKD Screening</p>
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(APP_URL)}&bgcolor=ffffff&color=0D2B45" width="220" height="220">
  <div class="url">${APP_URL}</div>
  <br><button onclick="window.print()" style="padding:10px 24px;background:#0E8A74;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">🖨️ พิมพ์</button>
  </body></html>`);
  w.document.close();
}

// ════════════════════════════════════════════════════════════════════
//  VALIDATION MODE
// ════════════════════════════════════════════════════════════════════
let _valLoaded = false;

function toggleValidation() {
  const content = document.getElementById('val-content');
  const icon    = document.getElementById('val-toggle-icon');
  const isOpen  = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : 'block';
  icon.textContent = isOpen ? '▶ ดูผล' : '▼ ซ่อน';
  if (!isOpen && !_valLoaded) { _valLoaded = true; renderValidation(); }
}

async function renderValidation() {
  const el = document.getElementById('val-inner');
  el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px">⏳ กำลังโหลด audit log...</div>';
  const audits = await storageGet(AUDIT_KEY) || [];
  if (!audits.length) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px">ยังไม่มี AI Scan ในระบบ</div>';
    return;
  }
  const total      = audits.length;
  const overridden = audits.filter(a => a.human_override?.length).length;
  const confirmed  = total - overridden;
  const acc        = Math.round(confirmed / total * 100);
  const accColor   = acc >= 90 ? 'var(--green)' : acc >= 75 ? 'var(--gold)' : 'var(--red)';

  const fields = { protein:{c:0,t:0}, glucose:{c:0,t:0}, first_name:{c:0,t:0} };
  audits.forEach(a => {
    ['protein','glucose','first_name'].forEach(f => {
      fields[f].t++;
      if (!a.human_override?.includes(f)) fields[f].c++;
    });
  });

  const confSum = { id:0, protein:0, glucose:0, cnt:0 };
  audits.forEach(a => {
    if (!a.ai_confidence) return;
    confSum.id      += a.ai_confidence.id      || 0;
    confSum.protein += a.ai_confidence.protein || 0;
    confSum.glucose += a.ai_confidence.glucose || 0;
    confSum.cnt++;
  });
  const avgConf = k => confSum.cnt ? Math.round(confSum[k] / confSum.cnt) : '—';

  el.innerHTML = `
    <div style="text-align:center;padding:12px 0 16px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Overall Accuracy</div>
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:48px;font-weight:900;color:${accColor};line-height:1">${acc}%</div>
      <div style="font-size:12px;color:var(--muted)">confirmed ${confirmed} / overridden ${overridden} จาก ${total} scans</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
      ${[['🔴 Protein','protein'],['🔵 Glucose','glucose'],['👤 ชื่อ','first_name']].map(([lbl,k])=>{
        const pct = fields[k].t ? Math.round(fields[k].c/fields[k].t*100) : 0;
        const c = pct>=90?'var(--green)':pct>=75?'var(--gold)':'var(--red)';
        return `<div class="val-row">
          <span style="font-size:13px">${lbl}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="background:var(--bg);border-radius:20px;width:80px;height:6px;overflow:hidden">
              <div style="height:100%;background:${c};border-radius:20px;width:${pct}%"></div>
            </div>
            <span class="val-acc" style="color:${c};font-size:15px">${pct}%</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div style="background:var(--bg);border-radius:10px;padding:10px 12px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">AVG AI Confidence</div>
      ${[['ID Card','id'],['Protein','protein'],['Glucose','glucose']].map(([l,k])=>`
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
          <span style="color:var(--muted)">${l}</span>
          <span style="font-weight:700">${avgConf(k)}%</span>
        </div>`).join('')}
    </div>`;
}

// ════════════════════════════════════════════════════════════════════
//  LINE SHARE
// ════════════════════════════════════════════════════════════════════
async function shareResult(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  const risk = calcRisk(r.age, r.disease, r.prot, r.glc, r.sbp);
  const isPos = r.isPositive;
  const appt = r.appointmentDate ? `\n📅 วันนัด Phase 2: ${r.appointmentDate}` : '';
  const text =
`🏥 W Medical Hospital — ผลตรวจ CKD Screening
━━━━━━━━━━━━━━━━━━
👤 ${r.fname} ${r.lname}  อายุ ${r.age} ปี
📆 ตรวจวันที่ ${r.date} เวลา ${r.time}
━━━━━━━━━━━━━━━━━━
🔬 Protein: ${r.prot}
🔵 Glucose: ${r.glc}
${risk.icon} CKD Risk: ${risk.level} (${risk.score} คะแนน)
${isPos
  ? '⚠️ ผลผิดปกติ — ควรตรวจ Phase 2\n(UACR + Creatinine + eGFR)'
  : '✅ ผลปกติ — ดูแลสุขภาพต่อเนื่อง'}${appt}
━━━━━━━━━━━━━━━━━━
www.w-medical-hospital.com`;

  if (navigator.share) {
    try {
      await navigator.share({ title: `ผลตรวจ CKD — ${r.fname} ${r.lname}`, text });
    } catch(e) { if (e.name !== 'AbortError') showToast('แชร์ไม่สำเร็จ'); }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      showToast('📋 คัดลอกแล้ว — วางใน Line ได้เลย');
    } catch(e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('📋 คัดลอกแล้ว — วางใน Line ได้เลย');
    }
  }
}

// ════════════════════════════════════════════════════════════════════
//  APPOINTMENT DATE
// ════════════════════════════════════════════════════════════════════
let _apptId = null;

function showApptModal(id) {
  _apptId = id;
  const r = records.find(x => x.id === id);
  document.getElementById('appt-name').textContent = r ? `${r.fname} ${r.lname}` : '';
  document.getElementById('appt-date-inp').value = r?.appointmentDate || '';
  document.getElementById('appt-modal').classList.add('show');
}

function closeApptModal() {
  document.getElementById('appt-modal').classList.remove('show');
  _apptId = null;
}

async function saveAppt() {
  const date = document.getElementById('appt-date-inp').value;
  if (!date) { showToast('กรุณาเลือกวันที่'); return; }
  await _writeAppt(_apptId, date);
  showToast('✅ บันทึกวันนัดแล้ว');
}

async function clearAppt() {
  if (!confirm('ลบวันนัดออก?')) return;
  await _writeAppt(_apptId, null);
  showToast('ลบวันนัดแล้ว');
}

async function _writeAppt(id, date) {
  showLoading('กำลังบันทึก...');
  const latest = await storageGet(RECORDS_KEY) || [];
  const r = latest.find(x => x.id === id);
  if (r) {
    if (date) r.appointmentDate = date;
    else delete r.appointmentDate;
    await storageSet(RECORDS_KEY, latest);
    records = latest;
  }
  hideLoading();
  closeApptModal();
  renderList();
}

// ════════════════════════════════════════════════════════════════════
//  BURMESE CONSENT
// ════════════════════════════════════════════════════════════════════
let _consentConfirmed = false;

function showConsentIfNeeded() {
  const grp = document.getElementById('inp-group').value;
  if (grp === 'ต่างด้าว' && !_consentConfirmed) {
    document.getElementById('consent-modal').classList.add('show');
  }
}

function closeConsent(agreed) {
  document.getElementById('consent-modal').classList.remove('show');
  if (!agreed) {
    document.getElementById('inp-group').value = 'ทั่วไป';
    showToast('เปลี่ยนกลุ่มเป็น "ทั่วไป" แล้ว');
  } else {
    _consentConfirmed = true;
    showToast('บันทึกความยินยอมแล้ว ✓');
  }
}

// Reset consent flag when form is cleared
const _origCloseSuccess = closeSuccess;
closeSuccess = function() {
  _origCloseSuccess();
  _consentConfirmed = false;
};

// ════════════════════════════════════════════════════════════════════
//  CLEANUP — ลบ SW เก่าถ้ามี (ไม่ reload)
// ════════════════════════════════════════════════════════════════════
try {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister())).catch(()=>{});
  }
  if (typeof caches !== 'undefined') {
    caches.keys().then(k => k.forEach(x => caches.delete(x))).catch(()=>{});
  }
} catch(e) { console.warn('SW cleanup error', e); }

// ── DEBUG BANNER ─────────────────────────────────────────────────────
(function(){
  var d = document.createElement('div');
  d.id = 'debug-bar';
  d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:red;color:#fff;padding:6px 12px;font-size:12px;z-index:9999;font-family:monospace';
  d.textContent = 'JS loaded ✓ | init pending...';
  document.body.appendChild(d);
})();

// ── START ─────────────────────────────────────────────────────────────
try {
  init();
  document.getElementById('debug-bar').textContent = 'JS loaded ✓ | init() done ✓ | records: ' + records.length;
  document.getElementById('debug-bar').style.background = 'green';
} catch(e) {
  document.getElementById('debug-bar').textContent = 'ERROR: ' + e.message;
}
