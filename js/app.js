'use strict';

/* ================================================================
   塗料マスタ（品番区分 → 塗料量 kg/個）
   ================================================================ */
const PAINT_MASTER = {
  T200: 0.10,  T250: 0.15,  T300: 0.20,  T350: 0.25,
  T400: 0.30,  T450: 0.35,  T500: 0.40,  T550: 0.45,
  T600: 0.55,  T650: 0.60,
  T3200: 0.15, T3250: 0.20, T3300: 0.25, T3350: 0.30,
  T3400: 0.35, T3450: 0.40, T3500: 0.45, T3600: 0.50,
};

/* 表示順（T系 → T3系、番号昇順） */
const PAINT_KEYS_ORDERED = [
  'T200','T250','T300','T350','T400','T450','T500','T550','T600','T650',
  'T3200','T3250','T3300','T3350','T3400','T3450','T3500','T3600',
];

/* ================================================================
   アプリ状態
   ================================================================ */
const state = {
  rawOCR:   '',   // OCR生テキスト
  rows:     [],   // 編集後の全行 [{nai,hinban,nouki,nonyuSaki,kosu}]
  filtered: [],   // フィルタリング後
  groups:   [],   // ユニーク {nouki, nonyuSaki}[]
};

/* ================================================================
   画面切り替え
   ================================================================ */
const STEPS = {
  'screen-upload':   1,
  'screen-progress': null,
  'screen-review':   2,
  'screen-select':   3,
  'screen-result':   4,
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  const step = STEPS[id];
  if (step) document.getElementById('step-indicator').textContent = `STEP ${step}/4`;
  window.scrollTo(0, 0);
}

/* ================================================================
   スナックバー通知
   ================================================================ */
let snackTimer = null;
function toast(msg, ms = 3000) {
  const el = document.getElementById('snackbar');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ================================================================
   画像リサイズ（メモリ節約）
   ================================================================ */
function resizeImage(file, maxW = 1600, maxH = 2200) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxW || h > maxH) {
        const r = Math.min(maxW / w, maxH / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, 'image/jpeg', 0.90);
    };
    img.src = url;
  });
}

/* ================================================================
   OCR 処理
   ================================================================ */
async function runOCR(blob) {
  showScreen('screen-progress');
  const bar = document.getElementById('progress-bar');
  const msg = document.getElementById('progress-msg');

  try {
    const worker = await Tesseract.createWorker(['jpn', 'eng'], 1, {
      logger(m) {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          bar.style.width = pct + '%';
          msg.textContent = `解析中... ${pct}%`;
        } else {
          msg.textContent = m.status;
        }
      },
    });

    const { data: { text } } = await worker.recognize(blob);
    await worker.terminate();

    state.rawOCR = text;
    state.rows   = parseOCRText(text);
  } catch (err) {
    console.error('OCR error:', err);
    toast('OCR 処理に失敗しました。手動でデータを入力してください。', 5000);
    state.rawOCR = '';
    state.rows   = [];
  }

  renderEditor();
  showScreen('screen-review');
}

/* ================================================================
   OCR テキスト → 行データ変換（ベストエフォート）
   ================================================================ */
function parseOCRText(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    /* 品番パターン: 英字2文字+数字2文字+英字+[英字]*+3桁数字+[英小文字] */
    const hinbanM = line.match(/[A-Za-z]{2}\d{2}[A-Za-z]{1,3}\d{3}[a-z]?/);
    if (!hinbanM) continue;

    const hinban = hinbanM[0].toUpperCase();

    /* 納期: M/D または MM/DD */
    const noukiM = line.match(/\d{1,2}\/\d{1,2}/);
    const nouki  = noukiM ? noukiM[0] : '?';

    /* 個数: 行末の独立した数字 */
    const nums   = line.match(/\b\d+\b/g) || [];
    const kosu   = nums.length ? parseInt(nums[nums.length - 1]) : 1;

    /* 内: 品番の前にある単語（NL: を含む可能性あり） */
    const before = line.slice(0, line.indexOf(hinbanM[0])).trim();
    const naiM   = before.match(/NL:\S+|\S+/);
    const nai    = naiM ? naiM[0] : '?';

    /* 納入先: 納期の後ろ、個数の前のテキスト */
    let nonyuSaki = '?';
    if (noukiM) {
      const after = line.slice(line.indexOf(noukiM[0]) + noukiM[0].length).trim();
      nonyuSaki = after.replace(/\s+\d+\s*$/, '').trim() || '?';
    }

    rows.push({ nai, hinban, nouki, nonyuSaki, kosu });
  }

  return rows;
}

