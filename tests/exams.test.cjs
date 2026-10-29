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

test("政治计入总题数与总错题数,缺少政治的历史记录保持原统计", () => {
  const exams = domain();
  const record = { mode: "timed", results: { zhengzhi: { total: 20, correct: 16 },
    changshi: { total: 10, correct: 8 } } };
  assert.equal(exams.MODULES[0].key, "zhengzhi");
  assert.equal(exams.counts(record).total, 30);
  assert.equal(exams.counts(record).wrong, 6);
  assert.equal(exams.accuracy(record, "zhengzhi"), 80);
  assert.equal(exams.inMode({ mode: "overtime", results: { zhengzhi: { total: 5, correct: 3 } } }, "overtime"), true);
  const older = { results: { changshi: { total: 10, correct: 8 } } };
  assert.equal(exams.accuracy(older, "zhengzhi"), null);
  assert.equal(exams.counts(older).total, 10);
  assert.equal(exams.counts(older).wrong, 2);
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
    { date: "2026-10-02", results: { zhengzhi: { total: 20, correct: 17 }, changshi: { total: 20, correct: 16 } } },
    { date: "2026-10-03", results: {}, shenlun_reflection: "感悟" }];
  context.window.Charts.renderExamWrongChart({}, records);
  assert.deepEqual(Array.from(created[0].config.data.datasets[0].data), [7]);
  context.window.Charts.renderExamWrongChart({}, []);
  assert.equal(created[0].destroyed, true);
  assert.equal(created.length, 1);
  context.window.Charts.renderExamChart({}, records);
  const datasets = created[1].config.data.datasets;
  assert.deepEqual(Array.from(datasets.find(item => item.label === "常识").data), [65, 80]);
  assert.deepEqual(Array.from(datasets.find(item => item.label === "政治").data), [null, 85]);
  assert.notEqual(datasets.find(item => item.label === "政治").borderColor,
    datasets.find(item => item.label === "常识").borderColor);
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

test("修改和删除只影响指定模考;失败回滚,修改保留感悟与编号", async () => {
  let fail = false;
  const context = { window: {}, localStorage: { getItem: () => null,
    setItem: () => { if (fail) throw new Error("storage full"); } } };
  load(context, "demo-data.js"); load(context, "store.js");
  const store = context.window.Store;
  await store.init();
  await store.addExam({ date: "2026-10-29", mode: "timed", notes: "原备注",
    results: { ziliao: { total: 20, correct: 3 } }, shenlun_reflection: "保留感悟" });
  await store.addExam({ date: "2026-10-29", mode: "overtime", results: { ziliao: { total: 1, correct: 1 } } });
  const patch = { results: { ziliao: { total: 20, correct: 17 } }, notes: "修改后",
    id: 999, shenlun_reflection: "不允许覆盖" };
  fail = true;
  await assert.rejects(store.updateExam(1, patch), /storage full/);
  assert.equal((await store.listExams())[0].results.ziliao.correct, 3);
  fail = false;
  await store.updateExam(1, patch);
  const edited = (await store.listExams())[0];
  assert.equal(edited.id, 1);
  assert.equal(edited.shenlun_reflection, "保留感悟");
  assert.equal(edited.notes, "修改后");
  assert.equal(domain().counts(edited).wrong, 3);
  fail = true;
  await assert.rejects(store.deleteExam(1), /storage full/);
  assert.equal((await store.listExams())[0], edited);
  fail = false;
  await store.deleteExam(1);
  const remaining = await store.listExams();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 2);
  assert.equal(remaining[0].mode, "overtime");
  await assert.rejects(store.deleteExam(1), /已不存在/);
  await assert.rejects(store.updateExam(1, patch), /已不存在/);
});

