/*
 * 資料上傳：先存入本機待傳佇列，上傳成功後才移除；失敗的資料下次開啟網頁時自動重送。
 * 後台以 run_id 去除重複，因此重送不會產生重複資料。
 */
(function () {
  'use strict';
  var PENDING = 'ct_pending_v1';
  var HISTORY = 'ct_history_v1';
  var MAX_HISTORY = 300;

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  }
  function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  function endpoint() { return (window.TEST_CONFIG.endpoint || '').trim(); }

  async function post(payload) {
    var url = endpoint();
    if (!url) throw new Error('尚未設定後台網址');
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避免 CORS 預檢
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: ctrl ? ctrl.signal : undefined
      });
      var j = await res.json();
      if (!j.ok) throw new Error(j.error || '後台回應錯誤');
      return j;
    } finally { if (timer) clearTimeout(timer); }
  }

  function removePending(runId) {
    save(PENDING, load(PENDING).filter(function (r) { return r.summary.run_id !== runId; }));
  }

  var Uploader = {
    hasEndpoint: function () { return !!endpoint(); },
    pendingCount: function () { return load(PENDING).length; },
    history: function () { return load(HISTORY); },

    /* 保存並上傳一筆測驗結果；回傳 {ok, error} */
    submit: async function (record) {
      var p = load(PENDING); p.push(record); save(PENDING, p);
      var h = load(HISTORY); h.push(record); if (h.length > MAX_HISTORY) h = h.slice(-MAX_HISTORY); save(HISTORY, h);
      if (!endpoint()) return { ok: false, error: '尚未設定後台網址（資料僅保存在本機）' };
      var lastErr = null;
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          await post(record);
          removePending(record.summary.run_id);
          return { ok: true };
        } catch (e) {
          lastErr = e;
          await new Promise(function (r) { setTimeout(r, 1500 * (attempt + 1)); });
        }
      }
      return { ok: false, error: String(lastErr && lastErr.message || lastErr) };
    },

    /* 重送所有待傳資料；回傳 {sent, failed} */
    flush: async function () {
      var list = load(PENDING), sent = 0, failed = 0;
      if (!endpoint() || !list.length) return { sent: 0, failed: list.length };
      for (var i = 0; i < list.length; i++) {
        try { await post(list[i]); removePending(list[i].summary.run_id); sent++; }
        catch (e) { failed++; }
      }
      return { sent: sent, failed: failed };
    },

    ping: async function () { return post({ type: 'ping' }); }
  };

  window.Uploader = Uploader;
})();
