// 初始数据 — 未配置 Supabase 时,首次打开用它初始化本地存储。
// 内容是干净的起始状态:四个阶段、一个奖品,其余留空。
window.DemoData = (function () {

  function seed() {
    return {
      settings: {
        exam_name: "",
        exam_date: null,
        current_phase: 2,   // 当前处于「专项刷题」
        ashore: false,      // 上岸(「一鸣惊人」由监督员手动颁发)
      },
      phases: [
        { id: 1, name: "理论学习", sort: 1 },
        { id: 2, name: "专项刷题", sort: 2 },
        { id: 3, name: "查缺补漏", sort: 3 },
        { id: 4, name: "定时刷题", sort: 4 },
      ],
      tasks: [],
      goals: [],
      rewards: [
        { id: 1, title: "休息半天", cost: 500, active: true },
      ],
      ledger: [],
      exams: [],
      drills: [],
      messages: [],
      badges: [],   // 已解锁成就 id(解锁即永久)
      vouchers: [], // 兑奖券(累计积分每满 1500 开宝箱领取)
      seq: { task: 1, goal: 1, ledger: 1, reward: 2, exam: 1, drill: 1, message: 1, voucher: 1 },
    };
  }

  return { seed: seed };
})();
