/**
 * データのインポート / エクスポート (CSV)
 */

/**
 * 指定自動車のデータを CSV ファイルとして Google Drive に保存
 * @param {string} carName - 自動車名
 * @returns {Object} { success, fileUrl, fileName, recordCount, error }
 */
function exportToCsv(carName) {
  try {
    const records = getRecords(carName);
    if (records.length === 0) {
      return { success: false, error: 'エクスポートするデータがありません。' };
    }

    // BOM 付き UTF-8（Excel で文字化けしないように）
    let csv = '\uFEFF';
    csv += HEADERS.map(h => escapeCsvField(h)).join(',') + '\n';

    records.forEach(r => {
      const row = [
        escapeCsvField(r.date),
        escapeCsvField(r.type),
        escapeCsvField(r.oilElement),
        r.fuelAmount  !== '' ? r.fuelAmount  : '',
        r.cost        !== '' ? r.cost        : '',
        r.odometer    !== '' ? r.odometer    : '',
        escapeCsvField(r.fuelStatus),
        r.fuelEconomy !== '' ? r.fuelEconomy : '',
        r.oilDistance !== '' ? r.oilDistance : '',
        escapeCsvField(r.memo),
        escapeCsvField(r.summary),
        escapeCsvField(r.photos.join(' | '))
      ];
      csv += row.join(',') + '\n';
    });

    const dateStr  = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
    const fileName = `${carName}_整備記録_${dateStr}.csv`;

    // 保存先フォルダの解決
    const settings = getSettings();
    let file;
    if (settings.exportFolderId && settings.exportFolderId.trim()) {
      try {
        const folder = DriveApp.getFolderById(settings.exportFolderId.trim());
        file = folder.createFile(fileName, csv, MimeType.CSV);
      } catch (_) {
        // フォルダが見つからない場合はマイドライブのルートに保存
        file = DriveApp.createFile(fileName, csv, MimeType.CSV);
      }
    } else {
      file = DriveApp.createFile(fileName, csv, MimeType.CSV);
    }

    return {
      success:     true,
      fileUrl:     file.getUrl(),
      fileName:    fileName,
      recordCount: records.length
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * CSV テキストをインポートして指定シートに追加（または上書き）
 * @param {string}  csvContent - CSV テキスト
 * @param {string}  carName    - 対象自動車名
 * @param {boolean} overwrite  - true のとき既存データを消去して上書き
 * @returns {Object} { success, count, errors, error }
 */
function importFromCsv(csvContent, carName, overwrite) {
  try {
    if (!carName) return { success: false, error: '自動車名を指定してください。' };

    // BOM を除去して行に分割
    const content = csvContent.replace(/^\uFEFF/, '').trim();
    const lines   = content.split(/\r?\n/).filter(l => l.trim());

    if (lines.length < 2) {
      return { success: false, error: 'データが見つかりません（ヘッダー含め 2 行以上必要）。' };
    }

    const sheet = getOrCreateCarSheet(carName);

    if (overwrite) {
      const lastRow = sheet.getLastRow();
      if (lastRow >= DATA_START_ROW) {
        sheet.deleteRows(DATA_START_ROW, lastRow - HEADER_ROW);
      }
    }

    let importedCount = 0;
    const errors      = [];

    // 1 行目はヘッダーなのでスキップ
    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 2 || !cols[0].trim()) continue;

        // 日付を変換
        let dateValue = cols[0].trim();
        if (dateValue) {
          const parts = dateValue.replace(/-/g, '/').split('/');
          if (parts.length === 3) {
            dateValue = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          }
        }

        const rowData = [
          dateValue,                                    // 整備年月日
          cols[1]  ? cols[1].trim()            : '',   // 整備種別
          cols[2]  ? cols[2].trim()            : '',   // OILエレメント
          cols[3]  ? (parseFloat(cols[3])  || '') : '',// 給油量
          cols[4]  ? (parseFloat(cols[4])  || '') : '',// 料金
          cols[5]  ? (parseFloat(cols[5])  || '') : '',// オドメーター
          cols[6]  ? cols[6].trim()            : '',   // 給油状態
          '',  // 燃費（再計算）
          '',  // OIL距離（再計算）
          cols[9]  ? cols[9].trim()            : '',   // メモ
          cols[10] ? cols[10].trim()           : '',   // 摘要
          cols[11] ? cols[11].trim()           : ''    // 写真
        ];

        sheet.appendRow(rowData);
        importedCount++;
      } catch (rowErr) {
        errors.push(`行 ${i + 1}: ${rowErr.message}`);
      }
    }

    if (importedCount > 0) recalculateCarData(carName);

    return { success: true, count: importedCount, errors };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ========================
// CSV ユーティリティ
// ========================

/**
 * CSV フィールドをエスケープ（RFC 4180 準拠）
 * @param {*} value
 * @returns {string}
 */
function escapeCsvField(value) {
  if (value === null || value === undefined || value === '') return '';
  const str = value.toString();
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * CSV の 1 行をフィールド配列に解析（クォート対応）
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
