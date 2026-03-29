// ============================================================
// 美業記帳系統 — Google Apps Script 後端 API
// ============================================================
// 設定步驟：
// 1. 到 Google Sheets 建立一個新試算表，複製試算表網址中的 ID
//    例如：https://docs.google.com/spreadsheets/d/【這段就是ID】/edit
// 2. 將 ID 貼到下方 SPREADSHEET_ID
// 3. 點選「部署」→「新增部署項目」→「網頁應用程式」
//    執行身分：我自己、存取對象：任何人
// 4. 複製部署後的網址，貼到前端 index.html 的設定頁面
// ============================================================

const SPREADSHEET_ID = ''; // ← 在此填入你的 Google Sheets ID

const SHEETS = {
  SERVICE_RECORDS:    '服務紀錄',
  SERVICE_TYPES:      '服務項目',
  INVENTORY:          '庫存',
  PURCHASE_RECORDS:   '進貨紀錄',
  EXPENSE_RECORDS:    '支出紀錄',
  EXPENSE_CATEGORIES: '支出項目',
  CLIENTS:            '客戶資料',
};

const HEADERS = {
  SERVICE_RECORDS:    ['ID','日期','客戶姓名','客戶電話','服務項目','金額','備註','客戶類型'],
  SERVICE_TYPES:      ['ID','名稱','預設價格','類別'],
  INVENTORY:          ['ID','品名','類別','目前庫存','安全庫存量','單位','供貨來源','備註'],
  PURCHASE_RECORDS:   ['ID','日期','品名','進貨數量','進貨單價','總成本','供貨來源','備註'],
  EXPENSE_RECORDS:    ['ID','日期','支出項目','金額','備註'],
  EXPENSE_CATEGORIES: ['ID','名稱','類型'],
  CLIENTS:            ['ID','姓名','電話','第一次到訪','最後到訪','總到訪次數','備註'],
};

