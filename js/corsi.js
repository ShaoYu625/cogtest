/*
 * Corsi 方塊敲擊測驗（正向）
 * 主要分數 UBS：至少兩次正確重現之最長序列長度。
 */
(function () {
  'use strict';

  // 9 個方塊在正方形板面上的中心位置（0–1 正規化座標，不規則排列）
  var BLOCKS = [
    [0.15, 0.22], [0.55, 0.10], [0.82, 0.30],
    [0.35, 0.40], [0.66, 0.52], [0.12, 0.62],
    [0.42, 0.75], [0.85, 0.78], [0.22, 0.90]
  ];
  var BLOCK_SIZE = 0.12;

  /* ---------- 計分（純函式，可單獨測試） ---------- */
  function score(formalTrials, cfg) {
    var byLen = {};
    formalTrials.forEach(function (t) {
      if (!byLen[t.length]) byLen[t.length] = { n: 0, c: 0 };
      byLen[t.length].n++;
      if (t.correct) byLen[t.length].c++;
    });
    var ubs = 0;
    Object.keys(byLen).forEach(function (L) {
      if (byLen[L].c >= cfg.passCount && +L > ubs) ubs = +L;
    });
    var nCorrect = formalTrials.filter(function (t) { return t.correct; }).length;
    var rts = [];
    formalTrials.forEach(function (t) { if (t.correct && t.response_total_ms != null) rts.push(t.response_total_ms / t.length); });
    return {
      UBS: ubs,
      total_correct_trials: nCorrect,
      total_trials: formalTrials.length,
      total_score: ubs * nCorrect,
      ceiling_reached: ubs === cfg.maxLength ? 1 : 0,
      mean_ms_per_block_correct: U.round(U.mean(rts), 0)
    };
  }

  /* ---------- 板面 ---------- */
  function Board(host) {
    var self = this;
    this.onTap = null;
    this.state = 'wait';
    host.innerHTML =
      '<div class="corsi-wrap">' +
      '  <div class="corsi-msg" aria-live="polite"></div>' +
      '  <div class="corsi-area"><div class="corsi-board" data-state="wait"></div></div>' +
      '  <div class="corsi-sub"></div>' +
      '</div>';
    this.msg = host.querySelector('.corsi-msg');
    this.sub = host.querySelector('.corsi-sub');
    this.area = host.querySelector('.corsi-area');
    this.board = host.querySelector('.corsi-board');
    this.els = BLOCKS.map(function (p, i) {
      var b = document.createElement('div');
      b.className = 'corsi-block';
      b.style.left = ((p[0] - BLOCK_SIZE / 2) * 100) + '%';
      b.style.top = ((p[1] - BLOCK_SIZE / 2) * 100) + '%';
      b.style.width = b.style.height = (BLOCK_SIZE * 100) + '%';
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (self.state === 'respond' && self.onTap) self.onTap(i);
      });
      self.board.appendChild(b);
      return b;
    });
    this.resize = function () {
      var r = self.area.getBoundingClientRect();
      var side = Math.floor(Math.min(r.width, r.height) - 8);
      side = Math.max(200, Math.min(side, 760));
      self.board.style.width = self.board.style.height = side + 'px';
    };
    window.addEventListener('resize', this.resize);
    this.resize();
  }
  Board.prototype.destroy = function () { window.removeEventListener('resize', this.resize); };
  Board.prototype.setState = function (s) { this.state = s; this.board.setAttribute('data-state', s); };
  Board.prototype.setMessage = function (m, sub) { this.msg.textContent = m || ''; this.sub.textContent = sub || ''; };
  Board.prototype.light = function (i, on) { this.els[i].classList.toggle('lit', !!on); };
  Board.prototype.flash = function (i) {
    var el = this.els[i];
    el.classList.add('tapped');
    setTimeout(function () { el.classList.remove('tapped'); }, 180);
  };

  /* ---------- 單一試題 ---------- */
  async function runTrial(board, ctl, cfg, seq, meta) {
    board.setState('wait');
    board.setMessage('請注視方塊', meta.label);
    await U.sleep(cfg.preTrialMs, ctl);
    board.setMessage('', meta.label);
    var presStart = U.now();
    for (var k = 0; k < seq.length; k++) {
      board.light(seq[k], true);
      await U.sleep(cfg.highlightMs, ctl);
      board.light(seq[k], false);
      await U.sleep(cfg.gapMs, ctl);
    }
    var presMs = U.now() - presStart;
    board.setState('respond');
    board.setMessage('請依相同順序點擊方塊', meta.label);
    var respStart = U.now();
    var taps = [];
    await U.waitFor(ctl, function (finish) {
      board.onTap = function (i) {
        taps.push({ b: i, t: Math.round(U.now() - respStart) });
        board.flash(i);
        if (taps.length >= seq.length) { board.setState('wait'); setTimeout(finish, 250); }
      };
      return function () { board.onTap = null; };
    });
    board.setState('wait');
    var resp = taps.map(function (x) { return x.b; });
    var nPos = 0;
    seq.forEach(function (b, i) { if (resp[i] === b) nPos++; });
    var correct = nPos === seq.length;
    return {
      length: seq.length,
      sequence: seq.map(function (b) { return b + 1; }).join('-'),
      response: resp.map(function (b) { return b + 1; }).join('-'),
      correct: correct ? 1 : 0,
      positions_correct: nPos,
      presentation_ms: Math.round(presMs),
      first_tap_ms: taps.length ? taps[0].t : null,
      response_total_ms: taps.length ? taps[taps.length - 1].t : null,
      tap_times_ms: taps.map(function (x) { return x.t; }).join('|')
    };
  }

  async function feedback(board, ctl, correct) {
    board.setMessage(correct ? '✓ 正確' : '✗ 錯誤', '');
    board.msg.classList.add(correct ? 'fb-ok' : 'fb-bad');
    await U.sleep(1200, ctl);
    board.msg.classList.remove('fb-ok', 'fb-bad');
  }

  var INSTR =
    '<p>畫面上有 <b>9 個藍色方塊</b>。每一題中，部分方塊會<b>依序亮起（變成黃色）</b>，請記住亮起的順序。</p>' +
    '<p>方塊全部亮完、畫面出現「<b>請依相同順序點擊方塊</b>」後，請按照<b>相同的順序</b>，逐一點擊這些方塊。</p>' +
    '<ul class="tips">' +
    '<li>序列會從短到長逐漸增加。</li>' +
    '<li>點擊後無法修改，請以正確為優先，不需要搶快。</li>' +
    '<li>方塊亮起時請不要用手指點著方塊或在螢幕上比劃。</li>' +
    '</ul>' +
    '<p>接下來先進行練習，練習時會告訴您是否正確。</p>';

  /* ---------- 主流程 ---------- */
  async function run(stage, ctl, cfg, items, hooks) {
    var practice = [], formal = [];
    var res = { aborted: 0, stop_reason: '', practice_rounds: 0 };
    var board = null;
    function progress(t) { if (hooks && hooks.progress) hooks.progress(t); }
    try {
      progress('說明');
      await U.message(stage, ctl, { kicker: '測驗說明', title: 'Corsi 方塊敲擊測驗', body: INSTR, button: '開始練習' });

      // 練習：若有答錯可重複一次
      for (var round = 1; round <= cfg.practiceMaxRounds; round++) {
        res.practice_rounds = round;
        board = new Board(stage);
        var allOk = true;
        for (var p = 0; p < items.practice.length; p++) {
          progress('練習 ' + (p + 1) + ' / ' + items.practice.length);
          var pt = await runTrial(board, ctl, cfg, items.practice[p], { label: '練習' });
          pt.phase = 'practice'; pt.practice_round = round;
          practice.push(pt);
          if (!pt.correct) allOk = false;
          await feedback(board, ctl, pt.correct);
        }
        board.destroy(); board = null;
        if (allOk || round === cfg.practiceMaxRounds) break;
        await U.message(stage, ctl, { title: '再練習一次', body: '<p>練習中有答錯的題目。請記住：方塊亮完後，依<b>相同順序</b>點擊。我們再練習一次。</p>', button: '再練習一次' });
      }

      progress('準備正式測驗');
      await U.message(stage, ctl, {
        kicker: '練習結束', title: '準備開始正式測驗',
        body: '<p>正式測驗<b>不會</b>顯示對錯。序列長度會逐漸增加，直到無法正確重現為止。</p><p>請專心注視方塊，準備好後按下開始。</p>',
        button: '開始正式測驗'
      });

      res.formal_started_at = U.localTime();
      board = new Board(stage);
      var trialNo = 0;
      for (var L = cfg.startLength; L <= cfg.maxLength; L++) {
        var seqs = items.formal[L], c = 0, w = 0;
        for (var k = 0; k < seqs.length; k++) {
          trialNo++;
          progress('第 ' + trialNo + ' 題');
          var t = await runTrial(board, ctl, cfg, seqs[k], { label: '' });
          t.phase = 'formal'; t.trial_in_length = k + 1;
          formal.push(t);
          if (t.correct) c++; else w++;
          await U.sleep(cfg.interTrialMs, ctl);
          if (c >= cfg.passCount) break;                   // 已通過此長度
          if (w > seqs.length - cfg.passCount) break;      // 已不可能通過
        }
        if (c < cfg.passCount) { res.stop_reason = 'failed_length_' + L; break; }
      }
      if (!res.stop_reason) res.stop_reason = 'max_length_completed';
      board.destroy(); board = null;
    } catch (e) {
      if (board) board.destroy();
      if (e && e.name === 'AbortError') { res.aborted = 1; res.stop_reason = 'aborted_by_examiner'; }
      else throw e;
    }

    var s = score(formal, cfg);
    var summary = Object.assign({}, s, {
      completed: res.aborted ? 0 : 1,
      aborted: res.aborted,
      stop_reason: res.stop_reason,
      practice_rounds: res.practice_rounds,
      practice_correct: practice.filter(function (t) { return t.correct; }).length,
      practice_trials: practice.length,
      formal_started_at: res.formal_started_at || ''
    });
    var trials = practice.concat(formal).map(function (t, i) {
      return Object.assign({ trial_no: i + 1 }, t);
    });
    return { summary: summary, trials: trials };
  }

  window.CorsiTest = { run: run, score: score, BLOCKS: BLOCKS, BLOCK_SIZE: BLOCK_SIZE };
})();
