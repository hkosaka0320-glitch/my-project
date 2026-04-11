/**
 * 自動車整備記録システム - Google Apps Script
 *
 * ■ シート構成
 *   「設定」シート  … 非表示（アプリ管理用）
 *   車両名シート    … 車両ごとに1シート（記録データ）
 *
 * ■ 列構成（各車両シート）
 *   A: 整備年月日  B: 整備種別  C: 給油量(L)  D: 料金(円)  E: メーター距離(km)
 *   F: 燃費(km/L)  G: 給油状態  H: オイル後距離(km)  I: エレメント交換
 *   J: 摘要  K: メモ  L: データ保存先  M: 写真URL
 */

// ───────────────────────────────────────────────
// 定数
// ───────────────────────────────────────────────

const CFG = {
  SETTINGS: '設定',
  PHOTO_FOLDER: '自動車整備記録_写真',
  HEADERS: [
    '整備年月日','整備種別','給油量(L)','料金(円)','メーター距離(km)',
    '燃費(km/L)','給油状態','オイル後距離(km)','エレメント交換',
    '摘要','メモ','データ保存先','写真URL'
  ],
  // 0始まり列インデックス
  C: {
    DATE:0, TYPE:1, FUEL_AMT:2, PRICE:3, ODO:4,
    EFF:5, FUEL_STS:6, OIL_DIST:7, OIL_ELM:8,
    SUMMARY:9, MEMO:10, SAVEPATH:11, PHOTOS:12
  },
  COL_W: [105,115,85,90,115,100,90,120,100,185,185,205,270],
  TYPES: ['給油','オイル交換','タイヤ交換','車検','保険','ワイパー交換','洗車','その他整備'],
  HDR_BG: '#1F5C99',  HDR_FG: '#FFFFFF',
  ALT:    '#EAF2FF',
  W_HIGH: '#FFCDD2',  W_MID: '#FFF9C4'
};

// ───────────────────────────────────────────────
// メニュー / 初期化
// ───────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚗 自動車整備記録')
    .addItem('📋 整備記録パネルを開く', 'showSidebar')
    .addSeparator()
    .addItem('📊 燃費グラフを全更新', 'menuUpdateAllCharts')
    .addItem('🎨 シート書式を整える',  'menuFormatAll')
    .toUi();
}

function onInstall() { onOpen(); initSettings_(); }

function initSettings_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(CFG.SETTINGS)) return;
  const s = ss.insertSheet(CFG.SETTINGS, 0);
  s.getRange('A1').setValue('自動車整備記録システム 設定シート（削除しないでください）');
  s.getRange('A1').setFontWeight('bold').setFontColor(CFG.HDR_BG);
  s.hideSheet();
}

// ───────────────────────────────────────────────
// サイドバー
// ───────────────────────────────────────────────

function showSidebar() {
  initSettings_();
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('🚗 自動車整備記録')
    .setWidth(350);
  SpreadsheetApp.getUi().showSidebar(html);
}

// ───────────────────────────────────────────────
// 車両 CRUD
// ───────────────────────────────────────────────

/** 全車両の情報（名称・件数・統計）を返す */
function getCars() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets()
    .filter(s => s.getName() !== CFG.SETTINGS)
    .map(s => ({
      name:        s.getName(),
      recordCount: Math.max(0, s.getLastRow() - 1),
      stats:       getCarStats_(s)
    }));
}

/** 車両追加（新シート作成） */
function addCar(carName) {
  const name = (carName || '').trim();
  if (!name) return { ok:false, msg:'車両名を入力してください。' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(name)) return { ok:false, msg:`「${name}」は既に登録されています。` };
  if (name === CFG.SETTINGS)   return { ok:false, msg:'その名前は使用できません。' };
  setupCarSheet_(ss.insertSheet(name));
  return { ok:true, carName:name };
}

