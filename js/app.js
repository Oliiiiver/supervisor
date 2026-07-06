// 页面逻辑:tab 切换、各模块渲染、表单事件。
(function () {

  const $ = sel => document.querySelector(sel);

  const DAILY_CAP = 100; // 每日积分上限(只作用于备考任务)

  // 两人各自的时区:备考任务按北京时间翻页,陪跑任务按伦敦时间翻页。
  // 这样无论谁在何时打开,看到的都是"她的今天 + 他的今天",视图完全一致。
  const TZ_HER = "Asia/Shanghai";
  const TZ_SUP = "Europe/London";

  function dateInTZ(tz, d) {
    // en-CA 的日期格式正好是 YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d || new Date());
  }

  function todayHer() { return dateInTZ(TZ_HER); }
  function todaySup() { return dateInTZ(TZ_SUP); }

  function prevDate(iso) {
    return new Date(Date.parse(iso) - 86400000).toISOString().slice(0, 10);
  }

  function fmtDate(iso) {
    return iso ? iso.slice(5).replace("-", "/") : "";
  }

  function isSup() {
    return document.body.classList.contains("supervisor");
  }

  // ---------- Tab 切换 ----------

  function activateTab(name) {
    const btn = document.querySelector('.tab[data-tab="' + name + '"]');
    if (!btn) return;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $("#tab-" + name).classList.add("active");
  }

  $("#tabs").addEventListener("click", function (e) {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    activateTab(btn.dataset.tab);
    history.replaceState(null, "", "#" + btn.dataset.tab);
  });

  // 支持 #rewards / #track / #board 直达
  if (location.hash) activateTab(location.hash.slice(1));

  // ---------- 监督员模式 ----------

  const supToggle = $("#supervisor-toggle");
  supToggle.checked = localStorage.getItem("supervisor-mode") === "1";
  document.body.classList.toggle("supervisor", supToggle.checked);
  supToggle.addEventListener("change", function () {
    document.body.classList.toggle("supervisor", supToggle.checked);
    localStorage.setItem("supervisor-mode", supToggle.checked ? "1" : "0");
    refresh();
  });

  // ---------- 小工具 ----------

  // 积分 = 完成情况 × 赋分,按完成那天(北京时间)聚合,每日上限 100 分。
  // 全部由任务实时推导,不落库:事后赋分、改分、取消打卡,积分自动跟着变,
  // 不存副本就永远不会不一致(流水表里的"任务"行也是现算出来的)
  function earnDay(t) {
    return t.done_at ? dateInTZ(TZ_HER, new Date(t.done_at)) : t.date;
  }

  // date → { raw, capped, n } 只统计她的已完成任务
  function earningsByDay(tasks) {
    const byDay = {};
    for (const t of tasks) {
      if (t.owner !== "her" || !t.done || t.points <= 0) continue;
      const d = earnDay(t);
      const e = byDay[d] || (byDay[d] = { raw: 0, n: 0 });
      e.raw += t.points;
      e.n++;
    }
    for (const d in byDay) byDay[d].capped = Math.min(DAILY_CAP, byDay[d].raw);
    return byDay;
  }

  function totalEarned(tasks) {
    const byDay = earningsByDay(tasks);
    let s = 0;
    for (const d in byDay) s += byDay[d].capped;
    return s;
  }

  function earnedToday(tasks) {
    const e = earningsByDay(tasks)[todayHer()];
    return e ? e.capped : 0;
  }

  // 当前连续打卡天数,从 anchor(当事人时区的今天)或其前一天往回数
  function currentStreak(dateSet, anchor) {
    let streak = 0;
    let d = anchor;
    if (!dateSet.has(d)) d = prevDate(d);
    while (dateSet.has(d)) {
      streak++;
      d = prevDate(d);
    }
    return streak;
  }

  function doneDates(tasks, owner) {
    return new Set(tasks.filter(t => t.owner === owner && t.done).map(t => t.date));
  }

  // 按日期归并备考任务:date → { total, done }
  function herTaskDays(tasks) {
    const byDate = {};
    for (const t of tasks) {
      if (t.owner !== "her") continue;
      const d = byDate[t.date] || (byDate[t.date] = { total: 0, done: 0 });
      d.total++;
      if (t.done) d.done++;
    }
    return byDate;
  }

  // 全清天数:有任务且全部完成的日子(只看备考任务)
  function allClearDays(tasks) {
    const byDate = herTaskDays(tasks);
    let n = 0;
    for (const k in byDate) {
      if (byDate[k].done === byDate[k].total) n++;
    }
    return n;
  }

  // 最长连续全清:只看有任务的日子,休息日(没安排任务)跳过、不断链;
  // 有任务但没做完的那天,连击归零。今天没做完不算断(还没过完)。
  function maxAllClearStreak(tasks) {
    const byDate = herTaskDays(tasks);
    const dates = Object.keys(byDate).sort();
    const today = todayHer();
    let best = 0, run = 0;
    for (const k of dates) {
      if (byDate[k].done === byDate[k].total) {
        run++;
        best = Math.max(best, run);
      } else if (k !== today) {
        run = 0;
      }
    }
    return best;
  }

  // 点赞按钮(监督员可点,学习者只看):实心 = 监督员看过并点了赞
  function likeButton(item, setLiked) {
    const btn = document.createElement("button");
    btn.className = "like-btn" + (item.liked ? " liked" : "");
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15"'
      + ' fill="' + (item.liked ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M8 11l4-7c1.7 0 3 1.3 3 3l-.7 3.2H19c1.3 0 2.3 1.2 2 2.5l-1.1 4.8c-.3 1.2-1.3 2.5-2.5 2.5H8z"/>'
      + '<path d="M8 11H4v9h4z"/></svg>';
    if (isSup()) {
      btn.title = item.liked ? "取消赞" : "点个赞";
      btn.addEventListener("click", async function () {
        await setLiked(!item.liked);
        refresh();
      });
    } else {
      btn.disabled = true;
      btn.title = item.liked ? "监督员点了赞" : "";
      if (!item.liked) btn.classList.add("like-hidden"); // 没赞过就不显示空心,免得像催
    }
    return btn;
  }

  // ---------- 渲染:项目管理 ----------

  let wasAllClear = null; // null = 初次渲染,不庆祝

  function taskRow(t, ledgerEarnedFn) {
    const li = document.createElement("li");
    li.className = "task-item" + (t.done ? " done" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "task-check";
    cb.checked = t.done;
    cb.addEventListener("change", async function () {
      if (cb.checked) {
        const rect = cb.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        if (t.owner === "her") {
          await Store.setTaskDone(t, true);
          Juice.burst(cx, cy);
          if (t.points > 0) {
            // 这一勾实际带来的分 = 含它时今天的分 − 不含它时今天的分(日上限内)
            const fresh = await Store.listTasks();
            const gained = earnedToday(fresh) - earnedToday(fresh.filter(x => x.id !== t.id));
            if (gained > 0) Juice.floatText(cx + 24, cy, "+" + gained + " 分");
          }
        } else {
          await Store.setTaskDone(t, true); // 陪跑任务不进积分经济
          Juice.burst(cx, cy, { n: 16, power: 60 });
        }
      } else {
        await Store.setTaskDone(t, false);
      }
      refresh();
    });

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = t.title;

    li.append(cb, title);

    if (t.owner === "her" && t.done) {
      li.append(likeButton(t, liked => Store.setTaskLiked(t.id, liked)));
    }

    if (t.owner === "her") {
      if (isSup()) {
        const pts = document.createElement("input");
        pts.type = "number";
        pts.className = "task-pts-input";
        pts.min = 0;
        pts.max = 100;
        pts.value = t.points;
        pts.title = "分值(改完自动保存)";
        pts.addEventListener("change", async function () {
          await Store.updateTaskPoints(t.id, Math.min(parseInt(pts.value, 10) || 0, DAILY_CAP));
          refresh(); // 积分实时推导,事后赋分不需要补账
        });
        li.append(pts);
      } else {
        const pts = document.createElement("span");
        pts.className = "task-pts";
        pts.textContent = t.points > 0 ? "+" + t.points : "待赋分";
        li.append(pts);
      }
    }

    if (isSup()) {
      const del = document.createElement("button");
      del.className = "task-del";
      del.textContent = "×";
      del.title = "删除任务";
      del.addEventListener("click", async function () {
        if (!confirm("删除任务「" + t.title + "」?")) return;
        await Store.deleteTask(t.id);
        refresh();
      });
      li.append(del);
    }
    return li;
  }

  async function renderPlan() {
    const tHer = todayHer();
    const tSup = todaySup();
    // 逾期自清:昨天没做完的任务今天自动消失(软删除,全清判定仍算数)
    await Store.dismissOverdue(tHer, tSup);
    const [settings, phases, tasks] = await Promise.all([
      Store.getSettings(), Store.listPhases(), Store.listTasks(),
    ]);

    // 倒计时(考试在国内,按北京时间算)
    if (settings.exam_date) {
      const days = Math.ceil((new Date(settings.exam_date) - new Date(tHer)) / 86400000);
      $("#countdown-days").textContent = days >= 0 ? days : "—";
      $("#exam-meta").textContent = (settings.exam_name || "考试") + " · " + settings.exam_date;
      $("#exam-name").value = settings.exam_name || "";
      $("#exam-date").value = settings.exam_date;
    } else {
      $("#countdown-days").textContent = "–";
      $("#exam-meta").textContent = "尚未设置考试日期";
    }

    // 阶段路线
    const currentPhase = phases.find(p => p.id === settings.current_phase) || phases[0];
    const currentSort = currentPhase ? currentPhase.sort : 0;

    const bar = $("#phase-bar");
    const list = $("#phase-list");
    bar.innerHTML = "";
    list.innerHTML = "";

    for (const p of phases) {
      const state = p.sort < currentSort ? "done" : (p.sort === currentSort ? "current" : "");

      const seg = document.createElement("div");
      seg.className = "phase-seg " + state;
      seg.style.flexGrow = 1;
      bar.appendChild(seg);

      const li = document.createElement("li");
      li.className = state;
      li.innerHTML = '<span class="phase-name">' + p.name + '</span>'
        + '<span class="phase-range">'
        + (state === "done" ? "已完成" : state === "current" ? "进行中" : "未开始")
        + "</span>";
      if (isSup()) {
        li.classList.add("clickable");
        li.title = "设为当前阶段";
        li.addEventListener("click", async function () {
          await Store.saveSettings({ current_phase: p.id });
          refresh();
        });
      }
      list.appendChild(li);
    }
    $("#current-phase").textContent = currentPhase ? currentPhase.name : "—";

    // 今日任务,两列(各自时区的"今天")
    const todaysHer = tasks.filter(t => t.date === tHer && t.owner === "her");
    const todaysSup = tasks.filter(t => t.date === tSup && t.owner === "sup");
    const doneHer = todaysHer.filter(t => t.done);
    const earned = earnedToday(tasks);

    $("#today-done").textContent = doneHer.length;
    $("#today-total").textContent = todaysHer.length;
    $("#today-points").textContent = "今日获得 " + earned + " / " + DAILY_CAP + " 分";

    // 今日全清横幅(只在"刚刚达成"的那一下庆祝,页面刷新不重播)
    const isAllClear = todaysHer.length > 0 && doneHer.length === todaysHer.length;
    $("#allclear").hidden = !isAllClear;
    if (isAllClear) {
      $("#allclear-count").textContent = allClearDays(tasks);
      if (wasAllClear === false) {
        $("#allclear").classList.add("pop");
        Juice.bigBurst();
      }
    } else {
      $("#allclear").classList.remove("pop");
    }
    wasAllClear = isAllClear;

    const ulHer = $("#task-list-her");
    ulHer.innerHTML = "";
    $("#task-empty-her").hidden = todaysHer.length > 0;
    for (const t of todaysHer) ulHer.appendChild(taskRow(t));

    const ulSup = $("#task-list-sup");
    ulSup.innerHTML = "";
    $("#task-empty-sup").hidden = todaysSup.length > 0;
    for (const t of todaysSup) ulSup.appendChild(taskRow(t));

    if (!$("#task-date-her").value) $("#task-date-her").value = tHer;
    if (!$("#task-date-sup").value) $("#task-date-sup").value = tSup;
  }

  // ---------- 渲染:奖励机制 ----------

  async function renderRewards() {
    const [rewards, ledger, tasks] = await Promise.all([
      Store.listRewards(), Store.listLedger(), Store.listTasks(),
    ]);

    // 余额 = 实时推导的任务积分 − 兑换支出(旧版流水里的任务记账行直接忽略)
    const redeems = ledger.filter(e => e.kind === "redeem");
    const balance = totalEarned(tasks) + redeems.reduce((s, e) => s + e.delta, 0);
    $("#points-balance").textContent = balance;
    $("#streak-days").textContent = currentStreak(doneDates(tasks, "her"), todayHer());

    // 奖品目录
    const grid = $("#reward-grid");
    grid.innerHTML = "";
    $("#reward-empty").hidden = rewards.length > 0;

    for (const r of rewards) {
      const card = document.createElement("div");
      card.className = "reward-card";

      const head = document.createElement("div");
      head.className = "reward-head";

      const title = document.createElement("span");
      title.className = "reward-title";
      title.textContent = r.title;

      const del = document.createElement("button");
      del.className = "task-del";
      del.textContent = "×";
      del.title = "删除奖品";
      del.addEventListener("click", async function () {
        if (!confirm("删除奖品「" + r.title + "」?")) return;
        await Store.removeReward(r.id);
        refresh();
      });
      head.append(title, del);

      const costRow = document.createElement("div");
      costRow.className = "reward-cost";
      const costInput = document.createElement("input");
      costInput.type = "number";
      costInput.min = 1;
      costInput.value = r.cost;
      costInput.title = "分值(改完自动保存)";
      costInput.addEventListener("change", async function () {
        const v = parseInt(costInput.value, 10);
        if (v > 0) await Store.updateRewardCost(r.id, v);
        refresh();
      });
      costRow.append(costInput, document.createTextNode(" 分"));

      const btn = document.createElement("button");
      btn.textContent = "兑换";
      btn.disabled = balance < r.cost;
      btn.addEventListener("click", async function () {
        if (!confirm("花 " + r.cost + " 分兑换「" + r.title + "」?")) return;
        await Store.addLedger({
          delta: -r.cost, reason: "兑换:" + r.title, kind: "redeem", reward_id: r.id,
        });
        refresh();
      });

      card.append(head, costRow, btn);
      grid.appendChild(card);
    }

    // 流水(最近 30 条):任务积分按日现算聚合 + 兑换记录
    const byDay = earningsByDay(tasks);
    const rows = [];
    for (const d in byDay) {
      rows.push({ date: d, kind: "任务", reason: "完成任务 × " + byDay[d].n, delta: byDay[d].capped });
    }
    for (const e of redeems) {
      rows.push({
        date: dateInTZ(TZ_HER, new Date(e.created_at)), kind: "兑换",
        reason: e.reason, delta: e.delta,
      });
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));

    const tbody = $("#ledger-table tbody");
    tbody.innerHTML = "";
    $("#ledger-empty").hidden = rows.length > 0;
    for (const r of rows.slice(0, 30)) {
      const tr = document.createElement("tr");
      const sign = r.delta > 0 ? "+" : "";
      tr.innerHTML = "<td>" + fmtDate(r.date) + "</td>"
        + "<td></td>"
        + '<td><span class="kind-tag">' + r.kind + "</span></td>"
        + '<td class="num ' + (r.delta > 0 ? "delta-pos" : "delta-neg") + '">'
        + sign + r.delta + "</td>";
      tr.children[1].textContent = r.reason;
      tbody.appendChild(tr);
    }
  }

  // ---------- 专项刷题看板 ----------

  // 她每天换一个模块练,混在一起看不出单科的进步;
  // 选中某个模块就只看它的走势 + 进步数字,选择记在本机
  const DRILL_FILTER_KEY = "supervisor-drill-filter";

  function drillFilter() {
    const v = localStorage.getItem(DRILL_FILTER_KEY);
    return v === "all" || (v && Charts.MODULE_LABEL[v]) ? v : "all";
  }

  function renderDrillFilter() {
    const wrap = $("#drill-filter");
    wrap.innerHTML = "";
    const current = drillFilter();
    const options = [["all", "全部"]].concat(
      Object.keys(Charts.MODULE_LABEL).map(k => [k, Charts.MODULE_LABEL[k]]));
    for (const [key, label] of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "drill-chip" + (key === current ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", function () {
        localStorage.setItem(DRILL_FILTER_KEY, key);
        refresh();
      });
      wrap.appendChild(btn);
    }
  }

  // 单模块的进步数字:按日聚合,最新 vs 上一次 vs 首练
  function renderDrillStats(shown, filter) {
    const box = $("#drill-stats");
    if (filter === "all" || !shown.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;

    const byDate = {};
    for (const d of shown) {
      const agg = byDate[d.date] || (byDate[d.date] = { total: 0, correct: 0 });
      agg.total += d.total;
      agg.correct += d.correct;
    }
    const dates = Object.keys(byDate).sort();
    const acc = date => Math.round(byDate[date].correct / byDate[date].total * 100);
    const latest = acc(dates[dates.length - 1]);

    $("#ds-latest").textContent = latest + "%";

    const prevEl = $("#ds-vs-prev");
    prevEl.className = "drill-stat-delta";
    if (dates.length >= 2) {
      const diff = latest - acc(dates[dates.length - 2]);
      prevEl.textContent = diff === 0 ? "持平 较上次"
        : (diff > 0 ? "↑ " : "↓ ") + Math.abs(diff) + " 较上次";
      prevEl.classList.add(diff > 0 ? "delta-pos" : "delta-neg");
    } else {
      prevEl.textContent = "";
    }

    $("#ds-vs-first").textContent = dates.length >= 2
      ? acc(dates[0]) + "% → " + latest + "%"
      : "首练日";

    const questions = shown.reduce((s, d) => s + d.total, 0);
    $("#ds-total").textContent = questions + " 题 · " + shown.length + " 组";
  }

  // ---------- 渲染:学习轨迹 ----------

  async function renderTrack() {
    const [tasks, drills, exams, ledger, settings, messages, rewardCountAll, persisted] =
      await Promise.all([
        Store.listTasks(), Store.listDrills(), Store.listExams(), Store.listLedger(),
        Store.getSettings(), Store.listMessages(), Store.countAllRewards(),
        Store.listBadgeUnlocks(),
      ]);

    const herDates = doneDates(tasks, "her");
    const supDates = doneDates(tasks, "sup");

    // 累计数字:只涨不跌
    const totalQuestions = drills.reduce((s, d) => s + d.total, 0);
    const studyDates = new Set([...herDates, ...drills.map(d => d.date)]);
    const cumPoints = totalEarned(tasks); // 历史总积分:兑换不扣,实时推导
    $("#cum-questions").textContent = totalQuestions;
    $("#cum-days").textContent = studyDates.size;
    $("#cum-points").textContent = cumPoints;

    // 双人热力图 + 共同打卡(各按当事人时区锚定"今天")
    Charts.renderHeatmap($("#heatmap-her"), tasks.filter(t => t.owner === "her"), 16, todayHer());
    Charts.renderHeatmap($("#heatmap-sup"), tasks.filter(t => t.owner === "sup"), 16, todaySup());
    $("#hm-streak-her").textContent = currentStreak(herDates, todayHer());
    $("#hm-streak-sup").textContent = currentStreak(supDates, todaySup());
    const bothDays = [...herDates].filter(d => supDates.has(d)).length;
    $("#both-days").textContent = bothDays;

    // ---- 成就墙 ----

    // 模块精通:单组 ≥20 题且正确率 ≥90%
    const module90 = {};
    for (const key in Charts.MODULE_LABEL) module90[key] = false;
    for (const d of drills) {
      if (d.total >= 20 && d.correct / d.total >= 0.9) module90[d.module] = true;
    }

    // 单日完成备考任务数峰值
    const doneByDate = {};
    for (const t of tasks) {
      if (t.owner === "her" && t.done) doneByDate[t.date] = (doneByDate[t.date] || 0) + 1;
    }

    // 一日之际:她本人在北京时间早八前创建当天的任务。
    // 监督员排的任务不算——伦敦的傍晚恰好是北京的凌晨,否则他排明天的课表就会误触发
    const earlyBird = tasks.some(function (t) {
      if (t.owner !== "her" || !t.created_at) return false;
      if ((t.created_by || "her") === "sup") return false;
      const bj = new Date(new Date(t.created_at).getTime() + 8 * 3600e3);
      return bj.getUTCHours() < 8 && bj.toISOString().slice(0, 10) === t.date;
    });

    // 万事俱备:笔试前一天起自动解锁(考试与生日都按北京时间)
    const tHer = todayHer();
    let examEve = false;
    if (settings.exam_date) {
      examEve = tHer >= prevDate(settings.exam_date) && tHer <= settings.exam_date;
    }

    // 生日快乐:11 月 30 日起一个月的窗口内解锁(解锁即永久)
    const monthDay = tHer.slice(5);
    const birthdayWindow = monthDay >= "11-30" || monthDay.slice(0, 2) === "12";

    const ctx = {
      herDoneCount: tasks.filter(t => t.owner === "her" && t.done).length,
      allClearDays: allClearDays(tasks),
      maxAllClearStreak: maxAllClearStreak(tasks),
      redeemCount: ledger.filter(e => e.kind === "redeem").length,
      spentPoints: ledger.filter(e => e.kind === "redeem").reduce((s, e) => s - e.delta, 0),
      rewardCountAll: rewardCountAll,
      module90: module90,
      drillCount: drills.length,
      totalQuestions: totalQuestions, // 文官系列按累计题数

      examCount: exams.length,
      bothDays: bothDays,
      dayMaxDone: Math.max(0, ...Object.values(doneByDate)),
      earlyBird: earlyBird,
      msgCount: messages.filter(m => (m.author || "her") !== "sup").length,
      ashore: !!settings.ashore,
      examEve: examEve,
      birthdayWindow: birthdayWindow,
    };

    // 解锁即永久:已持久化的直接算解锁,新达成的补记
    const persistedSet = new Set(persisted);
    const unlocked = Badges.LIST.filter(b => persistedSet.has(b.id) || b.test(ctx));
    const lockedCount = Badges.LIST.length - unlocked.length;
    const fresh = unlocked.filter(b => !persistedSet.has(b.id));
    if (fresh.length) {
      await Store.addBadgeUnlocks(fresh.map(b => b.id));
      fresh.forEach(function (b, i) {
        setTimeout(function () { Juice.badgeToast(b.icon, b.name); }, i * 700);
      });
      Juice.bigBurst();
    }

    // 监督员专属:颁发「一鸣惊人」
    const awardBtn = $("#award-ashore");
    awardBtn.hidden = !!settings.ashore;

    // Steam 式进度条
    const pct = Math.round(unlocked.length / Badges.LIST.length * 100);
    $("#ach-fill").style.width = pct + "%";
    $("#ach-count").textContent = "已解锁 " + unlocked.length + " / " + Badges.LIST.length + " · " + pct + "%";

    // 只展示已解锁的;未解锁的合并成一张"隐藏成就"卡
    const bgrid = $("#badge-grid");
    bgrid.innerHTML = "";
    for (const b of unlocked) {
      const el = document.createElement("div");
      el.className = "badge unlocked";
      el.innerHTML = '<div class="badge-icon">' + b.icon + '</div>'
        + '<div class="badge-name">' + b.name + '</div>'
        + '<div class="badge-desc">' + b.desc + '</div>';
      el.title = "已解锁";
      bgrid.appendChild(el);
    }
    if (lockedCount > 0) {
      const el = document.createElement("div");
      el.className = "badge";
      el.innerHTML = '<div class="badge-icon badge-q">?</div>'
        + '<div class="badge-name">隐藏成就 × ' + lockedCount + '</div>'
        + '<div class="badge-desc">该成就会在解锁后显示</div>';
      bgrid.appendChild(el);
    }

    // 专项刷题看板:全部总览,或选中单个模块只看它的走势与进步
    renderDrillFilter();
    const dFilter = drillFilter();
    const shown = dFilter === "all" ? drills : drills.filter(d => d.module === dFilter);

    const hasDrills = shown.length > 0;
    $("#drill-chart").parentElement.style.display = hasDrills ? "" : "none";
    $("#drill-chart-empty").hidden = hasDrills;
    $("#drill-chart-empty").textContent = dFilter === "all"
      ? "录入几组专项练习后,这里会画出各模块正确率的走势。"
      : "还没有「" + Charts.MODULE_LABEL[dFilter] + "」的刷题记录。";
    if (hasDrills) Charts.renderDrillChart($("#drill-chart"), shown);
    renderDrillStats(shown, dFilter);

    // 刷题记录表(最近的在上面,跟随上面的模块筛选)
    const dtbody = $("#drill-table tbody");
    dtbody.innerHTML = "";
    $("#drill-empty").hidden = hasDrills;
    for (const d of shown.slice().reverse().slice(0, 30)) {
      const tr = document.createElement("tr");
      const acc = Math.round(d.correct / d.total * 100);
      tr.innerHTML = "<td>" + fmtDate(d.date) + "</td>"
        + "<td>" + (Charts.MODULE_LABEL[d.module] || d.module) + "</td>"
        + '<td class="num">' + d.total + "</td>"
        + '<td class="num">' + (d.total - d.correct) + "</td>"
        + '<td class="num">' + acc + "%</td>"
        + '<td class="like-cell"></td>'
        + "<td></td>";
      tr.children[5].appendChild(likeButton(d, liked => Store.setDrillLiked(d.id, liked)));
      const del = document.createElement("button");
      del.className = "task-del";
      del.textContent = "×";
      del.title = "删除这条记录";
      del.addEventListener("click", async function () {
        if (!confirm("删除这条刷题记录?")) return;
        await Store.deleteDrill(d.id);
        refresh();
      });
      tr.lastChild.appendChild(del);
      dtbody.appendChild(tr);
    }
    if (!$("#drill-date").value) $("#drill-date").value = todayHer();

    // 模考记录(留框架,后期启用)
    const tbody = $("#exam-table tbody");
    tbody.innerHTML = "";
    $("#exam-empty").hidden = exams.length > 0;
    for (const e of exams.slice().reverse()) {
      const tr = document.createElement("tr");
      const cells = [
        fmtDate(e.date),
        e.changshi, e.yanyu, e.shuliang, e.panduan, e.ziliao,
        e.shenlun == null ? "—" : e.shenlun,
      ];
      tr.innerHTML = cells.map(function (v, i) {
        return '<td class="' + (i > 0 ? "num" : "") + '">' + v + (i > 0 && i < 6 && typeof v === "number" ? "%" : "") + "</td>";
      }).join("") + "<td></td>";
      tr.lastChild.textContent = e.notes || "";
      tbody.appendChild(tr);
    }
    if (!$("#exam-form-date").value) $("#exam-form-date").value = todayHer();
  }

  // ---------- 渲染:留言板 ----------

  async function renderBoard() {
    const messages = await Store.listMessages();
    const ul = $("#msg-list");
    ul.innerHTML = "";
    $("#msg-empty").hidden = messages.length > 0;

    for (const m of messages) {
      const li = document.createElement("li");
      li.className = "msg-item";

      const meta = document.createElement("div");
      meta.className = "msg-meta";
      meta.textContent = m.created_at.slice(0, 10).replace(/-/g, "/");

      if ((m.author || "her") === "sup") {
        const tag = document.createElement("span");
        tag.className = "kind-tag";
        tag.textContent = "监督员";
        meta.appendChild(tag);
      }

      if (isSup()) {
        const del = document.createElement("button");
        del.className = "task-del";
        del.textContent = "×";
        del.title = "处理完删除";
        del.addEventListener("click", async function () {
          if (!confirm("删除这条留言?")) return;
          await Store.deleteMessage(m.id);
          refresh();
        });
        meta.appendChild(del);
      }

      const text = document.createElement("div");
      text.className = "msg-text";
      text.textContent = m.text;

      li.append(meta, text);
      ul.appendChild(li);
    }
  }

  // ---------- 表单事件 ----------

  $("#task-form-her").addEventListener("submit", async function (e) {
    e.preventDefault();
    const pts = isSup() ? (parseInt($("#task-points-her").value, 10) || 0) : 0;
    await Store.addTask({
      title: $("#task-title-her").value.trim(),
      points: Math.min(pts, DAILY_CAP),
      date: $("#task-date-her").value,
      owner: "her",
      created_by: isSup() ? "sup" : "her",
    });
    $("#task-title-her").value = "";
    $("#task-points-her").value = "";
    refresh();
  });

  $("#task-form-sup").addEventListener("submit", async function (e) {
    e.preventDefault();
    await Store.addTask({
      title: $("#task-title-sup").value.trim(),
      points: 0,
      date: $("#task-date-sup").value,
      owner: "sup",
      created_by: isSup() ? "sup" : "her",
    });
    $("#task-title-sup").value = "";
    refresh();
  });

  $("#settings-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    await Store.saveSettings({
      exam_name: $("#exam-name").value.trim(),
      exam_date: $("#exam-date").value || null,
    });
    refresh();
  });

  $("#reward-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    await Store.addReward({
      title: $("#reward-title").value.trim(),
      cost: parseInt($("#reward-cost").value, 10),
      created_by: isSup() ? "sup" : "her",
    });
    $("#reward-title").value = "";
    $("#reward-cost").value = "";
    refresh();
  });

  $("#drill-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const total = parseInt($("#drill-total").value, 10);
    const wrong = parseInt($("#drill-wrong").value, 10);
    if (wrong > total) {
      alert("错的题数不能超过题数。");
      return;
    }
    await Store.addDrill({
      date: $("#drill-date").value,
      module: $("#drill-module").value,
      total: total,
      correct: total - wrong, // 她习惯记错题数,库里仍存对题数
      liked: false,
    });
    $("#drill-total").value = "";
    $("#drill-wrong").value = "";
    refresh();
  });

  $("#exam-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const val = id => {
      const v = $(id).value;
      return v === "" ? null : parseInt(v, 10);
    };
    await Store.addExam({
      date: $("#exam-form-date").value,
      changshi: val("#exam-changshi"),
      yanyu: val("#exam-yanyu"),
      shuliang: val("#exam-shuliang"),
      panduan: val("#exam-panduan"),
      ziliao: val("#exam-ziliao"),
      shenlun: val("#exam-shenlun"),
      notes: $("#exam-notes").value.trim(),
    });
    this.reset();
    refresh();
  });

  $("#board-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const text = $("#board-text").value.trim();
    if (!text) return;
    await Store.addMessage(text, isSup() ? "sup" : "her");
    $("#board-text").value = "";
    refresh();
  });

  $("#award-ashore").addEventListener("click", async function () {
    if (!confirm("确认她已经上岸,颁发「一鸣惊人」?此操作不可撤销。")) return;
    await Store.saveSettings({ ashore: true });
    refresh();
  });

  $("#reset-demo").addEventListener("click", function () {
    if (confirm("清空本机所有数据并恢复初始状态?此操作不可撤销。")) Store.resetLocal();
  });

  // 深浅色切换时重绘图表
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refresh);

  // ---------- 启动 ----------

  async function refresh() {
    await Promise.all([renderPlan(), renderRewards(), renderTrack(), renderBoard()]);
  }

  (async function () {
    Pomodoro.init($("#pomo-chip"));
    await Store.init();
    const local = Store.mode() === "local";
    $("#demo-badge").hidden = !local;
    $("#reset-demo").hidden = !local;
    $("#mode-label").textContent = local
      ? "本地模式 · 数据仅存本机(配置 Supabase 后自动切换云端同步,见 README)"
      : "云端模式 · 数据实时同步";
    await refresh();
  })();

})();
