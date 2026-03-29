/* ============================================================
   app.js — 美業記帳系統主邏輯
   ============================================================
   效能策略：
   1. 啟動時並行載入全部資料
   2. 切換頁面只重畫 DOM（瞬間）
   3. 新增/刪除使用 Optimistic UI：
      → 立刻更新本地 state + 重畫畫面（0ms）
      → API 在背景同步，失敗才回滾
   ============================================================ */

// ── 全域狀態 ────────────────────────────────────────────────
const state = {
  view:  'dashboard',
  year:  new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  serviceTypes:      [],
  expenseCategories: [],
  inventory:         [],
  clients:           [],
  serviceRecords:    [],
  expenseRecords:    [],
  stats:             null,
};

// ── 工具 ─────────────────────────────────────────────────────
const fmt = {
  money: n => `$${Number(n || 0).toLocaleString()}`,
  date:  d => d ? new Date(d).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }) : '',
};

function tempId() { return 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function loading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show);
}

function todayVal() { return new Date().toISOString().slice(0, 10); }

/** 靜默背景刷新儀表板統計（不擋 UI） */
function bgRefreshStats() {
  API.getDashboardStats(state.year, state.month)
    .then(res => {
      state.stats = res;
      if (state.view === 'dashboard') renderDashboard(state.stats);
    })
    .catch(() => {});
}

// ════════════════════════════════════════════════════════════
// 資料載入
// ════════════════════════════════════════════════════════════
async function loadAll() {
  const [t, c, inv, cl, stats, svc, exp] = await Promise.all([
    API.getServiceTypes(),
    API.getExpenseCategories(),
    API.getInventory(),
    API.getClients(),
    API.getDashboardStats(state.year, state.month),
    API.getServiceRecords(state.year, state.month),
    API.getExpenseRecords(state.year, state.month),
  ]);
  state.serviceTypes      = t.data    || [];
  state.expenseCategories = c.data    || [];
  state.inventory         = inv.data  || [];
  state.clients           = cl.data   || [];
  state.stats             = stats;
  state.serviceRecords    = svc.data  || [];
  state.expenseRecords    = exp.data  || [];
}

async function refreshMonthData() {
  loading(true);
  try {
    const [stats, svc, exp] = await Promise.all([
      API.getDashboardStats(state.year, state.month),
      API.getServiceRecords(state.year, state.month),
      API.getExpenseRecords(state.year, state.month),
    ]);
    state.stats          = stats;
    state.serviceRecords = svc.data || [];
    state.expenseRecords = exp.data || [];
    renderCurrentView();
  } catch (e) { handleApiError(e); }
  finally { loading(false); }
}

// ════════════════════════════════════════════════════════════
// 導覽（瞬間切換，只重畫 DOM）
// ════════════════════════════════════════════════════════════
function showView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.view === name)
  );
  const fab = document.getElementById('fabBtn');
  if (fab) fab.style.display = ['services', 'inventory', 'expenses'].includes(name) ? 'flex' : 'none';
  renderCurrentView();
}

function renderCurrentView() {
  switch (state.view) {
    case 'dashboard': renderDashboard(state.stats || {}); break;
    case 'services':  renderServiceList();   break;
    case 'inventory': renderInventoryList(); break;
    case 'expenses':  renderExpenseList();   break;
    case 'settings':  renderSettings();      break;
  }
}

function initMonthPicker() {
  const ySel = document.getElementById('selYear');
  const mSel = document.getElementById('selMonth');
  const curY = new Date().getFullYear();
  for (let y = curY; y >= curY - 3; y--)
    ySel.innerHTML += `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}</option>`;
  mSel.value = state.month;
  ySel.addEventListener('change', () => { state.year  = +ySel.value; refreshMonthData(); });
  mSel.addEventListener('change', () => { state.month = +mSel.value; refreshMonthData(); });
}