/** 車両名変更 */
function renameCar(oldName, newName) {
  const n = (newName || '').trim();
  if (!n) return { ok:false, msg:'車両名を入力してください。' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(oldName);
  if (!sheet) return { ok:false, msg:'シートが見つかりません。' };
  if (ss.getSheetByName(n) && n !== oldName) return { ok:false, msg:`「${n}」は既に存在します。` };
  sheet.setName(n);
  return { ok:true };
}

/** 車両削除 */
function deleteCar(carName) {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const s   = ss.getSheetByName(carName);
  if (!s) return { ok:false, msg:'シートが見つかりません。' };
  ss.deleteSheet(s);
  return { ok:true };
}

// ───────────────────────────────────────────────
// 記録 CRUD
// ───────────────────────────────────────────────

/** 指定車両の記録一覧（新しい順） */
function getRecords(carName) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(carName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const lr  = sheet.getLastRow();
  const C   = CFG.C;
  const tz  = Session.getScriptTimeZone();
  const data = sheet.getRange(2, 1, lr - 1, CFG.HEADERS.length).getValues();
  return data
    .map((row, i) => ({
      rowIndex:       i + 2,
      date:           row[C.DATE] instanceof Date
                        ? Utilities.formatDate(row[C.DATE], tz, 'yyyy/MM/dd')
                        : String(row[C.DATE]),
      type:           row[C.TYPE],
      fuelAmount:     row[C.FUEL_AMT],
      price:          row[C.PRICE],
      odometer:       row[C.ODO],
      fuelEfficiency: row[C.EFF],
      fuelStatus:     row[C.FUEL_STS],
      oilDistance:    row[C.OIL_DIST],
      oilElement:     row[C.OIL_ELM],
      summary:        row[C.SUMMARY],
      memo:           row[C.MEMO],
      savePath:       row[C.SAVEPATH],
      photos:         row[C.PHOTOS]
    }))
    .filter(r => r.date || r.type)
    .reverse();
}

/** 記録追加 */
function addRecord(data) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(data.carName);
    if (!sheet) return { ok:false, msg:'シートが見つかりません。' };

    const odo  = data.odometer  ? Number(data.odometer)  : null;
    const fuel = data.fuelAmount ? Number(data.fuelAmount) : null;

    const eff     = (data.type === '給油' && data.fuelStatus === '満タン' && odo && fuel)
                      ? calcEfficiency_(sheet, null, odo, fuel) : '';
    const oilDist = data.type === 'オイル交換' ? 0
                      : (odo ? calcOilDist_(sheet, null, odo) : '');

    sheet.appendRow(buildRow_(data, eff, oilDist));
    const nr = sheet.getLastRow();
    sheet.getRange(nr, 1).setNumberFormat('yyyy/MM/dd');
    styleDataRow_(sheet, nr, Number(oilDist));
    updateChart_(sheet, data.carName);
    return { ok:true };
  } catch(e) { return { ok:false, msg:e.toString() }; }
}

/** 記録更新 */
function updateRecord(data) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(data.carName);
    if (!sheet) return { ok:false, msg:'シートが見つかりません。' };

    const ri   = Number(data.rowIndex);
    const odo  = data.odometer  ? Number(data.odometer)  : null;
    const fuel = data.fuelAmount ? Number(data.fuelAmount) : null;

    const eff     = (data.type === '給油' && data.fuelStatus === '満タン' && odo && fuel)
                      ? calcEfficiency_(sheet, ri, odo, fuel) : '';
    const oilDist = data.type === 'オイル交換' ? 0
                      : (odo ? calcOilDist_(sheet, ri, odo) : '');

    sheet.getRange(ri, 1, 1, CFG.HEADERS.length).setValues([buildRow_(data, eff, oilDist)]);
    sheet.getRange(ri, 1).setNumberFormat('yyyy/MM/dd');
    styleDataRow_(sheet, ri, Number(oilDist));
    updateChart_(sheet, data.carName);
    return { ok:true };
  } catch(e) { return { ok:false, msg:e.toString() }; }
}

/** 記録削除 */
function deleteRecord(carName, rowIndex) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(carName);
    if (!sheet) return { ok:false, msg:'シートが見つかりません。' };
    sheet.deleteRow(Number(rowIndex));
    recolorAll_(sheet);
    updateChart_(sheet, carName);
    return { ok:true };
  } catch(e) { return { ok:false, msg:e.toString() }; }
}

// ───────────────────────────────────────────────
// 計算
// ───────────────────────────────────────────────

/**
 * 燃費計算（満タン法）
 * currentOdo より小さい最大オドの「満タン」給油記録を前回とみなす
 */
