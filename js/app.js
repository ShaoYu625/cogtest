/* 主流程：受試者資料 → 測驗（依順序）→ 上傳 → 結束 */
(function () {
  'use strict';
  var CFG = window.TEST_CONFIG, ITEMS = window.TEST_ITEMS;
  var stage = U.$('#stage'), topbar = U.$('#topbar');
  var tbTitle = U.$('#tb-title'), tbProg = U.$('#tb-progress'), abortBtn = U.$('#abort-btn');

  var TIMEPOINTS = [
    { v: 'pre', label: '前測' },
    { v: 'post', label: '後測' },
    { v: 'familiarization', label: '熟悉練習日' },
    { v: 'pilot', label: '試行／測試（不列入分析）' }
  ];
  var ORDERS = [
    { v: 'CL', label: 'CORSI → 視覺追蹤', tests: ['corsi', 'lvt'] },
    { v: 'LC', label: '視覺追蹤 → CORSI', tests: ['lvt', 'corsi'] },
    { v: 'C', label: '只做 CORSI', tests: ['corsi'] },
    { v: 'L', label: '只做視覺追蹤', tests: ['lvt'] }
  ];
  var TEST_NAMES = { corsi: 'Corsi 方塊敲擊測驗', lvt: '視覺追蹤測驗' };
  var ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

  function labelOf(list, v) { for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i].label; return v; }

  /* ---------- 頂端列 ---------- */
  var currentCtl = null;
  function setTopbar(title, prog, showAbort) {
    topbar.hidden = !title;
    tbTitle.textContent = title || '';
    tbProg.textContent = prog || '';
    abortBtn.hidden = !showAbort;
  }
  abortBtn.addEventListener('click', function () {
    if (currentCtl && window.confirm('確定要中止這項測驗嗎？\n已完成的題目仍會保存，並標記為「中止」。')) currentCtl.abort();
  });

  /* ---------- 防止離開 / 螢幕休眠 / 全螢幕 ---------- */
  var testing = false, wakeLock = null, hiddenCount = 0;
  window.addEventListener('beforeunload', function (e) { if (testing) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', function () {
    if (testing && document.visibilityState === 'hidden') hiddenCount++;
    if (testing && document.visibilityState === 'visible') requestWakeLock();
  });
  function requestWakeLock() {
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {}); } catch (e) { /* ignore */ }
  }
  function enterFullscreen() {
    var el = document.documentElement;
    try {
      var f = el.requestFullscreen || el.webkitRequestFullscreen;
      if (f) { var p = f.call(el); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { /* ignore */ }
  }
  function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    } catch (e) { /* ignore */ }
  }

  /* ---------- 起始畫面 ---------- */
  function setupScreen() {
    testing = false;
    setTopbar('');
    document.body.classList.remove('testing');
    var q = new URLSearchParams(location.search);
    var pid = q.get('id') || '', tp = q.get('tp') || 'pre', order = q.get('order') || 'CL';
    var noEndpoint = !Uploader.hasEndpoint();
    var pending = Uploader.pendingCount();

    stage.innerHTML =
      '<div class="screen-scroll"><div class="card card-setup">' +
      '<div class="kicker">' + U.esc(CFG.studyTitle) + '</div>' +
      '<h1>受試者資料</h1>' +
      (noEndpoint ? '<div class="alert alert-warn">尚未設定資料後台（js/config.js 的 endpoint）。本次結果只能在結束畫面下載，不會自動上傳。</div>' : '') +
      '<form id="setup" autocomplete="off" novalidate>' +
      '<label class="field"><span>受試者編號 <em>必填</em></span>' +
      '<input id="pid" name="pid" inputmode="latin" value="' + U.esc(pid) + '" placeholder="例如 P001" maxlength="32" autocapitalize="characters" spellcheck="false">' +
      '<small>僅限英文字母、數字、- 或 _，請勿輸入姓名。</small></label>' +
      '<label class="field"><span>施測時間點</span><select id="tp">' +
      TIMEPOINTS.map(function (t) { return '<option value="' + t.v + '"' + (t.v === tp ? ' selected' : '') + '>' + t.label + '</option>'; }).join('') +
      '</select></label>' +
      '<fieldset class="field"><legend>測驗順序</legend><div class="radio-grid">' +
      ORDERS.map(function (o) {
        return '<label class="radio"><input type="radio" name="order" value="' + o.v + '"' + (o.v === order ? ' checked' : '') + '><span>' + o.label + '</span></label>';
      }).join('') +
      '</div></fieldset>' +
      '<label class="field"><span>施測備註 <em class="opt">選填</em></span><input id="note" maxlength="200" placeholder="例如：施測者代號、異常狀況"></label>' +
      '<div class="err" id="err" hidden></div>' +
      '<div class="actions"><button class="btn btn-primary btn-lg" type="submit">下一步</button></div>' +
      '</form>' +
      '<details class="tools"><summary>研究者工具</summary><div class="tools-body">' +
      '<div class="tool-row"><span>資料後台</span><span id="ep-status">' + (noEndpoint ? '未設定' : '已設定') + '</span>' +
      (noEndpoint ? '' : '<button class="btn btn-sm" type="button" id="ping">測試連線</button>') + '</div>' +
      '<div class="tool-row"><span>本機待上傳</span><span id="pending">' + pending + ' 筆</span>' +
      '<button class="btn btn-sm" type="button" id="flush"' + (pending && !noEndpoint ? '' : ' disabled') + '>立即重送</button></div>' +
      '<div class="tool-row"><span>此裝置歷史紀錄</span><span>' + Uploader.history().length + ' 筆</span>' +
      '<button class="btn btn-sm" type="button" id="dl-hist">下載 CSV</button></div>' +
      '<div class="tool-row tool-col"><span>產生受試者專屬連結（預先填好編號與設定）</span>' +
      '<div class="link-row"><input id="link-out" readonly placeholder="填好上方欄位後按「產生」"><button class="btn btn-sm" type="button" id="mk-link">產生</button></div></div>' +
      '<div class="tool-row"><span>程式版本</span><span>' + U.esc(CFG.appVersion) + ' / ' + U.esc(ITEMS.version) + '</span></div>' +
      '</div></details>' +
      '</div></div>';

    var form = U.$('#setup'), err = U.$('#err');
    function values() {
      var o = form.querySelector('input[name=order]:checked');
      return { pid: U.$('#pid').value.trim(), tp: U.$('#tp').value, order: o ? o.value : 'CL', note: U.$('#note').value.trim() };
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = values();
      if (!ID_RE.test(v.pid)) { err.hidden = false; err.textContent = '請輸入受試者編號（僅限英文字母、數字、- 或 _，最多 32 字）。'; U.$('#pid').focus(); return; }
      confirmScreen(v);
    });
    var ping = U.$('#ping');
    if (ping) ping.addEventListener('click', function () {
      var s = U.$('#ep-status'); s.textContent = '連線中…';
      Uploader.ping().then(function () { s.textContent = '✓ 連線成功'; }).catch(function (e) { s.textContent = '✗ 失敗：' + e.message; });
    });
    U.$('#flush').addEventListener('click', function () {
      var s = U.$('#pending'); s.textContent = '重送中…';
      Uploader.flush().then(function (r) { s.textContent = '成功 ' + r.sent + '，剩餘 ' + Uploader.pendingCount() + ' 筆'; });
    });
    U.$('#dl-hist').addEventListener('click', function () { downloadRecords(Uploader.history(), 'device-history'); });
    U.$('#mk-link').addEventListener('click', function () {
      var v = values();
      var u = location.origin + location.pathname + '?id=' + encodeURIComponent(v.pid) + '&tp=' + v.tp + '&order=' + v.order;
      var out = U.$('#link-out'); out.value = u; out.select();
      try { navigator.clipboard.writeText(u); } catch (e) { /* ignore */ }
    });
  }

  /* ---------- 確認畫面 ---------- */
  function confirmScreen(v) {
    var order = ORDERS.filter(function (o) { return o.v === v.order; })[0];
    var dev = U.deviceInfo();
    var small = Math.min(dev.viewport_w, dev.viewport_h) < 320;
    stage.innerHTML =
      '<div class="screen-scroll"><div class="card">' +
      '<div class="kicker">開始前確認</div><h1>準備開始</h1>' +
      '<dl class="summary">' +
      '<dt>受試者編號</dt><dd>' + U.esc(v.pid) + '</dd>' +
      '<dt>施測時間點</dt><dd>' + U.esc(labelOf(TIMEPOINTS, v.tp)) + '</dd>' +
      '<dt>測驗順序</dt><dd>' + U.esc(order.label) + '</dd>' +
      '</dl>' +
      '<ul class="tips">' +
      '<li>請在安靜、光線充足的環境進行，並關閉通知與其他程式。</li>' +
      '<li>手機請<b>直向</b>拿穩；平板或電腦請保持固定的觀看距離。</li>' +
      '<li>測驗過程約 15–25 分鐘，中途請勿切換程式或關閉網頁。</li>' +
      '</ul>' +
      (small ? '<div class="alert alert-warn">此裝置畫面偏小，可能影響作答，建議改用較大的螢幕。</div>' : '') +
      '<div class="actions"><button class="btn" id="back">返回修改</button><button class="btn btn-primary btn-lg" id="go">開始</button></div>' +
      '</div></div>';
    U.$('#back').addEventListener('click', setupScreen);
    U.$('#go').addEventListener('click', function () {
      enterFullscreen();
      requestWakeLock();
      runSession(v, order.tests);
    });
  }

  /* ---------- 測驗流程 ---------- */
  async function runSession(v, tests) {
    testing = true;
    document.body.classList.add('testing');
    var session = { id: U.uid('S'), pid: v.pid, tp: v.tp, order: v.order, note: v.note };
    var outcomes = [];

    for (var i = 0; i < tests.length; i++) {
      var kind = tests[i];
      if (i > 0) await breakScreen(TEST_NAMES[kind], tests.length, i + 1);

      var ctl = new U.Controller();
      currentCtl = ctl;
      hiddenCount = 0;
      var startD = new Date(), t0 = U.now();
      var head = (tests.length > 1 ? '(' + (i + 1) + '/' + tests.length + ') ' : '') + TEST_NAMES[kind];
      setTopbar(head, '', true);
      var hooks = { progress: function (t) { tbProg.textContent = t; } };
      var res = kind === 'corsi'
        ? await CorsiTest.run(stage, ctl, CFG.corsi, ITEMS.corsi, hooks)
        : await LvtTest.run(stage, ctl, CFG.lvt, ITEMS.lvt, hooks);
      var endD = new Date();
      currentCtl = null;
      setTopbar('');

      var record = buildRecord(kind, res, session, i + 1, startD, endD, (U.now() - t0) / 1000);
      var up = Uploader.submit(record);
      outcomes.push({ kind: kind, record: record, upload: up });
      if (res.summary.aborted) break;
    }

    testing = false;
    document.body.classList.remove('testing');
    exitFullscreen();
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ }
    endScreen(session, outcomes);
  }

  function buildRecord(kind, res, s, pos, startD, endD, durS) {
    var dev = U.deviceInfo();
    var runId = U.uid((kind === 'corsi' ? 'C' : 'L') + '-' + s.pid + '-');
    var base = {
      run_id: runId,
      session_id: s.id,
      participant_id: s.pid,
      timepoint: s.tp,
      test: kind,
      order: s.order,
      test_position: pos
    };
    var summary = Object.assign({}, base, {
      started_at: U.localTime(startD),
      ended_at: U.localTime(endD),
      started_at_utc: startD.toISOString(),
      duration_s: U.round(durS, 1)
    }, res.summary, {
      page_hidden_count: hiddenCount,
      note: s.note,
      app_version: CFG.appVersion,
      items_version: ITEMS.version,
      device_type: dev.device_type,
      input_type: dev.input_type,
      viewport: dev.viewport_w + 'x' + dev.viewport_h,
      screen: dev.screen_w + 'x' + dev.screen_h,
      dpr: dev.dpr,
      orientation: dev.orientation,
      user_agent: dev.user_agent
    });
    var trials = res.trials.map(function (t) {
      return Object.assign({ run_id: runId, participant_id: s.pid, timepoint: s.tp, test_position: pos }, t);
    });
    return { type: 'result', kind: kind, summary: summary, trials: trials };
  }

  /* ---------- 休息 ---------- */
  function breakScreen(nextName, total, pos) {
    var sec = CFG.breakBetweenTestsSec;
    stage.innerHTML =
      '<div class="screen-scroll"><div class="card center">' +
      '<div class="kicker">休息</div><h1>第一項測驗完成</h1>' +
      '<p>請放鬆休息，眼睛離開螢幕。</p>' +
      '<div class="countdown" id="cd">' + sec + '</div>' +
      '<p>下一項：<b>' + U.esc(nextName) + '</b>（' + pos + '/' + total + '）</p>' +
      '<div class="actions"><button class="btn btn-primary btn-lg" id="next" disabled>繼續</button></div>' +
      '<button class="link-btn" id="skip">研究者：略過倒數</button>' +
      '</div></div>';
    return new Promise(function (resolve) {
      var left = sec, btn = U.$('#next'), cd = U.$('#cd');
      var timer = setInterval(function () {
        left--; cd.textContent = Math.max(0, left);
        if (left <= 0) { clearInterval(timer); btn.disabled = false; cd.classList.add('done'); }
      }, 1000);
      U.$('#skip').addEventListener('click', function () { clearInterval(timer); btn.disabled = false; cd.textContent = '0'; });
      btn.addEventListener('click', function () { clearInterval(timer); resolve(); });
    });
  }

  /* ---------- 結束 ---------- */
  function downloadRecords(records, tag) {
    if (!records.length) { alert('沒有可下載的紀錄'); return; }
    var stamp = U.compactTime();
    ['corsi', 'lvt'].forEach(function (k) {
      var rs = records.filter(function (r) { return r.kind === k; });
      if (!rs.length) return;
      U.download(k.toUpperCase() + '_摘要_' + tag + '_' + stamp + '.csv', U.toCSV(rs.map(function (r) { return r.summary; })), 'text/csv;charset=utf-8');
      var trials = [];
      rs.forEach(function (r) { trials = trials.concat(r.trials); });
      setTimeout(function () {
        U.download(k.toUpperCase() + '_逐題_' + tag + '_' + stamp + '.csv', U.toCSV(trials), 'text/csv;charset=utf-8');
      }, 300);
    });
  }

  function scoreLine(o) {
    var s = o.record.summary;
    if (o.kind === 'corsi') return 'UBS 記憶廣度 = <b>' + s.UBS + '</b>，正式題答對 ' + s.total_correct_trials + ' / ' + s.total_trials;
    return 'S（限時答對）= <b>' + s.S + '</b>，R = ' + s.R + '，正確率 ' + s.accuracy_pct + '%，MDR = ' + s.MDR_s + ' 秒';
  }

  async function endScreen(session, outcomes) {
    setTopbar('');
    var anyAborted = outcomes.some(function (o) { return o.record.summary.aborted; });
    stage.innerHTML =
      '<div class="screen-scroll"><div class="card">' +
      '<div class="kicker">' + (anyAborted ? '測驗已中止' : '全部完成') + '</div>' +
      '<h1>' + (anyAborted ? '測驗已中止' : '測驗完成，謝謝您！') + '</h1>' +
      '<p>' + (anyAborted ? '已完成的部分已保存。' : '您已完成所有測驗，請告知研究人員。') + '</p>' +
      '<div class="upload-list" id="ul">' + outcomes.map(function (o, i) {
        return '<div class="upload-item" id="u' + i + '"><span>' + TEST_NAMES[o.kind] + (o.record.summary.aborted ? '（中止）' : '') +
          '</span><span class="st st-wait">資料儲存中…</span></div>';
      }).join('') + '</div>' +
      (CFG.showScoresToParticipant ? '<div class="scores">' + outcomes.map(function (o) { return '<p>' + TEST_NAMES[o.kind] + '：' + scoreLine(o) + '</p>'; }).join('') + '</div>' : '') +
      '<details class="tools"><summary>研究者資訊</summary><div class="tools-body">' +
      '<p>受試者 <b>' + U.esc(session.pid) + '</b>｜' + U.esc(labelOf(TIMEPOINTS, session.tp)) + '｜場次 ' + U.esc(session.id) + '</p>' +
      outcomes.map(function (o) {
        return '<p>' + TEST_NAMES[o.kind] + '：' + scoreLine(o) + '<br><small>開始 ' + o.record.summary.started_at +
          '，正式題開始 ' + (o.record.summary.formal_started_at || '—') + '，結束 ' + o.record.summary.ended_at +
          '，切換畫面 ' + o.record.summary.page_hidden_count + ' 次</small></p>';
      }).join('') +
      '<div class="actions actions-left"><button class="btn btn-sm" id="dl">下載本次資料（CSV）</button>' +
      '<button class="btn btn-sm" id="dl-json">下載本次資料（JSON）</button>' +
      '<button class="btn btn-sm" id="retry" hidden>重新上傳</button></div>' +
      '</div></details>' +
      '<div class="actions"><button class="btn btn-primary" id="new">下一位受試者</button></div>' +
      '</div></div>';

    var records = outcomes.map(function (o) { return o.record; });
    U.$('#dl').addEventListener('click', function () { downloadRecords(records, session.pid + '_' + session.tp); });
    U.$('#dl-json').addEventListener('click', function () {
      U.download('結果_' + session.pid + '_' + session.tp + '_' + U.compactTime() + '.json', JSON.stringify(records, null, 2), 'application/json');
    });
    U.$('#new').addEventListener('click', function () { location.href = location.pathname; });
    function setStatus(i, ok, err) {
      var st = U.$('#u' + i + ' .st');
      if (ok) { st.className = 'st st-ok'; st.textContent = '✓ 已上傳'; st.title = ''; }
      else {
        st.className = 'st st-bad';
        st.textContent = Uploader.hasEndpoint() ? '尚未上傳（已暫存於本機，之後自動重送）' : '已保存於本機（未設定後台）';
        st.title = err || '';
      }
    }
    U.$('#retry').addEventListener('click', function () {
      var btn = this; btn.disabled = true; btn.textContent = '上傳中…';
      Uploader.flush().then(function () {
        var left = 0;
        outcomes.forEach(function (o, i) { var p = isPending(o.record); if (p) left++; setStatus(i, !p); });
        btn.disabled = false; btn.textContent = '重新上傳'; btn.hidden = left === 0;
      });
    });

    var anyFail = false;
    for (var i = 0; i < outcomes.length; i++) {
      var r = await outcomes[i].upload;
      setStatus(i, r.ok, r.error);
      if (!r.ok) anyFail = true;
    }
    if (anyFail) {
      if (Uploader.hasEndpoint()) U.$('#retry').hidden = false;
      U.$('.tools').open = true;
    }
    window.__lastSession = { session: session, records: records };
  }

  function isPending(record) {
    try {
      return JSON.parse(localStorage.getItem('ct_pending_v1') || '[]').some(function (r) { return r.summary.run_id === record.summary.run_id; });
    } catch (e) { return true; }
  }

  /* ---------- 啟動 ---------- */
  if (!ITEMS || !window.CorsiTest || !window.LvtTest) {
    stage.innerHTML = '<div class="card"><h1>載入失敗</h1><p>程式檔案不完整，請重新整理頁面。</p></div>';
    return;
  }
  setupScreen();
  // 開啟網頁時自動重送先前未上傳的資料
  if (Uploader.hasEndpoint() && Uploader.pendingCount()) Uploader.flush();
})();