// ════════════════════════════════════════════════════════════
// 儀表板
// ════════════════════════════════════════════════════════════
function renderDashboard(s) {
  const c = s.currentMonth || {};
  document.getElementById('statRevenue').textContent = fmt.money(c.totalRevenue);
  document.getElementById('statClients').textContent = c.totalClients || 0;
  document.getElementById('statExpense').textContent = fmt.money(c.totalExpenses);
  document.getElementById('statProfit').textContent  = fmt.money(c.netProfit);
  document.getElementById('statNew').textContent     = `新客 ${c.newClients || 0} 人`;
  document.getElementById('statReturn').textContent  = `回頭客 ${c.returningClients || 0} 人`;

  Charts.renderMonthly(s.monthlyRevenue || Array(12).fill(0), s.monthlyExpenses || Array(12).fill(0));

  const bd   = s.serviceBreakdown || {};
  const keys = Object.keys(bd);
  if (keys.length) {
    Charts.renderServicePie(keys, keys.map(k => bd[k].count));
    document.getElementById('servicePieEmpty').style.display = 'none';
    document.getElementById('servicePieChart').style.display = 'block';
  } else {
    document.getElementById('servicePieEmpty').style.display = 'block';
    document.getElementById('servicePieChart').style.display = 'none';
  }

  const low = s.lowInventory || [];
  const el  = document.getElementById('lowStockList');
  el.innerHTML = low.length === 0
    ? '<div class="no-data">庫存充足，一切安好 ✓</div>'
    : low.map(i => `
      <div class="list-item">
        <div class="item-icon amber">📦</div>
        <div class="item-body">
          <div class="item-name">${i['品名']}</div>
          <div class="item-sub">來源：${i['供貨來源'] || '—'}</div>
        </div>
        <div class="item-right"><span class="low-stock-chip">剩 ${i['目前庫存']} ${i['單位']}</span></div>
      </div>`).join('');
}