/* ================================================================
   フィルタリング
   ================================================================ */

/* 品番から 200〜650 範囲の3桁数値（末尾優先）を返す */
function extractNum(hinban) {
  const regex = /\d{3}/g;
  let m, last = null;
  while ((m = regex.exec(hinban)) !== null) {
    const n = parseInt(m[0]);
    if (n >= 200 && n <= 650) last = n;
  }
  return last;
}

/* 品番を塗料マスタキー（T200, T3300 等）に分類 */
function classifyHinban(hinban) {
  const h = hinban.toUpperCase();

  /* T3xxx パターン（T3 直後に3桁数字） */
  const t3 = h.match(/T3(\d{3})/);
  if (t3) {
    const key = `T3${t3[1]}`;
    if (PAINT_MASTER[key] !== undefined) return key;
  }

  /* T（非T3）+ 任意英字 + 3桁数字 */
  const t = h.match(/T(?!3)[A-Z]*(\d{3})/);
  if (t) {
    const key = `T${t[1]}`;
    if (PAINT_MASTER[key] !== undefined) return key;
  }

  /* フォールバック: 範囲内の最後の3桁数字を使用 */
  const n = extractNum(hinban);
  if (n !== null) {
    const key = `T${n}`;
    if (PAINT_MASTER[key] !== undefined) return key;
  }

  return null;
}

function filterRows(rows) {
  return rows.filter(row => {
    if (row.nai && row.nai.startsWith('NL:')) return false;
    return extractNum(row.hinban) !== null;
  });
}

/* ================================================================
   テーブルエディタ描画
   ================================================================ */
const COL_KEYS    = ['nai', 'hinban', 'nouki', 'nonyuSaki', 'kosu'];
const COL_WIDTHS  = ['80px', '120px', '70px', 'auto', '52px'];

function renderEditor() {
  const tbody = document.getElementById('edit-tbody');
  tbody.innerHTML = '';

  /* OCR 生テキスト表示 */
  const rawBlock = document.getElementById('raw-block');
  if (state.rawOCR) {
    document.getElementById('raw-text').textContent = state.rawOCR;
    rawBlock.classList.remove('hidden');
  } else {
    rawBlock.classList.add('hidden');
  }

  /* 行がなければ空行3つ */
  const src = state.rows.length > 0 ? state.rows : [{},{},{}];
  src.forEach(row => appendRow(row));
}

function appendRow(data = {}) {
  const tbody = document.getElementById('edit-tbody');
  const tr = document.createElement('tr');

  COL_KEYS.forEach((key, i) => {
    const td = document.createElement('td');
    if (key === 'kosu') td.className = 'td-num';

    const input = document.createElement('input');
    input.type  = key === 'kosu' ? 'number' : 'text';
    input.value = data[key] != null ? data[key] : '';
    input.placeholder = ['内','品番','納期','納入先','個数'][i];
    if (key === 'kosu') { input.min = '0'; input.style.width = COL_WIDTHS[i]; }

    td.appendChild(input);
    tr.appendChild(td);
  });

  const tdDel = document.createElement('td');
  tdDel.className = 'td-del';
  const del = document.createElement('button');
  del.className = 'del-btn';
  del.type = 'button';
  del.textContent = '×';
  del.onclick = () => tr.remove();
  tdDel.appendChild(del);
  tr.appendChild(tdDel);

  tbody.appendChild(tr);
}

