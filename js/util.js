/* 共用工具函式 */
(function () {
  'use strict';
  var U = {};

  U.$ = function (sel, el) { return (el || document).querySelector(sel); };

  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  U.now = function () { return performance.now(); };

  /* ---------- 中止控制 ---------- */
  function AbortError() { var e = new Error('aborted'); e.name = 'AbortError'; return e; }
  U.AbortError = AbortError;

  U.Controller = function () { this.aborted = false; this._l = []; };
  U.Controller.prototype.on = function (fn) {
    var self = this;
    if (this.aborted) { setTimeout(fn, 0); return function () {}; }
    this._l.push(fn);
    return function () { var i = self._l.indexOf(fn); if (i >= 0) self._l.splice(i, 1); };
  };
  U.Controller.prototype.abort = function () {
    if (this.aborted) return;
    this.aborted = true;
    var l = this._l.slice(); this._l = [];
    l.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
  };

  /* 等待某事件；setup(finish) 回傳 cleanup 函式。中止時 reject AbortError。 */
  U.waitFor = function (ctl, setup) {
    return new Promise(function (resolve, reject) {
      var done = false, cleanup = null, off = null;
      function finish(v) {
        if (done) return; done = true;
        if (cleanup) cleanup(); if (off) off();
        resolve(v);
      }
      cleanup = setup(finish);
      off = ctl.on(function () {
        if (done) return; done = true;
        if (cleanup) cleanup();
        reject(AbortError());
      });
    });
  };

  U.sleep = function (ms, ctl) {
    return U.waitFor(ctl, function (finish) {
      var t = setTimeout(finish, ms);
      return function () { clearTimeout(t); };
    });
  };

  /* ---------- 統計 ---------- */
  U.median = function (arr) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  U.mean = function (arr) {
    if (!arr.length) return null;
    return arr.reduce(function (s, x) { return s + x; }, 0) / arr.length;
  };
  U.round = function (x, d) {
    if (x == null || isNaN(x)) return null;
    var p = Math.pow(10, d || 0); return Math.round(x * p) / p;
  };

  /* ---------- 時間 ---------- */
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  U.localTime = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  U.compactTime = function (d) {
    d = d || new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  };

  U.uid = function (prefix) {
    var r = '';
    try {
      var a = new Uint8Array(4); crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) r += pad(a[i].toString(16), 2);
    } catch (e) { r = Math.random().toString(16).slice(2, 10); }
    return (prefix || '') + U.compactTime() + '-' + r;
  };

  /* ---------- 裝置資訊 ---------- */
  U.deviceInfo = function () {
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    var w = window.innerWidth, h = window.innerHeight;
    var ua = navigator.userAgent || '';
    var type = /iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'tablet'
      : /Mobi|Android|iPhone/i.test(ua) ? (Math.min(screen.width, screen.height) >= 600 ? 'tablet' : 'phone')
      : 'desktop';
    return {
      device_type: type,
      input_type: coarse ? 'touch' : 'mouse',
      viewport_w: w, viewport_h: h,
      screen_w: screen.width, screen_h: screen.height,
      dpr: U.round(window.devicePixelRatio || 1, 2),
      orientation: w >= h ? 'landscape' : 'portrait',
      user_agent: ua
    };
  };

  /* ---------- 匯出 ---------- */
  U.toCSV = function (rows) {
    if (!rows.length) return '';
    var keys = [];
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
    function cell(v) {
      if (v == null) return '';
      if (typeof v === 'object') v = JSON.stringify(v);
      v = String(v);
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    return '﻿' + [keys.join(',')].concat(rows.map(function (r) {
      return keys.map(function (k) { return cell(r[k]); }).join(',');
    })).join('\r\n');
  };

  U.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  /* ---------- 畫面 ---------- */
  /* 顯示一張說明卡片，按下按鈕（或 Enter）後 resolve */
  U.message = function (stage, ctl, o) {
    stage.innerHTML =
      '<div class="screen-scroll"><div class="card">' +
      (o.kicker ? '<div class="kicker">' + U.esc(o.kicker) + '</div>' : '') +
      '<h1>' + U.esc(o.title) + '</h1>' +
      '<div class="card-body">' + (o.body || '') + '</div>' +
      '<div class="actions"><button class="btn btn-primary btn-lg" data-go>' + U.esc(o.button || '繼續') + '</button></div>' +
      '</div></div>';
    if (o.afterRender) o.afterRender(stage);
    var btn = stage.querySelector('[data-go]');
    return U.waitFor(ctl, function (finish) {
      var armed = false;
      var t = setTimeout(function () { armed = true; }, o.minDelayMs == null ? 400 : o.minDelayMs);
      function click() { if (armed) finish(); }
      function key(e) { if (e.key === 'Enter' && armed) { e.preventDefault(); finish(); } }
      btn.addEventListener('click', click);
      document.addEventListener('keydown', key);
      return function () { clearTimeout(t); btn.removeEventListener('click', click); document.removeEventListener('keydown', key); };
    });
  };

  window.U = U;
})();
