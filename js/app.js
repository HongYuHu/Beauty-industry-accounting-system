/* ============================================================
   app.js — 美業記帳系統主邏輯
   ============================================================ */

// ── 全域狀態 ────────────────────────────────────────────────
const state = {
  view:       'dashboard',
  year:       new Date().getFullYear(),
  month:      new Date().getMonth() + 1,
  serviceTypes:       [],
  expenseCategories:  [],
  inventory:          [],
  serviceRecords:     [],
  expenseRecords:     [],
  clients:            [],
  stats:              null,
};

// ── 工具函式 ────────────────────────────────────────────────
const fmt = {
  money:  n => `$${Number(n||0).toLocaleString()}`,
  date:   d => d ? new Date(d).toLocaleDateString('zh-TW',{month:'2-digit',day:'2-digit'}) : '',
  dateVal:d => d ? new Date(d).toISOString().slice(0,10) : '',
};

function toast(msg, type='') {
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

// ── 導覽 ────────────────────────────────────────────────────
function showView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === name);
  });
  switch (name) {
    case 'dashboard': loadDashboard(); break;
    case 'services':  loadServices();  break;
    case 'inventory': loadInventory(); break;
    case 'expenses':  loadExpenses();  break;
    case 'settings':  loadSettings();  break;
  }
}

// ── 月份選擇器 ───────────────────────────────────────────────
function initMonthPicker() {
  const ySel = document.getElementById('selYear');
  const mSel = document.getElementById('selMonth');
  const curY = new Date().getFullYear();
  for (let y = curY; y >= curY - 3; y--) {
    ySel.innerHTML += `<option value="${y}" ${y===state.year?'selected':''}>${y}</option>`;
  }
  ySel.addEventListener('change', () => { state.year = +ySel.value; refreshCurrentView(); });
  mSel.addEventListener('change', () => { state.month = +mSel.value; refreshCurrentView(); });
  mSel.value = state.month;
}

function refreshCurrentView() {
  switch (state.view) {
    case 'dashboard': loadDashboard(); break;
    case 'services':  loadServices();  break;
    case 'expenses':  loadExpenses();  break;
  }
}

// ════════════════════════════════════════════════════════════
// 儀表板
// ════════════════════════════════════════════════════════════
async function loadDashboard() {
  loading(true);
  try {
    const res = await API.getDashboardStats(state.year, state.month);
    state.stats = res;
    renderDashboard(res);
  } catch (e) {
    handleApiError(e);
  } finally {
    loading(false);
  }
}

function renderDashboard(s) {
  const c = s.currentMonth || {};
  document.getElementById('statRevenue').textContent  = fmt.money(c.totalRevenue);
  document.getElementById('statClients').textContent  = c.totalClients || 0;
  document.getElementById('statExpense').textContent  = fmt.money(c.totalExpenses);
  document.getElementById('statProfit').textContent   = fmt.money(c.netProfit);
  document.getElementById('statNew').textContent      = `新客 ${c.newClients || 0} 人`;
  document.getElementById('statReturn').textContent   = `回頭客 ${c.returningClients || 0} 人`;

  Charts.renderMonthly(
    s.monthlyRevenue  || Array(12).fill(0),
    s.monthlyExpenses || Array(12).fill(0),
  );

  const bd = s.serviceBreakdown || {};
  const keys = Object.keys(bd);
  if (keys.length) {
    Charts.renderServicePie(
      keys,
      keys.map(k => bd[k].count),
    );
    document.getElementById('servicePieEmpty').style.display = 'none';
    document.getElementById('servicePieChart').style.display = 'block';
  } else {
    document.getElementById('servicePieEmpty').style.display = 'block';
    document.getElementById('servicePieChart').style.display = 'none';
  }

  // 低庫存警示
  const low = s.lowInventory || [];
  const el = document.getElementById('lowStockList');
  if (low.length === 0) {
    el.innerHTML = '<div class="no-data">庫存充足，一切安好 ✓</div>';
  } else {
    el.innerHTML = low.map(i => `
      <div class="list-item">
        <div class="item-icon amber">📦</div>
        <div class="item-body">
          <div class="item-name">${i['品名']}</div>
          <div class="item-sub">來源：${i['供貨來源']||'—'}</div>
        </div>
        <div class="item-right">
          <span class="low-stock-chip">剩 ${i['目前庫存']} ${i['單位']}</span>
        </div>
      </div>`).join('');
  }
}

// ════════════════════════════════════════════════════════════
// 服務紀錄
// ════════════════════════════════════════════════════════════
async function loadServices() {
  loading(true);
  try {
    const [svcRes, typeRes, clientRes] = await Promise.all([
      API.getServiceRecords(state.year, state.month),
      API.getServiceTypes(),
      API.getClients(),
    ]);
    state.serviceRecords = svcRes.data || [];
    state.serviceTypes   = typeRes.data || [];
    state.clients        = clientRes.data || [];
    renderServiceList();
  } catch (e) {
    handleApiError(e);
  } finally {
    loading(false);
  }
}

