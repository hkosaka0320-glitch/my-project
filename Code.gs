// ===================================================
// 中1英語「やり直し」学習管理システム
// Code.gs - Google Apps Script バックエンド
// ===================================================

const SHEET_NAME = 'Questions';

// --------------------------------------------------
// エントリーポイント: HTML を配信する
// --------------------------------------------------
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('中1英語やり直し学習システム')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --------------------------------------------------
// スプレッドシート初期化（初回実行時のみ）
// --------------------------------------------------
function initializeSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  } else {
    // 既にデータがある場合はスキップ
    if (sheet.getLastRow() > 1) return sheet;
  }

  const headers = [
    'ID', 'フェーズ', 'カテゴリ', '英文', '日本語訳',
    '解説', 'ステータス', '間違いフラグ', '正解数', '挑戦数'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#4A90D9')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  const sampleData = buildCurriculum();
  if (sampleData.length > 0) {
    sheet.getRange(2, 1, sampleData.length, sampleData[0].length)
      .setValues(sampleData);
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

// --------------------------------------------------
// カリキュラムデータ定義
// --------------------------------------------------
function buildCurriculum() {
  // [ID, フェーズ, カテゴリ, 英文, 日本語訳, 解説, ステータス, 間違いフラグ, 正解数, 挑戦数]
  return [
    // ── Phase 1: be動詞 ─────────────────────────────
    [1,  1, 'be動詞', 'I am a student.',          '私は学生です。',           'am は I（私）専用のbe動詞。主語が I → am で覚えよう！',                              0, false, 0, 0],
    [2,  1, 'be動詞', 'You are kind.',             'あなたは親切です。',       'are は you（あなた／あなたたち）に使うbe動詞。',                                       0, false, 0, 0],
    [3,  1, 'be動詞', 'She is a teacher.',         '彼女は先生です。',         'is は he / she / it などの3人称単数に使うbe動詞。',                                    0, false, 0, 0],
    [4,  1, 'be動詞', 'He is not tall.',           '彼は背が高くありません。', 'be動詞の否定文 → be動詞の直後に not を置くだけ。',                                     0, false, 0, 0],
    [5,  1, 'be動詞', 'Are you a student?',        'あなたは学生ですか？',     'be動詞の疑問文 → be動詞を文の先頭に移動する。',                                        0, false, 0, 0],
    [6,  1, 'be動詞', 'This is my book.',          'これは私の本です。',       'This（これ）は単数扱いで is を使う。',                                                  0, false, 0, 0],
    [7,  1, 'be動詞', 'We are friends.',           '私たちは友達です。',       'We（私たち）は複数なので are を使う。',                                                 0, false, 0, 0],
    [8,  1, 'be動詞', 'They are not Japanese.',    '彼らは日本人ではありません。', 'They にも are。否定は are not（短縮形: aren\'t）。',                               0, false, 0, 0],
    [9,  1, 'be動詞', 'Is she your sister?',       '彼女はあなたの姉妹ですか？', 'she は3人称単数 → 疑問文は Is で始める。',                                          0, false, 0, 0],
    [10, 1, 'be動詞', 'I am not tired.',           '私は疲れていません。',     'am not は短縮できない（×amn\'t）。覚えておこう！',                                     0, false, 0, 0],

    // ── Phase 1: 名詞・代名詞 ────────────────────────
    [11, 1, '名詞・代名詞', 'This is a pen.',           'これはペンです。',           'a は不定冠詞。初めて登場する単数名詞の前に使う。',                              0, false, 0, 0],
    [12, 1, '名詞・代名詞', 'That is an apple.',         'あれはリンゴです。',         'an は母音（a i u e o）で始まる名詞の前に使う。',                               0, false, 0, 0],
    [13, 1, '名詞・代名詞', 'The cat is cute.',          'その猫は可愛いです。',       'the は既に話題に出ている特定の名詞に使う定冠詞。',                              0, false, 0, 0],
    [14, 1, '名詞・代名詞', 'These are my books.',       'これらは私の本です。',       'These は this の複数形。動詞も are になる。',                                   0, false, 0, 0],
    [15, 1, '名詞・代名詞', 'That is his bag.',          'あれは彼のバッグです。',     'his は「彼の」という所有格。he の仲間。',                                       0, false, 0, 0],
    [16, 1, '名詞・代名詞', 'Those are her cats.',       'あれらは彼女の猫たちです。', 'Those は that の複数形。her は「彼女の」（所有格）。',                          0, false, 0, 0],
    [17, 1, '名詞・代名詞', 'It is my umbrella.',        'それは私の傘です。',         'It（それ）は物や動物を指す代名詞。',                                            0, false, 0, 0],
    [18, 1, '名詞・代名詞', 'Is this your pen?',         'これはあなたのペンですか？', 'be動詞疑問文 + your（あなたの：所有格）の組み合わせ。',                         0, false, 0, 0],

    // ── Phase 2: 一般動詞 ────────────────────────────
    [19, 2, '一般動詞', 'I play soccer.',            '私はサッカーをします。',       '一般動詞は主語の直後に置く。I/you/they では原形のまま。',                       0, false, 0, 0],
    [20, 2, '一般動詞', 'She plays the piano.',      '彼女はピアノを弾きます。',     '3人称単数（he/she/it）の現在形 → 動詞に s を付ける。',                         0, false, 0, 0],
    [21, 2, '一般動詞', 'I like cats.',              '私は猫が好きです。',           'like は「好きだ」。目的語に複数形を使うことが多い。',                            0, false, 0, 0],
    [22, 2, '一般動詞', 'He watches TV every day.',  '彼は毎日テレビを見ます。',     'watch は ch で終わるので es を付ける（watches）。',                             0, false, 0, 0],
    [23, 2, '一般動詞', 'She studies English.',      '彼女は英語を勉強します。',     'study は y → i に変えて es を付ける（studies）。',                             0, false, 0, 0],
    [24, 2, '一般動詞', 'I go to school by bus.',    '私はバスで学校に行きます。',   'go to ～ で「〜へ行く」。by bus は「バスで」（交通手段）。',                    0, false, 0, 0],
    [25, 2, '一般動詞', 'We have two cats.',         '私たちは猫を2匹飼っています。', 'have は「持っている／飼っている」。',                                          0, false, 0, 0],
    [26, 2, '一般動詞', 'He has a big dog.',         '彼は大きな犬を飼っています。', 'have の3単現形は has（不規則変化）。',                                          0, false, 0, 0],

    // ── Phase 2: 否定文・疑問文（一般動詞）─────────
    [27, 2, '否定文・疑問文', 'I do not play tennis.',        '私はテニスをしません。',         '一般動詞の否定文 → do not（don\'t）+ 動詞の原形。',                  0, false, 0, 0],
    [28, 2, '否定文・疑問文', 'She does not eat meat.',       '彼女は肉を食べません。',         '3単現の否定文 → does not（doesn\'t）+ 動詞の原形。',                 0, false, 0, 0],
    [29, 2, '否定文・疑問文', 'Do you have a dog?',           'あなたは犬を飼っていますか？',   '一般動詞の疑問文 → 文頭に Do を置き、主語＋動詞原形。',               0, false, 0, 0],
    [30, 2, '否定文・疑問文', 'Does he play baseball?',       '彼は野球をしますか？',           '3単現の疑問文 → 文頭に Does を置き、動詞は原形に戻す。',              0, false, 0, 0],
    [31, 2, '否定文・疑問文', 'Yes, I do.',                   'はい、します。',                 'Do の疑問文には Yes, I do. / No, I don\'t. で答える。',               0, false, 0, 0],
    [32, 2, '否定文・疑問文', 'No, she does not.',            'いいえ、彼女はしません。',       'Does の疑問文には Yes, she does. / No, she doesn\'t. で答える。',     0, false, 0, 0],
    [33, 2, '否定文・疑問文', 'They don\'t live here.',       '彼らはここに住んでいません。',   'don\'t は do not の短縮形。',                                         0, false, 0, 0],

    // ── Phase 3: 疑問詞 ──────────────────────────────
    [34, 3, '疑問詞', 'What is this?',                 'これは何ですか？',               'What（何）→ 物・事を尋ねる。',                                             0, false, 0, 0],
    [35, 3, '疑問詞', 'Who is she?',                   '彼女は誰ですか？',               'Who（誰）→ 人を尋ねる。',                                                  0, false, 0, 0],
    [36, 3, '疑問詞', 'Where do you live?',             'あなたはどこに住んでいますか？', 'Where（どこ）→ 場所を尋ねる。一般動詞には do/does も必要。',               0, false, 0, 0],
    [37, 3, '疑問詞', 'When is your birthday?',         'あなたの誕生日はいつですか？',   'When（いつ）→ 時を尋ねる。',                                               0, false, 0, 0],
    [38, 3, '疑問詞', 'Why do you study English?',      'なぜ英語を勉強するのですか？',   'Why（なぜ）→ 理由を尋ねる。答えは Because ～. で。',                       0, false, 0, 0],
    [39, 3, '疑問詞', 'How are you?',                   'お元気ですか？',                 'How（どのように）→ 状態や方法を尋ねる。',                                  0, false, 0, 0],
    [40, 3, '疑問詞', 'How many books do you have?',    '本を何冊持っていますか？',       'How many + 複数名詞 → 数を尋ねる。',                                       0, false, 0, 0],
    [41, 3, '疑問詞', 'What time is it now?',           '今何時ですか？',                 'What time で「何時」と時刻を尋ねる。',                                     0, false, 0, 0],
    [42, 3, '疑問詞', 'Which do you like, cats or dogs?', '猫と犬、どちらが好きですか？', 'Which（どちら）→ 選択を尋ねる。',                                         0, false, 0, 0],

    // ── Phase 3: 複数形・There is/are ───────────────
    [43, 3, '複数形・There構文', 'I have two cats.',                    '私は猫を2匹飼っています。',     '規則変化の複数形 → 名詞の語尾に s を付ける。',                              0, false, 0, 0],
    [44, 3, '複数形・There構文', 'There is a cat under the chair.',     '椅子の下に猫が1匹います。',     'There is + 単数名詞 → 「〜が1つ/1匹あります」。',                           0, false, 0, 0],
    [45, 3, '複数形・There構文', 'There are three books on the desk.',  '机の上に3冊の本があります。',   'There are + 複数名詞 → 「〜がいくつかあります」。',                         0, false, 0, 0],
    [46, 3, '複数形・There構文', 'There is no milk in the fridge.',     '冷蔵庫にミルクがありません。',  'There is no ～ → 「〜がまったくない」。',                                   0, false, 0, 0],
    [47, 3, '複数形・There構文', 'Are there any students in the room?', '部屋に生徒はいますか？',        'There are の疑問文 → Are there ～? で尋ねる。',                             0, false, 0, 0],
  ];
}

// --------------------------------------------------
// シートを取得（なければ初期化）
// --------------------------------------------------
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) {
    sheet = initializeSpreadsheet();
  }
  return sheet;
}

