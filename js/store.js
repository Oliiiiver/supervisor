// 数据层。两种模式,接口完全一致:
//   local — 未配置 Supabase 时,数据存 localStorage
//   cloud — config.js 填好后自动切换,数据存 Supabase,两人跨设备同步
window.Store = (function () {

  const LS_KEY = "supervisor-data-v5"; // 换 key 让新初始数据生效(旧本地数据即弃用)
  let mode = "local";
  let db = null;     // supabase client
  let cache = null;  // local 模式的内存数据

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  }

  function nextId(name) {
    return cache.seq[name]++;
  }

  async function sb(promise) {
    const { data, error } = await promise;
    if (error) {
      console.error(error);
      alert("云端操作失败:" + error.message);
      throw error;
    }
    return data;
  }

  return {

    mode: function () { return mode; },

    async init() {
      const cfg = window.CONFIG || {};
      // 测试后门:强制本地模式(配好云端后仍可做本地种子测试)
      const forceLocal = localStorage.getItem("supervisor-force-local") === "1";
      if (!forceLocal && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase) {
        db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        mode = "cloud";
      } else {
        mode = "local";
        const raw = localStorage.getItem(LS_KEY);
        cache = raw ? JSON.parse(raw) : window.DemoData.seed();
        save();
      }
    },

    resetLocal() {
      localStorage.removeItem(LS_KEY);
      location.reload();
    },

    // ---------- 设置 ----------

    async getSettings() {
      if (mode === "local") return cache.settings;
      const rows = await sb(db.from("settings").select("*").eq("id", 1));
      return rows[0] || { exam_name: "", exam_date: null, current_phase: 1 };
    },

    async saveSettings(s) {
      if (mode === "local") {
        cache.settings = Object.assign({}, cache.settings, s);
        return save();
      }
      await sb(db.from("settings").upsert(Object.assign({ id: 1 }, s)));
    },

    // ---------- 阶段 ----------

    async listPhases() {
      if (mode === "local") return cache.phases.slice().sort((a, b) => a.sort - b.sort);
      return sb(db.from("phases").select("*").order("sort"));
    },

    // ---------- 任务 ----------

    async listTasks() {
      if (mode === "local") return cache.tasks.slice();
      return sb(db.from("tasks").select("*").order("id"));
    },

    async addTask(t) {
      if (mode === "local") {
        cache.tasks.push({
          id: nextId("task"), date: t.date, title: t.title, owner: t.owner,
          points: t.points, done: false, done_at: null,
          dismissed: false, liked: false,
          created_by: t.created_by || "her",
          created_at: new Date().toISOString(),
        });
        return save();
      }
      await sb(db.from("tasks").insert(t)); // created_at 由数据库默认值生成
    },

    async updateTaskPoints(id, points) {
      if (mode === "local") {
        const t = cache.tasks.find(x => x.id === id);
        if (t) t.points = points;
        return save();
      }
      await sb(db.from("tasks").update({ points: points }).eq("id", id));
    },

    // 销账:把逾期未完成的任务从"之前未完成"里清掉(仅监督员操作)
    async dismissTask(id) {
      if (mode === "local") {
        const t = cache.tasks.find(x => x.id === id);
        if (t) t.dismissed = true;
        return save();
      }
      await sb(db.from("tasks").update({ dismissed: true }).eq("id", id));
    },

    async setTaskLiked(id, liked) {
      if (mode === "local") {
        const t = cache.tasks.find(x => x.id === id);
        if (t) t.liked = liked;
        return save();
      }
      await sb(db.from("tasks").update({ liked: liked }).eq("id", id));
    },

    async deleteTask(id) {
      if (mode === "local") {
        cache.tasks = cache.tasks.filter(x => x.id !== id);
        cache.ledger = cache.ledger.filter(x => x.task_id !== id);
        return save();
      }
      await sb(db.from("ledger").delete().eq("task_id", id));
      await sb(db.from("tasks").delete().eq("id", id));
    },

    // 勾选/取消勾选任务;award 是实际记入流水的分数(调用方按每日上限算好)
    async setTaskDone(task, done, award) {
      if (mode === "local") {
        const t = cache.tasks.find(x => x.id === task.id);
        t.done = done;
        t.done_at = done ? new Date().toISOString() : null;
        if (done) {
          if (award > 0) {
            cache.ledger.push({
              id: nextId("ledger"), delta: award, reason: t.title,
              kind: "task", task_id: t.id, reward_id: null,
              created_at: new Date().toISOString(),
            });
          }
        } else {
          cache.ledger = cache.ledger.filter(
            x => !(x.kind === "task" && x.task_id === t.id));
        }
        return save();
      }
      await sb(db.from("tasks").update({
        done: done, done_at: done ? new Date().toISOString() : null,
      }).eq("id", task.id));
      if (done) {
        if (award > 0) {
          await sb(db.from("ledger").insert({
            delta: award, reason: task.title, kind: "task", task_id: task.id,
          }));
        }
      } else {
        await sb(db.from("ledger").delete().eq("task_id", task.id).eq("kind", "task"));
      }
    },

    // ---------- 奖品与积分 ----------

    async listRewards() {
      if (mode === "local") return cache.rewards.filter(r => r.active);
      return sb(db.from("rewards").select("*").eq("active", true).order("cost"));
    },

    async addReward(r) {
      if (mode === "local") {
        cache.rewards.push({
          id: nextId("reward"), title: r.title, cost: r.cost, active: true,
          created_by: r.created_by || "her",
        });
        return save();
      }
      await sb(db.from("rewards").insert(r));
    },

    async updateRewardCost(id, cost) {
      if (mode === "local") {
        const r = cache.rewards.find(x => x.id === id);
        if (r) r.cost = cost;
        return save();
      }
      await sb(db.from("rewards").update({ cost: cost }).eq("id", id));
    },

    // 她添加过的奖品总数(含已删除的,给"溺爱自己"成就用;监督员加的不算)
    async countAllRewards() {
      if (mode === "local") {
        return cache.rewards.filter(r => (r.created_by || "her") !== "sup").length;
      }
      const rows = await sb(db.from("rewards").select("created_by"));
      return rows.filter(r => (r.created_by || "her") !== "sup").length;
    },

    // 软删除:流水里可能引用它,只下架不抹掉
    async removeReward(id) {
      if (mode === "local") {
        const r = cache.rewards.find(x => x.id === id);
        if (r) r.active = false;
        return save();
      }
      await sb(db.from("rewards").update({ active: false }).eq("id", id));
    },

    async listLedger() {
      if (mode === "local") {
        return cache.ledger.slice().sort(
          (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
      }
      return sb(db.from("ledger").select("*").order("created_at", { ascending: false }));
    },

    async addLedger(entry) {
      if (mode === "local") {
        cache.ledger.push(Object.assign({
          id: nextId("ledger"), task_id: null, reward_id: null,
          created_at: new Date().toISOString(),
        }, entry));
        return save();
      }
      await sb(db.from("ledger").insert(entry));
    },

    // ---------- 专项刷题 ----------

    async listDrills() {
      if (mode === "local") {
        return cache.drills.slice().sort(
          (a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      }
      return sb(db.from("drills").select("*").order("date").order("id"));
    },

    async addDrill(d) {
      if (mode === "local") {
        cache.drills.push(Object.assign({ id: nextId("drill") }, d));
        return save();
      }
      await sb(db.from("drills").insert(d));
    },

    async deleteDrill(id) {
      if (mode === "local") {
        cache.drills = cache.drills.filter(x => x.id !== id);
        return save();
      }
      await sb(db.from("drills").delete().eq("id", id));
    },

    async setDrillLiked(id, liked) {
      if (mode === "local") {
        const d = cache.drills.find(x => x.id === id);
        if (d) d.liked = liked;
        return save();
      }
      await sb(db.from("drills").update({ liked: liked }).eq("id", id));
    },

    // ---------- 模考 ----------

    async listExams() {
      if (mode === "local") {
        return cache.exams.slice().sort((a, b) => a.date.localeCompare(b.date));
      }
      return sb(db.from("mock_exams").select("*").order("date"));
    },

    async addExam(e) {
      if (mode === "local") {
        cache.exams.push(Object.assign({ id: nextId("exam") }, e));
        return save();
      }
      await sb(db.from("mock_exams").insert(e));
    },

    // ---------- 留言板 ----------

    async listMessages() {
      if (mode === "local") {
        return cache.messages.slice().sort(
          (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
      }
      return sb(db.from("messages").select("*").order("created_at", { ascending: false }));
    },

    async addMessage(text, author) {
      if (mode === "local") {
        cache.messages.push({
          id: nextId("message"), text: text, author: author || "her",
          created_at: new Date().toISOString(),
        });
        return save();
      }
      await sb(db.from("messages").insert({ text: text, author: author || "her" }));
    },

    async deleteMessage(id) {
      if (mode === "local") {
        cache.messages = cache.messages.filter(x => x.id !== id);
        return save();
      }
      await sb(db.from("messages").delete().eq("id", id));
    },

    // ---------- 成就解锁(解锁即永久) ----------

    async listBadgeUnlocks() {
      if (mode === "local") return (cache.badges || []).slice();
      const rows = await sb(db.from("badge_unlocks").select("badge_id"));
      return rows.map(r => r.badge_id);
    },

    async addBadgeUnlocks(ids) {
      if (!ids.length) return;
      if (mode === "local") {
        cache.badges = [...new Set([...(cache.badges || []), ...ids])];
        return save();
      }
      await sb(db.from("badge_unlocks").upsert(ids.map(id => ({ badge_id: id }))));
    },

  };
})();
