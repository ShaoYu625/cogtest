/*
 * 視覺追蹤測驗（線條追蹤，LVT 形式）
 * 受試者按住按鈕（或空白鍵）時才顯示題目，放開後題目消失並選擇終點編號。
 * 主要分數 S：在每題時限內答對的題數；輔助：R（不計時限答對題數）、正確率、MDR。
 */
(function () {
  'use strict';
  var G = window.LvtGeom;
  var ACCENT = '#d9480f';

  /* ---------- 繪圖 ---------- */
  function fitCanvas(canvas) {
    var r = canvas.parentNode.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(120, Math.floor(r.width)), h = Math.max(120, Math.floor(r.height));
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  /* 計算版面：橫向（起點在左、終點在右）或直向（起點在上、終點在下） */
  function layout(w, h) {
    var horiz = w >= h * 1.05;
    var padStart = 34, padEnd = 30, padSide = 14;
    var availL = (horiz ? w : h) - padStart - padEnd;
    var availC = (horiz ? h : w) - padSide * 2;
    var C = Math.min(availC, 620);
    var L = Math.min(availL, C * 1.6, 980);   // 長寬比限制在 1.0–1.6，減少不同螢幕間的差異
    if (L < C) C = L;
    var offL = padStart + (availL - L) / 2;
    var offC = padSide + (availC - C) / 2;
    return {
      horiz: horiz, L: L, C: C,
      map: function (nx, ny) {
        return horiz ? [offL + nx * L, offC + ny * C] : [offC + ny * C, offL + nx * L];
      }
    };
  }

  function drawItem(canvas, item, opts) {
    opts = opts || {};
    var f = fitCanvas(canvas), ctx = f.ctx;
    ctx.clearRect(0, 0, f.w, f.h);
    var lay = layout(f.w, f.h);
    if (opts.blank) return lay;
    var n = item.n;
    var lw = Math.max(1.6, Math.min(2.6, lay.C / 230));

    function strokeLine(line, color, width) {
      var pts = G.sample(line, n, 220);
      ctx.beginPath();
      pts.forEach(function (p, i) {
        var q = lay.map(p[0], p[1]);
        if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      });
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();
    }

    item.lines.forEach(function (l) { strokeLine(l, '#1e2833', lw); });
    if (opts.highlight) {
      var tl = item.lines.filter(function (l) { return l.s === item.target; })[0];
      strokeLine(tl, ACCENT, lw * 2.2);
    }

    // 起點
    for (var i = 0; i < n; i++) {
      var q = lay.map(0, G.slotY(i, n));
      ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#7a8796'; ctx.fill();
    }
    // 目標起點：圓點 + 指向箭頭
    var t = lay.map(0, G.slotY(item.target, n));
    ctx.beginPath(); ctx.arc(t[0], t[1], 6.5, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT; ctx.fill();
    ctx.beginPath();
    if (lay.horiz) { ctx.moveTo(t[0] - 10, t[1]); ctx.lineTo(t[0] - 28, t[1] - 9); ctx.lineTo(t[0] - 28, t[1] + 9); }
    else { ctx.moveTo(t[0], t[1] - 10); ctx.lineTo(t[0] - 9, t[1] - 28); ctx.lineTo(t[0] + 9, t[1] - 28); }
    ctx.closePath(); ctx.fill();

    // 終點編號
    var fs = Math.round(Math.max(12, Math.min(18, (lay.C / n) * 0.5)));
    ctx.font = '700 ' + fs + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#1e2833'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var j = 0; j < n; j++) {
      var e = lay.map(1, G.slotY(j, n));
      if (lay.horiz) ctx.fillText(String(j + 1), e[0] + 16, e[1]);
      else ctx.fillText(String(j + 1), e[0], e[1] + 16);
    }
    return lay;
  }

  /* ---------- 計分（純函式） ---------- */
  function score(formal, cfg, nItems) {
    var correct = formal.filter(function (t) { return t.correct; });
    var S = formal.filter(function (t) { return t.correct && t.within_limit; }).length;
    var R = correct.length;
    var rt = correct.map(function (t) { return t.view_ms; });
    var all = formal.filter(function (t) { return t.view_ms != null; }).map(function (t) { return t.view_ms; });
    return {
      S: S,
      R: R,
      accuracy_pct: U.round(R / nItems * 100, 2),
      MDR_s: U.round(U.median(rt) / 1000, 3),
      items_total: nItems,
      items_answered: formal.filter(function (t) { return t.response != null; }).length,
      over_limit_items: formal.filter(function (t) { return !t.within_limit; }).length,
      hard_cap_items: formal.filter(function (t) { return t.hard_cap; }).length,
      mean_view_ms_all: U.round(U.mean(all), 0),
      false_starts: formal.reduce(function (s, t) { return s + (t.false_starts || 0); }, 0),
      canvas_touches: formal.reduce(function (s, t) { return s + (t.canvas_touches || 0); }, 0),
      time_limit_ms: cfg.itemTimeLimitMs
    };
  }

  /* ---------- 介面 ---------- */
  function UI(stage) {
    stage.innerHTML =
      '<div class="lvt-wrap">' +
      '  <div class="lvt-msg" aria-live="polite"></div>' +
      '  <div class="lvt-area"><canvas></canvas></div>' +
      '  <div class="lvt-controls">' +
      '    <button type="button" class="hold-btn"><span class="hold-main">按住觀看</span><span class="hold-sub">電腦可按住空白鍵</span></button>' +
      '    <div class="answer-pad" hidden></div>' +
      '    <div class="fb-row" hidden><button type="button" class="btn btn-primary btn-lg fb-next">下一題</button></div>' +
      '  </div>' +
      '</div>';
    this.msg = stage.querySelector('.lvt-msg');
    this.area = stage.querySelector('.lvt-area');
    this.canvas = stage.querySelector('canvas');
    this.hold = stage.querySelector('.hold-btn');
    this.pad = stage.querySelector('.answer-pad');
    this.fbRow = stage.querySelector('.fb-row');
    this.fbNext = stage.querySelector('.fb-next');
    this.hold.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // 阻止觸控產生的相容滑鼠事件與 click（指標事件仍正常觸發）
    this.hold.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    this.hold.addEventListener('touchend', function (e) { e.preventDefault(); }, { passive: false });
    var self = this;
    this.current = null; // {item, opts} 目前畫面
    this.onResize = function () {
      if (self.current) drawItem(self.canvas, self.current.item, self.current.opts);
      else drawItem(self.canvas, null, { blank: true });
    };
    // 繪圖區尺寸改變（旋轉螢幕、訊息列變化）時重新繪製
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(function () { self.onResize(); });
      this.ro.observe(this.area);
    } else {
      window.addEventListener('resize', this.onResize);
    }
    drawItem(this.canvas, null, { blank: true });
  }
  UI.prototype.destroy = function () {
    if (this.ro) this.ro.disconnect();
    window.removeEventListener('resize', this.onResize);
  };
  UI.prototype.show = function (item, opts) { this.current = { item: item, opts: opts || {} }; return drawItem(this.canvas, item, opts); };
  UI.prototype.clear = function () { this.current = null; drawItem(this.canvas, null, { blank: true }); };
  UI.prototype.mode = function (m) {
    this.hold.hidden = m !== 'hold';
    this.pad.hidden = m !== 'answer';
    this.fbRow.hidden = m !== 'feedback';
  };
  UI.prototype.setMsg = function (html) { this.msg.innerHTML = '<div>' + html + '</div>'; };
  UI.prototype.buildPad = function (n) {
    var h = '';
    for (var i = 1; i <= n; i++) h += '<button type="button" class="ans-btn" data-v="' + i + '">' + i + '</button>';
    this.pad.innerHTML = h;
    this.pad.setAttribute('data-n', n);
  };

  /* 等待按下（按鈕或空白鍵）；回傳來源 */
  function waitPress(ui, ctl) {
    return U.waitFor(ctl, function (finish) {
      function pd(e) {
        e.preventDefault();
        try { ui.hold.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        finish({ src: 'pointer', id: e.pointerId });
      }
      function kd(e) {
        if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!e.repeat) finish({ src: 'key' }); }
      }
      ui.hold.addEventListener('pointerdown', pd);
      document.addEventListener('keydown', kd);
      return function () { ui.hold.removeEventListener('pointerdown', pd); document.removeEventListener('keydown', kd); };
    });
  }

  /* 等待放開，或達到最長觀看時間 */
  function waitRelease(ui, ctl, press, capMs, onTouch) {
    return U.waitFor(ctl, function (finish) {
      var timer = setTimeout(function () { finish({ type: 'hard_cap' }); }, capMs);
      function pu(e) { if (press.src === 'pointer' && e.pointerId === press.id) finish({ type: 'release' }); }
      function ku(e) { if (press.src === 'key' && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); finish({ type: 'release' }); } }
      function kd(e) { if (e.code === 'Space' || e.key === ' ') e.preventDefault(); }
      function blur() { finish({ type: 'release' }); }
      function touch() { onTouch(); }
      ui.hold.addEventListener('pointerup', pu);
      ui.hold.addEventListener('pointercancel', pu);
      ui.hold.addEventListener('lostpointercapture', pu);
      document.addEventListener('keyup', ku);
      document.addEventListener('keydown', kd);
      window.addEventListener('blur', blur);
      ui.area.addEventListener('pointerdown', touch);
      return function () {
        clearTimeout(timer);
        ui.hold.removeEventListener('pointerup', pu);
        ui.hold.removeEventListener('pointercancel', pu);
        ui.hold.removeEventListener('lostpointercapture', pu);
        document.removeEventListener('keyup', ku);
        document.removeEventListener('keydown', kd);
        window.removeEventListener('blur', blur);
        ui.area.removeEventListener('pointerdown', touch);
      };
    });
  }

  /* 作答鍵盤出現後先短暫鎖定，避免放開按鈕時的觸控點擊誤觸數字 */
  function waitAnswer(ui, ctl, n, armMs) {
    return U.waitFor(ctl, function (finish) {
      var armed = false;
      ui.pad.classList.add('arming');
      var t = setTimeout(function () { armed = true; ui.pad.classList.remove('arming'); }, armMs);
      function click(e) {
        if (!armed) return;
        var b = e.target.closest('.ans-btn');
        if (b) finish(+b.getAttribute('data-v'));
      }
      function kd(e) {
        var v = parseInt(e.key, 10);
        if (armed && v >= 1 && v <= n) { e.preventDefault(); finish(v); }
      }
      ui.pad.addEventListener('click', click);
      document.addEventListener('keydown', kd);
      return function () {
        clearTimeout(t); ui.pad.classList.remove('arming');
        ui.pad.removeEventListener('click', click); document.removeEventListener('keydown', kd);
      };
    });
  }

  function waitNext(ui, ctl) {
    return U.waitFor(ctl, function (finish) {
      var armed = false, t = setTimeout(function () { armed = true; }, 400);
      function click() { if (armed) finish(); }
      function kd(e) { if (armed && (e.key === 'Enter' || e.code === 'Space')) { e.preventDefault(); finish(); } }
      ui.fbNext.addEventListener('click', click);
      document.addEventListener('keydown', kd);
      return function () { clearTimeout(t); ui.fbNext.removeEventListener('click', click); document.removeEventListener('keydown', kd); };
    });
  }

  /* ---------- 單一題目 ---------- */
  async function runItem(ui, ctl, cfg, item, label) {
    ui.clear();
    ui.mode('hold');
    ui.setMsg('<span class="lvt-label">' + U.esc(label) + '</span>準備好後，<b>按住</b>下方按鈕觀看題目');
    var falseStarts = 0, touches = 0, rel, viewMs, lay;
    for (;;) {
      var press = await waitPress(ui, ctl);
      ui.hold.classList.add('active');
      ui.setMsg('<span class="lvt-label">' + U.esc(label) + '</span>找到答案後<b>立即放開</b>');
      lay = ui.show(item);
      var t0 = U.now();
      rel = await waitRelease(ui, ctl, press, cfg.hardCapMs, function () { touches++; });
      viewMs = U.now() - t0;
      ui.hold.classList.remove('active');
      ui.clear();
      if (rel.type === 'release' && viewMs < cfg.minViewMs) {
        falseStarts++;
        ui.setMsg('<span class="lvt-label">' + U.esc(label) + '</span>按住時間太短，請<b>重新按住</b>觀看');
        continue;
      }
      break;
    }
    ui.buildPad(item.n);
    ui.mode('answer');
    ui.setMsg('<span class="lvt-label">' + U.esc(label) + '</span>' +
      (rel.type === 'hard_cap' ? '觀看時間已到。' : '') + '橘色起點的線條連到<b>哪一個編號</b>？');
    var a0 = U.now();
    var resp = await waitAnswer(ui, ctl, item.n, cfg.answerArmMs);
    var answerMs = U.now() - a0;
    ui.mode('none');
    return {
      target_start: item.target + 1,
      correct_answer: item.answer + 1,
      response: resp,
      correct: resp === item.answer + 1 ? 1 : 0,
      view_ms: Math.round(viewMs),
      within_limit: viewMs <= cfg.itemTimeLimitMs ? 1 : 0,
      hard_cap: rel.type === 'hard_cap' ? 1 : 0,
      answer_ms: Math.round(answerMs),
      false_starts: falseStarts,
      canvas_touches: touches,
      n_lines: item.n,
      target_crossings: item.target_crossings,
      layout: lay.horiz ? 'horizontal' : 'vertical',
      field_px: Math.round(lay.L) + 'x' + Math.round(lay.C)
    };
  }

  var INSTR =
    '<p>畫面上會出現許多<b>交錯的線條</b>。每條線從一側的起點出發，連到另一側的一個<b>編號終點</b>。</p>' +
    '<p>其中一個起點會以<b style="color:' + ACCENT + '">橘色箭頭</b>標示。請<b>只用眼睛</b>沿著這條線追蹤，找出它連到哪一個編號。</p>' +
    '<div class="lvt-example"><div class="lvt-example-fig"><canvas></canvas></div><div class="lvt-example-cap">範例：橘色為目標線（正式作答時所有線條都是黑色）</div></div>' +
    '<ol class="steps">' +
    '<li><b>按住</b>畫面下方的「按住觀看」按鈕，題目才會出現（電腦可按住<b>空白鍵</b>）。</li>' +
    '<li>找到答案後<b>立即放開</b>，題目會消失，且無法再看一次。</li>' +
    '<li>點選您看到的<b>終點編號</b>（電腦也可按數字鍵）。</li>' +
    '</ol>' +
    '<p class="note">請不要用手指或滑鼠沿著線條描。請在正確的前提下盡快作答。接下來先進行 4 題練習。</p>';

  /* ---------- 主流程 ---------- */
  async function run(stage, ctl, cfg, items, hooks) {
    var practice = [], formal = [], ui = null;
    var res = { aborted: 0, stop_reason: '' };
    function progress(t) { if (hooks && hooks.progress) hooks.progress(t); }
    try {
      progress('說明');
      await U.message(stage, ctl, {
        kicker: '測驗說明', title: '視覺追蹤測驗', body: INSTR, button: '開始練習',
        afterRender: function (st) {
          var c = st.querySelector('.lvt-example canvas');
          requestAnimationFrame(function () { drawItem(c, items.practice[0], { highlight: true }); });
        }
      });

      ui = new UI(stage);
      for (var p = 0; p < items.practice.length; p++) {
        progress('練習 ' + (p + 1) + ' / ' + items.practice.length);
        var it = items.practice[p];
        var pt = await runItem(ui, ctl, cfg, it, '練習 ' + (p + 1));
        pt.phase = 'practice'; pt.item_no = p + 1;
        practice.push(pt);
        // 回饋：顯示正確路徑
        ui.setMsg(pt.correct
          ? '<span class="fb-ok">✓ 正確</span>　答案是 <b>' + pt.correct_answer + '</b>'
          : '<span class="fb-bad">✗ 錯誤</span>　正確答案是 <b>' + pt.correct_answer + '</b>（您選 ' + pt.response + '），請看橘色路徑');
        ui.mode('feedback');
        ui.show(it, { highlight: true });
        await waitNext(ui, ctl);
      }
      ui.destroy(); ui = null;

      progress('準備正式測驗');
      await U.message(stage, ctl, {
        kicker: '練習結束', title: '準備開始正式測驗',
        body: '<p>正式測驗共 <b>' + items.formal.length + ' 題</b>，<b>不會</b>顯示對錯。</p>' +
          '<p>每一題都請：<b>按住觀看 → 找到答案立即放開 → 點選編號</b>。請在正確的前提下盡快作答。</p>',
        button: '開始正式測驗'
      });

      res.formal_started_at = U.localTime();
      ui = new UI(stage);
      for (var i = 0; i < items.formal.length; i++) {
        progress('第 ' + (i + 1) + ' / ' + items.formal.length + ' 題');
        var ft = await runItem(ui, ctl, cfg, items.formal[i], '第 ' + (i + 1) + ' / ' + items.formal.length + ' 題');
        ft.phase = 'formal'; ft.item_no = i + 1;
        formal.push(ft);
        await U.sleep(cfg.interItemMs, ctl);
      }
      res.stop_reason = 'all_items_completed';
      ui.destroy(); ui = null;
    } catch (e) {
      if (ui) ui.destroy();
      if (e && e.name === 'AbortError') { res.aborted = 1; res.stop_reason = 'aborted_by_examiner'; }
      else throw e;
    }

    var s = score(formal, cfg, items.formal.length);
    var summary = Object.assign({}, s, {
      completed: res.aborted ? 0 : 1,
      aborted: res.aborted,
      stop_reason: res.stop_reason,
      practice_correct: practice.filter(function (t) { return t.correct; }).length,
      practice_trials: practice.length,
      formal_started_at: res.formal_started_at || ''
    });
    var trials = practice.concat(formal).map(function (t, i) { return Object.assign({ trial_no: i + 1 }, t); });
    return { summary: summary, trials: trials };
  }

  window.LvtTest = { run: run, score: score, drawItem: drawItem, layout: layout };
})();