// --------------------------------------------------
// 全データを連想配列の配列として返す
// --------------------------------------------------
function getAllData() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

// --------------------------------------------------
// フェーズ・カテゴリごとの進捗サマリーを返す
// --------------------------------------------------
function getPhases() {
  const data = getAllData();
  const phases = {};

  data.forEach(item => {
    const p = item['フェーズ'];
    const c = item['カテゴリ'];

    if (!phases[p]) phases[p] = { categories: {} };
    if (!phases[p].categories[c]) {
      phases[p].categories[c] = { total: 0, inProgress: 0, completed: 0, mastered: 0, weakPoints: 0 };
    }

    const cat = phases[p].categories[c];
    cat.total++;
    if (item['ステータス'] === 1) cat.inProgress++;
    if (item['ステータス'] === 2) cat.completed++;
    if (item['ステータス'] === 3) cat.mastered++;
    if (item['間違いフラグ'] === true) cat.weakPoints++;
  });

  return phases;
}

// --------------------------------------------------
// 問題一覧を取得（フェーズ・カテゴリでフィルタ可）
// --------------------------------------------------
function getQuestions(phase, category) {
  const data = getAllData();
  return data.filter(item => {
    if (phase    && item['フェーズ']  !== phase)    return false;
    if (category && item['カテゴリ'] !== category) return false;
    return true;
  });
}