test("云端修改和删除锁定编号,未命中和服务失败不能报告成功", async () => {
  let response = { data: [{ id: 17 }], error: null };
  const calls = [];
  const query = {
    update(patch) { calls.push(["update", patch]); return this; },
    delete() { calls.push(["delete"]); return this; },
    eq(key, value) { calls.push(["eq", key, value]); return this; },
    select(key) { calls.push(["select", key]); return Promise.resolve(response); },
  };
  const context = { console: { error() {} }, window: { CONFIG: { SUPABASE_URL: "test", SUPABASE_ANON_KEY: "test" },
    supabase: { createClient: () => ({ from: table => { assert.equal(table, "mock_exams"); return query; } }) } },
    localStorage: { getItem: () => null } };
  load(context, "store.js");
  const store = context.window.Store; await store.init();
  await store.updateExam(17, { notes: "更新", id: 18, shenlun_reflection: "不能覆盖" });
  assert.equal(calls[0][1].notes, "更新");
  assert.equal(calls[0][1].id, undefined);
  assert.equal(calls[0][1].shenlun_reflection, undefined);
  assert.deepEqual(calls[1], ["eq", "id", 17]);
  calls.length = 0;
  await store.deleteExam(17);
  assert.deepEqual(calls, [["delete"], ["eq", "id", 17], ["select", "id"]]);
  response = { data: [], error: null };
  await assert.rejects(store.deleteExam(17), /已不存在/);
  await assert.rejects(store.updateExam(17, { notes: "更新" }), /已不存在/);
  response = { data: null, error: new Error("offline") };
  await assert.rejects(store.deleteExam(17), /offline/);
  await assert.rejects(store.updateExam(17, { notes: "更新" }), /offline/);
});

test("模考操作嵌入日期格左侧,仅监督员可见,不增加表格列", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
  const elements = new Map();
  function element() {
    return { children: [], dataset: {}, attributes: {}, textContent: "",
      appendChild(child) { this.children.push(child); },
      prepend(child) { this.children.unshift(child); },
      replaceChildren() { this.children = []; },
      setAttribute(key, value) { this.attributes[key] = value; } };
  }
  const $ = key => { if (!elements.has(key)) elements.set(key, element()); return elements.get(key); };
  let supervisor = false;
  const Exams = domain();
  const context = { $, document: { createElement: element }, isSup: () => supervisor,
    Exams, OBJECTIVE_EXAM_MODULES: Exams.MODULES, objectiveExamCounts: Exams.counts, examChartMode: "timed" };
  const start = source.indexOf("  function renderExamTable(exams) {");
  const end = source.indexOf("  function renderExamReflections(exams) {", start);
  vm.runInNewContext(source.slice(start, end), context);
  const rows = [{ id: 17, date: "2026-10-29", results: { ziliao: { total: 20, correct: 17 } } }];
  context.renderExamTable(rows);
  let cells = $("#exam-table tbody").children[0].children;
  assert.equal(cells.length, 9);
  assert.equal(cells[0].children.length, 0);
  supervisor = true;
  context.renderExamTable(rows);
  cells = $("#exam-table tbody").children[0].children;
  assert.equal(cells.length, 9);
  const buttons = cells[0].children[0].children;
  assert.equal(buttons[0].textContent, "×");
  assert.equal(buttons[0].dataset.examAction, "delete");
  assert.equal(buttons[1].textContent, "✎");
  assert.match(buttons[1].attributes["aria-label"], /修改/);
  supervisor = false;
  context.renderExamTable(rows);
  assert.equal($("#exam-table tbody").children[0].children[0].children.length, 0);
});

test("普通模式不能打开管理弹窗或提交此前打开的修改和删除", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
  const elements = new Map();
  const $ = key => {
    if (!elements.has(key)) elements.set(key, { handlers: {},
      addEventListener(name, handler) { this.handlers[name] = handler; } });
    return elements.get(key);
  };
  const start = source.indexOf('  const examManageDialog = $("#exam-manage-dialog");');
  const end = source.indexOf("  // 原生 dialog", start);
  vm.runInNewContext(source.slice(start, end), { $, isSup: () => false });
  // 若未被入口拦截，读取事件目标或访问 Store 会直接报错。
  $("#exam-table").handlers.click({});
  await $("#exam-manage-form").handlers.submit({ preventDefault() {} });
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