// ════════════════════════════════════════════════════════════
// 服務紀錄（Optimistic UI）
// ════════════════════════════════════════════════════════════
function renderServiceList() {
  const list    = document.getElementById('serviceList');
  const records = [...state.serviceRecords].sort((a, b) => new Date(b['日期']) - new Date(a['日期']));
  const total   = state.serviceRecords.reduce((s, r) => s + Number(r['金額'] || 0), 0);

  document.getElementById('svcMonthSummary').textContent =
    `共 ${state.serviceRecords.length} 筆 · ${fmt.money(total)}`;

  if (records.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>這個月還沒有服務紀錄</p></div>`;
    return;
  }
  list.innerHTML = records.map(r => `
    <div class="list-item">
      <div class="item-icon">💆</div>
      <div class="item-body">
        <div class="item-name">${r['客戶姓名']} <span class="tag ${r['客戶類型'] === '新客' ? 'new' : 'returning'}">${r['客戶類型']}</span></div>
        <div class="item-sub">${r['服務項目']}${r['備註'] ? ' · ' + r['備註'] : ''}</div>
      </div>
      <div class="item-right">
        <div class="item-amount">${fmt.money(r['金額'])}</div>
        <div class="item-date">${fmt.date(r['日期'])}</div>
      </div>
      <button class="btn-icon gray btn" onclick="showEditServiceModal('${r['ID']}')" title="修改">✎</button>
      <button class="btn-icon red btn" onclick="deleteServiceRecord('${r['ID']}')" title="刪除">×</button>
    </div>`).join('');
}

function showEditServiceModal(id) {
  const r = state.serviceRecords.find(x => String(x['ID']) === String(id));
  if (!r) return;

  const sel = document.getElementById('svcType');
  sel.innerHTML = state.serviceTypes.length
    ? state.serviceTypes.map(t =>
        `<option value="${t['名稱']}" data-price="${t['預設價格']}">${t['名稱']} (預設 ${fmt.money(t['預設價格'])})</option>`
      ).join('')
    : '<option value="">請先到「設定」新增服務項目</option>';

  sel.onchange = () => {
    const opt = sel.selectedOptions[0];
    if (opt?.dataset.price) document.getElementById('svcAmount').value = opt.dataset.price;
  };

  document.getElementById('svcDate').value        = r['日期'];
  document.getElementById('svcClientName').value  = r['客戶姓名'];
  document.getElementById('svcClientPhone').value = r['客戶電話'] || '';
  document.getElementById('svcType').value        = r['服務項目'];
  document.getElementById('svcAmount').value      = r['金額'];
  document.getElementById('svcNotes').value       = r['備註'] || '';
  document.getElementById('svcClientType').value  = r['客戶類型'] || '新客';
  
  document.getElementById('modalAddService').dataset.editId = id;
  document.querySelector('#modalAddService .modal-title').textContent = '📝 修改服務紀錄';
  openModal('modalAddService');
}

function showAddServiceModal() {
  const sel = document.getElementById('svcType');
  sel.innerHTML = state.serviceTypes.length
    ? state.serviceTypes.map(t =>
        `<option value="${t['名稱']}" data-price="${t['預設價格']}">${t['名稱']} (預設 ${fmt.money(t['預設價格'])})</option>`
      ).join('')
    : '<option value="">請先到「設定」新增服務項目</option>';

  const firstOpt = sel.selectedOptions[0];
  document.getElementById('svcAmount').value = firstOpt?.dataset.price || '';
  sel.onchange = () => {
    const opt = sel.selectedOptions[0];
    if (opt?.dataset.price) document.getElementById('svcAmount').value = opt.dataset.price;
  };

  document.getElementById('svcDate').value        = todayVal();
  document.getElementById('svcClientName').value  = '';
  document.getElementById('svcClientPhone').value = '';
  document.getElementById('svcNotes').value       = '';
  document.getElementById('svcClientType').value  = '新客';
  
  document.getElementById('modalAddService').dataset.editId = '';
  document.querySelector('#modalAddService .modal-title').textContent = '💆 新增服務紀錄';
  openModal('modalAddService');
}

// 輸入電話自動辨識舊客
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('svcClientPhone')?.addEventListener('blur', function () {
    const phone = this.value.trim();
    if (!phone) return;
    const found = state.clients.find(c => String(c['電話']) === phone);
    if (found) {
      document.getElementById('svcClientName').value = found['姓名'];
      document.getElementById('svcClientType').value = '回頭客';
      toast(`歡迎回來，${found['姓名']}！共到訪 ${found['總到訪次數']} 次`, 'success');
    }
  });
});

async function submitAddService() {
  const data = {
    date:        document.getElementById('svcDate').value,
    clientName:  document.getElementById('svcClientName').value.trim(),
    clientPhone: document.getElementById('svcClientPhone').value.trim(),
    serviceType: document.getElementById('svcType').value,
    amount:      document.getElementById('svcAmount').value,
    notes:       document.getElementById('svcNotes').value.trim(),
    clientType:  document.getElementById('svcClientType').value,
  };
  if (!data.clientName)  { toast('請填寫客戶姓名', 'error'); return; }
  if (!data.serviceType) { toast('請選擇服務項目', 'error'); return; }
  if (!data.amount)      { toast('請填寫金額', 'error'); return; }

  const editId = document.getElementById('modalAddService').dataset.editId;

  if (editId) {
    data.id = editId;
    const rIdx = state.serviceRecords.findIndex(r => String(r['ID']) === editId);
    if (rIdx === -1) return;
    const backup = { ...state.serviceRecords[rIdx] };
    
    state.serviceRecords[rIdx] = {
      ...state.serviceRecords[rIdx],
      '日期': data.date, '客戶姓名': data.clientName,
      '客戶電話': data.clientPhone, '服務項目': data.serviceType,
      '金額': Number(data.amount), '備註': data.notes, '客戶類型': data.clientType,
    };
    closeModal('modalAddService');
    renderServiceList();
    toast('服務紀錄已修改！', 'success');
    
    try {
      await API.updateServiceRecord(data);
      bgRefreshStats();
    } catch (e) {
      state.serviceRecords[rIdx] = backup;
      renderServiceList();
      toast('同步失敗，已回滾：' + e.message, 'error');
    }
  } else {
    // ★ Optimistic：立刻更新畫面
    const tid = tempId();
    state.serviceRecords.push({
      'ID': tid, '日期': data.date, '客戶姓名': data.clientName,
      '客戶電話': data.clientPhone, '服務項目': data.serviceType,
      '金額': Number(data.amount), '備註': data.notes, '客戶類型': data.clientType,
    });
    closeModal('modalAddService');
    renderServiceList();
    toast('服務紀錄已新增！', 'success');

    // ★ 背景同步
    try {
      const res = await API.addServiceRecord(data);
      // 把暫時 ID 換成真實 ID
      const idx = state.serviceRecords.findIndex(r => r['ID'] === tid);
      if (idx !== -1) state.serviceRecords[idx]['ID'] = res.id;
      bgRefreshStats();
    } catch (e) {
      // 失敗：回滾
      state.serviceRecords = state.serviceRecords.filter(r => r['ID'] !== tid);
      renderServiceList();
      toast('同步失敗，已回滾：' + e.message, 'error');
    }
  }
}

async function deleteServiceRecord(id) {
  if (!confirm('確定刪除這筆服務紀錄？')) return;

  // ★ Optimistic：立刻從畫面移除
  const backup = [...state.serviceRecords];
  state.serviceRecords = state.serviceRecords.filter(r => String(r['ID']) !== String(id));
  renderServiceList();
  toast('已刪除');

  // ★ 背景同步
  try {
    await API.deleteServiceRecord(id);
    bgRefreshStats();
  } catch (e) {
    state.serviceRecords = backup;
    renderServiceList();
    toast('刪除失敗，已回滾', 'error');
  }
}

// ════════════════════════════════════════════════════════════
// 庫存管理（Optimistic UI）
// ════════════════════════════════════════════════════════════
function renderInventoryList() {
  const list = document.getElementById('inventoryList');
  if (state.inventory.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>尚無庫存商品</p></div>`;
    return;
  }
  list.innerHTML = state.inventory.map(i => {
    const cur  = Number(i['目前庫存']);
    const safe = Number(i['安全庫存量']) || 1;
    const pct  = Math.min(100, Math.round(cur / (safe * 2) * 100));
    const lvl  = cur <= 0 ? 'danger' : cur <= safe ? 'warning' : 'ok';
    return `
    <div class="list-item">
      <div class="item-icon teal">🧴</div>
      <div class="item-body">
        <div class="item-name">${i['品名']} <span class="tag ${lvl === 'ok' ? 'fixed' : lvl === 'warning' ? 'warning' : 'danger'}">${i['類別']}</span></div>
        <div class="item-sub">來源：${i['供貨來源'] || '—'} · 安全庫存 ${safe}${i['單位']}</div>
        <div class="stock-bar-wrap">
          <div class="stock-bar-bg"><div class="stock-bar-fill ${lvl}" style="width:${pct}%"></div></div>
        </div>
      </div>
      <div class="item-right">
        <div class="item-amount" style="color:${lvl === 'ok' ? 'var(--teal)' : lvl === 'warning' ? 'var(--amber)' : 'var(--red)'}">${cur} ${i['單位']}</div>
        <div class="item-date">${i['備註'] || ''}</div>
      </div>
      <div class="item-actions">
        <button class="btn-icon btn" onclick="showAddPurchaseModal('${i['ID']}','${i['品名']}')" title="進貨">+</button>
        <button class="btn-icon red btn" onclick="deleteInventoryItem('${i['ID']}')" title="刪除">×</button>
      </div>
    </div>`;
  }).join('');
}

