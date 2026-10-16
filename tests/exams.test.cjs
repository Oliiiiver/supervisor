const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(context, file) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
}

function domain() {
  const context = { window: {} };
  load(context, "exams.js");
  return context.window.Exams;
}

test("客观题按题数加权统计,不计入申论", () => {
  const exams = domain();
  const record = { results: { changshi: { total: 10, correct: 8 },
    yanyu: { total: 30, correct: 15 }, shenlun: { total: 100, correct: 0 } } };
  const counts = exams.counts(record);
  assert.equal(counts.total, 40);
  assert.equal(counts.correct, 23);
  assert.equal(counts.wrong, 17);
  assert.equal(exams.accuracy(record, "changshi"), 80);
});

test("独立感悟与申论旧分数不算客观题模考", () => {
  const exams = domain();
  for (const record of [{ mode: "timed", results: {}, shenlun_reflection: "经验" },
    { shenlun: 85 }, { results: { changshi: { total: 0, correct: 0 } } }]) {
    assert.equal(exams.hasObjective(record), false);
    assert.equal(exams.inMode(record, "timed"), false);
    assert.equal(exams.counts(record).total, 0);
  }
});

test("历史百分比保留零分点,不能还原为错题数", () => {
  const exams = domain();
  const record = { changshi: 0, yanyu: 75, shenlun: 90, results: {} };
  assert.equal(exams.accuracy(record, "changshi"), 0);
  assert.equal(exams.accuracy(record, "yanyu"), 75);
  assert.equal(exams.counts(record).total, 0);
  assert.equal(exams.inMode(record, "timed"), true);
  assert.equal(exams.inMode(record, "overtime"), false);
});

test("无效题数不会污染统计;全对和全错均有效", () => {
  const exams = domain();
  for (const result of [{ total: -1, correct: 0 }, { total: 10, correct: 11 },
    { total: 10, correct: null }, { total: 10, correct: 1.5 }, { total: "abc", correct: 0 }]) {
    assert.equal(exams.result({ results: { changshi: result } }, "changshi"), null);
  }
  assert.equal(exams.accuracy({ results: { changshi: { total: 10, correct: 0 } } }, "changshi"), 0);
  assert.equal(exams.accuracy({ results: { changshi: { total: 10, correct: 10 } } }, "changshi"), 100);
});

test("超时补做与限时记录严格分开", () => {
  const exams = domain();
  const record = { mode: "overtime", results: { shuliang: { total: 8, correct: 5 } } };
  assert.equal(exams.inMode(record, "timed"), false);
  assert.equal(exams.inMode(record, "overtime"), true);
  assert.equal(exams.counts(record).wrong, 3);
});

test("错题图只含可还原的题数记录,切换空数据时销毁旧图", () => {
  const created = [];
  class Chart {
    constructor(canvas, config) { this.config = config; created.push(this); }
    destroy() { this.destroyed = true; }
  }
  const context = { window: {}, Chart, document: { documentElement: { classList: { contains: () => false } } },
    matchMedia: () => ({ matches: false }) };
  load(context, "exams.js");
  context.Exams = context.window.Exams;
  load(context, "charts.js");
  const records = [{ date: "2026-10-01", changshi: 65, results: {} },
    { date: "2026-10-02", results: { changshi: { total: 20, correct: 16 } } },
    { date: "2026-10-03", results: {}, shenlun_reflection: "感悟" }];
  context.window.Charts.renderExamWrongChart({}, records);
  assert.deepEqual(Array.from(created[0].config.data.datasets[0].data), [4]);
  context.window.Charts.renderExamWrongChart({}, []);
  assert.equal(created[0].destroyed, true);
  assert.equal(created.length, 1);
  context.window.Charts.renderExamChart({}, records);
  assert.deepEqual(Array.from(created[1].config.data.datasets[0].data), [65, 80]);
  context.window.Charts.renderExamChart({}, []);
  assert.equal(created[1].destroyed, true);
});