function collectRows() {
  const rows = [];
  document.querySelectorAll('#edit-tbody tr').forEach(tr => {
    const inputs = tr.querySelectorAll('input');
    if (inputs.length < 5) return;
    const row = {
      nai:       inputs[0].value.trim(),
      hinban:    inputs[1].value.trim().toUpperCase(),
      nouki:     inputs[2].value.trim(),
      nonyuSaki: inputs[3].value.trim(),
      kosu:      parseInt(inputs[4].value) || 0,
    };
    if (!row.hinban && !row.nai) return; /* 空行スキップ */
    rows.push(row);
  });
  return rows;
}

/* ================================================================
   選択 UI 描画
   ================================================================ */
function renderSelectScreen() {
  state.filtered = filterRows(state.rows);
  document.getElementById('filtered-count').textContent = state.filtered.length;

  /* ユニーク [納期, 納入先] グループ */
  const seen = new Map();
  state.filtered.forEach(r => {
    const k = `${r.nouki}\0${r.nonyuSaki}`;
    if (!seen.has(k)) seen.set(k, { nouki: r.nouki, nonyuSaki: r.nonyuSaki });
  });
  state.groups = [...seen.values()];

  const list = document.getElementById('group-list');
  list.innerHTML = '';

  if (state.groups.length === 0) {
    list.innerHTML = '<p class="empty-msg">フィルタリング後のデータがありません。<br>前の画面に戻ってデータを確認してください。</p>';
  } else {
    state.groups.forEach((g, i) => {
      const n = i + 1;
      const div = document.createElement('div');
      div.className = 'group-item';
      div.dataset.n = n;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id   = `g${n}`;
      cb.value = n;
      cb.addEventListener('change', syncInput);

      const lbl = document.createElement('label');
      lbl.htmlFor = `g${n}`;
      lbl.className = 'group-label';
      lbl.innerHTML =
        `<span class="group-num">${n}.</span>` +
        `納期：${esc(g.nouki)}　|　納入先：${esc(g.nonyuSaki)}`;

      div.addEventListener('click', e => {
        if (e.target !== cb) cb.checked = !cb.checked;
        div.classList.toggle('checked', cb.checked);
        syncInput();
      });

      div.appendChild(cb);
      div.appendChild(lbl);
      list.appendChild(div);
    });
  }

  document.getElementById('selection-input').value = '';
  showScreen('screen-select');
}

function syncInput() {
  const nums = [...document.querySelectorAll('#group-list input[type=checkbox]:checked')]
    .map(cb => cb.value);
  document.getElementById('selection-input').value = nums.join(',');
}

function syncCheckboxes() {
  const vals = document.getElementById('selection-input').value
    .split(/[,\s、，]+/)
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n));

  document.querySelectorAll('#group-list .group-item').forEach(div => {
    const n = parseInt(div.dataset.n);
    const cb = div.querySelector('input[type=checkbox]');
    const checked = vals.includes(n);
    cb.checked = checked;
    div.classList.toggle('checked', checked);
  });
}

/* ================================================================
   集計・計算
   ================================================================ */
function calculate() {
  const raw = document.getElementById('selection-input').value;
  const selectedNums = raw
    .split(/[,\s、，]+/)
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n >= 1 && n <= state.groups.length);

  if (selectedNums.length === 0) {
    toast('集計する番号を入力してください。');
    return;
  }

  const selectedGroups = selectedNums.map(n => state.groups[n - 1]);

  /* 選択グループに属する行を抽出 */
  const target = state.filtered.filter(row =>
    selectedGroups.some(g => g.nouki === row.nouki && g.nonyuSaki === row.nonyuSaki)
  );

  /* 品番区分ごとにカウント */
  const counts = {};
  let unknownCount = 0;

  target.forEach(row => {
    const key = classifyHinban(row.hinban);
    if (key) {
      counts[key] = (counts[key] || 0) + (row.kosu || 1);
    } else {
      unknownCount += (row.kosu || 1);
    }
  });

  renderResult(counts, unknownCount);
  showScreen('screen-result');
}

/* ================================================================
   結果描画
   ================================================================ */
