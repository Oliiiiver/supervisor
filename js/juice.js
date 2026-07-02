// Juiciness:彩纸迸发、飘分、成就解锁弹窗。
// 全部用几何色块(方块/菱形),与整站风格一致;颜色取自校验过的分类色板。
window.Juice = (function () {

  const COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#e87ba4", "#eb6834"];

  // 在视口坐标 (x, y) 迸发一团几何彩纸
  function burst(x, y, opts) {
    opts = opts || {};
    const n = opts.n || 26;
    const power = opts.power || 90; // 飞散半径基数(px)
    for (let i = 0; i < n; i++) {
      const el = document.createElement("span");
      const size = 5 + Math.random() * 5;
      el.style.cssText = "position:fixed;left:" + x + "px;top:" + y + "px;"
        + "width:" + size + "px;height:" + size + "px;"
        + "background:" + COLORS[i % COLORS.length] + ";"
        + "pointer-events:none;z-index:9999;"
        + (Math.random() < 0.4 ? "transform:rotate(45deg);" : ""); // 一部分是菱形
      document.body.appendChild(el);

      const ang = Math.random() * Math.PI * 2;
      const dist = power * (0.4 + Math.random());
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist * 0.8;
      const rot = (Math.random() - 0.5) * 540;
      const dur = 700 + Math.random() * 500;

      el.animate([
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: "translate(" + dx * 0.7 + "px," + dy * 0.7 + "px) rotate(" + rot * 0.7 + "deg)", opacity: 1, offset: 0.6 },
        { transform: "translate(" + dx + "px," + (dy + 70) + "px) rotate(" + rot + "deg)", opacity: 0 },
      ], { duration: dur, easing: "cubic-bezier(.15,.6,.4,1)" }).onfinish = () => el.remove();
    }
  }

  // 大场面:全清、解锁成就时从上方中央撒一大把
  function bigBurst() {
    burst(innerWidth / 2, 180, { n: 64, power: 220 });
  }

  // 从 (x, y) 飘起一行加分文字
  function floatText(x, y, text) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = "position:fixed;left:" + x + "px;top:" + (y - 8) + "px;"
      + "font:700 16px system-ui,sans-serif;color:#2a78d6;"
      + "pointer-events:none;z-index:9999;white-space:nowrap;";
    document.body.appendChild(el);
    el.animate([
      { transform: "translateY(0) scale(1)", opacity: 0 },
      { transform: "translateY(-14px) scale(1.25)", opacity: 1, offset: 0.25 },
      { transform: "translateY(-52px) scale(1)", opacity: 0 },
    ], { duration: 1100, easing: "ease-out" }).onfinish = () => el.remove();
  }

  // 成就解锁弹窗(自动叠放、4 秒后消失)
  let toastStack = 0;
  function badgeToast(iconHtml, name) {
    const el = document.createElement("div");
    el.className = "juice-toast";
    el.style.top = (20 + toastStack * 84) + "px";
    el.innerHTML = '<div class="juice-toast-icon">' + iconHtml + '</div>'
      + '<div><div class="juice-toast-title">成就解锁</div>'
      + '<div class="juice-toast-name">' + name + "</div></div>";
    document.body.appendChild(el);
    toastStack++;

    el.animate([
      { transform: "translate(-50%,-24px) scale(.8)", opacity: 0 },
      { transform: "translate(-50%,6px) scale(1.05)", opacity: 1, offset: 0.55 },
      { transform: "translate(-50%,0) scale(1)", opacity: 1 },
    ], { duration: 450, easing: "ease-out" });

    setTimeout(function () {
      const rect = el.getBoundingClientRect();
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2, { n: 20, power: 70 });
    }, 350);

    setTimeout(function () {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).onfinish = function () {
        el.remove();
        toastStack--;
      };
    }, 4000);
  }

  return { burst: burst, bigBurst: bigBurst, floatText: floatText, badgeToast: badgeToast };
})();
