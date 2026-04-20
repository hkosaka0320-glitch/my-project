'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════
const state = {
    sessionId: null,
    items: [],           // 品番フィルタ済みアイテム (OCR→解析後)
    selectedNoki: new Set(),
    selectedNyusaki: new Set(),
    filteredItems: [],   // 納期・納入先チェック後の絞り込み結果
};

// ═══════════════════════════════════════════════════════════════════════════
// Screen navigation
// ═══════════════════════════════════════════════════════════════════════════
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════════════
// Camera (手順1: 撮影)
// ═══════════════════════════════════════════════════════════════════════════
let cameraStream = null;

async function openCamera() {
    showScreen('screen-camera');
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width:  { ideal: 1920 },
                height: { ideal: 1080 },
            }
        });
        document.getElementById('camera-video').srcObject = cameraStream;
    } catch (err) {
        stopCamera();
        showScreen('screen-home');
        alert('カメラを起動できませんでした。\nファイル選択をお使いください。\n\n' + err.message);
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
}

function captureFromVideo() {
    const video = document.getElementById('camera-video');
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0);
    stopCamera();
    return canvas;
}

// ═══════════════════════════════════════════════════════════════════════════
// OCR — Tesseract.js (手順2: 内容読み込み)
// ※ 初回はブラウザが日本語モデル (~12 MB) をダウンロードし IndexedDB にキャッシュ
// ═══════════════════════════════════════════════════════════════════════════
async function runOcr(imageSource) {
    showScreen('screen-ocr');
    setOcrStatus('OCR エンジン初期化中...');
    setOcrPct(0);

    try {
        const result = await Tesseract.recognize(
            imageSource,
            'jpn+eng',   // 日本語 + 英数字（品番対応）
            {
                logger: m => {
                    switch (m.status) {
                        case 'loading tesseract core':
                            setOcrStatus('Tesseract コア読み込み中...'); break;
                        case 'loading language traineddata':
                            setOcrStatus('日本語モデル読み込み中...\n（初回のみ数十秒かかります）'); break;
                        case 'initializing tesseract':
                        case 'initializing api':
                            setOcrStatus('初期化中...'); break;
                        case 'recognizing text':
                            setOcrStatus('テキスト認識中...');
                            setOcrPct(Math.round(m.progress * 100));
                            break;
                    }
                }
            }
        );
        // OCR 完了 → 確認画面へ
        document.getElementById('ocr-textarea').value = result.data.text;
        showScreen('screen-verify');

    } catch (err) {
        setOcrStatus('エラー: ' + err.message);
        setTimeout(() => showScreen('screen-home'), 4000);
    }
}

function setOcrStatus(msg) {
    document.getElementById('ocr-status').textContent = msg;
}

function setOcrPct(pct) {
    document.getElementById('ocr-progress-fill').style.width = pct + '%';
    document.getElementById('ocr-progress-pct').textContent  = pct + '%';
}

// ═══════════════════════════════════════════════════════════════════════════
// Text Parser
// ═══════════════════════════════════════════════════════════════════════════

// 品番パターン: ????T?(200-650)
// 例: ABCDT1350, XYZWTA500
const HINBAN_RE = /[A-Z0-9]{4}T[A-Z0-9]([2-5]\d{2}|6[0-4]\d|650)/i;

/**
 * OCR テキストをアイテム配列に変換する。
 * 優先: タブ/スペース区切りの表形式 → キー値形式 → 品番スキャン
 */
function parseOcrText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];

    const headerIdx = lines.findIndex(l =>
        l.includes('品番') || l.includes('ヒンバン') || l.includes('品　番')
    );

    if (headerIdx >= 0) return parseTableFormat(lines, headerIdx);

    const kvItems = parseKeyValueFormat(lines);
    if (kvItems.length) return kvItems;

    return scanForPartNumbers(lines); // 最終フォールバック
}

// ── 表形式パーサー ──────────────────────────────────────────────────────────
function parseTableFormat(lines, headerIdx) {
    const headers = splitCols(lines[headerIdx]);

    const idxOf = (...keywords) =>
        headers.findIndex(h => keywords.some(k => h.includes(k)));

    const naiCol     = idxOf('内');
    const hinbanCol  = idxOf('品番', 'ヒンバン');
    const nokiCol    = idxOf('納期');
    const nyusakiCol = idxOf('納入先', '納先', '納入');

    const items = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = splitCols(lines[i]);
        if (!cols.length) continue;

        const nai     = cols[naiCol]     || '';
        const hinban  = cols[hinbanCol]  || '';
        const noki    = cols[nokiCol]    || '';
        const nyusaki = cols[nyusakiCol] || '';

        if (nai.startsWith('NL:')) continue;   // 手順3: NL: 行削除
        if (!hinban) continue;

        items.push({ nai, hinban, noki, nyusaki });
    }
    return items;
}

