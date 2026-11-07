/*
 * 視覺追蹤測驗（LVT）線條幾何
 * 每條線在正規化座標中為 y = f(x)，x 由 0（起點側）到 1（終點側），因此線條不會回頭。
 * 同一份程式碼同時供瀏覽器繪圖與 tools/generate-items.js 題目產生與檢核使用。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LvtGeom = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 控制點的 x 位置：頭尾兩段為水平引線，中間 5 個為隨機高度
  var CX = [0, 0.035, 0.17, 0.33, 0.5, 0.67, 0.83, 0.965, 1];
  var N_MID = CX.length - 4;

  function slotY(i, n) { return (i + 0.5) / n; }

  function controlYs(line, n) {
    var y0 = slotY(line.s, n), y1 = slotY(line.e, n);
    return [y0, y0].concat(line.m, [y1, y1]);
  }

  function tangents(ys) {
    var m = new Array(ys.length);
    for (var k = 0; k < ys.length; k++) {
      if (k <= 1 || k >= ys.length - 2) m[k] = 0;
      else m[k] = (ys[k + 1] - ys[k - 1]) / (CX[k + 1] - CX[k - 1]);
    }
    return m;
  }

  /* 預先計算一條線的控制資料 */
  function prepare(line, n) {
    var ys = controlYs(line, n);
    return { ys: ys, ms: tangents(ys) };
  }

  /* 計算位置 x 的 y 與斜率 */
  function evalAt(p, x) {
    var k = 0;
    while (k < CX.length - 2 && x > CX[k + 1]) k++;
    var h = CX[k + 1] - CX[k];
    var t = (x - CX[k]) / h;
    var t2 = t * t, t3 = t2 * t;
    var y0 = p.ys[k], y1 = p.ys[k + 1], m0 = p.ms[k] * h, m1 = p.ms[k + 1] * h;
    var y = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
    var dy = ((6 * t2 - 6 * t) * y0 + (3 * t2 - 4 * t + 1) * m0 + (-6 * t2 + 6 * t) * y1 + (3 * t2 - 2 * t) * m1) / h;
    return { y: y, s: dy };
  }

  /* 取樣整條線 */
  function sample(line, n, count) {
    var p = prepare(line, n), pts = [];
    for (var i = 0; i <= count; i++) {
      var x = i / count, r = evalAt(p, x);
      pts.push([x, r.y, r.s]);
    }
    return pts;
  }

  /* ---------- 題目檢核（供產生器使用） ---------- */
  var RULES = {
    samples: 800,
    yMin: 0.02, yMax: 0.98,     // 線條不可超出版面
    maxSlope: 3.2,              // 線條不可過陡
    closeDist: 0.025,           // 兩線距離小於此值時視為「靠近」
    minSlopeDiff: 0.8,          // 靠近處兩線斜率差需大於此值（避免平行貼合或小角度交叉）
    minCrossGap: 0.035,         // 不同交叉點之間的最小距離（避免三線交會）
    maxPairCrossings: 3
  };

  function checkLine(pts) {
    for (var i = 0; i < pts.length; i++) {
      if (pts[i][1] < RULES.yMin || pts[i][1] > RULES.yMax) return 'out_of_bounds';
      if (Math.abs(pts[i][2]) > RULES.maxSlope) return 'too_steep';
    }
    return null;
  }

  /* 檢查兩條線；回傳 {ok, crossings:[[x,y],...]} */
  function checkPair(a, b) {
    var crossings = [];
    for (var i = 0; i < a.length; i++) {
      var d = a[i][1] - b[i][1];
      if (Math.abs(d) < RULES.closeDist && Math.abs(a[i][2] - b[i][2]) < RULES.minSlopeDiff) {
        return { ok: false, reason: 'shallow_or_touching' };
      }
      if (i > 0) {
        var dp = a[i - 1][1] - b[i - 1][1];
        if ((dp < 0 && d >= 0) || (dp > 0 && d <= 0)) {
          var f = dp / (dp - d);
          var x = a[i - 1][0] + f * (a[i][0] - a[i - 1][0]);
          var y = a[i - 1][1] + f * (a[i][1] - a[i - 1][1]);
          crossings.push([x, y]);
        }
      }
    }
    if (crossings.length > RULES.maxPairCrossings) return { ok: false, reason: 'too_many_crossings' };
    return { ok: true, crossings: crossings };
  }

  function crossTooClose(newCrossings, existing) {
    for (var i = 0; i < newCrossings.length; i++) {
      for (var j = 0; j < existing.length; j++) {
        var dx = newCrossings[i][0] - existing[j][0], dy = newCrossings[i][1] - existing[j][1];
        if (dx * dx + dy * dy < RULES.minCrossGap * RULES.minCrossGap) return true;
      }
      for (var k = i + 1; k < newCrossings.length; k++) {
        var ex = newCrossings[i][0] - newCrossings[k][0], ey = newCrossings[i][1] - newCrossings[k][1];
        if (ex * ex + ey * ey < RULES.minCrossGap * RULES.minCrossGap) return true;
      }
    }
    return false;
  }

  /* 完整檢核一道題目；回傳 {ok, reason, targetCrossings, totalCrossings} */
  function validateItem(item) {
    var pts = item.lines.map(function (l) { return sample(l, item.n, RULES.samples); });
    var all = [], targetCross = 0, ends = {};
    for (var i = 0; i < item.lines.length; i++) {
      if (ends[item.lines[i].e]) return { ok: false, reason: 'duplicate_end' };
      ends[item.lines[i].e] = true;
      var r0 = checkLine(pts[i]); if (r0) return { ok: false, reason: r0 };
      for (var j = 0; j < i; j++) {
        var r = checkPair(pts[i], pts[j]);
        if (!r.ok) return { ok: false, reason: r.reason };
        if (crossTooClose(r.crossings, all)) return { ok: false, reason: 'crossings_too_close' };
        all = all.concat(r.crossings);
        if (item.lines[i].s === item.target || item.lines[j].s === item.target) targetCross += r.crossings.length;
      }
    }
    var tl = item.lines.filter(function (l) { return l.s === item.target; })[0];
    if (!tl || tl.e !== item.answer) return { ok: false, reason: 'answer_mismatch' };
    return { ok: true, targetCrossings: targetCross, totalCrossings: all.length };
  }

  return {
    CX: CX, N_MID: N_MID, RULES: RULES,
    slotY: slotY, prepare: prepare, evalAt: evalAt, sample: sample,
    checkLine: checkLine, checkPair: checkPair, crossTooClose: crossTooClose,
    validateItem: validateItem
  };
});
