/**
 * データ管理 (CRUD)
 */

/**
 * 整備記録を新規保存
 * @param {Object} data - フォームデータ
 * @returns {Object} { success, error }
 */
function saveRecord(data) {
  try {
    const sheet = getOrCreateCarSheet(data.carName);
    sheet.appendRow(buildRowData(data));
    recalculateCarData(data.carName);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 整備記録を更新
 * @param {Object} data - フォームデータ（rowIndex を含む）
 * @returns {Object} { success, error }
 */
function updateRecord(data) {
  try {
    const sheet = getOrCreateCarSheet(data.carName);
    const row = buildRowData(data);
    sheet.getRange(data.rowIndex, 1, 1, row.length).setValues([row]);
    recalculateCarData(data.carName);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 整備記録を削除
 * @param {string} carName
 * @param {number} rowIndex - シート上の行番号
 * @returns {Object} { success, error }
 */
function deleteRecord(carName, rowIndex) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(carName);
    if (!sheet) return { success: false, error: 'シートが見つかりません。' };
    sheet.deleteRow(rowIndex);
    recalculateCarData(carName);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 特定の自動車の全記録を取得
 * @param {string} carName
 * @returns {Object[]} 記録の配列
 */
function getRecords(carName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(carName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return [];

  const numRows = lastRow - HEADER_ROW;
  const data = sheet.getRange(DATA_START_ROW, 1, numRows, HEADERS.length).getValues();

  return data
    .map((row, idx) => ({
      rowIndex:    idx + DATA_START_ROW,
      date:        formatDateValue(row[COL.DATE - 1]),
      type:        row[COL.TYPE - 1]        || '',
      oilElement:  row[COL.OIL_ELEM - 1]   || '',
      fuelAmount:  numOrEmpty(row[COL.FUEL_AMT - 1]),
      cost:        numOrEmpty(row[COL.COST - 1]),
      odometer:    numOrEmpty(row[COL.ODOMETER - 1]),
      fuelStatus:  row[COL.FUEL_STATUS - 1] || '',
      fuelEconomy: numOrEmpty(row[COL.FUEL_ECO - 1]),
      oilDistance: numOrEmpty(row[COL.OIL_DIST - 1]),
      memo:        row[COL.MEMO - 1]        || '',
      summary:     row[COL.SUMMARY - 1]     || '',
      photos: row[COL.PHOTOS - 1]
        ? row[COL.PHOTOS - 1].toString().split(',').map(s => s.trim()).filter(Boolean)
        : []
    }))
    .filter(r => r.date || r.type); // 完全空白行を除外
}

/**
 * 燃費グラフ用データを取得
 * @param {string} carName
 * @returns {Object[]} { date, fuelEconomy, odometer }[]
 */
function getFuelEconomyData(carName) {
  return getRecords(carName)
    .filter(r => r.type === '給油' && r.fuelEconomy !== '' && r.fuelEconomy > 0)
    .map(r => ({ date: r.date, fuelEconomy: r.fuelEconomy, odometer: r.odometer }));
}

// ========================
// 内部ヘルパー
// ========================

/**
 * フォームデータから行データ配列を構築
 * @param {Object} data
 * @returns {Array}
 */
function buildRowData(data) {
  // 日付を Date オブジェクトに変換して保存
  let dateValue = data.date;
  if (typeof dateValue === 'string' && dateValue) {
    const parts = dateValue.replace(/-/g, '/').split('/');
    if (parts.length === 3) {
      dateValue = new Date(
        parseInt(parts[0]),
        parseInt(parts[1]) - 1,
        parseInt(parts[2])
      );
    }
  }

  return [
    dateValue,
    data.type        || '',
    data.oilElement  || '',
    toNumOrEmpty(data.fuelAmount),
    toNumOrEmpty(data.cost),
    toNumOrEmpty(data.odometer),
    data.fuelStatus  || '',
    '',  // 燃費（再計算で設定）
    '',  // OIL距離（再計算で設定）
    data.memo        || '',
    data.summary     || '',
    (data.photos && data.photos.length > 0) ? data.photos.join(', ') : ''
  ];
}

/**
 * 日付値を yyyy/MM/dd 文字列に変換
 * @param {*} value
 * @returns {string}
 */
function formatDateValue(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy/MM/dd');
  }
  return value.toString();
}

/**
 * 数値または空文字を返す
 * @param {*} v
 * @returns {number|string}
 */
function numOrEmpty(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return isNaN(n) ? '' : n;
}

/**
 * 文字列を数値に変換、空なら空文字を返す
 * @param {*} v
 * @returns {number|string}
 */
function toNumOrEmpty(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseFloat(v);
  return isNaN(n) ? '' : n;
}
