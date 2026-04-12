/**
 * 燃費・オイル交換距離の計算ロジック
 *
 * 燃費計算：満タン法
 *  - 給油状態が「満タン」のとき計算
 *  - 距離 = 現在オドメーター − 前回満タン時オドメーター
 *  - 燃料 = 前回満タン以降の給油量合計（今回満タン分を含む）
 *  - 燃費 = 距離 / 燃料
 *
 * OIL交換距離：
 *  - 距離 = 現在オドメーター − 最後のオイル交換時オドメーター
 *  - 全行で表示（オイル交換記録が存在する場合）
 */

/**
 * 指定自動車の燃費・OIL距離を再計算してシートに書き戻す
 * @param {string} carName
 */
function recalculateCarData(carName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(carName);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return;

  const numRows = lastRow - HEADER_ROW;
  const data = sheet.getRange(DATA_START_ROW, 1, numRows, HEADERS.length).getValues();

  let lastFullTankOdometer  = null; // 最後の「満タン」時オドメーター
  let fuelSinceFullTank     = 0;   // 最後の「満タン」以降の給油量合計
  let lastOilChangeOdometer = null; // 最後のオイル交換時オドメーター

  const calcValues = data.map(row => {
    const type        = row[COL.TYPE - 1]        || '';
    const fuelStatus  = row[COL.FUEL_STATUS - 1] || '';
    const fuelAmt     = parseFloat(row[COL.FUEL_AMT - 1])  || 0;
    const odometer    = parseFloat(row[COL.ODOMETER - 1])  || 0;

    let fuelEconomy = '';
    let oilDist     = '';

    // ---- OIL交換距離計算 ----
    if (type === 'オイル交換' && odometer > 0) {
      lastOilChangeOdometer = odometer;
      oilDist = 0;
    } else if (lastOilChangeOdometer !== null && odometer > 0) {
      oilDist = odometer - lastOilChangeOdometer;
    }

    // ---- 燃費計算（満タン法） ----
    if (type === '給油') {
      if (fuelStatus === '満タン') {
        // 前回満タン → 今回満タン の区間で計算
        if (lastFullTankOdometer !== null && odometer > 0 && fuelSinceFullTank + fuelAmt > 0) {
          const dist = odometer - lastFullTankOdometer;
          if (dist > 0) {
            fuelEconomy = Math.round((dist / (fuelSinceFullTank + fuelAmt)) * 10) / 10;
          }
        }
        // 満タン基点をリセット
        if (odometer > 0) lastFullTankOdometer = odometer;
        fuelSinceFullTank = 0;
        // ※ 今回の満タン分は次回計算の分母に含めるため累積しない
        //   （区間の燃料 = 前回満タン直後から今回満タンまでの給油量）
        fuelSinceFullTank += fuelAmt;
      } else if (fuelStatus === '非満タン') {
        fuelSinceFullTank += fuelAmt;
      }
    }

    return [fuelEconomy, oilDist];
  });

  // 計算結果を FUEL_ECO・OIL_DIST 列に一括書き込み
  sheet.getRange(DATA_START_ROW, COL.FUEL_ECO, numRows, 2).setValues(calcValues);

  // 行の背景色を種別ごとに設定
  applyRowColoring(sheet, DATA_START_ROW, lastRow);
}

/**
 * 行の背景色を整備種別に応じて設定
 * @param {Sheet} sheet
 * @param {number} startRow
 * @param {number} endRow
 */
function applyRowColoring(sheet, startRow, endRow) {
  const colorMap = {
    '給油':       ['#E8F5E9', '#C8E6C9'],
    'オイル交換': ['#FFF8E1', '#FFECB3'],
    '車検':       ['#E3F2FD', '#BBDEFB'],
    '保険':       ['#F3E5F5', '#E1BEE7'],
    'タイヤ交換': ['#FCE4EC', '#F8BBD0'],
    'ワイパー交換':['#E8EAF6', '#C5CAE9'],
    '洗車':       ['#E0F7FA', '#B2EBF2'],
    'その他整備': ['#FAFAFA', '#F0F0F0']
  };

  const colCount = HEADERS.length;
  for (let row = startRow; row <= endRow; row++) {
    const type   = sheet.getRange(row, COL.TYPE).getValue() || '';
    const colors = colorMap[type] || ['#FFFFFF', '#F5F5F5'];
    const bg     = (row % 2 === 0) ? colors[1] : colors[0];
    sheet.getRange(row, 1, 1, colCount).setBackground(bg);
  }
}

/**
 * 現在のOIL交換経過距離を取得（最新オドメーター − 最後のOIL交換時オドメーター）
 * @param {string} carName
 * @returns {number|null}
 */
function getCurrentOilDistance(carName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(carName);
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return null;

  const numRows = lastRow - HEADER_ROW;
  const data    = sheet.getRange(DATA_START_ROW, 1, numRows, COL.ODOMETER).getValues();

  let lastOilOdo = null;
  let latestOdo  = null;

  data.forEach(row => {
    const type = row[COL.TYPE - 1] || '';
    const odo  = parseFloat(row[COL.ODOMETER - 1]) || 0;
    if (odo > 0) latestOdo = odo;
    if (type === 'オイル交換' && odo > 0) lastOilOdo = odo;
  });

  if (lastOilOdo === null || latestOdo === null) return null;
  return latestOdo - lastOilOdo;
}

/**
 * 最新の燃費を取得
 * @param {string} carName
 * @returns {number|null}
 */
function getLatestFuelEconomy(carName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(carName);
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return null;

  const numRows = lastRow - HEADER_ROW;
  const data    = sheet.getRange(DATA_START_ROW, COL.FUEL_ECO, numRows, 1).getValues();

  for (let i = data.length - 1; i >= 0; i--) {
    const v = parseFloat(data[i][0]);
    if (!isNaN(v) && v > 0) return v;
  }
  return null;
}

/**
 * フォーム表示用のサマリー情報を取得
 * @param {string} carName
 * @returns {Object} { oilDistance, latestFuelEconomy }
 */
function getCarSummary(carName) {
  return {
    oilDistance:       getCurrentOilDistance(carName),
    latestFuelEconomy: getLatestFuelEconomy(carName)
  };
}