// ── キー値形式パーサー ────────────────────────────────────────────────────
function parseKeyValueFormat(lines) {
    const items = [];
    let cur = { nai: '', hinban: '', noki: '', nyusaki: '' };

    const flush = () => {
        if (cur.hinban && !cur.nai.startsWith('NL:')) {
            items.push({ ...cur });
        }
        cur = { nai: '', hinban: '', noki: '', nyusaki: '' };
    };

    for (const line of lines) {
        if      (/^内\s*[：:]/.test(line))      cur.nai     = extractVal(line);
        else if (/^品番\s*[：:]/.test(line))     { flush(); cur.hinban  = extractVal(line); }
        else if (/^納期\s*[：:]/.test(line))     cur.noki    = extractVal(line);
        else if (/^納入先\s*[：:]/.test(line))   { cur.nyusaki = extractVal(line); flush(); }
        else {
            const m = HINBAN_RE.exec(line.toUpperCase());
            if (m) { flush(); cur.hinban = m[0].toUpperCase(); }
        }
    }
    flush();
    return items;
}

// ── 品番スキャン (フォールバック) ─────────────────────────────────────────
function scanForPartNumbers(lines) {
    const items = [];
    for (const line of lines) {
        const m = HINBAN_RE.exec(line.toUpperCase());
        if (!m) continue;
        const hinban = m[0].toUpperCase();
        // 同じ行に日付パターンがあれば納期として取得
        const dateM = line.match(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{2}[\/\-]\d{1,2}[\/\-]\d{1,2}/);
        items.push({ hinban, nai: '', noki: dateM ? dateM[0] : '', nyusaki: '' });
    }
    return items;
}

// ── 手順4: 品番フィルタ ─────────────────────────────────────────────────────
function filterByPartNumber(items) {
    return items.filter(item => HINBAN_RE.test((item.hinban || '').toUpperCase()));
}

// ── 手順7: 品番末尾数字ごとに集計 ──────────────────────────────────────────
function aggregateBySuffix(items) {
    const counts = {};
    for (const item of items) {
        const m = HINBAN_RE.exec((item.hinban || '').toUpperCase());
        if (!m) continue;
        const suffix = m[1];
        counts[suffix] = (counts[suffix] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0]));
}

// ── ユーティリティ ─────────────────────────────────────────────────────────
function splitCols(line) {
    return line.split(/\t|\s{2,}|[|｜,，]/).map(s => s.trim()).filter(Boolean);
}

function extractVal(line) {
    return line.replace(/^[^：:]+[：:]/, '').trim();
}