function renderResult(counts, unknownCount) {
  const el = document.getElementById('result-body');
  let html = '';
  let totalCount = 0;
  let totalPaint = 0;

  PAINT_KEYS_ORDERED.forEach(key => {
    const count = counts[key] || 0;
    if (count === 0) return;   /* 0件は非表示 */

    const kg    = PAINT_MASTER[key];
    const total = count * kg;
    totalCount += count;
    totalPaint += total;

    html += `
      <div class="result-item">
        <div>
          <div class="result-label">${key}</div>
          <div class="result-calc">${count}個 × ${kg.toFixed(2)}kg</div>
        </div>
        <div class="result-val">${total.toFixed(2)}kg</div>
      </div>`;
  });

  if (unknownCount > 0) {
    html += `
      <div class="result-item result-unknown">
        <div>
          <div class="result-label">分類不明</div>
          <div class="result-calc">${unknownCount}個（塗料計算対象外）</div>
        </div>
        <div class="result-val">—</div>
      </div>`;
  }

  if (!html) {
    html = '<p class="empty-msg">集計対象のデータがありません。</p>';
  }

  html += `
    <div class="result-total">
      <h3>【 総 合 計 】</h3>
      <p>合計個数：${totalCount} 個</p>
      <p>合計塗料量：${totalPaint.toFixed(2)} kg</p>
    </div>`;

  if (unknownCount > 0) {
    html += `<p class="result-note">※ 分類不明の品番はマスタに登録がないため、塗料計算に含まれていません。</p>`;
  }

  el.innerHTML = html;
}

/* ================================================================
   ユーティリティ
   ================================================================ */
function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resetAll() {
  state.rawOCR = '';
  state.rows = [];
  state.filtered = [];
  state.groups = [];
  const fi = document.getElementById('file-input');
  fi.value = '';
  fi._blob = null;
  document.getElementById('preview-card').classList.add('hidden');
  document.getElementById('upload-label').parentElement
    .querySelector('.upload-label').style.display = '';
}

/* ================================================================
   イベント登録
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  /* ── 画像選択 ── */
  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('file-input')._blob = file;
    const preview = document.getElementById('img-preview');
    preview.src = URL.createObjectURL(file);
    document.getElementById('preview-card').classList.remove('hidden');
  });

  /* ── OCR 開始 ── */
  document.getElementById('btn-start-ocr').addEventListener('click', async () => {
    const file = document.getElementById('file-input')._blob;
    if (!file) { toast('画像が選択されていません。'); return; }
    try {
      const resized = await resizeImage(file);
      await runOCR(resized);
    } catch (err) {
      console.error(err);
      toast('画像処理に失敗しました。');
    }
  });

  /* ── 画像変更 ── */
  document.getElementById('btn-change-img').addEventListener('click', () => {
    document.getElementById('preview-card').classList.add('hidden');
    const fi = document.getElementById('file-input');
    fi.value = '';
    fi._blob = null;
  });

  /* ── 手動入力 ── */
  document.getElementById('btn-manual').addEventListener('click', () => {
    state.rawOCR = '';
    state.rows   = [];
    renderEditor();
    showScreen('screen-review');
  });

  /* ── 行を追加 ── */
  document.getElementById('btn-add-row').addEventListener('click', () => {
    appendRow();
    /* 追加した行までスクロール */
    const tbody = document.getElementById('edit-tbody');
    const lastRow = tbody.lastElementChild;
    if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ── 次へ（選択画面へ） ── */
  document.getElementById('btn-to-select').addEventListener('click', () => {
    state.rows = collectRows();
    if (state.rows.length === 0) {
      toast('データを入力してください。');
      return;
    }
    renderSelectScreen();
  });

  /* ── チェックボックス ↔ テキスト同期 ── */
  document.getElementById('selection-input').addEventListener('input', syncCheckboxes);

  /* ── 集計実行 ── */
  document.getElementById('btn-calculate').addEventListener('click', calculate);

  /* ── 結果から選択に戻る ── */
  document.getElementById('btn-back-select').addEventListener('click', () => {
    showScreen('screen-select');
  });

  /* ── 最初からやり直す ── */
  document.getElementById('btn-restart').addEventListener('click', () => {
    resetAll();
    showScreen('screen-upload');
  });

  /* 初期画面 */
  showScreen('screen-upload');
});