// ────────────────────────────────────────────────────────────
// 進入點
// ────────────────────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    switch (action) {
      case 'init':               result = initSheets(); break;
      case 'getServiceRecords':  result = getServiceRecords(e.parameter); break;
      case 'getServiceTypes':    result = getSheetData(SHEETS.SERVICE_TYPES); break;
      case 'getInventory':       result = getSheetData(SHEETS.INVENTORY); break;
      case 'getPurchaseRecords': result = getSheetData(SHEETS.PURCHASE_RECORDS); break;
      case 'getExpenseRecords':  result = getExpenseRecords(e.parameter); break;
      case 'getExpenseCategories': result = getSheetData(SHEETS.EXPENSE_CATEGORIES); break;
      case 'getClients':         result = getSheetData(SHEETS.CLIENTS); break;
      case 'getDashboardStats':  result = getDashboardStats(e.parameter); break;
      default: result = { error: '未知的 action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return output(result);
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); }
  catch (err) { return output({ error: '無效的 JSON: ' + err }); }

  const action = data.action;
  let result;
  try {
    switch (action) {
      case 'addServiceRecord':      result = addServiceRecord(data); break;
      case 'updateServiceRecord':   result = updateServiceRecord(data); break;
      case 'deleteServiceRecord':   result = deleteRow(SHEETS.SERVICE_RECORDS, data.id); break;
      case 'addServiceType':        result = addServiceType(data); break;
      case 'deleteServiceType':     result = deleteRow(SHEETS.SERVICE_TYPES, data.id); break;
      case 'addInventoryItem':      result = addInventoryItem(data); break;
      case 'addPurchaseRecord':     result = addPurchaseRecord(data); break;
      case 'updateInventoryStock':  result = updateInventoryStock(data); break;
      case 'deleteInventoryItem':   result = deleteRow(SHEETS.INVENTORY, data.id); break;
      case 'addExpense':            result = addExpense(data); break;
      case 'updateExpense':         result = updateExpense(data); break;
      case 'deleteExpense':         result = deleteRow(SHEETS.EXPENSE_RECORDS, data.id); break;
      case 'addExpenseCategory':    result = addExpenseCategory(data); break;
      case 'deleteExpenseCategory': result = deleteRow(SHEETS.EXPENSE_CATEGORIES, data.id); break;
      default: result = { error: '未知的 action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return output(result);
}

function output(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ────────────────────────────────────────────────────────────
// 初始化試算表
// ────────────────────────────────────────────────────────────
function initSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const created = [];

  Object.keys(SHEETS).forEach(key => {
    const name = SHEETS[key];
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      const headers = HEADERS[key];
      const range = sheet.getRange(1, 1, 1, headers.length);
      range.setValues([headers]);
      range.setBackground('#f8bbd0').setFontWeight('bold').setFontSize(11);
      sheet.setFrozenRows(1);
      created.push(name);
    }
  });

  // 預設服務項目
  const typeSheet = ss.getSheetByName(SHEETS.SERVICE_TYPES);
  if (typeSheet.getLastRow() <= 1) {
    const defaults = [
      [uid(), '單色睫毛', 1200, '睫毛'],
      [uid(), '混合睫毛', 1500, '睫毛'],
      [uid(), '特殊睫毛', 1800, '睫毛'],
      [uid(), '臉部保養', 1200, '美容'],
      [uid(), '深層清潔', 900, '美容'],
    ];
    typeSheet.getRange(2, 1, defaults.length, 4).setValues(defaults);
  }

  // 預設支出項目
  const catSheet = ss.getSheetByName(SHEETS.EXPENSE_CATEGORIES);
  if (catSheet.getLastRow() <= 1) {
    const defaults = [
      [uid(), '房租', '固定'],
      [uid(), '睫毛材料', '固定'],
      [uid(), '美容耗材', '變動'],
      [uid(), '水電費', '固定'],
      [uid(), '交通費', '變動'],
    ];
    catSheet.getRange(2, 1, defaults.length, 3).setValues(defaults);
  }

  return { success: true, created };
}

// ────────────────────────────────────────────────────────────
// 通用工具
// ────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return { data: [] };
  const raw = sheet.getDataRange().getValues();
  if (raw.length <= 1) return { data: [] };
  const headers = raw[0];
  return {
    data: raw.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    })
  };
}

function deleteRow(sheetName, id) {
  const sheet = getSheet(sheetName);
  if (!sheet) return { error: '找不到工作表' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: '找不到該筆資料' };
}

// ────────────────────────────────────────────────────────────
// 服務紀錄
// ────────────────────────────────────────────────────────────
function getServiceRecords(params) {
  const sheet = getSheet(SHEETS.SERVICE_RECORDS);
  if (!sheet) return { data: [] };
  const raw = sheet.getDataRange().getValues();
  if (raw.length <= 1) return { data: [] };
  const headers = raw[0];
  let rows = raw.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  if (params.year || params.month) {
    rows = rows.filter(r => {
      if (!r['日期']) return false;
      const d = new Date(r['日期']);
      if (params.year  && String(d.getFullYear())   !== String(params.year))  return false;
      if (params.month && String(d.getMonth() + 1)  !== String(params.month)) return false;
      return true;
    });
  }
  return { data: rows };
}

function addServiceRecord(data) {
  const sheet = getSheet(SHEETS.SERVICE_RECORDS);
  if (!sheet) return { error: '找不到工作表' };
  const id = uid();
  sheet.appendRow([id, data.date, data.clientName, data.clientPhone || '',
    data.serviceType, Number(data.amount), data.notes || '', data.clientType || '新客']);
  upsertClient(data.clientName, data.clientPhone || '', data.date);
  return { success: true, id };
}