function renderServiceList() {
  const list = document.getElementById('serviceList');
  const records = [...state.serviceRecords].sort((a,b) => new Date(b['日期']) - new Date(a['日期']));

  if (records.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div><p>這個月還沒有服務紀錄</p></div>`;
    return;
  }

  list.innerHTML = records.map(r => `
    <div class="list-item">
      <div class="item-icon">💆</div>
      <div class="item-body">
        <div class="item-name">${r['客戶姓名']} <span class="tag ${r['客戶類型']==='新客'?'new':'returning'}">${r['客戶類型']}</span></div>
        <div class="item-sub">${r['服務項目']}${r['備註']?' · '+r['備註']:''}</div>
      </div>
      <div class="item-right">
        <div class="item-amount">${fmt.money(r['金額'])}</div>
        <div class="item-date">${fmt.date(r['日期'])}</div>
      </div>
      <button class="btn-icon red btn" onclick="deleteServiceRecord('${r['ID']}')" title="刪除">×</button>
    </div>`).join('');

  // 更新月份摘要
  const total = state.serviceRecords.reduce((s,r) => s + Number(r['金額']||0), 0);
  document.getElementById('svcMonthSummary').textContent =
    `共 ${state.serviceRecords.length} 筆 · ${fmt.money(total)}`;
}

function showAddServiceModal() {
  // 填入服務類型選項
  const sel = document.getElementById('svcType');
  sel.innerHTML = state.serviceTypes.map(t =>
    `<option value="${t['名稱']}" data-price="${t['預設價格']}">${t['名稱']} (預設 ${fmt.money(t['預設價格'])})</option>`
  ).join('');
  if (state.serviceTypes.length === 0) {
    sel.innerHTML = '<option value="">請先到「設定」新增服務項目</option>';
  }
  sel.addEventListener('change', () => {
    const opt = sel.selectedOptions[0];
    if (opt && opt.dataset.price) {
      document.getElementById('svcAmount').value = opt.dataset.price;
    }
  });

  // 自動填入金額（第一筆）
  if (sel.selectedOptions[0]?.dataset.price) {
    document.getElementById('svcAmount').value = sel.selectedOptions[0].dataset.price;
  }

  document.getElementById('svcDate').value = todayVal();
  document.getElementById('svcClientName').value = '';
  document.getElementById('svcClientPhone').value = '';
  document.getElementById('svcAmount').value = '';
  document.getElementById('svcNotes').value = '';
  document.getElementById('svcClientType').value = '新客';

  openModal('modalAddService');
}

// 輸入電話時自動判斷新舊客
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('svcClientPhone')?.addEventListener('blur', function() {
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
  if (!data.clientName) { toast('請填寫客戶姓名', 'error'); return; }
  if (!data.serviceType) { toast('請選擇服務項目', 'error'); return; }
  if (!data.amount) { toast('請填寫金額', 'error'); return; }

  loading(true);
  try {
    await API.addServiceRecord(data);
    closeModal('modalAddService');
    toast('服務紀錄已新增！', 'success');
    await loadServices();
    if (state.view === 'dashboard') loadDashboard();
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
    toast('已刪除', '');
    await loadServices();
  } catch (e) {
    toast('刪除失敗', 'error');
  } finally {
    loading(false);
  }
}

// ════════════════════════════════════════════════════════════
// 庫存管理
// ════════════════════════════════════════════════════════════
async function loadInventory() {
  loading(true);
  try {
    const res = await API.getInventory();
    state.inventory = res.data || [];
    renderInventoryList();
  } catch (e) {
    handleApiError(e);
  } finally {
    loading(false);
  }
}

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
        <div class="item-name">${i['品名']} <span class="tag ${lvl==='ok'?'fixed':lvl==='warning'?'warning':'danger'}">${i['類別']}</span></div>
        <div class="item-sub">來源：${i['供貨來源']||'—'} · 安全庫存 ${safe}${i['單位']}</div>
        <div class="stock-bar-wrap">
          <div class="stock-bar-bg"><div class="stock-bar-fill ${lvl}" style="width:${pct}%"></div></div>
        </div>
      </div>
      <div class="item-right">
        <div class="item-amount" style="color:${lvl==='ok'?'var(--teal)':lvl==='warning'?'var(--amber)':'var(--red)'}">${cur} ${i['單位']}</div>
        <div class="item-date">${i['備註']||''}</div>
      </div>
      <div class="item-actions">
        <button class="btn-icon btn" onclick="showAddPurchaseModal('${i['ID']}','${i['品名']}')" title="進貨">+</button>
        <button class="btn-icon red btn" onclick="deleteInventoryItem('${i['ID']}')" title="刪除">×</button>
      </div>
    </div>`;
  }).join('');
}

