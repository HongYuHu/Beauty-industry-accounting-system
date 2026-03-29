/* ============================================================
   app.js — 美業記帳系統主邏輯
   策略：App 啟動時一次並行載入全部資料，
         切換頁面只重畫 DOM，不再發 API 請求 → 瞬間切換
   ============================================================ */

// ── 全域狀態 ────────────────────────────────────────────────
const state = {
  view:  'dashboard',
  year:  new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  // 快取資料（啟動時載入一次）
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
  money:  n => `$${Number(n || 0).toLocaleString()}`,
  date:   d => d ? new Date(d).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }) : '',
};

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

function todayVal() {
  return new Date().toISOString().slice(0, 10);
}

// ════════════════════════════════════════════════════════════
// 資料載入（只在需要時才呼叫 API）
// ════════════════════════════════════════════════════════════

/** 啟動時：並行拉取所有資料 */
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

/** 換月份時：只重拉時間相關資料 */
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
  } catch (e) {
    handleApiError(e);
  } finally {
    loading(false);
  }
}

/** 新增/刪除服務後：更新服務 + 儀表板 + 客戶快取 */
async function refreshAfterService() {
  const [stats, svc, cl] = await Promise.all([
    API.getDashboardStats(state.year, state.month),
    API.getServiceRecords(state.year, state.month),
    API.getClients(),
  ]);
  state.stats          = stats;
  state.serviceRecords = svc.data || [];
  state.clients        = cl.data  || [];
}

/** 新增/刪除庫存後：更新庫存 + 儀表板快取 */
async function refreshAfterInventory() {
  const [inv, stats] = await Promise.all([
    API.getInventory(),
    API.getDashboardStats(state.year, state.month),
  ]);
  state.inventory = inv.data || [];
  state.stats     = stats;
}

/** 新增/刪除支出後：更新支出 + 儀表板快取 */
async function refreshAfterExpense() {
  const [exp, stats] = await Promise.all([
    API.getExpenseRecords(state.year, state.month),
    API.getDashboardStats(state.year, state.month),
  ]);
  state.expenseRecords = exp.data || [];
  state.stats          = stats;
}

/** 設定頁（服務項目/支出項目）更新 */
async function refreshSettings() {
  const [t, c] = await Promise.all([
    API.getServiceTypes(),
    API.getExpenseCategories(),
  ]);
  state.serviceTypes      = t.data || [];
  state.expenseCategories = c.data || [];
}

// ════════════════════════════════════════════════════════════
// 導覽（切換頁面只重畫 DOM，不發 API 請求）
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

// ── 月份選擇器 ───────────────────────────────────────────────
function initMonthPicker() {
  const ySel = document.getElementById('selYear');
  const mSel = document.getElementById('selMonth');
  const curY = new Date().getFullYear();
  for (let y = curY; y >= curY - 3; y--) {
    ySel.innerHTML += `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}</option>`;
  }
  mSel.value = state.month;
  ySel.addEventListener('change', () => { state.year  = +ySel.value; refreshMonthData(); });
  mSel.addEventListener('change', () => { state.month = +mSel.value; refreshMonthData(); });
}

// ════════════════════════════════════════════════════════════
// 儀表板（純畫面，從快取渲染）
// ════════════════════════════════════════════════════════════
function renderDashboard(s) {
  const c = s.currentMonth || {};
  document.getElementById('statRevenue').textContent = fmt.money(c.totalRevenue);
  document.getElementById('statClients').textContent = c.totalClients || 0;
  document.getElementById('statExpense').textContent = fmt.money(c.totalExpenses);
  document.getElementById('statProfit').textContent  = fmt.money(c.netProfit);
  document.getElementById('statNew').textContent     = `新客 ${c.newClients || 0} 人`;
  document.getElementById('statReturn').textContent  = `回頭客 ${c.returningClients || 0} 人`;

  Charts.renderMonthly(
    s.monthlyRevenue  || Array(12).fill(0),
    s.monthlyExpenses || Array(12).fill(0),
  );

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
        <div class="item-right">
          <span class="low-stock-chip">剩 ${i['目前庫存']} ${i['單位']}</span>
        </div>
      </div>`).join('');
}

// ════════════════════════════════════════════════════════════
// 服務紀錄
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
      <button class="btn-icon red btn" onclick="deleteServiceRecord('${r['ID']}')" title="刪除">×</button>
    </div>`).join('');
}

function showAddServiceModal() {
  const sel = document.getElementById('svcType');
  sel.innerHTML = state.serviceTypes.length
    ? state.serviceTypes.map(t =>
        `<option value="${t['名稱']}" data-price="${t['預設價格']}">${t['名稱']} (預設 ${fmt.money(t['預設價格'])})</option>`
      ).join('')
    : '<option value="">請先到「設定」新增服務項目</option>';

  // 自動帶入預設金額
  const firstOpt = sel.selectedOptions[0];
  document.getElementById('svcAmount').value = firstOpt?.dataset.price || '';

  sel.onchange = () => {
    const opt = sel.selectedOptions[0];
    if (opt?.dataset.price) document.getElementById('svcAmount').value = opt.dataset.price;
  };

  document.getElementById('svcDate').value        = todayVal();
  document.getElementById('svcClientName').value  = '';
  document.getElementById('svcClientPhone').value = '';
  document.getElementById('svcNotes').value        = '';
  document.getElementById('svcClientType').value  = '新客';
  openModal('modalAddService');
}

// 輸入電話後自動辨識舊客
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

  loading(true);
  try {
    await API.addServiceRecord(data);
    closeModal('modalAddService');
    toast('服務紀錄已新增！', 'success');
    await refreshAfterService();
    renderCurrentView();
  } catch (e) {
    toast('新增失敗：' + e.message, 'error');
  } finally {
    loading(false);
  }
}

