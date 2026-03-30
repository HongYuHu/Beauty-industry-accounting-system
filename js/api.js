/* ============================================================
   api.js — 與 Google Apps Script Web App 溝通
   ============================================================ */

const API = {
  // 固定的 GAS 部署網址
  url: 'https://script.google.com/macros/s/AKfycbzcjNdsW2EviG9IxsL6kzCou52JggeiEHs1xR1uHFcSyaWFbgDqvaMj7IzWBm9qNL4/exec',

  /** GET 請求 */
  async get(action, params = {}) {
    const url = this.url;
    if (!url) throw new Error('NO_URL');

    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${url}?${qs}`, { method: 'GET' });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  },

  /** POST 請求
   *  GAS 有 CORS 限制，必須用 Content-Type: text/plain 來避免 preflight。
   *  GAS 端收到後以 JSON.parse(e.postData.contents) 解析。
   */
  async post(action, body = {}) {
    const url = this.url;
    if (!url) throw new Error('NO_URL');

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  },

  // ── 初始化試算表 ─────────────────────────────────────────
  init: () => API.get('init'),

  // ── 儀表板 ───────────────────────────────────────────────
  getDashboardStats: (year, month) => API.get('getDashboardStats', { year, month }),

  // ── 服務紀錄 ─────────────────────────────────────────────
  getServiceRecords:   (year, month) => API.get('getServiceRecords', { year, month }),
  addServiceRecord:    (data)        => API.post('addServiceRecord', data),
  updateServiceRecord: (data)        => API.post('updateServiceRecord', data),
  deleteServiceRecord: (id)          => API.post('deleteServiceRecord', { id }),

  // ── 服務項目（自定義） ────────────────────────────────────
  getServiceTypes:   ()     => API.get('getServiceTypes'),
  addServiceType:    (data) => API.post('addServiceType', data),
  deleteServiceType: (id)   => API.post('deleteServiceType', { id }),

  // ── 庫存 ─────────────────────────────────────────────────
  getInventory:        ()     => API.get('getInventory'),
  addInventoryItem:    (data) => API.post('addInventoryItem', data),
  addPurchaseRecord:   (data) => API.post('addPurchaseRecord', data),
  updateInventoryStock:(data) => API.post('updateInventoryStock', data),
  deleteInventoryItem: (id)   => API.post('deleteInventoryItem', { id }),
  getPurchaseRecords:  ()     => API.get('getPurchaseRecords'),

  // ── 支出 ─────────────────────────────────────────────────
  getExpenseRecords:    (year, month) => API.get('getExpenseRecords', { year, month }),
  addExpense:           (data)        => API.post('addExpense', data),
  updateExpense:        (data)        => API.post('updateExpense', data),
  deleteExpense:        (id)          => API.post('deleteExpense', { id }),

  // ── 支出項目（自定義） ────────────────────────────────────
  getExpenseCategories:   ()     => API.get('getExpenseCategories'),
  addExpenseCategory:     (data) => API.post('addExpenseCategory', data),
  deleteExpenseCategory:  (id)   => API.post('deleteExpenseCategory', { id }),

  // ── 客戶資料 ─────────────────────────────────────────────
  getClients: () => API.get('getClients'),
};