function esc(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════
// OCR テキスト確認 → 解析実行
// ═══════════════════════════════════════════════════════════════════════════
function parseAndFilter() {
    const text = document.getElementById('ocr-textarea').value.trim();
    if (!text) {
        alert('テキストが空です。OCRを再実行するか、テキストを入力してください。');
        return;
    }

    const parsed   = parseOcrText(text);
    const filtered = filterByPartNumber(parsed); // 手順4

    if (!filtered.length) {
        alert('該当する品番 (????T?200〜650) が見つかりませんでした。\nOCR結果を確認・修正してください。');
        return;
    }

    state.sessionId = Date.now();
    state.items     = filtered;
    state.selectedNoki.clear();
    state.selectedNyusaki.clear();

    saveSession(state.sessionId, filtered);
    renderFilterScreen(filtered);
}

// ═══════════════════════════════════════════════════════════════════════════
// Filter Screen — 手順5: 納期・納入先チェックボックス（重複なし）
// ═══════════════════════════════════════════════════════════════════════════
function renderFilterScreen(items) {
    const uniq = (key) =>
        [...new Set(items.map(i => i[key]).filter(Boolean))].sort();

    renderCheckboxList('noki-list',    uniq('noki'),    state.selectedNoki);
    renderCheckboxList('nyusaki-list', uniq('nyusaki'), state.selectedNyusaki);

    document.getElementById('filter-count').textContent = `${items.length} 件`;
    showScreen('screen-filter');
}

function renderCheckboxList(containerId, options, selectedSet) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (!options.length) {
        container.innerHTML = '<p class="empty-msg">（データなし）</p>';
        return;
    }

    options.forEach(opt => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';

        const cb = document.createElement('input');
        cb.type    = 'checkbox';
        cb.value   = opt;
        cb.checked = selectedSet.has(opt);
        cb.addEventListener('change', () => {
            cb.checked ? selectedSet.add(opt) : selectedSet.delete(opt);
        });

        const span = document.createElement('span');
        span.textContent = opt;

        label.appendChild(cb);
        label.appendChild(span);
        container.appendChild(label);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Result Screen — 手順6: チェック済みのデータを表示
// ═══════════════════════════════════════════════════════════════════════════
function renderResultScreen() {
    const { selectedNoki, selectedNyusaki, items } = state;

    if (!selectedNoki.size && !selectedNyusaki.size) {
        alert('納期または納入先を1つ以上選択してください。');
        return;
    }

    state.filteredItems = items.filter(item => {
        const nokiOk    = !selectedNoki.size    || selectedNoki.has(item.noki);
        const nyusakiOk = !selectedNyusaki.size || selectedNyusaki.has(item.nyusaki);
        return nokiOk && nyusakiOk;
    });

    const list = document.getElementById('result-list');
    list.innerHTML = '';

    state.filteredItems.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="item-card">
                <div class="item-hinban">${esc(item.hinban)}</div>
                ${item.noki    ? `<div class="item-detail">納期: ${esc(item.noki)}</div>`    : ''}
                ${item.nyusaki ? `<div class="item-detail">納入先: ${esc(item.nyusaki)}</div>` : ''}
                ${item.nai     ? `<div class="item-detail">内: ${esc(item.nai)}</div>`         : ''}
            </div>
        `;
        list.appendChild(li);
    });

    document.getElementById('result-count').textContent = `${state.filteredItems.length} 件`;
    showScreen('screen-result');
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary Screen — 手順7: 品番末尾数字ごとに個数集計
// ═══════════════════════════════════════════════════════════════════════════
function renderSummaryScreen() {
    const agg   = aggregateBySuffix(state.filteredItems);
    const total = agg.reduce((s, [, c]) => s + c, 0);

    const pad = (s, n) => String(s).padStart(n, ' ');

    let out = '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    out    += '  品番 集計結果\n';
    out    += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    if (!agg.length) {
        out += '  （該当データなし）\n';
    } else {
        agg.forEach(([suffix, count]) => {
            out += `  ????T?${suffix.padEnd(3)}  :  ${pad(count, 4)} 個\n`;
        });
        out += '──────────────────────────\n';
        out += `  合　計       :  ${pad(total, 4)} 個\n`;
    }

    out += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    document.getElementById('summary-text').textContent = out;
    showScreen('screen-summary');
}

// ═══════════════════════════════════════════════════════════════════════════
// Storage — localStorage にセッションを保存（端末内）
// ═══════════════════════════════════════════════════════════════════════════
function saveSession(sessionId, items) {
    try {
        localStorage.setItem(`inv_${sessionId}`, JSON.stringify(items));

        const index = JSON.parse(localStorage.getItem('inv_sessions') || '[]');
        index.unshift({ id: sessionId, ts: Date.now(), count: items.length });
        // 直近50セッションのみ保持
        localStorage.setItem('inv_sessions', JSON.stringify(index.slice(0, 50)));
    } catch (e) {
        console.warn('[Storage] 保存失敗:', e);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Wiring
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

    // ── ホーム ────────────────────────────────────────────────────────────
    document.getElementById('btn-start-camera').addEventListener('click', openCamera);

    document.getElementById('file-input').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';  // 同ファイル再選択を許可
        runOcr(URL.createObjectURL(file));
    });

    // ── カメラ ────────────────────────────────────────────────────────────
    document.getElementById('btn-camera-close').addEventListener('click', () => {
        stopCamera();
        showScreen('screen-home');
    });

    document.getElementById('btn-capture').addEventListener('click', () => {
        const canvas = captureFromVideo();
        runOcr(canvas);
    });

    // ── OCR 確認 ──────────────────────────────────────────────────────────
    document.getElementById('btn-verify-back').addEventListener('click', () => {
        showScreen('screen-home');
    });
    document.getElementById('btn-verify-back2').addEventListener('click', () => {
        showScreen('screen-home');
    });
    document.getElementById('btn-parse').addEventListener('click', parseAndFilter);

    // ── 絞り込み ──────────────────────────────────────────────────────────
    document.getElementById('btn-filter-back').addEventListener('click', () => {
        showScreen('screen-verify');
    });
    document.getElementById('btn-show-result').addEventListener('click', renderResultScreen);

    // ── 抽出結果 ──────────────────────────────────────────────────────────
    document.getElementById('btn-result-back').addEventListener('click', () => {
        showScreen('screen-filter');
    });
    document.getElementById('btn-ok').addEventListener('click', renderSummaryScreen);

    // ── 集計 ──────────────────────────────────────────────────────────────
    document.getElementById('btn-summary-back').addEventListener('click', () => {
        showScreen('screen-result');
    });
    document.getElementById('btn-home').addEventListener('click', () => {
        state.items = [];
        state.filteredItems = [];
        state.selectedNoki.clear();
        state.selectedNyusaki.clear();
        document.getElementById('ocr-textarea').value = '';
        showScreen('screen-home');
    });

    // ── Service Worker 登録 (PWA) ─────────────────────────────────────────
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
});
