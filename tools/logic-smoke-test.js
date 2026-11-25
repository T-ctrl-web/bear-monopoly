/* ============================================================
 * 《熊熊大富翁》逻辑冒烟测试（Node，无浏览器）
 * 模拟 DOM + Canvas 2D，自动跑完整局（默认 3 人，全 AI 化自动应答），
 * 验证：买地→升级→抽卡→群体收租→变卖→淘汰→产业移交→胜负
 * 运行：node tools/logic-smoke-test.js（需 Node 18+）
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---------- DOM / Canvas 桩 ---------- */
function makeCtx2D() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, k) {
      if (k === "measureText") return () => ({ width: 30 });
      if (k === "createLinearGradient") return () => ({ addColorStop: noop });
      if (typeof k === "string") return t[k] !== undefined ? t[k] : noop;
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeEl(tag) {
  const el = {
    tagName: tag, style: {}, dataset: {}, children: [],
    classList: { add: noop2, remove: noop2, contains: () => false },
    innerHTML: "", textContent: "",
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    querySelectorAll() { return []; },
    addEventListener() {},
    getContext() { return makeCtx2D(); },
  };
  return el;
}
function noop2() {}

const els = {};
global.document = {
  getElementById(id) { return els[id] || (els[id] = makeEl("div")); },
  createElement(tag) { return makeEl(tag); },
  querySelectorAll() { return []; },
};
global.window = global;
global.innerWidth = 1280;
global.innerHeight = 800;
global.devicePixelRatio = 1;
global.addEventListener = () => {};
global.location = { reload: () => {} };
global.performance = require("perf_hooks").performance;
global.requestAnimationFrame = fn => setTimeout(fn, 0);

/* ---------- 加载游戏脚本 ---------- */
// 兼容两种目录结构：tools/ 在 prototype/ 内 或 在项目根
const gamePath = fs.existsSync(path.join(__dirname, "..", "game.js"))
  ? path.join(__dirname, "..", "game.js")
  : path.join(__dirname, "..", "prototype", "game.js");
const code = fs.readFileSync(gamePath, "utf8");
vm.runInThisContext(code, { filename: "game.js" });

/* ---------- 自动化：弹窗一律选第一个按钮（买地/升级/执行效果） ---------- */
global.showModal = opts => {
  const v = (opts.buttons && opts.buttons[0] && opts.buttons[0].value) !== undefined
    ? opts.buttons[0].value : true;
  return Promise.resolve(v);
};

/* ---------- 状态读取（game.js 末尾注入的调试句柄） ---------- */
const state = () => globalThis.__G;

/* ---------- 开局（3 人：1 真人 + 2 AI） ---------- */
setTimeout(() => global.startGame(), 10);
let done = false;
const timer = setInterval(() => {
  if (done) return;
  const btn = els["roll-btn"];
  const banner = els["turn-banner"];
  if (btn && btn.style && btn.style.display === "block" && typeof btn.onclick === "function" &&
      banner && /轮到你了/.test(banner.textContent)) {
    btn.style.display = "none";
    btn.onclick();
  }
  // v0.6：领地不再自动弹窗，测试里替玩家点击停驻的领地格
  if (typeof global.manualResolve === "function" && state().pendingTile) {
    global.manualResolve(state().pendingTile);
  }
}, 30);

/* ---------- 上限保护 ---------- */
const MAX_MS = 120000;
setTimeout(() => {
  done = true;
  clearInterval(timer);
  report();
}, MAX_MS);

function report() {
  const { players, tiles, running } = state();
  const alive = players.filter(p => p.alive);
  console.log("== 冒烟测试报告 ==");
  console.log(`运行中: ${running} · 存活: ${alive.length}/${players.length}`);
  players.forEach(p => {
    const cash = Number.isFinite(p.cash) ? p.cash : "NaN❌";
    console.log(`  ${p.name} 现金=${cash} 欠债=${p.debt} 圈数=${p.laps} 产业=${p.props.length} 存活=${p.alive}`);
  });
  // 产业归属双向一致性校验
  let bad = 0;
  tiles.forEach(t => {
    if (t.type !== "land") return;
    if (t.owner && !t.owner.props.includes(t)) { bad++; console.log(`❌ ${t.name}: owner.props 不含该格`); }
  });
  players.forEach(p => p.props.forEach(t => {
    if (t.owner !== p) { bad++; console.log(`❌ ${p.name}.props 含 ${t.name} 但 t.owner 不一致`); }
  }));
  // NaN 巡检
  let nan = 0;
  players.forEach(p => { if (!Number.isFinite(p.cash) || !Number.isFinite(p.debt)) nan++; });
  if (bad === 0) console.log("✅ 产业归属双向一致，0 异常"); else process.exitCode = 1;
  if (nan === 0) console.log("✅ 无 NaN"); else process.exitCode = 1;
  if (alive.length === 1 || !state().running) console.log("✅ 出现胜负结局（或整局结束）");
  else { console.log(`⚠️ ${MAX_MS / 1000}s 内未分出胜负（对局仍在进行，属正常范围）`); }
  process.exit(process.exitCode || 0);
}
