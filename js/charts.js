// 图表渲染:专项刷题正确率折线图(Chart.js)+ 打卡热力图(CSS grid)。
// 系列色为经 CVD/对比度校验的分类色板前五槽;
// 浅色底下 aqua/黄对比度不足 3:1,按规则以线端直接标注 + 数据表补偿。
window.Charts = (function () {

  const MODULES = [
    { key: "zhengzhi", label: "政治" },
    { key: "changshi", label: "常识" },
    { key: "yanyu",    label: "言语" },
    { key: "shuliang", label: "数量" },
    { key: "panduan",  label: "判断" },
    { key: "ziliao",   label: "资料" },
  ];

  // 分类色板前六槽(经 CVD/对比度校验的固定顺序)
  const SERIES_LIGHT = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948"];
  const SERIES_DARK  = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767"];

  function isDark() {
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function ink() {
    return isDark()
      ? { secondary: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835" }
      : { secondary: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7" };
  }

  // 线端直接标注:色块 + 模块名,纵向避让防止重叠
  const endLabels = {
    id: "endLabels",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const labels = [];
      chart.data.datasets.forEach(function (ds, i) {
        const meta = chart.getDatasetMeta(i);
        if (!meta.visible || !meta.data.length) return;
        // 找最后一个非空点
        let pt = null;
        for (let k = meta.data.length - 1; k >= 0; k--) {
          if (ds.data[k] != null) { pt = meta.data[k]; break; }
        }
        if (!pt) return;
        labels.push({ x: pt.x, y: pt.y, text: ds.label, color: ds.borderColor });
      });
      labels.sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) {
        if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
      }
      ctx.save();
      ctx.font = "11px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      for (const l of labels) {
        ctx.fillStyle = l.color;
        ctx.fillRect(l.x + 8, l.y - 4, 8, 8);
        ctx.fillStyle = ink().secondary;
        ctx.fillText(l.text, l.x + 20, l.y);
      }
      ctx.restore();
    },
  };

  let drillChart = null;

  // 专项刷题走势:x 轴为日期,每个模块一条线,y 为该组练习的正确率。
  // 同一天同模块多组练习时合并(总对题数 / 总题数)。
  function renderDrillChart(canvas, drills) {
    if (drillChart) drillChart.destroy();
    const colors = isDark() ? SERIES_DARK : SERIES_LIGHT;
    const c = ink();

    const dates = [...new Set(drills.map(d => d.date))].sort();
    const byModule = {};
    for (const d of drills) {
      const m = byModule[d.module] || (byModule[d.module] = {});
      const agg = m[d.date] || (m[d.date] = { total: 0, correct: 0 });
      agg.total += d.total;
      agg.correct += d.correct;
    }

    const datasets = [];
    MODULES.forEach(function (m, i) {
      if (!byModule[m.key]) return; // 没练过的模块不占图例
      datasets.push({
        label: m.label,
        data: dates.map(function (date) {
          const agg = byModule[m.key][date];
          return agg ? Math.round(agg.correct / agg.total * 100) : null;
        }),
        borderColor: colors[i],
        backgroundColor: colors[i],
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointHitRadius: 12,
        tension: 0,
        spanGaps: true,
      });
    });

    drillChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: dates.map(d => d.slice(5).replace("-", "/")),
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // 页面操作后会整体重绘,动画重播反而是噪音
        layout: { padding: { right: 64, top: 8 } },
        interaction: { mode: "index", intersect: false },
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { color: c.muted, callback: v => v + "%" },
            grid: { color: c.grid },
            border: { color: c.axis },
          },
          x: {
            ticks: { color: c.muted },
            grid: { display: false },
            border: { color: c.axis },
          },
        },
        plugins: {
          legend: datasets.length > 1 ? {
            position: "top",
            align: "start",
            labels: { color: c.secondary, boxWidth: 12, boxHeight: 12 },
          } : { display: false },
          tooltip: {
            callbacks: {
              label: ctx => " " + ctx.dataset.label + " " + ctx.formattedValue + "%",
            },
          },
        },
      },
      plugins: [endLabels],
    });
  }

  // 打卡热力图:列为周(周一起),格子颜色 = 当天完成任务数
  function renderHeatmap(container, tasks, weeks) {
    const doneByDate = {};
    for (const t of tasks) {
      if (t.done) doneByDate[t.date] = (doneByDate[t.date] || 0) + 1;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const WEEKS = weeks || 20;
    // 定位到 WEEKS 周前那一周的周一
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (WEEKS - 1) * 7);

    const weekdays = ["一", "", "三", "", "五", "", "日"];
    let html = '<div class="hm-weekdays">'
      + weekdays.map(w => "<span>" + w + "</span>").join("")
      + '</div><div class="hm-grid">';

    const d = new Date(start);
    for (let i = 0; i < WEEKS * 7; i++) {
      const key = d.getFullYear() + "-"
        + String(d.getMonth() + 1).padStart(2, "0") + "-"
        + String(d.getDate()).padStart(2, "0");
      if (d > today) {
        html += '<span class="hm-cell future"></span>';
      } else {
        const n = doneByDate[key] || 0;
        const lv = Math.min(n, 4);
        html += '<span class="hm-cell lv' + lv + '" title="'
          + (d.getMonth() + 1) + "月" + d.getDate() + "日 · "
          + (n ? "完成 " + n + " 个任务" : "未打卡") + '"></span>';
      }
      d.setDate(d.getDate() + 1);
    }
    html += "</div>";
    container.innerHTML = html;
  }

  const MODULE_LABEL = {};
  for (const m of MODULES) MODULE_LABEL[m.key] = m.label;

  return {
    renderDrillChart: renderDrillChart,
    renderHeatmap: renderHeatmap,
    MODULE_LABEL: MODULE_LABEL,
  };
})();