function calcEfficiency_(sheet, excludeRow, currentOdo, fuelAmt) {
  if (!sheet || sheet.getLastRow() < 2) return '';
  const C    = CFG.C;
  const data = sheet.getRange(2, 1, sheet.getLastRow()-1, CFG.HEADERS.length).getValues();
  let best   = -1;
  data.forEach((row, i) => {
    if (excludeRow && i+2 === excludeRow) return;
    if (row[C.TYPE] !== '給油' || row[C.FUEL_STS] !== '満タン') return;
    const odo = Number(row[C.ODO]);
    if (odo > 0 && odo < currentOdo && odo > best) best = odo;
  });
  if (best < 0) return '';
  const dist = currentOdo - best;
  return (dist > 0 && fuelAmt > 0) ? Math.round(dist / fuelAmt * 100) / 100 : '';
}

/**
 * オイル交換後の走行距離計算
 * currentOdo より小さい最大オドの「オイル交換」記録からの差分
 */
function calcOilDist_(sheet, excludeRow, currentOdo) {
  if (!sheet || sheet.getLastRow() < 2) return '';
  const C    = CFG.C;
  const data = sheet.getRange(2, 1, sheet.getLastRow()-1, CFG.HEADERS.length).getValues();
  let lastOil = -1;
  data.forEach((row, i) => {
    if (excludeRow && i+2 === excludeRow) return;
    if (row[C.TYPE] !== 'オイル交換') return;
    const odo = Number(row[C.ODO]);
    if (odo > 0 && odo < currentOdo && odo > lastOil) lastOil = odo;
  });
  return lastOil < 0 ? '' : currentOdo - lastOil;
}

/** 車両の統計情報（最大オド・最新燃費・オイル後距離など） */
function getCarStats_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) {
    return { maxOdo:null, lastEff:null, oilDist:null, lastOilDate:null };
  }
  const C    = CFG.C;
  const tz   = Session.getScriptTimeZone();
  const lr   = sheet.getLastRow();
  const data = sheet.getRange(2, 1, lr-1, CFG.HEADERS.length).getValues();
  let maxOdo=0, lastEff=null, lastOilOdo=0, lastOilDate=null;
  data.forEach(row => {
    const odo = Number(row[C.ODO]) || 0;
    if (odo > maxOdo) maxOdo = odo;
    if (row[C.TYPE] === 'オイル交換' && odo > lastOilOdo) {
      lastOilOdo  = odo;
      lastOilDate = row[C.DATE];
    }
  });
  for (let i = data.length-1; i >= 0; i--) {
    const e = Number(data[i][C.EFF]);
    if (e > 0) { lastEff = e; break; }
  }
  return {
    maxOdo:      maxOdo > 0 ? maxOdo : null,
    lastEff:     lastEff,
    oilDist:     (lastOilOdo > 0 && maxOdo > 0) ? maxOdo - lastOilOdo : null,
    lastOilDate: lastOilDate instanceof Date
                   ? Utilities.formatDate(lastOilDate, tz, 'yyyy/MM/dd') : null
  };
}

// ───────────────────────────────────────────────
// 燃費グラフ
// ───────────────────────────────────────────────

function updateChart_(sheet, carName) {
  sheet.getCharts().forEach(c => sheet.removeChart(c));
  const lr = sheet.getLastRow();
  if (lr < 3) return;
  try {
    const chart = sheet.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(sheet.getRange(1, 1, lr, 1))   // A列: 日付（ラベル）
      .addRange(sheet.getRange(1, 6, lr, 1))   // F列: 燃費
      .setNumHeaders(1)
      .setOption('title',               `${carName}  燃費推移 (km/L)`)
      .setOption('legend',              { position:'none' })
      .setOption('hAxis',               { title:'整備日', slantedText:true, slantedTextAngle:45 })
      .setOption('vAxis',               { title:'燃費 (km/L)', viewWindowMode:'maximized' })
      .setOption('colors',              ['#198754'])
      .setOption('pointSize',           5)
      .setOption('interpolateNulls',    true)
      .setOption('backgroundColor',     '#FAFAFA')
      .setOption('height', 300).setOption('width', 700)
      .setPosition(lr + 3, 1, 0, 0)
      .build();
    sheet.insertChart(chart);
  } catch(e) { console.log('Chart error: '+e); }
}

function menuUpdateAllCharts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets()
    .filter(s => s.getName() !== CFG.SETTINGS)
    .forEach(s => updateChart_(s, s.getName()));
  SpreadsheetApp.getUi().alert('燃費グラフを更新しました。');
}

// ───────────────────────────────────────────────
// 写真アップロード（Google Drive）
// ───────────────────────────────────────────────