function updateServiceRecord(data) {
  const sheet = getSheet(SHEETS.SERVICE_RECORDS);
  if (!sheet) return { error: '找不到工作表' };
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      sheet.getRange(i + 1, 2, 1, 7).setValues([[
        data.date, data.clientName, data.clientPhone || '',
        data.serviceType, Number(data.amount), data.notes || '', data.clientType || '新客'
      ]]);
      upsertClient(data.clientName, data.clientPhone || '', data.date);
      return { success: true };
    }
  }
  return { error: '找不到紀錄' };
}

// ────────────────────────────────────────────────────────────
// 客戶資料（自動維護）
// ────────────────────────────────────────────────────────────
function upsertClient(name, phone, date) {
  const sheet = getSheet(SHEETS.CLIENTS);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const match = (phone && String(data[i][2]) === String(phone)) || data[i][1] === name;
    if (match) {
      sheet.getRange(i + 1, 5).setValue(date);
      sheet.getRange(i + 1, 6).setValue(Number(data[i][5]) + 1);
      return;
    }
  }
  sheet.appendRow([uid(), name, phone, date, date, 1, '']);
}

// ────────────────────────────────────────────────────────────
// 服務項目（自定義）
// ────────────────────────────────────────────────────────────
function addServiceType(data) {
  const sheet = getSheet(SHEETS.SERVICE_TYPES);
  if (!sheet) return { error: '找不到工作表' };
  const id = uid();
  sheet.appendRow([id, data.name, Number(data.defaultPrice) || 0, data.category || '一般']);
  return { success: true, id };
}

// ────────────────────────────────────────────────────────────
// 庫存
// ────────────────────────────────────────────────────────────
function addInventoryItem(data) {
  const sheet = getSheet(SHEETS.INVENTORY);
  if (!sheet) return { error: '找不到工作表' };
  const id = uid();
  sheet.appendRow([id, data.name, data.category || '保養品',
    Number(data.stock) || 0, Number(data.safetyStock) || 3,
    data.unit || '個', data.supplier || '', data.notes || '']);
  return { success: true, id };
}

function addPurchaseRecord(data) {
  const sheet = getSheet(SHEETS.PURCHASE_RECORDS);
  if (!sheet) return { error: '找不到工作表' };
  const id = uid();
  const total = Number(data.quantity) * Number(data.unitPrice);
  sheet.appendRow([id, data.date, data.itemName,
    Number(data.quantity), Number(data.unitPrice), total,
    data.supplier || '', data.notes || '']);

  // 更新庫存數量
  if (data.inventoryId) {
    const inv = getSheet(SHEETS.INVENTORY);
    const rows = inv.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.inventoryId)) {
        inv.getRange(i + 1, 4).setValue(Number(rows[i][3]) + Number(data.quantity));
        break;
      }
    }
  }
  return { success: true, id, total };
}

function updateInventoryStock(data) {
  const sheet = getSheet(SHEETS.INVENTORY);
  if (!sheet) return { error: '找不到工作表' };
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      sheet.getRange(i + 1, 4).setValue(Number(data.stock));
      return { success: true };
    }
  }
  return { error: '找不到商品' };
}

// ────────────────────────────────────────────────────────────
// 支出
// ────────────────────────────────────────────────────────────
function getExpenseRecords(params) {
  const sheet = getSheet(SHEETS.EXPENSE_RECORDS);
  if (!sheet) return { data: [] };
  const raw = sheet.getDataRange().getValues();
  if (raw.length <= 1) return { data: [] };
  const headers = raw[0];
  let rows = raw.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  if (params.year || params.month) {
    rows = rows.filter(r => {
      if (!r['日期']) return false;
      const d = new Date(r['日期']);
      if (params.year  && String(d.getFullYear())  !== String(params.year))  return false;
      if (params.month && String(d.getMonth() + 1) !== String(params.month)) return false;
      return true;
    });
  }
  return { data: rows };
}

function addExpense(data) {
  const sheet = getSheet(SHEETS.EXPENSE_RECORDS);
  if (!sheet) return { error: '找不到工作表' };
  const id = uid();
  sheet.appendRow([id, data.date, data.category, Number(data.amount), data.notes || '']);
  return { success: true, id };
}