test("本地保存失败会回滚,重试只新增一条;编辑只更新感悟", async () => {
  let fail = false;
  const context = { window: {}, localStorage: { getItem: () => null,
    setItem: () => { if (fail) throw new Error("storage full"); } } };
  load(context, "demo-data.js");
  load(context, "store.js");
  const store = context.window.Store;
  await store.init();
  const record = { date: "2026-10-16", notes: "原备注", results: {}, shenlun_reflection: "原感悟" };
  fail = true;
  await assert.rejects(store.addExam(record), /storage full/);
  assert.equal((await store.listExams()).length, 0);
  fail = false;
  await store.addExam(record);
  const saved = (await store.listExams())[0];
  assert.equal(saved.id, 1);
  fail = true;
  await assert.rejects(store.updateExamReflection(1, "未保存的更改"));
  assert.equal(saved.shenlun_reflection, "原感悟");
  fail = false;
  await store.updateExamReflection(1, "新感悟");
  assert.equal(saved.shenlun_reflection, "新感悟");
  assert.equal(saved.date, "2026-10-16");
  assert.equal(saved.notes, "原备注");
  assert.equal((await store.listExams()).length, 1);
});

test("感悟切换先保护草稿,继续编辑不丢内容,确认放弃后才切换", () => {
  // 直接运行实际事件绑定,独立于整页启动和浏览器原生确认框。
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
  const start = source.indexOf('  const reflectionDialog = $("#exam-reflections-dialog");');
  const end = source.indexOf('  $("#exam-reflection-form").addEventListener("submit"', start);
  assert.ok(start > 0 && end > start);
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      value: "", hidden: true, disabled: false, open: false, handlers: {},
      addEventListener(name, handler) { this.handlers[name] = handler; },
      focus() {}, setCustomValidity() {},
      showModal() { this.open = true; },
      close() { this.open = false; this.handlers.close(); },
      reset() { ["#exam-reflection-date", "#exam-reflection-notes", "#exam-shenlun-reflection"]
        .forEach(key => { element(key).value = ""; }); },
    });
    return elements.get(selector);
  }
  const record = { id: 1, date: "2026-10-01", notes: "原备注", shenlun_reflection: "原感悟" };
  const context = { $: element, reflectionEditingId: null, reflectionSaving: false,
    currentExams: [record], todayHer: () => "2026-10-16", setExamStatus() {},
    document: { body: { classList: { add() {}, remove() {} } } } };
  vm.runInNewContext(source.slice(start, end), context);
  const click = selector => element(selector).handlers.click({});
  const edit = () => element("#exam-reflection-list").handlers.click({
    target: { closest: () => ({ dataset: { reflectionEdit: "1" } }) } });
  click("#exam-reflection-new");
  element("#exam-reflection-notes").value = "未保存的备注";
  edit();
  assert.equal(element("#exam-reflection-draft-warning").hidden, false);
  assert.equal(element("#exam-reflection-notes").value, "未保存的备注");
  click("#exam-reflection-keep-draft");
  assert.equal(element("#exam-reflection-draft-warning").hidden, true);
  assert.equal(element("#exam-reflection-notes").value, "未保存的备注");
  edit();
  click("#exam-reflection-discard-draft");
  assert.equal(element("#exam-shenlun-reflection").value, "原感悟");
  assert.equal(element("#exam-reflection-date").disabled, true);
  element("#exam-shenlun-reflection").value = "同一条感悟未保存的修改";
  edit();
  assert.equal(element("#exam-shenlun-reflection").value, "同一条感悟未保存的修改");
  click("#exam-reflection-new");
  assert.equal(element("#exam-reflection-draft-warning").hidden, false);
  click("#exam-reflection-discard-draft");
  assert.equal(element("#exam-shenlun-reflection").value, "");
  assert.equal(element("#exam-reflection-date").disabled, false);
  assert.equal(element("#exam-reflection-date").value, "2026-10-16");
});
