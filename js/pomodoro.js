// 番茄钟:45 分钟专注 + 10 分钟活动,提醒走"安静通道"——
// 标题栏倒计时、徽章变色脉动、静音浏览器通知。没有声音,没有弹窗打断。
window.Pomodoro = (function () {

  const FOCUS_MIN = 45;
  const BREAK_MIN = 10;
  const LS = "supervisor-pomo";

  const baseTitle = document.title;
  let state = null;      // { phase: "focus" | "break", endsAt: ms } | null
  let tickTimer = null;
  let flashTimer = null;
  let chip = null;

  function save() {
    if (state) localStorage.setItem(LS, JSON.stringify(state));
    else localStorage.removeItem(LS);
  }

  function fmt(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  // 静音通知:有授权才发,silent 保证不响铃
  function notify(body) {
    if (window.Notification && Notification.permission === "granted") {
      try {
        new Notification("考公陪跑台", { body: body, silent: true });
      } catch (e) { /* 部分移动端浏览器不支持,忽略 */ }
    }
  }

  // 标签页标题轻闪 30 秒(或她一回到页面就停)
  function flashTitle(text) {
    stopFlash();
    let on = false;
    flashTimer = setInterval(function () {
      document.title = on ? baseTitle : text;
      on = !on;
    }, 1200);
    setTimeout(stopFlash, 30000);
  }

  function stopFlash() {
    if (flashTimer) {
      clearInterval(flashTimer);
      flashTimer = null;
      document.title = baseTitle;
    }
  }

  // 安静的小提示条(复用成就弹窗的样式,但不撒彩纸、不闪)
  function quietToast(text) {
    const el = document.createElement("div");
    el.className = "juice-toast pomo-toast";
    el.style.top = "20px";
    el.innerHTML = '<div class="juice-toast-icon">'
      + '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<circle cx="16" cy="9" r="3"/><path d="M16 12v8M16 14l-6 4M16 14l6-3M16 20l-5 8M16 20l5 8"/></svg></div>'
      + "<div><div class=\"juice-toast-name\">" + text + "</div></div>";
    document.body.appendChild(el);
    el.animate([
      { transform: "translate(-50%,-16px)", opacity: 0 },
      { transform: "translate(-50%,0)", opacity: 1 },
    ], { duration: 350, easing: "ease-out" });
    setTimeout(function () {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400 }).onfinish = () => el.remove();
    }, 5000);
  }

  function setChip(text, cls) {
    chip.textContent = text;
    chip.className = "pomo-chip" + (cls ? " " + cls : "");
  }

  function update() {
    if (!state) {
      setChip("专注 " + FOCUS_MIN + ":00", "");
      return;
    }
    const left = state.endsAt - Date.now();
    if (left <= 0) return transition();
    if (state.phase === "focus") {
      setChip("专注 " + fmt(left), "running");
      if (!flashTimer) document.title = fmt(left) + " 专注 · 考公陪跑台";
    } else {
      setChip("活动 " + fmt(left), "resting");
      if (!flashTimer) document.title = fmt(left) + " 活动 · 考公陪跑台";
    }
  }

  function transition() {
    if (state.phase === "focus") {
      // 专注结束 → 提醒起来活动,自动进入活动倒计时
      state = { phase: "break", endsAt: Date.now() + BREAK_MIN * 60000 };
      save();
      notify(FOCUS_MIN + " 分钟专注完成,起来活动一下吧");
      flashTitle("○ 该起来活动啦");
      quietToast(FOCUS_MIN + " 分钟专注完成,起来活动一下吧");
      update();
    } else {
      // 活动结束 → 安静回到待机,由她决定何时开始下一轮
      state = null;
      save();
      stopFlash();
      notify("活动结束,随时开始下一轮专注");
      update();
    }
  }

  function onClick() {
    if (!state) {
      // 第一次使用顺便请求通知权限(拒绝也不影响,视觉提醒照常)
      if (window.Notification && Notification.permission === "default") {
        Notification.requestPermission();
      }
      state = { phase: "focus", endsAt: Date.now() + FOCUS_MIN * 60000 };
      save();
      update();
    } else if (confirm(state.phase === "focus" ? "放弃这轮专注?" : "跳过活动时间?")) {
      state = null;
      save();
      stopFlash();
      update();
    }
  }

  function init(el) {
    chip = el;
    chip.addEventListener("click", onClick);

    // 恢复未走完的计时;网页关着的时候错过的就算了(反正提醒不到她)
    try {
      const raw = localStorage.getItem(LS);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.endsAt > Date.now()) state = saved;
        else localStorage.removeItem(LS);
      }
    } catch (e) { /* 数据坏了就当没有 */ }

    // 她回到页面时停止标题闪烁(已经看到了)
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) stopFlash();
    });

    tickTimer = setInterval(update, 1000);
    update();
  }

  return { init: init };
})();
