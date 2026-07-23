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
    updateBoardDot(); // 进出留言板时同步角标显隐
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

  // 积分 = 完成情况 × 赋分 × 幸运倍数,按完成那天(北京时间)聚合,每日上限 100 分。
  // 全部由任务实时推导,不落库:事后赋分、改分、取消打卡,积分自动跟着变,
  // 不存副本就永远不会不一致(流水表里的"任务"行也是现算出来的)
  function earnDay(t) {
    return t.done_at ? dateInTZ(TZ_HER, new Date(t.done_at)) : t.date;
  }

  // 首次完成任务时抽签:1% 十倍,20% 双倍。结果落库,取消重勾不重抽
  // (不然反复勾选就能刷出十倍)。倍数乘在赋分上,事后赋分同样享受
  function rollLuck() {
    const r = Math.random();
    return r < 0.01 ? 10 : r < 0.21 ? 2 : 1;
  }

  // date → { raw, bonus, capped, n } 只统计她的已完成任务。
  // 日上限只管基础分;幸运加成(倍数多出来的部分)不受上限,不然十倍就名存实亡
  function earningsByDay(tasks) {
    const byDay = {};
    for (const t of tasks) {
      if (t.owner !== "her" || !t.done || t.points <= 0) continue;
      const d = earnDay(t);
      const e = byDay[d] || (byDay[d] = { raw: 0, bonus: 0, n: 0 });
      e.raw += t.points;
      e.bonus += t.points * ((t.multiplier || 1) - 1);
      e.n++;
    }
    for (const d in byDay) byDay[d].capped = Math.min(DAILY_CAP, byDay[d].raw) + byDay[d].bonus;
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
          const mult = t.multiplier || rollLuck(); // 已抽过就沿用,没抽过现抽
          await Store.setTaskDone(t, true, t.multiplier ? undefined : mult);
          Juice.burst(cx, cy);
          if (mult >= 10) {
            Juice.bigBurst();
            Juice.floatText(cx + 24, cy - 26, "×10 十倍暴击!");
          } else if (mult === 2) {
            Juice.floatText(cx + 24, cy - 26, "×2 双倍!");
          }
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
      // 抽中过倍数的任务挂个小签;待赋分也挂,让她知道这一签已经中了
      const luck = (t.multiplier || 1) > 1 ? (function () {
        const chip = document.createElement("span");
        chip.className = "luck-chip" + (t.multiplier >= 10 ? " luck-ten" : "");
        chip.textContent = "×" + t.multiplier;
        chip.title = t.multiplier >= 10 ? "十倍积分!" : "双倍积分";
        return chip;
      })() : null;

      if (isSup()) {
        const pts = document.createElement("input");
        pts.type = "number";
        pts.className = "task-pts-input";
        pts.min = 0;
        pts.max = 100;
        pts.value = t.points;
        pts.title = "分值(改完自动保存)" + (luck ? ",实得 = 分值 × " + t.multiplier : "");
        pts.addEventListener("change", async function () {
          await Store.updateTaskPoints(t.id, Math.min(parseInt(pts.value, 10) || 0, DAILY_CAP));
          refresh(); // 积分实时推导,事后赋分不需要补账
        });
        if (luck) li.append(luck);
        li.append(pts);
      } else {
        const pts = document.createElement("span");
        pts.className = "task-pts";
        pts.textContent = t.points > 0 ? "+" + t.points * (t.multiplier || 1) : "待赋分";
        if (luck) li.append(luck);
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

  // ---------- 任务目标(阶段主线) ----------

  // 钉在任务列顶上的主线:这段时间每天的任务都在推进它,不用天天重写。
  // 原地可编辑(内容和截止日都能改);过了当事人时区的截止日就自动消失,记录保留
  function renderGoal(slotId, goals, owner, today) {
    const slot = $(slotId);
    slot.innerHTML = "";
    const active = goals
      .filter(g => g.owner === owner && g.due >= today)
      .sort((a, b) => b.id - a.id)[0];

    function showForm(g) {
      const f = document.createElement("form");
      f.className = "goal-form";

      const text = document.createElement("textarea");
      text.rows = 2;
      text.required = true;
      text.placeholder = "这段时间的主线,如:完成文献综述初稿";
      text.value = g ? g.text : "";

      const row = document.createElement("div");
      row.className = "goal-form-row";
      const date = document.createElement("input");
      date.type = "date";
      date.required = true;
      date.value = g ? g.due : "";
      date.min = today; // 想提前收线就把截止日改成今天,明天自动消失
      date.title = "最后一天(含当天),过了自动消失";
      const save = document.createElement("button");
      save.type = "submit";
      save.textContent = g ? "保存" : "钉上";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "取消";
      cancel.addEventListener("click", function () {
        renderGoal(slotId, goals, owner, today);
      });
      row.append(date, save, cancel);
      f.append(text, row);

      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        const v = text.value.trim();
        if (!v) return;
        if (g) await Store.updateGoal(g.id, { text: v, due: date.value });
        else await Store.addGoal({ owner: owner, text: v, due: date.value });
        refresh();
      });

      slot.innerHTML = "";
      slot.appendChild(f);
      text.focus();
    }

    if (active) {
      const box = document.createElement("div");
      box.className = "goal-banner";

      const meta = document.createElement("div");
      meta.className = "goal-meta";
      const left = Math.round((Date.parse(active.due) - Date.parse(today)) / 86400000);
      const label = document.createElement("span");
      label.textContent = "任务目标 · 至 " + fmtDate(active.due)
        + (left === 0 ? " · 最后一天" : " · 还剩 " + left + " 天");
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "goal-edit";
      edit.textContent = "编辑";
      edit.addEventListener("click", function () { showForm(active); });
      meta.append(label, edit);

      const body = document.createElement("div");
      body.className = "goal-text";
      body.textContent = active.text;

      box.append(meta, body);
      slot.appendChild(box);
    } else {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "goal-add";
      add.textContent = "+ 设定任务目标";
      add.title = "接下来一段时间的主线,每天的任务都在推进它";
      add.addEventListener("click", function () { showForm(null); });
      slot.appendChild(add);
    }
  }

  async function renderPlan() {
    const tHer = todayHer();
    const tSup = todaySup();
    // 逾期自清:昨天没做完的任务今天自动消失(软删除,全清判定仍算数)
    await Store.dismissOverdue(tHer, tSup);
    const [settings, phases, tasks, goals] = await Promise.all([
      Store.getSettings(), Store.listPhases(), Store.listTasks(), Store.listGoals(),
    ]);

    renderGoal("#goal-her", goals, "her", tHer);
    renderGoal("#goal-sup", goals, "sup", tSup);

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
    const todayE = earningsByDay(tasks)[tHer];
    const todayBonus = todayE ? todayE.bonus : 0;
    $("#today-points").textContent = todayBonus > 0
      ? "今日获得 " + earned + " 分(含幸运 +" + todayBonus + ")"
      : "今日获得 " + earned + " / " + DAILY_CAP + " 分";

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
        const free = Math.random() < 0.2; // 兑换也有彩票:20% 免单,不消耗积分
        await Store.addLedger({
          delta: free ? 0 : -r.cost,
          reason: "兑换:" + r.title + (free ? "(幸运免单)" : ""),
          kind: "redeem", reward_id: r.id,
        });
        if (free) {
          const rect = btn.getBoundingClientRect();
          Juice.bigBurst();
          Juice.floatText(rect.left + rect.width / 2, rect.top, "幸运免单!");
        }
        refresh();
      });

      card.append(head, costRow, btn);
      grid.appendChild(card);
    }

    // 流水(最近 30 条):任务积分按日现算聚合 + 兑换记录
    const byDay = earningsByDay(tasks);
    const rows = [];
    for (const d in byDay) {
      rows.push({
        date: d, kind: "任务", delta: byDay[d].capped,
        reason: "完成任务 × " + byDay[d].n
          + (byDay[d].bonus > 0 ? "(含幸运 +" + byDay[d].bonus + ")" : ""),
      });
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
      const cls = r.delta > 0 ? "delta-pos" : r.delta < 0 ? "delta-neg" : ""; // 免单 = 0,不红不绿
      tr.innerHTML = "<td>" + fmtDate(r.date) + "</td>"
        + "<td></td>"
        + '<td><span class="kind-tag">' + r.kind + "</span></td>"
        + '<td class="num ' + cls + '">'
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
    const [tasks, drills, exams, ledger, settings, messages, rewardCountAll, persisted, vouchers] =
      await Promise.all([
        Store.listTasks(), Store.listDrills(), Store.listExams(), Store.listLedger(),
        Store.getSettings(), Store.listMessages(), Store.countAllRewards(),
        Store.listBadgeUnlocks(), Store.listVouchers(),
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
    updateChestTile(cumPoints, vouchers);

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
      luckyTen: tasks.some(t => t.owner === "her" && (t.multiplier || 1) >= 10),
      redeemCount: ledger.filter(e => e.kind === "redeem").length,
      spentPoints: ledger.filter(e => e.kind === "redeem").reduce((s, e) => s - e.delta, 0),
      voucherCount: vouchers.length, // 木瓜三连:兑奖券收藏进度
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
    // 纸墨主题用「金石版画」重绘图标,简白仍用原版
    const inkIcons = document.documentElement.classList.contains("theme-ink")
      ? (window.BadgeInkIcons || {}) : {};
    for (const b of unlocked) {
      const el = document.createElement("div");
      el.className = "badge unlocked";
      el.innerHTML = '<div class="badge-icon">' + (inkIcons[b.id] || b.icon) + '</div>'
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

  // ---------- 留言板新消息角标 ----------

  // 不记已读状态:角标 = "24 小时内有对方的新留言",一天后自动熄灭。
  // 正开着留言板时不显示(人就在看)
  let lastMessages = [];

  function updateBoardDot() {
    const mine = isSup() ? "sup" : "her";
    const cutoff = Date.now() - 24 * 3600e3;
    const fresh = lastMessages.filter(
      m => (m.author || "her") !== mine && Date.parse(m.created_at) > cutoff).length;
    const onBoard = document.querySelector('.tab[data-tab="board"]')
      .classList.contains("active");
    const dot = $("#board-dot");
    dot.hidden = onBoard || fresh === 0;
    if (fresh) dot.textContent = "+" + fresh;
  }

  // 安静的后台刷新:页面回到前台 + 每 5 分钟拉一次留言,只动角标不打扰
  async function pollBoard() {
    const msgs = await Store.listMessagesQuiet();
    if (!msgs) return; // 网络抖动就算了,下次再试
    lastMessages = msgs;
    updateBoardDot();
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) pollBoard();
  });
  setInterval(pollBoard, 5 * 60 * 1000);

  // ---------- 渲染:留言板 ----------

  // 留言时间按"留言人当地时间"显示:他的按伦敦、她的按北京,
  // 谁看都一样;悬停显示另一边时区的换算
  function msgTime(m, tz) {
    const d = new Date(m.created_at);
    return dateInTZ(tz, d).replace(/-/g, "/") + " " + new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);
  }

  // 引用式回复(微信风格):不嵌套,时间线平铺,回复的留言上方带一条原文引用
  let replyTo = null;

  function excerpt(s) {
    return s.length > 40 ? s.slice(0, 40) + "…" : s;
  }

  function setReplyTo(m) {
    replyTo = m;
    $("#reply-hint").hidden = !m;
    if (m) {
      $("#reply-hint-text").textContent = "回复:" + excerpt(m.text);
      $("#board-text").focus();
    }
  }

  async function renderBoard() {
    const messages = await Store.listMessages();
    lastMessages = messages;
    updateBoardDot();
    const ul = $("#msg-list");
    ul.innerHTML = "";
    $("#msg-empty").hidden = messages.length > 0;

    for (const m of messages) {
      const li = document.createElement("li");
      li.className = "msg-item";
      li.dataset.id = m.id;

      const meta = document.createElement("div");
      meta.className = "msg-meta";
      const fromSup = (m.author || "her") === "sup";
      meta.textContent = msgTime(m, fromSup ? TZ_SUP : TZ_HER);
      meta.title = fromSup
        ? "北京时间 " + msgTime(m, TZ_HER)
        : "伦敦时间 " + msgTime(m, TZ_SUP);

      if ((m.author || "her") === "sup") {
        const tag = document.createElement("span");
        tag.className = "kind-tag";
        tag.textContent = "监督员";
        meta.appendChild(tag);
      }

      const reply = document.createElement("button");
      reply.type = "button";
      reply.className = "msg-reply";
      reply.textContent = "回复";
      reply.addEventListener("click", function () { setReplyTo(m); });
      meta.appendChild(reply);

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

      li.appendChild(meta);

      if (m.reply_to != null) {
        const parent = messages.find(x => x.id === m.reply_to);
        const quote = document.createElement("div");
        quote.className = "msg-quote";
        quote.textContent = parent ? excerpt(parent.text) : "原留言已删除";
        if (parent) {
          quote.title = "点击查看原文";
          quote.addEventListener("click", function () {
            const target = ul.querySelector('[data-id="' + parent.id + '"]');
            if (!target) return;
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.classList.remove("flash");
            void target.offsetWidth; // 重置动画,连点也能再闪一次
            target.classList.add("flash");
          });
        }
        li.appendChild(quote);
      }

      const text = document.createElement("div");
      text.className = "msg-text";
      text.textContent = m.text;

      li.appendChild(text);
      ul.appendChild(li);
    }
  }

  // ---------- 宝箱与兑奖券 ----------
  // 她的累计积分每满 1500,"历史总积分"开始呼吸;点开是个宝箱,连点三下
  // 开出一张兑奖券(考后兑神秘奖品)。领取记录落库,两台设备不会重复开箱。

  const MILESTONE_STEP = 1500;
  const chest = { pending: [], milestone: 0, clicks: 0, shown: null };

  // 票根小图标:两侧撕票缺口 + 骑缝虚线
  const STUB_SVG = '<svg viewBox="0 0 34 22" width="30" height="20" aria-hidden="true">'
    + '<path d="M3 2 h28 a2 2 0 0 1 2 2 v4 a3 3 0 0 0 0 6 v4 a2 2 0 0 1 -2 2 h-28'
    + ' a2 2 0 0 1 -2 -2 v-4 a3 3 0 0 0 0 -6 v-4 a2 2 0 0 1 2 -2 z" fill="var(--accent)"/>'
    + '<line x1="23" y1="5" x2="23" y2="17" stroke="var(--surface)" stroke-width="1.6" stroke-dasharray="2.4 2"/>'
    + '</svg>';

  function updateChestTile(cum, vouchers) {
    const claimed = new Set(vouchers.map(v => v.milestone));
    chest.pending = [];
    for (let m = MILESTONE_STEP; m <= cum; m += MILESTONE_STEP) {
      if (!claimed.has(m)) chest.pending.push(m);
    }

    // 惊喜留给她本人拆:监督员这边不呼吸也开不了箱
    const tile = $("#cum-points-tile");
    const ready = chest.pending.length > 0 && !isSup();
    tile.classList.toggle("milestone-ready", ready);
    tile.classList.toggle("tile-clickable", ready);
    tile.title = ready ? "这个数字好像在发光…点点看?"
      : chest.pending.length ? "有个宝箱在等她拆" : "";

    // 每领一张,数字下面多一枚票根,点开回看
    const box = $("#voucher-stubs");
    box.innerHTML = "";
    const sorted = vouchers.slice().sort((a, b) => a.milestone - b.milestone);
    for (const v of sorted) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "voucher-stub";
      b.title = "兑奖券 · 累计 " + v.milestone + " 分";
      b.innerHTML = STUB_SVG;
      b.addEventListener("click", function (e) {
        e.stopPropagation(); // 别顺手把宝箱也点开了
        showVoucher(v);
      });
      box.appendChild(b);
    }
    box.hidden = sorted.length === 0;
  }

  function closeChest() {
    $("#chest-overlay").hidden = true;
  }

  function openChestModal(milestone) {
    chest.milestone = milestone;
    chest.clicks = 0;
    $("#chest-svg").classList.remove("open");
    $("#chest-wrap").classList.remove("shake-1", "shake-2");
    $("#chest-stage").hidden = false;
    $("#voucher-stage").hidden = true;
    $("#chest-overlay").hidden = false;
  }

  function showVoucher(v) {
    chest.shown = v;
    drawVoucher($("#voucher-canvas"), v);
    $("#chest-stage").hidden = true;
    $("#voucher-stage").hidden = false;
    $("#chest-overlay").hidden = false;
  }

  // 印章素材:图片晚于券面加载完时补画一次
  const sealImg = new Image();
  sealImg.onload = function () {
    if (chest.shown && !$("#voucher-stage").hidden) drawVoucher($("#voucher-canvas"), chest.shown);
  };
  sealImg.src = "img/seal.png";

  $("#cum-points-tile").addEventListener("click", function () {
    if (chest.pending.length && !isSup()) openChestModal(chest.pending[0]);
  });

  // 不写说明文字:箱子自己会小幅抖动勾人来点,每点一下抖得更凶,第三下开
  $("#chest-wrap").addEventListener("click", async function () {
    const svg = $("#chest-svg");
    if (svg.classList.contains("open")) return;

    const wrap = $("#chest-wrap");
    wrap.classList.remove("shake-1", "shake-2");
    void wrap.offsetWidth; // 重置动画,连点每下都晃
    chest.clicks++;
    wrap.classList.add(chest.clicks === 1 ? "shake-1" : "shake-2");
    if (chest.clicks < 3) return;

    // 第三下:先落库再开箱(撞上另一台设备刚开过就静默收场,刷新后看券即可)
    const m = chest.milestone;
    const serial = todayHer().replace(/-/g, "") + "-" + m;
    try {
      await Store.addVoucher({ milestone: m, serial: serial });
    } catch (e) {
      closeChest();
      refresh();
      return;
    }
    svg.classList.add("open");
    Juice.bigBurst();
    setTimeout(function () { showVoucher({ milestone: m, serial: serial }); }, 700);
    refresh(); // 后台更新呼吸状态和票根(也许还压着下一档)
  });

  $("#chest-close").addEventListener("click", closeChest);
  $("#voucher-ok").addEventListener("click", closeChest);
  $("#chest-overlay").addEventListener("click", function (e) {
    if (e.target === this) closeChest();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("#chest-overlay").hidden) closeChest();
  });

  // 券面:2100×1480(A5 横版 210×148mm 的 10 倍),画布即券,PDF 整页贴图。
  // 固定用浅色纸面配色——它是一张"纸",不跟随深色模式
  function drawVoucher(canvas, v) {
    const c = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    // 券面随当前主题换装:简白 = 蓝票根 + 黑体,纸墨 = 朱砂票根 + 衬线
    const inkStyle = document.documentElement.classList.contains("theme-ink");
    const PAPER = inkStyle ? "#faf5e9" : "#faf8f2",
          INK   = inkStyle ? "#2a2620" : "#0b0b0b",
          INK2  = inkStyle ? "#5f584a" : "#52514e",
          MUTED = inkStyle ? "#998e77" : "#898781",
          ACCENT = inkStyle ? "#b03a24" : "#2a78d6",
          ACCENT_DEEP = inkStyle ? "#8e2b18" : "#1c5cab",
          HAIR  = inkStyle ? "#ddd1b8" : "#e1e0d9",
          AXIS  = inkStyle ? "#c9bb9c" : "#c3c2b7",
          STUB_TEXT = inkStyle ? "#faf5e9" : "#ffffff",
          DOT = inkStyle ? "rgba(42,38,32,0.03)" : "rgba(11,11,11,0.03)",
          WATERMARK = inkStyle ? "rgba(176,58,36,0.10)" : "rgba(42,120,214,0.10)",
          TRIO2 = inkStyle ? "#3f5c55" : "#1baf7a",
          TRIO3 = inkStyle ? "#a97b1f" : "#eda100";
    // 票根上的米白/纯白带透明度
    const stubA = a => inkStyle ? "rgba(250,245,233," + a + ")" : "rgba(255,255,255," + a + ")";
    const FONT = inkStyle
      ? '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STZhongsong", "SimSun", serif'
      : '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';
    const SX = 640;   // 票根分割线
    const MX = 780;   // 主区左边距

    function rr(x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function sq(x, y, size, color, deg) {
      c.save();
      c.translate(x, y);
      c.rotate(deg * Math.PI / 180);
      c.fillStyle = color;
      c.fillRect(-size / 2, -size / 2, size, size);
      c.restore();
    }

    c.clearRect(0, 0, W, H);

    // 纸面 + 外框
    rr(50, 50, W - 100, H - 100, 40);
    c.fillStyle = PAPER;
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.stroke();

    // 主区暗纹(细点阵 + 右缘大菱形轮廓)与票根 accent 色块,同一次裁剪保住圆角
    c.save();
    rr(50, 50, W - 100, H - 100, 40);
    c.clip();
    c.fillStyle = DOT;
    for (let gy = 130; gy < H - 90; gy += 56) {
      for (let gx = SX + 90; gx < W - 90; gx += 56) c.fillRect(gx, gy, 4, 4);
    }
    c.strokeStyle = WATERMARK;
    c.lineWidth = 3;
    for (const s of [430, 300]) {
      c.save();
      c.translate(1955, 745);
      c.rotate(Math.PI / 4);
      c.strokeRect(-s / 2, -s / 2, s, s);
      c.restore();
    }
    c.fillStyle = ACCENT;
    c.fillRect(50, 50, SX - 50, H - 100);
    c.restore();
    rr(50, 50, W - 100, H - 100, 40);
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.stroke(); // 色块压过的边框描回来

    // 票根内容(简白纯白/纸墨米白):内框、上下对称菱形饰件、套印错位的大数字
    c.textAlign = "center";
    c.strokeStyle = stubA(0.55);
    c.lineWidth = 3;
    rr(100, 100, SX - 150, H - 200, 24);
    c.stroke();

    sq(345, 215, 20, stubA(0.9), 45);
    sq(385, 215, 14, stubA(0.6), 45);
    sq(305, 215, 14, stubA(0.6), 45);
    sq(345, H - 215, 20, stubA(0.9), 45);
    sq(385, H - 215, 14, stubA(0.6), 45);
    sq(305, H - 215, 14, stubA(0.6), 45);

    let fs = 210; // 数字大小自适应,别撑破票根
    c.font = "700 " + fs + "px " + FONT;
    while (c.measureText(String(v.milestone)).width > 430 && fs > 90) {
      fs -= 10;
      c.font = "700 " + fs + "px " + FONT;
    }
    c.fillStyle = ACCENT_DEEP;
    c.fillText(String(v.milestone), 352, 707); // 深色错位衬底,套印质感
    c.fillStyle = STUB_TEXT;
    c.fillText(String(v.milestone), 345, 700);
    c.font = "400 44px " + FONT;
    try { c.letterSpacing = "18px"; } catch (e) {}
    c.fillText("积分里程碑", 354, 800);
    try { c.letterSpacing = "0px"; } catch (e) {}

    // 主区
    c.textAlign = "left";
    c.fillStyle = ACCENT;
    c.font = "600 34px " + FONT;
    try { c.letterSpacing = "12px"; } catch (e) {}
    c.fillText("REWARD VOUCHER", MX, 265);
    try { c.letterSpacing = "0px"; } catch (e) {}

    c.fillStyle = INK;
    c.font = "700 170px " + FONT;
    try { c.letterSpacing = "20px"; } catch (e) {}
    c.fillText("兑奖券", MX - 8, 460);
    try { c.letterSpacing = "0px"; } catch (e) {}

    // 标题旁的几何点缀:简白蓝绿金,纸墨朱砂/黛青/鎏金
    sq(1500, 415, 30, ACCENT, 0);
    sq(1550, 415, 22, TRIO2, 45);
    sq(1594, 415, 16, TRIO3, 0);

    c.fillStyle = HAIR;
    c.fillRect(MX, 530, W - 150 - MX, 3);

    // 正文
    c.fillStyle = INK2;
    c.font = "400 56px " + FONT;
    const pre = "恭喜你,累计积分达到 ";
    c.fillText(pre, MX, 690);
    const preW = c.measureText(pre).width;
    c.fillStyle = ACCENT;
    c.font = "700 96px " + FONT;
    c.fillText(String(v.milestone), MX + preW, 694);
    const numW = c.measureText(String(v.milestone)).width;
    c.fillStyle = INK2;
    c.font = "400 56px " + FONT;
    c.fillText(" 分", MX + preW + numW, 690);

    c.fillText("考试结束后,将有一份神秘奖品等待着你哦。", MX, 830);

    // 里程碑刻度尺:这张券在系列里的位置一目了然。
    // 达成的实心,未来的空心,当前这张放大高亮——每领一张,图案前进一格
    const RX = W - 150;
    const TRACK_N = 8;
    const tx0 = MX + 15;
    const tGap = (RX - MX - 30) / (TRACK_N - 1);
    c.strokeStyle = HAIR;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(tx0, 975);
    c.lineTo(tx0 + tGap * (TRACK_N - 1), 975);
    c.stroke();
    for (let i = 0; i < TRACK_N; i++) {
      const m = MILESTONE_STEP * (i + 1);
      const x = tx0 + i * tGap;
      const cur = m === v.milestone;
      const size = cur ? 27 : 18;
      c.save();
      c.translate(x, 975);
      c.rotate(Math.PI / 4);
      if (m <= v.milestone) {
        c.fillStyle = ACCENT;
        c.fillRect(-size / 2, -size / 2, size, size);
      } else {
        c.fillStyle = PAPER;
        c.strokeStyle = AXIS;
        c.lineWidth = 3;
        c.fillRect(-size / 2, -size / 2, size, size);
        c.strokeRect(-size / 2, -size / 2, size, size);
      }
      c.restore();
      c.textAlign = "center";
      c.fillStyle = cur ? ACCENT : MUTED;
      c.font = (cur ? "600 30px " : "400 26px ") + FONT;
      c.fillText(String(m), x, 1052);
    }
    c.textAlign = "left";

    // 底部:券号 + 签发
    c.fillStyle = HAIR;
    c.fillRect(MX, 1140, W - 150 - MX, 3);

    c.fillStyle = MUTED;
    c.font = "400 38px " + FONT;
    c.fillText("NO.", MX, 1250);
    c.fillStyle = INK;
    c.font = "600 52px " + FONT;
    try { c.letterSpacing = "6px"; } catch (e) {}
    c.fillText(v.serial, MX + 90, 1250);
    try { c.letterSpacing = "0px"; } catch (e) {}

    c.textAlign = "right";
    c.fillStyle = INK2;
    c.font = "400 40px " + FONT;
    c.fillText("签发人 · 林林", 1740, 1250); // 右边留给印章
    c.textAlign = "left";

    // 印章「晓之以礼」:盖在落款上方、微微倾斜,没有素材就先不盖章。
    // multiply 混合让白色笔画透出纸色、朱红像印泥吃进纸面,而不是贴图
    if (sealImg.complete && sealImg.naturalWidth > 0) {
      c.save();
      c.translate(1878, 1200);
      c.rotate(-8 * Math.PI / 180);
      c.globalAlpha = 0.92;
      c.globalCompositeOperation = "multiply";
      const sw = 210;
      const sh = sw * sealImg.naturalHeight / sealImg.naturalWidth;
      c.drawImage(sealImg, -sw / 2, -sh / 2, sw, sh);
      c.restore();
    }

    // 最后打孔:撕票缺口 + 骑缝虚线(destination-out 打穿,透明底)
    c.globalCompositeOperation = "destination-out";
    c.beginPath();
    c.arc(SX, 50, 36, 0, Math.PI * 2);
    c.arc(SX, H - 50, 36, 0, Math.PI * 2);
    c.fill();
    for (let y = 140; y <= H - 140; y += 46) {
      c.beginPath();
      c.arc(SX, y, 9, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = "source-over";
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
    await Store.addMessage(text, isSup() ? "sup" : "her", replyTo ? replyTo.id : null);
    $("#board-text").value = "";
    setReplyTo(null);
    refresh();
  });

  $("#reply-cancel").addEventListener("click", function () { setReplyTo(null); });

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

  // ---------- 风格切换:简白 ⇄ 纸墨,按钮上写对面的名字 ----------

  function applyTheme(ink) {
    document.documentElement.classList.toggle("theme-ink", ink);
    $("#theme-toggle").textContent = ink ? "简白" : "纸墨";
  }

  $("#theme-toggle").addEventListener("click", function () {
    const ink = !document.documentElement.classList.contains("theme-ink");
    try { localStorage.setItem("supervisor-theme", ink ? "ink" : "plain"); } catch (e) {}
    applyTheme(ink);
    refresh(); // 图表取色跟着主题走
  });

  applyTheme(document.documentElement.classList.contains("theme-ink"));

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