function uploadPhoto(fileData, fileName, mimeType, carName) {
  try {
    const folders = DriveApp.getFoldersByName(CFG.PHOTO_FOLDER);
    const main    = folders.hasNext() ? folders.next() : DriveApp.createFolder(CFG.PHOTO_FOLDER);
    const carFolders = main.getFoldersByName(carName);
    const folder  = carFolders.hasNext() ? carFolders.next() : main.createFolder(carName);
    const blob    = Utilities.newBlob(Utilities.base64Decode(fileData), mimeType, fileName);
    const file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok:true, url:`https://drive.google.com/file/d/${file.getId()}/view`, name:fileName };
  } catch(e) { return { ok:false, msg:e.toString() }; }
}

// ───────────────────────────────────────────────
// シート書式ヘルパー
// ───────────────────────────────────────────────

function setupCarSheet_(sheet) {
  const hdr = sheet.getRange(1, 1, 1, CFG.HEADERS.length);
  hdr.setValues([CFG.HEADERS]);
  hdr.setBackground(CFG.HDR_BG).setFontColor(CFG.HDR_FG).setFontWeight('bold');
  hdr.setHorizontalAlignment('center').setVerticalAlignment('middle');
  hdr.setFontSize(10).setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);
  CFG.COL_W.forEach((w, i) => sheet.setColumnWidth(i+1, w));
  sheet.getRange('A:A').setNumberFormat('yyyy/MM/dd');
  sheet.getRange('D:D').setNumberFormat('#,##0');
  sheet.getRange('E:E').setNumberFormat('#,##0');
  sheet.getRange('C:C').setNumberFormat('0.00');
  sheet.getRange('F:F').setNumberFormat('0.00');
  sheet.getRange('H:H').setNumberFormat('#,##0');
}

function buildRow_(data, eff, oilDist) {
  const C   = CFG.C;
  const row = new Array(CFG.HEADERS.length).fill('');
  row[C.DATE]     = data.date ? new Date(data.date) : '';
  row[C.TYPE]     = data.type      || '';
  row[C.FUEL_AMT] = data.fuelAmount ? Number(data.fuelAmount) : '';
  row[C.PRICE]    = data.price      ? Number(data.price)      : '';
  row[C.ODO]      = data.odometer   ? Number(data.odometer)   : '';
  row[C.EFF]      = eff;
  row[C.FUEL_STS] = data.fuelStatus  || '';
  row[C.OIL_DIST] = oilDist !== '' && oilDist !== null && oilDist !== undefined ? Number(oilDist) : '';
  row[C.OIL_ELM]  = data.oilElement ? 'あり' : '';
  row[C.SUMMARY]  = data.summary    || '';
  row[C.MEMO]     = data.memo       || '';
  row[C.SAVEPATH] = data.savePath   || '';
  row[C.PHOTOS]   = data.photos     || '';
  return row;
}

function styleDataRow_(sheet, rowIndex, oilDist) {
  const bg = rowIndex % 2 === 0 ? CFG.ALT : '#FFFFFF';
  sheet.getRange(rowIndex, 1, 1, CFG.HEADERS.length).setBackground(bg);
  if (oilDist > 0) {
    const cell = sheet.getRange(rowIndex, CFG.C.OIL_DIST + 1);
    if      (oilDist > 4000) { cell.setBackground(CFG.W_HIGH).setFontColor('#B71C1C').setFontWeight('bold'); }
    else if (oilDist > 3000) { cell.setBackground(CFG.W_MID).setFontColor('#F57F17'); }
  }
}

function recolorAll_(sheet) {
  const lr = sheet.getLastRow();
  if (lr < 2) return;
  const C    = CFG.C;
  const data = sheet.getRange(2, 1, lr-1, CFG.HEADERS.length).getValues();
  for (let r = 2; r <= lr; r++) {
    const bg = r % 2 === 0 ? CFG.ALT : '#FFFFFF';
    sheet.getRange(r, 1, 1, CFG.HEADERS.length).setBackground(bg);
    const oilDist = Number(data[r-2][C.OIL_DIST]);
    if (oilDist > 0) styleDataRow_(sheet, r, oilDist);
  }
}

function menuFormatAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets()
    .filter(s => s.getName() !== CFG.SETTINGS)
    .forEach(s => recolorAll_(s));
  SpreadsheetApp.getUi().alert('シート書式を整えました。');
}
