// 模考数据口径:客观题统计与申论感悟各自展示,共用已有记录表保存。
window.Exams = (function () {
  const MODULES = [
    { key: "changshi", label: "常识" },
    { key: "yanyu", label: "言语" },
    { key: "shuliang", label: "数量" },
    { key: "panduan", label: "判断" },
    { key: "ziliao", label: "资料" },
  ];

  function isLegacy(exam) {
    return !exam.results || typeof exam.results !== "object" || !Object.keys(exam.results).length;
  }

  function result(exam, key) {
    const value = exam.results && exam.results[key];
    if (!value || value.total == null || value.correct == null) return null;
    const total = Number(value.total), correct = Number(value.correct);
    return Number.isSafeInteger(total) && total > 0 && Number.isSafeInteger(correct)
      && correct >= 0 && correct <= total ? { total: total, correct: correct } : null;
  }

  function accuracy(exam, key) {
    const value = result(exam, key);
    if (value) return value.correct / value.total * 100;
    if (!isLegacy(exam) || exam[key] == null || exam[key] === "") return null;
    const rate = Number(exam[key]);
    return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
  }

  function counts(exam) {
    return MODULES.reduce(function (sum, module) {
      const value = result(exam, module.key);
      if (value) { sum.total += value.total; sum.correct += value.correct; }
      sum.wrong = sum.total - sum.correct;
      return sum;
    }, { total: 0, correct: 0, wrong: 0 });
  }

  function hasObjective(exam) {
    return MODULES.some(module => accuracy(exam, module.key) != null);
  }

  function inMode(exam, mode) {
    return hasObjective(exam) && (exam.mode === "overtime" ? "overtime" : "timed") === mode;
  }

  return { MODULES: MODULES, isLegacy: isLegacy, result: result, accuracy: accuracy,
    counts: counts, hasObjective: hasObjective, inMode: inMode };
})();
