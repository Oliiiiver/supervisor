// 成就徽章:定义 + 判定。图标为手绘几何 SVG,与整站风格一致。
// 每个徽章的 test(ctx) 从既有数据自动判定;解锁即永久(持久化在数据层)。
window.Badges = (function () {

  // 所有图标共用的 SVG 外壳:32 视窗、2px 描边、无填充
  function icon(inner) {
    return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor"'
      + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + inner + "</svg>";
  }

  const LIST = [

    // ---------- 书法系列:每日全清 ----------
    {
      id: "first-task",
      name: "始于足下",
      desc: "完成第一项备考任务",
      icon: icon('<path d="M5 27h6v-6h6v-6h6v-6h4"/>'),
      test: ctx => ctx.herDoneCount >= 1,
    },
    {
      id: "first-allclear",
      name: "起笔入锋",
      desc: "第一次每日任务全清",
      icon: icon('<path d="M16 4l5 13c0 5-10 5-10 0z"/><path d="M16 22v6"/>'),
      test: ctx => ctx.allClearDays >= 1,
    },
    {
      id: "allclear-streak-7",
      name: "提按有度",
      desc: "累计 7 天任务全清",
      icon: icon('<path d="M4 20c4-8 8 4 12-4s8 2 12-4"/>'),
      test: ctx => ctx.allClearDays >= 7,
    },
    {
      id: "allclear-streak-30",
      name: "入木三分",
      desc: "累计 30 天任务全清",
      icon: icon('<rect x="5" y="20" width="22" height="6"/><path d="M16 4v12M11 12l5 5 5-5"/>'),
      test: ctx => ctx.allClearDays >= 30,
    },
    {
      id: "allclear-60",
      name: "退笔成冢",
      desc: "累计 60 天任务全清",
      icon: icon('<path d="M5 26l11-16 11 16z"/><path d="M13 15l-2-5M19 15l2-5"/>'),
      test: ctx => ctx.allClearDays >= 60,
    },
    {
      id: "allclear-90",
      name: "临池尽墨",
      desc: "累计 90 天任务全清",
      icon: icon('<ellipse cx="16" cy="21" rx="11" ry="5"/><path d="M16 4v8M13 9l3 3 3-3"/>'),
      test: ctx => ctx.allClearDays >= 90,
    },
    {
      id: "allclear-120",
      name: "力透纸背",
      desc: "累计 120 天任务全清",
      icon: icon('<rect x="7" y="4" width="18" height="15"/><path d="M16 8v18"/><path d="M12 22l4 4 4-4"/>'),
      test: ctx => ctx.allClearDays >= 120,
    },
    {
      id: "allclear-150",
      name: "登峰造极",
      desc: "累计 150 天任务全清",
      icon: icon('<path d="M4 27l9-15 5 8 4-7 6 14z"/><path d="M22 12V4M22 4h5v4h-5"/>'),
      test: ctx => ctx.allClearDays >= 150,
    },

    // ---------- 奖励系列 ----------
    {
      id: "first-redeem",
      name: "第一桶金",
      desc: "第一次花积分兑换奖品",
      icon: icon('<path d="M16 5l9 9-9 13-9-13z"/><path d="M7 14h18"/>'),
      test: ctx => ctx.redeemCount >= 1,
    },
    {
      id: "big-spender",
      name: "挥金如土",
      desc: "累计花费 10000 积分兑换奖品",
      icon: icon('<circle cx="10" cy="9" r="4"/><circle cx="22" cy="13" r="4"/><circle cx="13" cy="23" r="4"/>'),
      test: ctx => ctx.spentPoints >= 10000,
    },
    {
      id: "work-rest",
      name: "劳逸结合",
      desc: "累计兑换 7 次奖品",
      icon: icon('<path d="M6 13h16v5a8 8 0 0 1-16 0z"/><path d="M22 14h3a3 3 0 0 1-3 6"/><path d="M11 9V6M17 9V6"/>'),
      test: ctx => ctx.redeemCount >= 7,
    },
    {
      id: "self-love",
      name: "溺爱自己",
      desc: "累计添加 10 项奖品",
      icon: icon('<rect x="6" y="12" width="20" height="14"/><path d="M6 17h20M16 12v14"/><circle cx="12" cy="9" r="3"/><circle cx="20" cy="9" r="3"/>'),
      test: ctx => ctx.rewardCountAll >= 10,
    },

    // ---------- 模块精通系列:单组 ≥20 题且正确率 ≥90% ----------
    {
      id: "mod-changshi",
      name: "天文地理",
      desc: "常识单组 20 题以上正确率达 90%",
      icon: icon('<circle cx="16" cy="16" r="7"/><ellipse cx="16" cy="16" rx="13" ry="4.5"/>'),
      test: ctx => ctx.module90.changshi,
    },
    {
      id: "mod-yanyu",
      name: "声韵辞章",
      desc: "言语单组 20 题以上正确率达 90%",
      icon: icon('<path d="M5 6h22v14H15l-6 6v-6H5z"/>'),
      test: ctx => ctx.module90.yanyu,
    },
    {
      id: "mod-panduan",
      name: "青红皂白",
      desc: "判断单组 20 题以上正确率达 90%",
      icon: icon('<circle cx="16" cy="16" r="11"/><path d="M16 5a11 11 0 0 1 0 22" fill="currentColor" stroke="none"/>'),
      test: ctx => ctx.module90.panduan,
    },
    {
      id: "mod-shuliang",
      name: "锱铢分毫",
      desc: "数量单组 20 题以上正确率达 90%",
      icon: icon('<path d="M16 5v18M6 9h20"/><path d="M6 9l-4 8h8zM26 9l-4 8h8z"/><path d="M10 27h12"/>'),
      test: ctx => ctx.module90.shuliang,
    },
    {
      id: "mod-ziliao",
      name: "表里纵横",
      desc: "资料单组 20 题以上正确率达 90%",
      icon: icon('<path d="M5 5v22h22"/><path d="M11 22v-7M17 22v-12M23 22v-4"/>'),
      test: ctx => ctx.module90.ziliao,
    },
    {
      id: "mod-zhengzhi",
      name: "修齐治平",
      desc: "政治单组 20 题以上正确率达 90%",
      icon: icon('<rect x="7" y="7" width="18" height="18"/><rect x="12" y="12" width="8" height="8" fill="currentColor" stroke="none"/>'),
      test: ctx => ctx.module90.zhengzhi,
    },
    {
      id: "mod-tutui",
      name: "剥复损益",
      desc: "图推单组 20 题以上正确率达 90%",
      icon: icon('<path d="M6 10h20M6 16h8M18 16h8M6 22h20"/>'),
      test: ctx => ctx.module90.tutui,
    },

    // ---------- 文官系列:专项刷题次数 ----------
    {
      id: "drill-1",
      name: "题海初探",
      desc: "完成第一次专项刷题",
      icon: icon('<path d="M4 21c3-4 5-4 8 0s5 4 8 0 5-4 8 0"/><circle cx="16" cy="9" r="2.5"/>'),
      test: ctx => ctx.drillCount >= 1,
    },
    {
      id: "drill-30",
      name: "举人入仕",
      desc: "累计刷 500 题",
      icon: icon('<path d="M9 5h14v22H9z"/><path d="M13 11h6M13 16h6M13 21h6"/>'),
      test: ctx => ctx.totalQuestions >= 500,
    },
    {
      id: "drill-60",
      name: "加官拜爵",
      desc: "累计刷 1000 题",
      icon: icon('<path d="M9 17a7 7 0 0 1 14 0v5H9z"/><path d="M3 19h6M23 19h6"/>'),
      test: ctx => ctx.totalQuestions >= 1000,
    },
    {
      id: "drill-90",
      name: "六部沉浮",
      desc: "累计刷 1500 题",
      icon: icon('<rect x="5" y="8" width="6" height="6"/><rect x="13" y="8" width="6" height="6"/><rect x="21" y="8" width="6" height="6"/><rect x="5" y="18" width="6" height="6"/><rect x="13" y="18" width="6" height="6"/><rect x="21" y="18" width="6" height="6"/>'),
      test: ctx => ctx.totalQuestions >= 1500,
    },
    {
      id: "drill-120",
      name: "位列三公",
      desc: "累计刷 2000 题",
      icon: icon('<path d="M7 26V10M16 26V6M25 26V10"/><path d="M4 27h24M4 10h6M13 6h6M22 10h6"/>'),
      test: ctx => ctx.totalQuestions >= 2000,
    },
    {
      id: "drill-150",
      name: "权倾朝野",
      desc: "累计刷 2500 题",
      icon: icon('<rect x="8" y="14" width="16" height="12"/><path d="M12 14v-3a4 4 0 0 1 8 0v3"/><circle cx="16" cy="8" r="2"/>'),
      test: ctx => ctx.totalQuestions >= 2500,
    },

    // ---------- 武官系列:模考 ----------
    {
      id: "exam-1",
      name: "初出茅庐",
      desc: "第一次完成模考",
      icon: icon('<path d="M4 16L16 5l12 11"/><path d="M8 14v12h16V14"/><path d="M14 26v-7h4v7"/>'),
      test: ctx => ctx.examCount >= 1,
    },
    {
      id: "exam-5",
      name: "斩将先登",
      desc: "累计完成 5 套模考",
      icon: icon('<path d="M16 3v17M11 8l5-5 5 5"/><path d="M10 20h12M16 20v9M13 29h6"/>'),
      test: ctx => ctx.examCount >= 5,
    },
    {
      id: "exam-10",
      name: "勇冠三军",
      desc: "累计完成 10 套模考",
      icon: icon('<path d="M8 18a8 8 0 0 1 16 0v6H8z"/><path d="M16 10V4M16 24v4"/>'),
      test: ctx => ctx.examCount >= 10,
    },
    {
      id: "exam-15",
      name: "威震华夏",
      desc: "累计完成 15 套模考",
      icon: icon('<ellipse cx="16" cy="10" rx="10" ry="4"/><path d="M6 10v12c0 2 4 4 10 4s10-2 10-4V10"/>'),
      test: ctx => ctx.examCount >= 15,
    },
    {
      id: "exam-20",
      name: "封狼居胥",
      desc: "累计完成 20 套模考",
      icon: icon('<path d="M9 4v24"/><path d="M9 5h16l-4 5 4 5H9"/>'),
      test: ctx => ctx.examCount >= 20,
    },

    // ---------- 里程碑 ----------
    {
      id: "ready",
      name: "万事俱备",
      desc: "笔试前夜,一切就绪",
      icon: icon('<rect x="6" y="4" width="20" height="24"/><path d="M10 10l2 2 4-4M10 17l2 2 4-4M10 24l2 2 4-4"/>'),
      test: ctx => ctx.examEve,
    },
    {
      id: "ashore",
      name: "一鸣惊人",
      desc: "上岸之日,由监督员亲手颁发",
      icon: icon('<path d="M4 24h24"/><path d="M9 24a7 7 0 0 1 14 0"/><path d="M16 9V4M7 13l-3-3M25 13l3-3"/>'),
      test: ctx => ctx.ashore,
    },
    {
      id: "birthday",
      name: "生日快乐",
      desc: "11 月 30 日,这天最重要的不是备考",
      icon: icon('<rect x="7" y="17" width="18" height="10"/><path d="M7 21h18"/><path d="M16 13V9"/><circle cx="16" cy="6.5" r="1.5" fill="currentColor" stroke="none"/>'),
      test: ctx => ctx.birthdayWindow,
    },

    // ---------- 苛刻隐藏系列 ----------
    {
      id: "early-bird",
      name: "一日之际",
      desc: "北京时间早八前写下当天第一个任务",
      icon: icon('<circle cx="16" cy="18" r="10"/><path d="M16 12v6h5"/><path d="M6 8l4-3M26 8l-4-3"/>'),
      test: ctx => ctx.earlyBird,
    },
    {
      id: "decathlon",
      name: "十项全能",
      desc: "一日内完成十项备考任务",
      icon: icon('<path d="M18 3L8 18h6l-2 11 10-15h-6z"/>'),
      test: ctx => ctx.dayMaxDone >= 10,
    },
    {
      id: "first-msg",
      name: "沟通为上",
      desc: "第一次在留言板留言",
      icon: icon('<path d="M4 5h16v10H10l-4 4v-4H4z"/><path d="M24 13h4v9l-3-2h-9v-4"/>'),
      test: ctx => ctx.msgCount >= 1,
    },
    {
      id: "both-7",
      name: "倾盖如故",
      desc: "两人同日打卡累计 7 天",
      icon: icon('<circle cx="12" cy="16" r="8"/><circle cx="20" cy="16" r="8"/>'),
      test: ctx => ctx.bothDays >= 7,
    },
    {
      id: "both-30",
      name: "海内比邻",
      desc: "两人同日打卡累计 30 天",
      icon: icon('<rect x="5" y="10" width="13" height="13"/><rect x="14" y="9" width="13" height="13"/>'),
      test: ctx => ctx.bothDays >= 30,
    },
    {
      id: "both-60",
      name: "如切如磋",
      desc: "两人同日打卡累计 60 天",
      icon: icon('<path d="M8 12l8-7 8 7-8 15z"/><path d="M8 12h16"/><path d="M12 12l4 15 4-15"/>'),
      test: ctx => ctx.bothDays >= 60,
    },
    {
      id: "both-150",
      name: "同舟共济",
      desc: "两人同日打卡累计 150 天",
      icon: icon('<path d="M4 21h24l-4 6H8z"/><path d="M16 4v15M16 6l8 9H16"/>'),
      test: ctx => ctx.bothDays >= 150,
    },
  ];

  return { LIST: LIST };
})();
