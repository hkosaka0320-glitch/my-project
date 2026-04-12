/**
 * シート・スプレッドシート管理
 */

/**
 * 登録済み自動車名のリストを取得（設定シートを除く）
 * @returns {string[]} 自動車名の配列
 */
function getCarList() {
  return SpreadsheetApp.getActiveSpreadsheet()
    .getSheets()
    .map(s => s.getName())
    .filter(name => name !== SETTINGS_SHEET_NAME);
}

// ========================
// 設定管理
// ========================

/**
 * 設定を取得
 * @returns {Object} 設定オブジェクト { exportFolderId, defaultCar }
 */
function getSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) sheet = createSettingsSheet(ss);

  const defaults = { exportFolderId: '', defaultCar: '' };
  const data = sheet.getDataRange().getValues();

  // 1行目はヘッダーなのでスキップ
  data.slice(1).forEach(row => {
    const key = row[0] ? row[0].toString() : '';
    const val = row[1] !== undefined ? row[1].toString() : '';
    if (key in defaults) defaults[key] = val;
  });

  return defaults;
}

/**
 * 設定を保存
 * @param {Object} settings - 保存する設定
 * @returns {Object} { success, error }
 */
function saveSettings(settings) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) sheet = createSettingsSheet(ss);

    sheet.clearContents();
    sheet.getRange(1, 1, 1, 2).setValues([['キー', '値']]);

    const entries = Object.entries(settings);
    if (entries.length > 0) {
      sheet.getRange(2, 1, entries.length, 2).setValues(entries);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 設定シートを初期作成
 * @param {Spreadsheet} ss
 * @returns {Sheet}
 */
function createSettingsSheet(ss) {
  const sheet = ss.insertSheet(SETTINGS_SHEET_NAME);

  sheet.getRange(1, 1, 1, 2).setValues([['キー', '値']]);
  sheet.getRange(2, 1, 2, 2).setValues([
    ['exportFolderId', ''],
    ['defaultCar',     '']
  ]);

  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 400);
  sheet.getRange(1, 1, 1, 2)
    .setBackground('#37474F')
    .setFontColor('white')
    .setFontWeight('bold');

  return sheet;
}

// ========================
// 自動車シート管理
// ========================

/**
 * 自動車シートを取得または新規作成
 * @param {string} carName
 * @returns {Sheet}
 */
function getOrCreateCarSheet(carName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(carName);
  if (!sheet) {
    sheet = ss.insertSheet(carName);
    setupCarSheetHeaders(sheet);
  }
  return sheet;
}

/**
 * 自動車シートのヘッダーとフォーマットを設定
 * @param {Sheet} sheet
 */
function setupCarSheetHeaders(sheet) {
  const colCount = HEADERS.length;
  const headerRange = sheet.getRange(1, 1, 1, colCount);

  headerRange.setValues([HEADERS]);
  headerRange
    .setBackground('#1B5E20')
    .setFontColor('white')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 30);

  // 列幅設定
  const widths = [110, 130, 90, 75, 90, 110, 80, 85, 145, 200, 200, 260];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  sheet.setFrozenRows(1);
}

/**
 * 新しい自動車を追加
 * @param {string} carName
 * @returns {Object} { success, carName, error }
 */
function addCar(carName) {
  if (!carName || !carName.trim()) {
    return { success: false, error: '自動車名を入力してください。' };
  }
  const name = carName.trim();

  if (name === SETTINGS_SHEET_NAME) {
    return { success: false, error: 'その名前は使用できません。' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(name)) {
    return { success: false, error: 'その自動車名は既に登録されています。' };
  }

  getOrCreateCarSheet(name);
  return { success: true, carName: name };
}

/**
 * 自動車シートを削除
 * @param {string} carName
 * @returns {Object} { success, error }
 */
function deleteCar(carName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(carName);
    if (!sheet) return { success: false, error: 'シートが見つかりません。' };
    if (ss.getSheets().length <= 1) {
      return { success: false, error: 'シートが1枚しかないため削除できません。' };
    }
    ss.deleteSheet(sheet);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