function showAddInventoryModal() {
  document.getElementById('invName').value     = '';
  document.getElementById('invCategory').value = '保養品';
  document.getElementById('invStock').value    = '0';
  document.getElementById('invSafety').value   = '3';
  document.getElementById('invUnit').value     = '個';
  document.getElementById('invSupplier').value = '';
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
    await loadInventory();
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
  openModal('modalAddPurchase');

  // 計算小計
  ['purQty','purPrice'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const q = Number(document.getElementById('purQty').value)||0;
      const p = Number(document.getElementById('purPrice').value)||0;
      document.getElementById('purTotal').textContent = fmt.money(q * p);
    });
  });
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
    await loadInventory();
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
    toast('已刪除', '');
    await loadInventory();
  } catch (e) {
    toast('刪除失敗', 'error');
  } finally {
    loading(false);
  }
}

// ════════════════════════════════════════════════════════════
// 支出管理
// ════════════════════════════════════════════════════════════
async function loadExpenses() {
  loading(true);
  try {
    const [expRes, catRes] = await Promise.all([
      API.getExpenseRecords(state.year, state.month),
      API.getExpenseCategories(),
    ]);
    state.expenseRecords    = expRes.data || [];
    state.expenseCategories = catRes.data || [];
    renderExpenseList();
  } catch (e) {
    handleApiError(e);
  } finally {
    loading(false);
  }
}

function renderExpenseList() {
  const list = document.getElementById('expenseList');
  const records = [...state.expenseRecords].sort((a,b) => new Date(b['日期'])-new Date(a['日期']));

  const total = state.expenseRecords.reduce((s,r) => s + Number(r['金額']||0), 0);
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
        <div class="item-sub">${r['備註']||''}</div>
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
  sel.innerHTML = state.expenseCategories.map(c =>
    `<option value="${c['名稱']}">${c['名稱']} (${c['類型']})</option>`
  ).join('');
  if (state.expenseCategories.length === 0) {
    sel.innerHTML = '<option value="">請先到「設定」新增支出項目</option>';
  }
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
    await loadExpenses();
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
    toast('已刪除', '');
    await loadExpenses();
  } catch (e) {
    toast('刪除失敗', 'error');
  } finally {
    loading(false);
  }
}

// ════════════════════════════════════════════════════════════
// 設定
// ════════════════════════════════════════════════════════════
async function loadSettings() {
  loading(true);
  try {
    const [typeRes, catRes] = await Promise.all([
      API.getServiceTypes(),
      API.getExpenseCategories(),
    ]);
    state.serviceTypes      = typeRes.data || [];
    state.expenseCategories = catRes.data || [];
    renderServiceTypes();
    renderExpenseCategories();
    // 顯示已儲存的 GAS URL
    document.getElementById('gasUrlInput').value = API.url;
  } catch (e) {
    handleApiError(e);
  } finally {
    loading(false);
  }
}

function renderServiceTypes() {
  const el = document.getElementById('serviceTypesList');
  if (state.serviceTypes.length === 0) {
    el.innerHTML = '<div class="no-data">尚無服務項目</div>';
    return;
  }
  el.innerHTML = state.serviceTypes.map(t => `
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
  if (state.expenseCategories.length === 0) {
    el.innerHTML = '<div class="no-data">尚無支出項目</div>';
    return;
  }
  el.innerHTML = state.expenseCategories.map(c => `
    <div class="setting-item">
      <div>
        <div class="setting-item-name">${c['名稱']}</div>
        <div class="setting-item-sub"><span class="tag ${c['類型']==='固定'?'fixed':'variable'}">${c['類型']}</span></div>
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
    await loadSettings();
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
    toast('已刪除', '');
    await loadSettings();
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
    await loadSettings();
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
    toast('已刪除', '');
    await loadSettings();
  } catch (e) {
    toast('刪除失敗', 'error');
  } finally {
    loading(false);
  }
}

// ── GAS URL 設定 ─────────────────────────────────────────────
async function saveGasUrl() {
  const url = document.getElementById('gasUrlInput').value.trim();
  if (!url) { toast('請填寫 GAS 網址', 'error'); return; }
  localStorage.setItem('gasUrl', url);
  toast('網址已儲存！正在初始化試算表…', 'success');
  loading(true);
  try {
    await API.init();
    toast('試算表初始化完成！', 'success');
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('appShell').style.display    = 'block';
    showView('dashboard');
  } catch (e) {
    toast('連線失敗，請確認網址是否正確：' + e.message, 'error');
  } finally {
    loading(false);
  }
}

// ── Modal helpers ────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ── 點擊遮罩關閉 modal ───────────────────────────────────────
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ── API 錯誤處理 ─────────────────────────────────────────────
function handleApiError(e) {
  if (e.message === 'NO_URL') {
    toast('請先在「設定」頁面填寫 GAS 網址', 'warning');
  } else {
    toast('載入失敗：' + e.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// 初始化
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initMonthPicker();

  if (API.url) {
    // 已有 URL → 直接進入 app
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('appShell').style.display    = 'block';
    showView('dashboard');
  } else {
    // 尚未設定 → 顯示設定畫面
    document.getElementById('setupScreen').style.display = 'flex';
    document.getElementById('appShell').style.display    = 'none';
  }
});