async function deleteServiceRecord(id) {
  if (!confirm('確定刪除這筆服務紀錄？')) return;
  loading(true);
  try {
    await API.deleteServiceRecord(id);
    toast('已刪除');
    await refreshAfterService();
    renderServiceList();
  } catch (e) {
    toast('刪除失敗', 'error');
  } finally {
    loading(false);
  }
}

// ════════════════════════════════════════════════════════════
// 庫存管理
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
  ['invName','invSupplier'].forEach(id => document.getElementById(id).value = '');
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
  loading(true);
  try {
    await API.addInventoryItem(data);
    closeModal('modalAddInventory');
    toast('商品已新增！', 'success');
    await refreshAfterInventory();
    renderInventoryList();
  } catch (e) {
    toast('新增失敗：' + e.message, 'error');
  } finally {
    loading(false);
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
  const data = {
    inventoryId: document.getElementById('purInventoryId').value,
    date:        document.getElementById('purDate').value,
    itemName:    document.getElementById('purItemName').value.trim(),
    quantity:    document.getElementById('purQty').value,
    unitPrice:   document.getElementById('purPrice').value,
    supplier:    document.getElementById('purSupplier').value.trim(),
  };
  if (!data.quantity || !data.unitPrice) { toast('請填寫數量和單價', 'error'); return; }
  loading(true);
  try {
    await API.addPurchaseRecord(data);
    closeModal('modalAddPurchase');
    toast('進貨紀錄已新增！', 'success');
    await refreshAfterInventory();
    renderInventoryList();
  } catch (e) {
    toast('新增失敗：' + e.message, 'error');
  } finally {
    loading(false);
  }
}

async function deleteInventoryItem(id) {
  if (!confirm('確定刪除此商品？')) return;
  loading(true);
  try {
    await API.deleteInventoryItem(id);
    toast('已刪除');
    await refreshAfterInventory();
    renderInventoryList();
  } catch (e) {
    toast('刪除失敗', 'error');
  } finally {
    loading(false);
  }
}

// ════════════════════════════════════════════════════════════
// 支出管理
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
      <button class="btn-icon red btn" onclick="deleteExpense('${r['ID']}')" title="刪除">×</button>
    </div>`).join('');
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
  loading(true);
  try {
    await API.addExpense(data);
    closeModal('modalAddExpense');
    toast('支出已記錄！', 'success');
    await refreshAfterExpense();
    renderExpenseList();
  } catch (e) {
    toast('新增失敗：' + e.message, 'error');
  } finally {
    loading(false);
  }
}

async function deleteExpense(id) {
  if (!confirm('確定刪除這筆支出？')) return;
  loading(true);
  try {
    await API.deleteExpense(id);
    toast('已刪除');
    await refreshAfterExpense();
    renderExpenseList();
  } catch (e) {
    toast('刪除失敗', 'error');
  } finally {
    loading(false);
  }
}

// ════════════════════════════════════════════════════════════
// 設定
// ════════════════════════════════════════════════════════════
function renderSettings() {
  document.getElementById('gasUrlInput').value = API.url;
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
  loading(true);
  try {
    await API.addServiceType(data);
    closeModal('modalAddServiceType');
    toast('服務項目已新增！', 'success');
    await refreshSettings();
    renderServiceTypes();
  } catch (e) {
    toast('新增失敗：' + e.message, 'error');
  } finally {
    loading(false);
  }
}

async function deleteServiceType(id) {
  if (!confirm('確定刪除此服務項目？')) return;
  loading(true);
  try {
    await API.deleteServiceType(id);
    toast('已刪除');
    await refreshSettings();
    renderServiceTypes();
  } catch (e) {
    toast('刪除失敗', 'error');
  } finally {
    loading(false);
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
  loading(true);
  try {
    await API.addExpenseCategory(data);
    closeModal('modalAddExpenseCat');
    toast('支出項目已新增！', 'success');
    await refreshSettings();
    renderExpenseCategories();
  } catch (e) {
    toast('新增失敗：' + e.message, 'error');
  } finally {
    loading(false);
  }
}

async function deleteExpenseCategory(id) {
  if (!confirm('確定刪除此支出項目？')) return;
  loading(true);
  try {
    await API.deleteExpenseCategory(id);
    toast('已刪除');
    await refreshSettings();
    renderExpenseCategories();
  } catch (e) {
    toast('刪除失敗', 'error');
  } finally {
    loading(false);
  }
}

// ── GAS URL ───────────────────────────────────────────────────
async function saveGasUrl() {
  const url = document.getElementById('gasUrlInput').value.trim();
  if (!url) { toast('請填寫 GAS 網址', 'error'); return; }
  localStorage.setItem('gasUrl', url);
  toast('網址已儲存！正在初始化試算表…', 'success');
  loading(true);
  try {
    await API.init();
    toast('試算表初始化完成！', 'success');
    // 重新載入全部資料
    await loadAll();
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('appShell').style.display    = 'block';
    showView('dashboard');
  } catch (e) {
    toast('連線失敗，請確認網址：' + e.message, 'error');
  } finally {
    loading(false);
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

  if (!API.url) {
    // 首次設定
    document.getElementById('setupScreen').style.display = 'flex';
    document.getElementById('appShell').style.display    = 'none';
    return;
  }

  // 已有 URL：顯示 App，啟動時一次載入全部資料
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('appShell').style.display    = 'block';

  loading(true);
  try {
    await loadAll();
    showView('dashboard');
  } catch (e) {
    handleApiError(e);
    // 還是先顯示畫面，避免空白
    showView('dashboard');
  } finally {
    loading(false);
  }
});