function updateExpense(data) {
  const sheet = getSheet(SHEETS.EXPENSE_RECORDS);
  if (!sheet) return { error: '找不到工作表' };
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      sheet.getRange(i + 1, 2, 1, 4).setValues([[
        data.date, data.category, Number(data.amount), data.notes || ''
      ]]);
      return { success: true };
    }
  }
  return { error: '找不到紀錄' };
}

function addExpenseCategory(data) {
  const sheet = getSheet(SHEETS.EXPENSE_CATEGORIES);
  if (!sheet) return { error: '找不到工作表' };
  const id = uid();
  sheet.appendRow([id, data.name, data.type || '變動']);
  return { success: true, id };
}

// ────────────────────────────────────────────────────────────
// 儀表板統計（優化版：只讀表 3 次，記憶體內計算）
// ────────────────────────────────────────────────────────────
function getDashboardStats(params) {
  const year  = String(params.year  || new Date().getFullYear());
  const month = String(params.month || (new Date().getMonth() + 1));

  // ── 一次讀取全部服務紀錄 ──────────────────────────────────
  function parseSheet(sheetName) {
    const sheet = getSheet(sheetName);
    if (!sheet) return [];
    const raw = sheet.getDataRange().getValues();
    if (raw.length <= 1) return [];
    const headers = raw[0];
    return raw.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
  }

  const allSvc = parseSheet(SHEETS.SERVICE_RECORDS);
  const allExp = parseSheet(SHEETS.EXPENSE_RECORDS);

  // 篩選當月
  function filterByYearMonth(rows, dateKey, y, m) {
    return rows.filter(r => {
      if (!r[dateKey]) return false;
      const d = new Date(r[dateKey]);
      return String(d.getFullYear()) === y && String(d.getMonth() + 1) === m;
    });
  }

  const curSvc = filterByYearMonth(allSvc, '日期', year, month);
  const curExp = filterByYearMonth(allExp, '日期', year, month);

  const totalRevenue     = curSvc.reduce((s, r) => s + (Number(r['金額']) || 0), 0);
  const totalExpenses    = curExp.reduce((s, r) => s + (Number(r['金額']) || 0), 0);
  const totalClients     = curSvc.length;
  const newClients       = curSvc.filter(r => r['客戶類型'] === '新客').length;
  const returningClients = curSvc.filter(r => r['客戶類型'] === '回頭客').length;

  // 全年每月（記憶體內過濾，不再重複讀表）
  const monthlyRevenue  = Array.from({ length: 12 }, (_, m) =>
    filterByYearMonth(allSvc, '日期', year, String(m + 1))
      .reduce((s, r) => s + (Number(r['金額']) || 0), 0)
  );
  const monthlyExpenses = Array.from({ length: 12 }, (_, m) =>
    filterByYearMonth(allExp, '日期', year, String(m + 1))
      .reduce((s, r) => s + (Number(r['金額']) || 0), 0)
  );

  // 服務項目分布（本月）
  const serviceBreakdown = {};
  curSvc.forEach(r => {
    const t = r['服務項目'] || '其他';
    if (!serviceBreakdown[t]) serviceBreakdown[t] = { count: 0, revenue: 0 };
    serviceBreakdown[t].count++;
    serviceBreakdown[t].revenue += Number(r['金額']) || 0;
  });

  // 低庫存警示
  const invData = getSheetData(SHEETS.INVENTORY).data || [];
  const lowInventory = invData
    .filter(i => Number(i['目前庫存']) <= Number(i['安全庫存量']))
    .slice(0, 5);

  return {
    currentMonth: { totalRevenue, totalExpenses,
                    netProfit: totalRevenue - totalExpenses,
                    totalClients, newClients, returningClients },
    monthlyRevenue,
    monthlyExpenses,
    serviceBreakdown,
    lowInventory,
  };
}