// --------------------------------------------------
// 弱点問題（間違いフラグが true）だけを返す
// --------------------------------------------------
function getWeakPoints() {
  const data = getAllData();
  return data.filter(item => item['間違いフラグ'] === true);
}

// --------------------------------------------------
// 回答結果を保存する
// --------------------------------------------------
function saveAnswer(id, isCorrect) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== id) continue;

    const prevStatus   = Number(values[i][6]);
    const correctCount = Number(values[i][8]) + (isCorrect ? 1 : 0);
    const attemptCount = Number(values[i][9]) + 1;

    // ステータス更新ロジック
    // 0:未着手 → 1:学習中 → 2:クリア（1回以上正解） → 3:マスター（3回以上正解）
    let newStatus = prevStatus;
    if (isCorrect) {
      if      (correctCount >= 3) newStatus = 3;
      else if (correctCount >= 1) newStatus = Math.max(prevStatus, 2);
    } else {
      if (prevStatus === 0) newStatus = 1;
    }

    // 間違いフラグ: 不正解なら立てる、正解で3回連続正解なら下げる
    const wrongFlag = !isCorrect;

    sheet.getRange(i + 1, 7).setValue(newStatus);
    sheet.getRange(i + 1, 8).setValue(wrongFlag);
    sheet.getRange(i + 1, 9).setValue(correctCount);
    sheet.getRange(i + 1, 10).setValue(attemptCount);

    return { success: true, newStatus, correctCount, isCorrect };
  }

  return { success: false, error: 'Question not found: ' + id };
}

// --------------------------------------------------
// 進捗をリセット（引数なし → 全リセット）
// --------------------------------------------------
function resetProgress(phase, category) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const updates = [];

  for (let i = 1; i < values.length; i++) {
    const itemPhase    = values[i][1];
    const itemCategory = values[i][2];
    const shouldReset  =
      (!phase    || itemPhase    === phase) &&
      (!category || itemCategory === category);

    if (shouldReset) {
      // ステータス・間違いフラグ・正解数・挑戦数 を 0/false/0/0 に
      sheet.getRange(i + 1, 7, 1, 4).setValues([[0, false, 0, 0]]);
    }
  }

  return { success: true };
}

// --------------------------------------------------
// 全体の統計情報を返す
// --------------------------------------------------
function getStats() {
  const data = getAllData();
  const stats = { total: data.length, notStarted: 0, inProgress: 0, completed: 0, mastered: 0, weakPoints: 0 };
  data.forEach(item => {
    const s = item['ステータス'];
    if (s === 0) stats.notStarted++;
    else if (s === 1) stats.inProgress++;
    else if (s === 2) stats.completed++;
    else if (s === 3) stats.mastered++;
    if (item['間違いフラグ'] === true) stats.weakPoints++;
  });
  return stats;
}
