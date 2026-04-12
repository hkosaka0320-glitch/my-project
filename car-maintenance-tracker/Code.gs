/**
 * 自動車整備記録システム - メインコード
 * Google Apps Script / Google Sheets プロジェクト
 */

// ========================
// 定数定義
// ========================

/** 設定シート名 */
const SETTINGS_SHEET_NAME = '設定';

/** ヘッダー行番号 */
const HEADER_ROW = 1;

/** データ開始行番号 */
const DATA_START_ROW = 2;

/** 列番号定義（1始まり） */
const COL = {
  DATE:        1,   // 整備年月日
  TYPE:        2,   // 整備種別
  OIL_ELEM:    3,   // OILエレメント交換
  FUEL_AMT:    4,   // 給油量(L)
  COST:        5,   // 料金(円)
  ODOMETER:    6,   // メーター距離(km)
  FUEL_STATUS: 7,   // 給油状態
  FUEL_ECO:    8,   // 燃費(km/L) ← 自動計算
  OIL_DIST:    9,   // 前回OIL交換からの距離(km) ← 自動計算
  MEMO:        10,  // メモ
  SUMMARY:     11,  // 摘要
  PHOTOS:      12   // 写真URL
};

/** 列ヘッダー名 */
const HEADERS = [
  '整備年月日',
  '整備種別',
  'OILエレメント交換',
  '給油量(L)',
  '料金(円)',
  'メーター距離(km)',
  '給油状態',
  '燃費(km/L)',
  '前回OIL交換からの距離(km)',
  'メモ',
  '摘要',
  '写真'
];

/** 整備種別リスト */
const MAINTENANCE_TYPES = [
  '給油',
  'オイル交換',
  'タイヤ交換',
  '車検',
  '保険',
  'ワイパー交換',
  '洗車',
  'その他整備'
];

/** 給油状態リスト */
const FUEL_STATUS_OPTIONS = ['満タン', '非満タン'];

// ========================
// メニュー設定
// ========================

/**
 * スプレッドシートを開いたときにカスタムメニューを追加
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('自動車整備記録')
    .addItem('整備記録を入力', 'showInputForm')
    .addItem('整備一覧を表示', 'showMaintenanceList')
    .addSeparator()
    .addItem('再計算', 'recalculateAllData')
    .addSeparator()
    .addItem('データをエクスポート', 'showExportDialog')
    .addItem('データをインポート', 'showImportDialog')
    .addSeparator()
    .addItem('設定', 'showSettings')
    .addToUi();
}

// ========================
// ダイアログ表示関数
// ========================

/**
 * 整備記録入力フォームを表示
 * @param {Object|null} editData - 編集データ（新規の場合はnull）
 */
function showInputForm(editData) {
  const template = HtmlService.createTemplateFromFile('InputForm');
  template.editData           = editData ? JSON.stringify(editData) : 'null';
  template.carList            = JSON.stringify(getCarList());
  template.maintenanceTypes   = JSON.stringify(MAINTENANCE_TYPES);
  template.fuelStatusOptions  = JSON.stringify(FUEL_STATUS_OPTIONS);

  const html = template.evaluate()
    .setWidth(780)
    .setHeight(860);

  SpreadsheetApp.getUi().showModalDialog(
    html,
    editData ? '整備記録を編集' : '整備記録を入力'
  );
}

/**
 * 整備一覧ダイアログを表示
 */
function showMaintenanceList() {
  const template = HtmlService.createTemplateFromFile('MaintenanceList');
  template.carList = JSON.stringify(getCarList());

  const html = template.evaluate()
    .setWidth(1120)
    .setHeight(740);

  SpreadsheetApp.getUi().showModalDialog(html, '整備一覧');
}

/**
 * 設定ダイアログを表示
 */
function showSettings() {
  const template = HtmlService.createTemplateFromFile('Settings');
  template.settings = JSON.stringify(getSettings());
  template.carList  = JSON.stringify(getCarList());

  const html = template.evaluate()
    .setWidth(640)
    .setHeight(540);

  SpreadsheetApp.getUi().showModalDialog(html, '設定');
}

/**
 * エクスポートダイアログを表示
 */
function showExportDialog() {
  const template = HtmlService.createTemplateFromFile('ExportDialog');
  template.carList = JSON.stringify(getCarList());

  const html = template.evaluate()
    .setWidth(460)
    .setHeight(340);

  SpreadsheetApp.getUi().showModalDialog(html, 'データエクスポート');
}

/**
 * インポートダイアログを表示
 */
function showImportDialog() {
  const template = HtmlService.createTemplateFromFile('ImportDialog');
  template.carList = JSON.stringify(getCarList());

  const html = template.evaluate()
    .setWidth(560)
    .setHeight(480);

  SpreadsheetApp.getUi().showModalDialog(html, 'データインポート');
}

// ========================
// ユーティリティ
// ========================

/**
 * HTMLファイルをインクルード（テンプレート用）
 * @param {string} filename - ファイル名
 * @returns {string} HTMLコンテンツ
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 全自動車データの再計算を実行
 */
function recalculateAllData() {
  const cars = getCarList();
  if (cars.length === 0) {
    SpreadsheetApp.getUi().alert('自動車データがありません。\nまず自動車を登録してください。');
    return;
  }
  cars.forEach(car => recalculateCarData(car));
  SpreadsheetApp.getUi().alert('再計算が完了しました。');
}

/**
 * シートのデータを日付順（昇順）に並び替え
 * @param {string} carName
 * @returns {Object} { success, error }
 */
function sortSheetByDate(carName) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(carName);
    if (!sheet) return { success: false, error: 'シートが見つかりません。' };
    const lastRow = sheet.getLastRow();
    if (lastRow < DATA_START_ROW + 1) return { success: true };
    const range = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, HEADERS.length);
    range.sort({ column: COL.DATE, ascending: true });
    recalculateCarData(carName);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 写真ファイルをGoogle Driveに保存
 * スプレッドシートと同じフォルダ内に「写真_車名」フォルダを作成して保存
 * @param {string} base64Data - Base64エンコードされたファイルデータ
 * @param {string} fileName   - ファイル名
 * @param {string} mimeType   - MIMEタイプ
 * @param {string} carName    - 自動車名（サブフォルダ名に使用）
 * @returns {Object} { success, fileUrl, fileName, error }
 */
function savePhotoToDrive(base64Data, fileName, mimeType, carName) {
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const ssFile  = DriveApp.getFileById(ss.getId());
    const parents = ssFile.getParents();
    const parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();

    // 写真用サブフォルダを取得または作成
    const folderName = '写真_' + (carName || '共通');
    let photoFolder;
    const folders = parentFolder.getFoldersByName(folderName);
    photoFolder = folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);

    // Base64 → Blob → Drive に保存
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType,
      fileName
    );
    const file = photoFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { success: true, fileUrl: file.getUrl(), fileName: file.getName() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