function showAddInventoryModal() {
  ['invName', 'invSupplier'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('invCategory').value = '保養品';
  document.getElementById('invStock').value    = '0';
  document.getElementById('invSafety').value   = '3';
  document.getElementById('invUnit').value     = '個';
  openModal('modalAddInventory');
}

async function submitAddInventory() {
  const data = {
    name:        document.getElementById('invName').value.trim(),
    category:    document.getElementById('invCategory').value,
    stock:       document.getElementById('invStock').value,
    safetyStock: document.getElementById('invSafety').value,
    unit:        document.getElementById('invUnit').value.trim() || '個',
    supplier:    document.getElementById('invSupplier').value.trim(),
  };
  if (!data.name) { toast('請填寫品名', 'error'); return; }

  // ★ Optimistic
  const tid = tempId();
  state.inventory.push({
    'ID': tid, '品名': data.name, '類別': data.category,
    '目前庫存': Number(data.stock), '安全庫存量': Number(data.safetyStock),
    '單位': data.unit, '供貨來源': data.supplier, '備註': '',
  });
  closeModal('modalAddInventory');
  renderInventoryList();
  toast('商品已新增！', 'success');

  try {
    const res = await API.addInventoryItem(data);
    const idx = state.inventory.findIndex(i => i['ID'] === tid);
    if (idx !== -1) state.inventory[idx]['ID'] = res.id;
    bgRefreshStats();
  } catch (e) {
    state.inventory = state.inventory.filter(i => i['ID'] !== tid);
    renderInventoryList();
    toast('同步失敗，已回滾：' + e.message, 'error');
  }
}

function showAddPurchaseModal(inventoryId, itemName) {
  document.getElementById('purInventoryId').value = inventoryId;
  document.getElementById('purItemName').value    = itemName || '';
  document.getElementById('purDate').value        = todayVal();
  document.getElementById('purQty').value         = '';
  document.getElementById('purPrice').value       = '';
  document.getElementById('purSupplier').value    = '';
  document.getElementById('purTotal').textContent = '$0';

  const updateTotal = () => {
    const q = Number(document.getElementById('purQty').value)   || 0;
    const p = Number(document.getElementById('purPrice').value) || 0;
    document.getElementById('purTotal').textContent = fmt.money(q * p);
  };
  document.getElementById('purQty').oninput   = updateTotal;
  document.getElementById('purPrice').oninput = updateTotal;
  openModal('modalAddPurchase');
}

async function submitAddPurchase() {
  const invId = document.getElementById('purInventoryId').value;
  const data = {
    inventoryId: invId,
    date:        document.getElementById('purDate').value,
    itemName:    document.getElementById('purItemName').value.trim(),
    quantity:    document.getElementById('purQty').value,
    unitPrice:   document.getElementById('purPrice').value,
    supplier:    document.getElementById('purSupplier').value.trim(),
  };
  if (!data.quantity || !data.unitPrice) { toast('請填寫數量和單價', 'error'); return; }

  // ★ Optimistic：立即增加庫存數量
  const idx = state.inventory.findIndex(i => String(i['ID']) === String(invId));
  let oldStock = 0;
  if (idx !== -1) {
    oldStock = Number(state.inventory[idx]['目前庫存']);
    state.inventory[idx]['目前庫存'] = oldStock + Number(data.quantity);
  }
  closeModal('modalAddPurchase');
  renderInventoryList();
  toast('進貨紀錄已新增！', 'success');

  try {
    await API.addPurchaseRecord(data);
    bgRefreshStats();
  } catch (e) {
    if (idx !== -1) state.inventory[idx]['目前庫存'] = oldStock;
    renderInventoryList();
    toast('同步失敗，已回滾：' + e.message, 'error');
  }
}

async function deleteInventoryItem(id) {
  if (!confirm('確定刪除此商品？')) return;

  const backup = [...state.inventory];
  state.inventory = state.inventory.filter(i => String(i['ID']) !== String(id));
  renderInventoryList();
  toast('已刪除');

  try {
    await API.deleteInventoryItem(id);
    bgRefreshStats();
  } catch (e) {
    state.inventory = backup;
    renderInventoryList();
    toast('刪除失敗，已回滾', 'error');
  }
}

// ════════════════════════════════════════════════════════════
// 支出管理（Optimistic UI）
// ════════════════════════════════════════════════════════════
function renderExpenseList() {
  const list    = document.getElementById('expenseList');
  const records = [...state.expenseRecords].sort((a, b) => new Date(b['日期']) - new Date(a['日期']));
  const total   = state.expenseRecords.reduce((s, r) => s + Number(r['金額'] || 0), 0);

  document.getElementById('expMonthSummary').textContent =
    `共 ${state.expenseRecords.length} 筆 · ${fmt.money(total)}`;

  if (records.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">💸</div><p>這個月還沒有支出紀錄</p></div>`;
    return;
  }
  list.innerHTML = records.map(r => `
    <div class="list-item">
      <div class="item-icon amber">💰</div>
      <div class="item-body">
        <div class="item-name">${r['支出項目']}</div>
        <div class="item-sub">${r['備註'] || ''}</div>
      </div>
      <div class="item-right">
        <div class="item-amount" style="color:var(--amber)">${fmt.money(r['金額'])}</div>
        <div class="item-date">${fmt.date(r['日期'])}</div>
      </div>
      <button class="btn-icon gray btn" onclick="showEditExpenseModal('${r['ID']}')" title="修改">✎</button>
      <button class="btn-icon red btn" onclick="deleteExpense('${r['ID']}')" title="刪除">×</button>
    </div>`).join('');
}

function showEditExpenseModal(id) {
  const r = state.expenseRecords.find(x => String(x['ID']) === String(id));
  if (!r) return;

  const sel = document.getElementById('expCategory');
  sel.innerHTML = state.expenseCategories.length
    ? state.expenseCategories.map(c =>
        `<option value="${c['名稱']}">${c['名稱']} (${c['類型']})</option>`
      ).join('')
    : '<option value="">請先到「設定」新增支出項目</option>';

  document.getElementById('expDate').value     = r['日期'];
  document.getElementById('expCategory').value = r['支出項目'];
  document.getElementById('expAmount').value   = r['金額'];
  document.getElementById('expNotes').value    = r['備註'] || '';

  document.getElementById('modalAddExpense').dataset.editId = id;
  document.querySelector('#modalAddExpense .modal-title').textContent = '📝 修改支出';
  openModal('modalAddExpense');
}

function showAddExpenseModal() {
  const sel = document.getElementById('expCategory');
  sel.innerHTML = state.expenseCategories.length
    ? state.expenseCategories.map(c =>
        `<option value="${c['名稱']}">${c['名稱']} (${c['類型']})</option>`
      ).join('')
    : '<option value="">請先到「設定」新增支出項目</option>';

  document.getElementById('expDate').value   = todayVal();
  document.getElementById('expAmount').value = '';
  document.getElementById('expNotes').value  = '';
  
  document.getElementById('modalAddExpense').dataset.editId = '';
  document.querySelector('#modalAddExpense .modal-title').textContent = '💸 新增支出';
  openModal('modalAddExpense');
}

async function submitAddExpense() {
  const data = {
    date:     document.getElementById('expDate').value,
    category: document.getElementById('expCategory').value,
    amount:   document.getElementById('expAmount').value,
    notes:    document.getElementById('expNotes').value.trim(),
  };
  if (!data.category) { toast('請選擇支出項目', 'error'); return; }
  if (!data.amount)   { toast('請填寫金額', 'error'); return; }

  const editId = document.getElementById('modalAddExpense').dataset.editId;

  if (editId) {
    data.id = editId;
    const rIdx = state.expenseRecords.findIndex(r => String(r['ID']) === editId);
    if (rIdx === -1) return;
    const backup = { ...state.expenseRecords[rIdx] };

    state.expenseRecords[rIdx] = {
      ...state.expenseRecords[rIdx],
      '日期': data.date, '支出項目': data.category,
      '金額': Number(data.amount), '備註': data.notes,
    };
    closeModal('modalAddExpense');
    renderExpenseList();
    toast('支出已修改！', 'success');

    try {
      await API.updateExpense(data);
      bgRefreshStats();
    } catch (e) {
      state.expenseRecords[rIdx] = backup;
      renderExpenseList();
      toast('同步失敗，已回滾：' + e.message, 'error');
    }
  } else {
    // ★ Optimistic
    const tid = tempId();
    state.expenseRecords.push({
      'ID': tid, '日期': data.date, '支出項目': data.category,
      '金額': Number(data.amount), '備註': data.notes,
    });
    closeModal('modalAddExpense');
    renderExpenseList();
    toast('支出已記錄！', 'success');

    try {
      const res = await API.addExpense(data);
      const idx = state.expenseRecords.findIndex(r => r['ID'] === tid);
      if (idx !== -1) state.expenseRecords[idx]['ID'] = res.id;
      bgRefreshStats();
    } catch (e) {
      state.expenseRecords = state.expenseRecords.filter(r => r['ID'] !== tid);
      renderExpenseList();
      toast('同步失敗，已回滾：' + e.message, 'error');
    }
  }
}

async function deleteExpense(id) {
  if (!confirm('確定刪除這筆支出？')) return;

  const backup = [...state.expenseRecords];
  state.expenseRecords = state.expenseRecords.filter(r => String(r['ID']) !== String(id));
  renderExpenseList();
  toast('已刪除');

  try {
    await API.deleteExpense(id);
    bgRefreshStats();
  } catch (e) {
    state.expenseRecords = backup;
    renderExpenseList();
    toast('刪除失敗，已回滾', 'error');
  }
}

// ════════════════════════════════════════════════════════════
// 設定（Optimistic UI）
// ════════════════════════════════════════════════════════════
function renderSettings() {
  renderServiceTypes();
  renderExpenseCategories();
}

function renderServiceTypes() {
  const el = document.getElementById('serviceTypesList');
  el.innerHTML = state.serviceTypes.length === 0
    ? '<div class="no-data">尚無服務項目</div>'
    : state.serviceTypes.map(t => `
      <div class="setting-item">
        <div>
          <div class="setting-item-name">${t['名稱']}</div>
          <div class="setting-item-sub">類別：${t['類別']} · 預設 ${fmt.money(t['預設價格'])}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteServiceType('${t['ID']}')">刪除</button>
      </div>`).join('');
}

function renderExpenseCategories() {
  const el = document.getElementById('expCategoriesList');
  el.innerHTML = state.expenseCategories.length === 0
    ? '<div class="no-data">尚無支出項目</div>'
    : state.expenseCategories.map(c => `
      <div class="setting-item">
        <div>
          <div class="setting-item-name">${c['名稱']}</div>
          <div class="setting-item-sub"><span class="tag ${c['類型'] === '固定' ? 'fixed' : 'variable'}">${c['類型']}</span></div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteExpenseCategory('${c['ID']}')">刪除</button>
      </div>`).join('');
}

// ── 服務項目 ─────────────────────────────────────────────────
function showAddServiceTypeModal() {
  document.getElementById('newTypeName').value     = '';
  document.getElementById('newTypePrice').value    = '';
  document.getElementById('newTypeCategory').value = '睫毛';
  openModal('modalAddServiceType');
}

async function submitAddServiceType() {
  const data = {
    name:         document.getElementById('newTypeName').value.trim(),
    defaultPrice: document.getElementById('newTypePrice').value,
    category:     document.getElementById('newTypeCategory').value,
  };
  if (!data.name) { toast('請填寫名稱', 'error'); return; }

  const tid = tempId();
  state.serviceTypes.push({
    'ID': tid, '名稱': data.name, '預設價格': Number(data.defaultPrice) || 0, '類別': data.category,
  });
  closeModal('modalAddServiceType');
  renderServiceTypes();
  toast('服務項目已新增！', 'success');

  try {
    const res = await API.addServiceType(data);
    const idx = state.serviceTypes.findIndex(t => t['ID'] === tid);
    if (idx !== -1) state.serviceTypes[idx]['ID'] = res.id;
  } catch (e) {
    state.serviceTypes = state.serviceTypes.filter(t => t['ID'] !== tid);
    renderServiceTypes();
    toast('同步失敗，已回滾：' + e.message, 'error');
  }
}

async function deleteServiceType(id) {
  if (!confirm('確定刪除此服務項目？')) return;

  const backup = [...state.serviceTypes];
  state.serviceTypes = state.serviceTypes.filter(t => String(t['ID']) !== String(id));
  renderServiceTypes();
  toast('已刪除');

  try { await API.deleteServiceType(id); }
  catch (e) {
    state.serviceTypes = backup;
    renderServiceTypes();
    toast('刪除失敗，已回滾', 'error');
  }
}

// ── 支出項目 ─────────────────────────────────────────────────
function showAddExpenseCategoryModal() {
  document.getElementById('newCatName').value = '';
  document.getElementById('newCatType').value = '固定';
  openModal('modalAddExpenseCat');
}

async function submitAddExpenseCat() {
  const data = {
    name: document.getElementById('newCatName').value.trim(),
    type: document.getElementById('newCatType').value,
  };
  if (!data.name) { toast('請填寫名稱', 'error'); return; }

  const tid = tempId();
  state.expenseCategories.push({ 'ID': tid, '名稱': data.name, '類型': data.type });
  closeModal('modalAddExpenseCat');
  renderExpenseCategories();
  toast('支出項目已新增！', 'success');

  try {
    const res = await API.addExpenseCategory(data);
    const idx = state.expenseCategories.findIndex(c => c['ID'] === tid);
    if (idx !== -1) state.expenseCategories[idx]['ID'] = res.id;
  } catch (e) {
    state.expenseCategories = state.expenseCategories.filter(c => c['ID'] !== tid);
    renderExpenseCategories();
    toast('同步失敗，已回滾：' + e.message, 'error');
  }
}

async function deleteExpenseCategory(id) {
  if (!confirm('確定刪除此支出項目？')) return;

  const backup = [...state.expenseCategories];
  state.expenseCategories = state.expenseCategories.filter(c => String(c['ID']) !== String(id));
  renderExpenseCategories();
  toast('已刪除');

  try { await API.deleteExpenseCategory(id); }
  catch (e) {
    state.expenseCategories = backup;
    renderExpenseCategories();
    toast('刪除失敗，已回滾', 'error');
  }
}

// ── Modal helpers ────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

function handleApiError(e) {
  if (e.message === 'NO_URL') toast('請先在「設定」填寫 GAS 網址', 'warning');
  else toast('載入失敗：' + e.message, 'error');
}

// ════════════════════════════════════════════════════════════
// 初始化
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  initMonthPicker();

  loading(true);
  try {
    await loadAll();
    showView('dashboard');
  } catch (e) {
    handleApiError(e);
    showView('dashboard');
  } finally { loading(false); }
});
