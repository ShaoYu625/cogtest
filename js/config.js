/*
 * ====== 研究者設定檔 ======
 * 部署前唯一「必須」修改的是 endpoint（Google Apps Script 網址）。
 * 其他參數請在正式收案前試行確認，收案開始後請勿再更改。
 */
window.TEST_CONFIG = {
  appVersion: '1.0.0',
  studyTitle: '認知作業施測系統',

  // Google Apps Script「網頁應用程式」網址，例如：
  // 'https://script.google.com/macros/s/AKfycb..../exec'
  // 留空時資料不會上傳，只能在結束畫面下載備份檔（適合本機試用）。
  endpoint: '',

  // 兩項測驗之間的休息秒數（研究計畫：1 分鐘）
  breakBetweenTestsSec: 60,

  // 結束畫面是否直接顯示分數（建議 false，避免影響後測動機；研究者可展開「研究者資訊」查看）
  showScoresToParticipant: false,

  corsi: {
    startLength: 2,          // 起始序列長度
    maxLength: 9,            // 最長序列長度（9 個方塊）
    passCount: 2,            // 每個長度至少答對幾題才算通過（UBS 定義：至少兩次正確）
    // 每個長度最多 3 題；答對 2 題即進入下一長度，答錯 2 題即停止
    highlightMs: 700,        // 每個方塊亮起時間
    gapMs: 300,              // 方塊之間的間隔（每個方塊合計 1 秒）
    preTrialMs: 1000,        // 每題開始前的準備時間
    interTrialMs: 800,       // 題與題之間的間隔
    practiceMaxRounds: 2     // 練習有錯時最多重做幾輪
  },

  lvt: {
    itemTimeLimitMs: 20000,  // 每題時限（S 分數只計算觀看時間在此時限內且答對的題目）— 請試行後確認
    hardCapMs: 60000,        // 單題最長觀看時間，超過即自動進入作答
    minViewMs: 200,          // 按住少於此時間視為誤觸，重新按住
    answerArmMs: 300,        // 作答鍵出現後的防誤觸時間
    interItemMs: 400         // 題與題之間的間隔
  }
};
