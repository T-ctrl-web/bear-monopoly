/* ============================================================
 * 《熊熊大富翁》可玩原型 v0.3（2D 横屏版）
 * 规则来源：《核心玩法设计.md》GDD v0.5 + 经济调参表 v1
 * 渲染：v0.3 起改为 2D 横屏俯视棋盘（经典大富翁版式，Canvas 2D，零依赖）
 *       规则与数值与 v0.1/v0.2 完全一致
 * ============================================================ */
"use strict";

/* ---------------- 经济参数（与调参表一致，均可调） ---------------- */
const CFG = {
  START_CASH: 1500,        // 起步熊熊币
  START_SUBSIDY_RATE: 0.10,// 过起点补贴比例
  BASE_PRICE: 300,         // 基准地价
  DIST_DECAY: 0.01,        // 距起点每格折减
  RENT_MULT: { 1: 0.8, 2: 1.6, 3: 3.0 },  // 过路费倍率（v0.7 调低：旧 1.0/2.5/5.0 升满+垄断过于致命）
  MONOPOLY_MULT: 2.0,      // 垄断倍数
  UPG_RATE: { 2: 0.50, 3: 1.00 },         // 升级费率
  SELL_RATE: 0.50,         // 破产变卖折价
  LOAN_MULT: 1.5,          // 借款偿还倍数
  LOAN_LAPS: 2,            // 借款保护圈数
  JAR_PAY: 100,            // 糖罐逃脱费
  MAX_LEVEL: 3,
  AI_RESERVE: 300,         // AI 决策保留现金
};

/* ---------------- 棋盘（32 格单环） ---------------- */
const REGION_COEF = { "蜂蜜广场": 1.5, "蜂蜜花田": 1.3, "渔夫湾": 1.15, "竹笋竹林": 1.0, "蘑菇密林": 0.85 };
const REGION_COLOR = { "蜂蜜广场": 0xd98a6a, "蜂蜜花田": 0xe0b955, "渔夫湾": 0x7aa8cc, "竹笋竹林": 0x9cc4a5, "蘑菇密林": 0xada0d0 };

const LANDS = [
  [1, "蜂蜜广场", "熊熊百货屋"], [2, "蜂蜜广场", "蜂蜜面包房"], [4, "蜂蜜广场", "镇中心邮局"], [13, "蜂蜜广场", "蜂蜜电影院"],
  [6, "蜂蜜花田", "蜂蜜工坊"], [7, "蜂蜜花田", "养蜂场"], [9, "蜂蜜花田", "花田咖啡馆"], [10, "蜂蜜花田", "蜂蜡蜡烛铺"], [12, "蜂蜜花田", "野花市集"],
  [14, "渔夫湾", "鱼市码头"], [15, "渔夫湾", "冰淇淋小屋"], [17, "渔夫湾", "灯塔民宿"], [18, "渔夫湾", "渔具铺"], [22, "渔夫湾", "海鲜餐厅"],
  [19, "竹笋竹林", "竹笋园"], [20, "竹笋竹林", "竹韵茶馆"], [23, "竹笋竹林", "竹制品铺"], [26, "竹笋竹林", "竹林温泉"], [28, "竹笋竹林", "熊猫客栈"],
  [25, "蘑菇密林", "蘑菇种植园"], [27, "蘑菇密林", "萤火虫剧场"], [29, "蘑菇密林", "树屋旅馆"], [30, "蘑菇密林", "月光集市"], [31, "蘑菇密林", "蜂蜜火锅店"],
];

function buildTiles() {
  const tiles = [];
  for (let i = 0; i < 32; i++) tiles.push({ pos: i, type: "path", name: "花田小径" });
  tiles[0] = { pos: 0, type: "start", name: "蜜金树·起点" };
  [3, 11, 16, 24].forEach(p => tiles[p] = { pos: p, type: "nest", name: "幸运蜂巢" });
  tiles[8] = { pos: 8, type: "jar", name: "蜂蜜糖罐" };
  LANDS.forEach(([pos, region, name]) => {
    const price = Math.round(CFG.BASE_PRICE * REGION_COEF[region] * (1 - CFG.DIST_DECAY * pos));
    tiles[pos] = { pos, type: "land", region, name, price, owner: null, level: 1 };
  });
  return tiles;
}

/* ---------------- 角色 ---------------- */
const CHARS = [
  { id: "mituantuan", name: "蜜团团", species: "棕熊", color: 0xc98d5e, trait: "花田产业过路费收入 +20%" },
  { id: "xueqiuqiu", name: "雪球球", species: "北极熊", color: 0xe8f1f8, trait: "渔夫湾产业购买价 -20%" },
  { id: "tuanzi", name: "团子", species: "熊猫", color: 0xf5f0e6, trait: "竹林产业购买价 -20%" },
  { id: "shuishuilu", name: "瞌睡噜", species: "考拉", color: 0x9fb4c7, trait: "每回合开始 20% 概率捡到 50 熊熊币" },
  { id: "yueyaer", name: "月芽儿", species: "月亮熊", color: 0xf7e7a1, trait: "抽到负面卡时 50% 概率改为蜜金树祝福(+150)" },
];

/* ---------------- 事件卡池（18 张，权重同调参表） ---------------- */
const CARDS = [
  { name: "冬眠", rarity: "普通", mode: "instant", amount: 0, weight: 8, desc: "熊嘛，困了就睡：跳过下 1 回合。", ref: "大富翁·休息格" },
  { name: "迷路", rarity: "普通", mode: "instant", amount: 0, weight: 7, desc: "走错花田了：后退 3 格并结算落格效果。", ref: "机会卡·后退3格" },
  { name: "顺风奔跑", rarity: "普通", mode: "instant", amount: 0, weight: 7, desc: "顺风送你一程：前进 3 格并结算落格效果。", ref: "机会卡·前进3格" },
  { name: "前往蜜金树", rarity: "稀有", mode: "instant", amount: 0, weight: 4, desc: "立即移动回起点格，领取过起点补贴。", ref: "机会卡·前进至GO" },
  { name: "捡到蜂蜜罐", rarity: "普通", mode: "instant", amount: 120, weight: 7, desc: "路边捡到一罐蜂蜜，+120 熊熊币！", ref: "命运卡·银行错误" },
  { name: "零食诱惑", rarity: "普通", mode: "instant", amount: -100, weight: 6, desc: "没忍住买了零食，-100 熊熊币。", ref: "命运卡·医生费" },
  { name: "邮递员送货", rarity: "普通", mode: "instant", amount: 80, weight: 6, desc: "邮递员送来包裹，+80 熊熊币。", ref: "命运卡·出售股票" },
  { name: "蜜金树祝福", rarity: "稀有", mode: "instant", amount: 300, weight: 5, desc: "蜜婆婆保佑你，+300 熊熊币！", ref: "命运卡·遗产继承" },
  { name: "蜂蜜暴雨", rarity: "稀有", mode: "instant", amount: 150, weight: 4, desc: "黏糊糊的糖浆席卷全岛，其他熊熊各付你 150！", ref: "原创·群体收租" },
  { name: "生日派对", rarity: "稀有", mode: "instant", amount: 100, weight: 4, desc: "今天是你的生日，每位其他熊熊送你 100！", ref: "命运卡·生日收礼" },
  { name: "修屋顶费", rarity: "稀有", mode: "instant", amount: 60, weight: 3, desc: "大风把屋顶吹跑了：每块 Lv2 及以上产业付 60 维护费。", ref: "机会卡·修缮费" },
  { name: "蜜税蜂", rarity: "稀有", mode: "instant", amount: 0, weight: 3, desc: "税务蜂上门：按持有产业总地价的 10% 缴税。", ref: "机会卡·所得税" },
  { name: "顺风快递", rarity: "稀有", mode: "instant", amount: 0, weight: 4, desc: "顺风快递到货，立即再掷骰子移动一次！", ref: "原创·再行动" },
  { name: "糖罐逃脱卡", rarity: "常备", mode: "hold", hold: "escape", amount: 0, weight: 5, desc: "保留在手：踩到蜂蜜糖罐格时可立即脱身。", ref: "大富翁·出狱卡" },
  { name: "蜂蜜大促销", rarity: "稀有", mode: "hold", hold: "promo", amount: 0, weight: 3, desc: "保留在手：下次升级改造费用减半。", ref: "原创·折扣券" },
  { name: "搬家券", rarity: "史诗", mode: "instant", amount: 0, weight: 2, desc: "镇长批准：与任一熊熊随机互换 1 块产业！", ref: "原创·产业互换" },
  { name: "大丰收", rarity: "史诗", mode: "instant", amount: 500, weight: 2, desc: "花田大丰收，+500 熊熊币！", ref: "机会卡·保险到期" },
  { name: "蜂王巡游", rarity: "史诗", mode: "instant", amount: 200, weight: 2, desc: "蜂王驾临，所有其他熊熊各付你 200 过路费！", ref: "原创·全体收割" },
];
const BLESSING_FALLBACK = { name: "蜜金树祝福", rarity: "稀有", mode: "instant", amount: 150, weight: 0, desc: "月芽儿的占卜扭转了厄运，+150 熊熊币。", ref: "角色特性" };

/* 实体牌堆：按权重把卡池展开成实体卡并洗匀，抽一张少一张，抽空重洗（v0.8） */
function makeDeck() {
  const d = [];
  CARDS.forEach(c => { for (let i = 0; i < c.weight; i++) d.push(c); });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function drawFrom(t) {
  if (!t.deck || t.deck.length === 0) t.deck = makeDeck();
  return t.deck.pop();
}

/* ---------------- 全局状态 ---------------- */
let tiles = buildTiles();
let players = [];
let turnIdx = 0;
let running = false;
let totalPlayers = 3;
let aiDifficulty = "normal";   // easy / normal / hard
let humanChar = CHARS[0];

/* ---------------- DOM 引用 ---------------- */
const $ = id => document.getElementById(id);
const turnBanner = $("turn-banner"), playersEl = $("players"), logEl = $("log"),
      rollBtn = $("roll-btn"), diceEl = $("dice-result"), mask = $("modal-mask"), modal = $("modal");

/* 日志改为单行滚动条（v0.6：不再用大方块挡视野） */
let logTimer = null;
function clearLog() {
  logEl.innerHTML = "";
  logEl.classList.remove("show", "l-bad", "l-good", "l-card", "l-sys");
}
function log(msg, cls) {
  // 永久性提示（规则说明等）走 l-sys 时不刷新计时器也可以，统一处理
  logEl.textContent = msg;
  logEl.className = "show" + (cls ? " " + cls : "");
  clearTimeout(logTimer);
  logTimer = setTimeout(() => {
    if (!logEl.classList.contains("keep")) logEl.classList.remove("show");
  }, 600);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- 弹窗 ---------------- */
function showModal({ title, body, buttons, cardFace }) {
  return new Promise(resolve => {
    let html = `<h3>${title}</h3>`;
    if (cardFace) {
      const rc = { "普通": "#8bc34a", "稀有": "#42a5f5", "史诗": "#ab47bc", "常备": "#78909c" }[cardFace.rarity] || "#999";
      html += `<div class="card-face">
        <div class="c-rarity" style="background:${rc}22;color:${rc}">🌈 ${cardFace.rarity} · ${cardFace.ref || ""}</div>
        <div class="c-name">🍯 ${cardFace.name}</div>
        <div class="c-desc">${cardFace.desc}</div>
      </div>`;
    } else {
      html += `<div class="m-body">${body || ""}</div>`;
    }
    html += `<div class="m-btns">` + buttons.map((b, i) =>
      `<button data-i="${i}" class="${b.secondary ? "secondary" : ""}">${b.label}</button>`).join("") + `</div>`;
    modal.innerHTML = html;
    mask.style.display = "flex";
    modal.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => { mask.style.display = "none"; resolve(buttons[+btn.dataset.i].value); };
    });
    // v0.8b：点击弹窗外空白处 = 关闭（无按钮时返回 null）
    mask.onclick = e => {
      if (e.target !== mask) return;
      mask.style.display = "none";
      resolve(buttons && buttons.length ? buttons[buttons.length - 1].value : null);
    };
  });
}

/* ============================================================
 * 2D 横屏俯视棋盘（Canvas 2D，经典大富翁版式）
 * ============================================================ */
const css = n => "#" + n.toString(16).padStart(6, "0");
let canvas, ctx, DPR = 1;
let viewScale = 1, viewOX = 0, viewOY = 0, fitScale = 1;
let dirty = true;                 // 脏标记：仅在需要时重绘
const bears = {};                 // playerId -> {px, py}（棋盘逻辑坐标）
const TILE = 72;                  // 1 格逻辑边长
let decoTrees = [];               // 中央装饰（初始化时固定）
let marginBushes = [], marginFlies = [];  // 棋盘外围装饰（v0.9b）

// 32 格 -> 10x8 方环网格坐标（v0.5 修复：左列原公式与左下角重叠且漏一格，导致首尾断开）
function tileGrid(pos) {
  if (pos <= 9)        return { x: -4.5 + pos,       z: -3.5 };
  if (pos <= 15)       return { x: 4.5,              z: -2.5 + (pos - 10) };
  if (pos <= 25)       return { x: 4.5 - (pos - 16), z: 3.5 };
  return { x: -4.5, z: 2.5 - (pos - 26) };   // 26→2.5 … 31→-2.5，首尾与起点格相接
}
// 网格 -> 棋盘逻辑像素（棋盘中心为原点）
function tilePx(pos) {
  const g = tileGrid(pos);
  return { px: g.x * TILE, py: g.z * TILE };
}

function initScene() {
  canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
  $("scene-container").appendChild(canvas);
  ctx = canvas.getContext("2d");

  // 中央装饰树（固定伪随机，保证每次重绘一致）
  decoTrees = [];
  let seed = 20261125;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 12; i++) {
    const tx = (rnd() - 0.5) * 6.8, tz = (rnd() - 0.5) * 4.8;
    if (Math.abs(tx) < 1.6 && Math.abs(tz) < 1.4) continue;
    decoTrees.push({ x: tx, z: tz, dark: i % 2 === 0 });
  }

  // v0.9b：棋盘外围装饰（灌木剪影 + 萤火虫），填充两侧/上下空区
  marginBushes = [];
  marginFlies = [];
  let seed2 = 20261126;
  const rnd2 = () => (seed2 = (seed2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 90; i++) {
    const tx = (rnd2() - 0.5) * 22, tz = (rnd2() - 0.5) * 15;
    // 只保留棋盘底板之外的区域
    if (Math.abs(tx) < 6.2 && Math.abs(tz) < 5.0) continue;
    if (rnd2() < 0.62) {
      marginBushes.push({
        x: tx, z: tz, s: 0.55 + rnd2() * 0.85,
        dark: rnd2() < 0.5, rot: rnd2() * Math.PI,
      });
    } else {
      marginFlies.push({ x: tx, z: tz, ph: rnd2() * Math.PI * 2, sp: 0.4 + rnd2() * 0.8, r: 1.6 + rnd2() * 1.6 });
    }
  }

  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * DPR);
    canvas.height = Math.round(innerHeight * DPR);
    // 棋盘 10×8 格：约 720×576，加边距适配横屏
    fitScale = Math.min(innerWidth / 820, innerHeight / 640);
    dirty = true;
  };
  addEventListener("resize", resize);
  resize();

  // 视角控制：拖动平移 + 滚轮缩放；点击（未拖动）时命中格子
  let dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
  canvas.addEventListener("pointerdown", e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; downX = e.clientX; downY = e.clientY;
  });
  addEventListener("pointerup", e => {
    if (dragging && Math.hypot(e.clientX - downX, e.clientY - downY) < 8) {
      handleCanvasClick(e.clientX, e.clientY);
    }
    dragging = false;
  });
  addEventListener("pointermove", e => {
    if (!dragging) return;
    viewOX += (e.clientX - lastX) / viewScale;
    viewOY += (e.clientY - lastY) / viewScale;
    lastX = e.clientX; lastY = e.clientY;
    dirty = true;
  });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const k = e.deltaY > 0 ? 0.92 : 1.09;
    const ns = Math.min(2.2, Math.max(0.6, viewScale * k));
    if (ns !== viewScale) { viewScale = ns; dirty = true; }
  }, { passive: false });

  (function loop() {
    requestAnimationFrame(loop);
    if (dirty) { dirty = false; render(); }
  })();
}

/* 屏幕坐标 -> 棋盘逻辑坐标 */
function screenToBoard(clientX, clientY) {
  const s = viewScale * fitScale;
  return {
    px: (clientX - innerWidth / 2) / s - viewOX,
    py: (clientY - innerHeight / 2) / s - viewOY,
  };
}

/* 点击命中：优先 "没走到的无主领地格"（手动触发结算），其次领地详情，最后卡牌区 */
let pendingTile = null;   // 真人停留已结算过的格子，点击可再看/操作
function handleCanvasClick(clientX, clientY) {
  if (!running || !canvas) return;
  const { px, py } = screenToBoard(clientX, clientY);
  const half = TILE / 2;

  // 卡牌区点击 -> 看卡池
  if (Math.abs(px - (-1.62 * TILE)) < TILE * 0.9 && Math.abs(py + 0.55 * TILE) < TILE * 0.58) return showCardPool("destiny");
  if (Math.abs(px - (1.62 * TILE)) < TILE * 0.9 && Math.abs(py + 0.55 * TILE) < TILE * 0.58) return showCardPool("chance");

  // 格子命中
  for (const t of tiles) {
    const p = tilePx(t.pos);
    if (Math.abs(px - p.px) <= half && Math.abs(py - p.py) <= half) {
      const human = players.find(x => x.isHuman && x.alive);
      if (pendingTile === t && human && human.pos === t.pos) return manualResolve(t);
      return showTileInfo(t);
    }
  }
}

function showCardPool() {
  const rows = CARDS.map(c => `「${c.name}」${c.desc}`).join("\n");
  showModal({
    title: "🎴 卡池一览",
    body: `命运卡与机会卡共用同一卡池（共 ${CARDS.length} 种，按权重洗入 4 处蜂巢牌堆）。\n踩到幸运蜂巢时会摊开 3 张背面朝上的卡，由当前玩家亲手点选一张翻开。\n\n${rows}`,
    buttons: [{ label: "知道了", value: true, secondary: true }],
  });
}

function showTileInfo(t) {
  const human = players.find(x => x.isHuman && x.alive);
  let body = "";
  if (t.type === "land") {
    const mono = monopolyOwner(t.region, t.owner) ? "（当前垄断 ×2）" : "（集齐同区垄断后 ×2）";
    const upg = lv => lv <= CFG.MAX_LEVEL ? Math.round(t.price * CFG.UPG_RATE[lv]) : null;
    body = `${t.region} · 地价 ${t.price} 熊熊币 · 业主：${t.owner ? t.owner.name : "无主"}\n\n` +
      `各等级过路费 ${mono}：\n` +
      `  Lv1（小摊）：$${Math.round(t.price * CFG.RENT_MULT[1])}\n` +
      `  Lv2（小店）：升级费 $${upg(2)} → 过路费 $${Math.round(t.price * CFG.RENT_MULT[2])}\n` +
      `  Lv3（大楼）：升级费 $${upg(3)} → 过路费 $${Math.round(t.price * CFG.RENT_MULT[3])}\n` +
      (t.owner === human && t.level < CFG.MAX_LEVEL
        ? `\n你下一次升级：$${upgradeCost(t, human)}${p_hasPromo(human) ? "（大促销减半）" : ""}`
        : "");
  } else if (t.type === "nest") {
    body = `实体蜂巢牌堆：摊开 3 张背面朝上的卡，由你亲手点选一张翻开\n\n当前牌堆剩余 ${t.deck ? t.deck.length : 0} 张（抽空自动重洗）`;
  } else if (t.type === "jar") {
    body = `被糖浆黏住：支付 ${CFG.JAR_PAY} 或停 1 回合（可用逃脱卡）`;
  } else if (t.type === "start") {
    body = `路过领 ${subsidy()} 熊熊币（并偿还欠款）`;
  } else {
    body = "花田小径，无事发生";
  }
  showModal({ title: `📍 ${t.name}`, body, buttons: [{ label: "关闭", value: true, secondary: true }] });
}
function p_hasPromo(p) { return p && p.holdPromo; }

function invalidate() { dirty = true; }

function shade(hexColor, f) {
  const r = Math.min(255, Math.round(((hexColor >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hexColor >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hexColor & 255) * f));
  return css((r << 16) | (g << 8) | b);
}

function roundRect(x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- 主渲染 ---------------- */
function render() {
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 深林绿桌面（v0.9 高级配色）
  const bg = ctx.createRadialGradient(W / 2, H * 0.32, H * 0.1, W / 2, H / 2, Math.max(W, H) * 0.75);
  bg.addColorStop(0, "#1d4a33");
  bg.addColorStop(0.6, "#123223");
  bg.addColorStop(1, "#081c12");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.setTransform(DPR * viewScale * fitScale, 0, 0, DPR * viewScale * fitScale,
    DPR * (W / DPR / 2 + viewOX * viewScale * fitScale), DPR * (H / DPR / 2 + viewOY * viewScale * fitScale));

  // 外围灌木剪影（两层深浅，营造林间层次）
  marginBushes.forEach(b => {
    ctx.save();
    ctx.translate(b.x * TILE, b.z * TILE);
    ctx.rotate(b.rot);
    const s = b.s * TILE;
    ctx.fillStyle = b.dark ? "rgba(9,32,20,.9)" : "rgba(16,46,30,.85)";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.9, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.55, s * 0.12, s * 0.5, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-s * 0.5, s * 0.18, s * 0.42, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  // 萤火虫（金色光点，柔光晕）
  const now = performance.now();
  marginFlies.forEach(f => {
    const a = 0.35 + 0.3 * Math.sin(now / 900 * f.sp + f.ph);
    const fx = f.x * TILE, fy = f.z * TILE;
    ctx.fillStyle = `rgba(242,201,76,${(a * 0.28).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(fx, fy, f.r * 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(250,225,130,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(fx, fy, f.r, 0, Math.PI * 2); ctx.fill();
  });

  // 米色绒面棋盘底板（带投影 + 金线内框）
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
  roundRect(-5.35 * TILE, -4.35 * TILE, 10.7 * TILE, 8.7 * TILE, 26);
  const bp = ctx.createLinearGradient(0, -4.35 * TILE, 0, 4.35 * TILE);
  bp.addColorStop(0, "#f9f3e2");
  bp.addColorStop(1, "#eee1c2");
  ctx.fillStyle = bp; ctx.fill();
  ctx.restore();
  roundRect(-5.35 * TILE, -4.35 * TILE, 10.7 * TILE, 8.7 * TILE, 26);
  ctx.strokeStyle = "rgba(212,175,55,.65)"; ctx.lineWidth = 2.5; ctx.stroke();
  roundRect(-5.18 * TILE, -4.18 * TILE, 10.36 * TILE, 8.36 * TILE, 20);
  ctx.strokeStyle = "rgba(212,175,55,.22)"; ctx.lineWidth = 1.2; ctx.stroke();

  // 中央场地：两个卡牌区（命运 / 机会）
  drawCardZone(-1.62 * TILE, -0.55 * TILE, "🎴 命运", "#8a7fb8", "好事坏事，天注定");
  drawCardZone(1.62 * TILE, -0.55 * TILE, "🃏 机会", "#f0a63c", "下一次，轮到你运气");

  // 中央蜜金树 + 赛事横幅（金字）
  ctx.font = `${TILE * 0.72}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🌳", 0, -2.35 * TILE);
  ctx.font = `900 ${TILE * 0.24}px "Noto Serif SC", "Microsoft YaHei", serif`;
  ctx.fillStyle = "#9a7b1e";
  ctx.fillText("蜜 熊 岛 大 富 翁", 0, -1.35 * TILE);
  ctx.font = `500 ${TILE * 0.13}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = "#a5926a";
  ctx.fillText("年度财富之争 · 淘汰制", 0, -1.02 * TILE);

  // 棋盘格
  tiles.forEach(t => drawTile(t, tilePx(t.pos)));

  // 熊熊（最后画，永远在最上层）
  players.filter(p => p.alive).forEach(p => drawBear(p));
}

/* 卡牌区（v0.9：玻璃卡座 + 带影卡叠） */
function drawCardZone(cx, cy, title, color, sub) {
  const w = TILE * 1.85, h = TILE * 1.12;
  ctx.save();
  // 卡座底板
  ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
  roundRect(cx - w / 2, cy - h / 2, w, h, 14);
  ctx.fillStyle = "rgba(255,252,244,.94)"; ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
  roundRect(cx - w / 2 + 4, cy - h / 2 + 4, w - 8, h - 8, 11);
  ctx.strokeStyle = "rgba(212,175,55,.35)"; ctx.lineWidth = 1; ctx.stroke();
  // 叠放的三张卡（带投影，最上面一张盖金纹背）
  const stack = [[-6, 3, -0.16], [4, -2, 0.12], [0, 0, -0.02]];
  stack.forEach(([ox, oy, rot], i) => {
    ctx.save(); ctx.translate(cx + ox, cy + oy - TILE * 0.02); ctx.rotate(rot);
    if (i < 2) ctx.shadowColor = "rgba(0,0,0,.18)", ctx.shadowBlur = 5, ctx.shadowOffsetY = 2;
    roundRect(-TILE * 0.26, -TILE * 0.33, TILE * 0.52, TILE * 0.66, 7);
    if (i < 2) { ctx.fillStyle = css(typeof color === "string" ? 0xffffff : color); ctx.globalAlpha = 0.01; ctx.fill(); ctx.globalAlpha = 1; ctx.shadowColor = "transparent"; }
    ctx.fillStyle = i === 2 ? "#fffdf5" : "#f3e9cf";
    ctx.fill();
    ctx.strokeStyle = i === 2 ? color : "rgba(150,120,60,.45)"; ctx.lineWidth = 2; ctx.stroke();
    if (i === 2) {
      ctx.strokeStyle = "rgba(212,175,55,.5)"; ctx.lineWidth = 1;
      roundRect(-TILE * 0.21, -TILE * 0.28, TILE * 0.42, TILE * 0.56, 5); ctx.stroke();
    }
    ctx.restore();
  });
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `900 ${TILE * 0.2}px "Noto Serif SC", "Microsoft YaHei", serif`;
  ctx.fillStyle = "#4a3316";
  ctx.fillText(title, cx, cy + h * 0.30);
  ctx.font = `500 ${TILE * 0.12}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = "#9a8358";
  ctx.fillText(sub, cx, cy + h * 0.44);
  ctx.restore();
}

function drawTile(t, { px, py }) {
  const half = TILE / 2 - 3;
  let fill, fillNum;
  if (t.type === "land") { fillNum = REGION_COLOR[t.region]; fill = css(fillNum); }
  else if (t.type === "start") { fillNum = 0xf0b93c; fill = css(fillNum); }
  else if (t.type === "nest") { fillNum = 0xf2cf5e; fill = css(fillNum); }
  else if (t.type === "jar") { fillNum = 0xe89ab2; fill = css(fillNum); }
  else { fillNum = 0xf0e8d2; fill = css(fillNum); }

  // 格子底板（v0.9：投影 + 纵向渐变，微立体）
  ctx.save();
  ctx.shadowColor = "rgba(60,42,10,.30)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
  roundRect(px - half, py - half, half * 2, half * 2, 10);
  const tg = ctx.createLinearGradient(px, py - half, px, py + half);
  tg.addColorStop(0, shade(fillNum, 1.12));
  tg.addColorStop(1, shade(fillNum, 0.87));
  ctx.fillStyle = tg; ctx.fill();
  ctx.restore();
  roundRect(px - half, py - half, half * 2, half * 2, 10);
  ctx.strokeStyle = "rgba(90,60,20,.28)"; ctx.lineWidth = 1.5; ctx.stroke();

  // 业主色边框
  if (t.type === "land" && t.owner) {
    roundRect(px - half - 2, py - half - 2, half * 2 + 4, half * 2 + 4, 11);
    ctx.strokeStyle = css(t.owner.color); ctx.lineWidth = 4.5; ctx.stroke();
  }

  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  if (t.type === "start") {
    ctx.font = `${TILE * 0.34}px sans-serif`;
    ctx.fillText("🌳", px, py - TILE * 0.12);
    ctx.font = `bold ${TILE * 0.18}px "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = "#6b4a2b";
    ctx.fillText("起点", px, py + TILE * 0.24);
  } else if (t.type === "nest") {
    // 实体牌堆：几张错开的卡背 + 剩余张数（v0.8）
    ctx.save();
    [[-5, 3, -0.16], [3, -2, 0.12], [0, 0, 0]].forEach(([ox, oy, rot]) => {
      ctx.save(); ctx.translate(px + ox, py + oy + TILE * 0.04); ctx.rotate(rot);
      roundRect(-TILE * 0.17, -TILE * 0.22, TILE * 0.34, TILE * 0.44, 4);
      ctx.fillStyle = "#fffdf5"; ctx.fill();
      ctx.strokeStyle = "#e0a52e"; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    });
    ctx.font = `${TILE * 0.26}px sans-serif`;
    ctx.fillText("🐝", px, py - TILE * 0.16);
    ctx.font = `bold ${TILE * 0.15}px "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = "#7a5b00";
    ctx.fillText(`牌堆 ${t.deck ? t.deck.length : 0}`, px, py + TILE * 0.32);
    ctx.restore();
  } else if (t.type === "jar") {
    ctx.font = `${TILE * 0.38}px sans-serif`;
    ctx.fillText("🍯", px, py - TILE * 0.1);
    ctx.font = `${TILE * 0.13}px "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = "#a04a68";
    ctx.fillText("蜂蜜糖罐", px, py + TILE * 0.26);
  } else if (t.type === "land") {
    // 建筑图标：Lv1 小摊 / Lv2 小店 / Lv3 大楼
    if (t.owner) {
      const icons = { 1: "⛺", 2: "🏪", 3: "🏢" };
      ctx.font = `${TILE * 0.34}px sans-serif`;
      ctx.fillText(icons[t.level], px, py - TILE * 0.12);
      // 等级星星
      ctx.font = `${TILE * 0.13}px sans-serif`;
      ctx.fillText("⭐".repeat(t.level), px, py + TILE * 0.14);
    }
    // 产业名
    const nm = t.name.length > 5 ? t.name.slice(0, 5) : t.name;
    ctx.font = `bold ${TILE * 0.14}px "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = t.owner ? "#3a2608" : "rgba(58,38,8,.85)";
    ctx.fillText(nm, px, py - TILE * 0.02);
    // 地价（醒目，标在格子中下部）
    ctx.font = `bold ${TILE * 0.2}px "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = "#c0392b";
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 3;
    ctx.strokeText(`$${t.price}`, px, py + TILE * 0.28);
    ctx.fillText(`$${t.price}`, px, py + TILE * 0.28);
  } else {
    ctx.font = `${TILE * 0.2}px sans-serif`;
    ctx.fillText("🌼", px, py);
  }
}

/* ---------------- 2D 熊熊 ---------------- */
function bearSlot(pos, playerIdx) {
  const { px, py } = tilePx(pos);
  const offs = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]];
  const o = offs[playerIdx % 4];
  return { px: px + o[0] * TILE, py: py + o[1] * TILE };
}

function drawBear(p) {
  const b = bears[p.id];
  if (!b) return;
  const x = b.px, y = b.py;
  const col = css(p.color), dark = shade(p.color, 0.55);
  // 影子
  ctx.fillStyle = "rgba(60,40,10,.22)";
  ctx.beginPath(); ctx.ellipse(x, y + 13, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
  // 身体
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(x, y, 11, 12, 0, 0, Math.PI * 2); ctx.fill();
  // 耳朵
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(x - 8, y - 13, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 8, y - 13, 4.5, 0, Math.PI * 2); ctx.fill();
  // 头
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y - 9, 10, 0, Math.PI * 2); ctx.fill();
  // 口鼻
  ctx.fillStyle = "#fff1dc";
  ctx.beginPath(); ctx.ellipse(x, y - 6, 5.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(x, y - 7.5, 2, 0, Math.PI * 2); ctx.fill();
  // 当前回合光环
  if (players[turnIdx] === p && running) {
    ctx.strokeStyle = "#f7b733"; ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(x, y - 2, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  // 名字牌
  ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tw = ctx.measureText(p.name).width + 10;
  ctx.fillStyle = "rgba(255,252,240,.92)";
  roundRect(x - tw / 2, y - 33, tw, 14, 7); ctx.fill();
  ctx.fillStyle = "#6b4a2b";
  ctx.fillText(p.name, x, y - 26);
}

async function hopBear(p, targetPos) {
  const from = bears[p.id] ? { ...bears[p.id] } : bearSlot(p.pos, p.idx);
  const to = bearSlot(targetPos, p.idx);
  const t0 = performance.now(), dur = 260;
  return new Promise(res => {
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = k * k * (3 - 2 * k);
      bears[p.id] = {
        px: from.px + (to.px - from.px) * e,
        py: from.py + (to.py - from.py) * e - Math.sin(k * Math.PI) * 18,
      };
      dirty = true;
      if (k < 1) requestAnimationFrame(step); else res();
    })();
  });
}

/* ---------------- 地产视觉刷新（状态即画面，标记重绘即可） ---------------- */
function updateTileVisual(tile) { invalidate(); }

/* ---------------- 玩家 ---------------- */
function makePlayer(char, idx, isHuman) {
  const p = {
    id: "p" + idx, idx, char, isHuman, name: char.name, color: char.color,
    cash: CFG.START_CASH, debt: 0, laps: 0, hasLoaned: false,
    pos: 0, alive: true, skipTurns: 0, holdEscape: false, holdPromo: false, props: [],
  };
  bears[p.id] = bearSlot(0, idx);
  invalidate();
  return p;
}

/* ---------------- 经济结算 ---------------- */
function monopolyOwner(region, owner) {
  const regionTiles = tiles.filter(t => t.type === "land" && t.region === region);
  return regionTiles.every(t => t.owner === owner) ? owner : null;
}

function computeRent(tile) {
  const owner = tile.owner;
  let rent = Math.round(tile.price * CFG.RENT_MULT[tile.level]);
  if (monopolyOwner(tile.region, owner)) rent = Math.round(rent * CFG.MONOPOLY_MULT);
  if (owner.char.id === "mituantuan" && tile.region === "蜂蜜花田") rent = Math.round(rent * 1.2);
  return rent;
}

function upgradeCost(tile, p) {
  let cost = Math.round(tile.price * CFG.UPG_RATE[tile.level + 1]);
  if (p && p.holdPromo) cost = Math.ceil(cost / 2);
  return cost;
}

function buyPrice(tile, p) {
  let price = tile.price;
  if (p.char.id === "xueqiuqiu" && tile.region === "渔夫湾") price = Math.round(price * 0.8);
  if (p.char.id === "tuanzi" && tile.region === "竹笋竹林") price = Math.round(price * 0.8);
  return price;
}

/* ---------------- AI 难度（v0.4 新增；不改规则，只改 AI 决策风格） ---------------- */
const DIFF_NAME = { easy: "简单", normal: "普通", hard: "困难" };

// 综合身价最高者 = 领先者（现金 + 产业总地价）
function leaderPlayer() {
  let best = null, bestVal = -1;
  players.filter(p => p.alive).forEach(p => {
    const v = p.cash + p.props.reduce((s, t) => s + t.price, 0);
    if (v > bestVal) { bestVal = v; best = p; }
  });
  return best;
}
function regionOwnCount(region, owner) {
  return tiles.filter(t => t.type === "land" && t.region === region && t.owner === owner).length;
}
function regionTotal(region) {
  return tiles.filter(t => t.type === "land" && t.region === region).length;
}

function aiWantsBuy(p, tile, price) {
  if (p.cash < price) return false;
  if (aiDifficulty === "easy") return p.cash - price >= 500 && Math.random() < 0.7;
  if (aiDifficulty === "hard") {
    const lead = leaderPlayer();
    const mine = regionOwnCount(tile.region, p);
    // 冲自家垄断：已有同区产业就优先拿下（可压低保留现金）
    if (mine >= 1) return p.cash - price >= 100;
    // 卡位：领先者在该区已有 ≥2 块，买下阻断其垄断
    if (lead && lead !== p && regionOwnCount(tile.region, lead) >= 2) return p.cash - price >= 150;
    return p.cash - price >= CFG.AI_RESERVE;
  }
  return p.cash - price >= CFG.AI_RESERVE; // 普通
}

function aiWantsUpgrade(p, tile, cost) {
  if (p.cash < cost) return false;
  if (aiDifficulty === "easy") return p.cash - cost >= 600 && Math.random() < 0.6;
  if (aiDifficulty === "hard") {
    const mine = regionOwnCount(tile.region, p);
    // 已垄断的区域优先升级（垄断×2 收益最大化）
    if (mine === regionTotal(tile.region)) return p.cash - cost >= 100;
    if (mine >= 2) return p.cash - cost >= 200;
    return p.cash - cost >= CFG.AI_RESERVE + 100;
  }
  return p.cash - cost >= CFG.AI_RESERVE + 100; // 普通
}

/* 向 payer 收 amount；payee 为 null 表示交给银行。返回 payer 是否存活 */
async function charge(payer, amount, payee, reason) {
  if (amount <= 0) return true;
  // 破产清算：自动变卖（从最便宜的产业开始）
  while (payer.cash < amount && payer.props.length > 0) {
    payer.props.sort((a, b) => a.price - b.price);
    const t = payer.props.shift();
    const gain = Math.round(t.price * CFG.SELL_RATE);
    payer.cash += gain;
    t.owner = null; t.level = 1;
    updateTileVisual(t);
    log(`💸 ${payer.name} 以半价变卖了「${t.name}」（+${gain}）来抵债`, "l-bad");
    updateUI();
    await sleep(500);
  }
  if (payer.cash < amount) {
    if (!payer.hasLoaned && payer.laps < CFG.LOAN_LAPS) {
      const shortfall = amount - payer.cash;
      payer.debt += Math.round(shortfall * CFG.LOAN_MULT);
      payer.cash = amount;
      payer.hasLoaned = true;
      log(`🍯 ${payer.name} 向蜜金树借了 ${shortfall} 熊熊币（下次经过起点需还 ${payer.debt}）`, "l-sys");
    } else {
      await eliminate(payer, payee, reason);
      return false;
    }
  }
  payer.cash -= amount;
  if (payee && payee.alive) payee.cash += amount;
  log(`💰 ${payer.name} 支付了 ${amount} 熊熊币（${reason}）${payee ? `给 ${payee.name}` : ""}`, amount > 300 ? "l-bad" : "");
  updateUI();
  return true;
}

async function eliminate(p, creditor, reason) {
  p.alive = false;
  (p.props || []).forEach(t => {
    t.owner = creditor && creditor.alive ? creditor : null;
    if (creditor && creditor.alive) creditor.props.push(t);
    updateTileVisual(t);
  });
  p.props = [];
  delete bears[p.id];
  invalidate();
  log(`🍞 ${p.name} 破产出局（${reason}），去面包房打工啦——明年再见！` + (creditor ? `产业全部移交给 ${creditor.name}。` : ""), "l-bad");
  updateUI();
  await sleep(1200);
}

function checkWinner() {
  const alive = players.filter(p => p.alive);
  if (alive.length === 1 && running) {
    running = false;
    const w = alive[0];
    log(`👑 ${w.name} 成为年度熊熊首富！金蜂蜜王冠加冕！`, "l-good");
    showModal({
      title: "👑 比赛结束！",
      body: `${w.name}（${w.char.species}）成为年度熊熊首富！\n\n最终持有 ${w.cash} 熊熊币 + ${w.props.length} 块产业。\n\n戴上传说的金蜂蜜王冠！🏆`,
      buttons: [{ label: "再来一局", value: "restart", secondary: false }],
    }).then(() => location.reload());
    return true;
  }
  return false;
}

/* ---------------- 过起点 ---------------- */
const subsidy = () => Math.round(CFG.START_CASH * CFG.START_SUBSIDY_RATE);
async function grantStart(p) {
  p.laps++;
  p.cash += subsidy();
  log(`🌳 ${p.name} 路过蜜金树，领取例奖 +${subsidy()} 熊熊币`, "l-good");
  if (p.debt > 0) {
    const repay = Math.min(p.cash, p.debt);
    p.cash -= repay; p.debt -= repay;
    log(` ↳ 偿还蜜金树借款 ${repay}${p.debt === 0 ? "（已还清！）" : ""}`, "l-sys");
  }
  updateUI();
}

/* ---------------- 回合流程 ---------------- */
function aliveIdxFrom(i) {
  for (let k = 0; k < players.length; k++) {
    const idx = (i + k) % players.length;
    if (players[idx].alive) return idx;
  }
  return -1;
}

async function nextTurn() {
  if (!running || checkWinner()) return;
  turnIdx = aliveIdxFrom(turnIdx);
  const p = players[turnIdx];
  updateUI();
  if (p.skipTurns > 0) {
    p.skipTurns--;
    log(`😴 ${p.name} 正在冬眠/被糖罐黏住，跳过本回合`, "l-sys");
    updateUI();
    await sleep(1000);
    turnIdx = (turnIdx + 1) % players.length;
    return nextTurn();
  }
  if (p.char.id === "shuishuilu" && Math.random() < 0.2) {
    p.cash += 50;
    log(`💤 ${p.name} 睡着睡着手边多了 50 熊熊币（角色特性）`, "l-good");
    updateUI();
  }
  if (p.isHuman) {
    turnBanner.textContent = `🍯 轮到你了：${p.name} · 掷骰子吧！`;
    rollBtn.style.display = "block";
    rollBtn.disabled = false;
  } else {
    turnBanner.textContent = `🤖 ${p.name} 正在思考…`;
    rollBtn.style.display = "none";
    await sleep(1100);
    await doRoll(p);
    if (!running || checkWinner()) return;
    turnIdx = (turnIdx + 1) % players.length;
    nextTurn();
  }
}

async function doRoll(p) {
  rollBtn.disabled = true;
  const n = 1 + Math.floor(Math.random() * 6);
  diceEl.textContent = `🎲 ${n}`;
  diceEl.style.display = "block";
  log(`🎲 ${p.name} 掷出 ${n} 点`);
  await sleep(700);
  await movePlayer(p, n, false);
  diceEl.style.display = "none";
  if (p.alive) await resolveTile(p);
}

async function movePlayer(p, steps, backward) {
  for (let i = 0; i < steps; i++) {
    p.pos = (p.pos + (backward ? -1 : 1) + 32) % 32;
    await hopBear(p, p.pos);
    if (p.pos === 0 && !backward) await grantStart(p);
  }
  updateUI();
}

/* ---------------- 落格结算 ----------------
 * v0.6b：领地不自动弹窗。真人回合在此挂起，等玩家点击该格后再继续
 * （修复：原实现不阻塞，AI 回合会清掉 pendingTile 导致点击无效）
 */
let humanTileResolve = null;   // 挂起回合的恢复函数

async function resolveTile(p) {
  if (!p.alive || !running) return;
  pendingTile = null;
  const t = tiles[p.pos];
  if (t.type === "land") {
    if (p.isHuman) {
      showTilePrompt(t, p);
      await new Promise(res => { humanTileResolve = res; pendingTile = t; });
      return;
    }
    await resolveLand(p, t);
  } else if (t.type === "nest") await nestFlow(p, t);
  else if (t.type === "jar") await jarFlow(p);
  else if (t.type === "path") { log(`🌿 ${p.name} 在花田小径散了个步`); await sleep(600); }
}

/* 领地高亮提示条 */
function showTilePrompt(t, p) {
  const act = !t.owner ? `点击格子买下（$ ${buyPrice(t, p)}）`
    : t.owner === p ? (t.level >= CFG.MAX_LEVEL ? "已满级" : `点击格子升级（$ ${upgradeCost(t, p)}）`)
    : `业主 ${t.owner.name} · 过路费 ${computeRent(t)}`;
  const bar = $("tile-hint");
  bar.innerHTML = `📍 <b>${t.name}</b> · ${act}`;
  bar.style.display = "block";
  invalidate();
}
function hideTilePrompt() {
  const bar = $("tile-hint");
  if (bar) bar.style.display = "none";
}

/* 玩家点击停驻领地格 -> 执行买/升级/付过路费，然后恢复回合 */
async function manualResolve(t) {
  if (!pendingTile || pendingTile !== t || !humanTileResolve) return;
  const p = players.find(x => x.isHuman && x.alive);
  const res = humanTileResolve;
  humanTileResolve = null;
  pendingTile = null;
  hideTilePrompt();
  if (!p) { res(); return; }
  if (t.owner && t.owner !== p) {
    const rent = computeRent(t);
    log(`💰 ${p.name} 支付过路费 ${rent} 给 ${t.owner.name}`, "l-bad");
    await charge(p, rent, t.owner, `${t.name} 过路费`);
  } else {
    await resolveLand(p, t, true);
  }
  res();
}

async function resolveLand(p, t, fromClick) {
  if (!t.owner) {
    const price = buyPrice(t, p);
    let bought = false;
    if (p.isHuman) {
      bought = await showModal({
        title: `🐝 「${t.name}」无主`,
        body: `${t.region} · 地价 ${price} 熊熊币${price !== t.price ? `（角色折扣，原价 ${t.price}）` : ""}\nLv1 过路费 ${Math.round(t.price * CFG.RENT_MULT[1])} · Lv3 过路费 ${Math.round(t.price * CFG.RENT_MULT[3])}\n\n你的现金：${p.cash}`,
        buttons: [{ label: `买下（-${price}）`, value: true }, { label: "放弃", value: false, secondary: true }],
      });
    } else {
      bought = aiWantsBuy(p, t, price);
    }
    if (bought && p.cash >= price) {
      p.cash -= price;
      t.owner = p;
      p.props.push(t);
      updateTileVisual(t);
      log(`🏠 ${p.name} 买下了「${t.name}」（-${price}）`, "l-good");
    } else if (bought) {
      log(`💸 ${p.name} 想买「${t.name}」但现金不足`, "l-sys");
    }
    updateUI();
  } else if (t.owner === p) {
    if (t.level >= CFG.MAX_LEVEL) {
      log(`⭐ 「${t.name}」已是满级大楼，无需改造`);
      await sleep(400);
      return;
    }
    const cost = upgradeCost(t, p);
    const nextLv = t.level + 1;
    let up = false;
    if (p.isHuman) {
      up = await showModal({
        title: `🔨 升级「${t.name}」`,
        body: `Lv${t.level} → Lv${nextLv}（${["小摊", "小店", "大楼"][t.level]} → ${["小摊", "小店", "大楼"][t.level]}）\n升级费 ${cost} 熊熊币${p.holdPromo ? "（大促销已减半！）" : ""}\n升级后过路费：${Math.round(t.price * CFG.RENT_MULT[t.level])} → ${Math.round(t.price * CFG.RENT_MULT[nextLv])}\n\n你的现金：${p.cash}`,
        buttons: [{ label: `升级到 Lv${nextLv}`, value: true }, { label: "下次再说", value: false, secondary: true }],
      });
    } else {
      up = aiWantsUpgrade(p, t, cost);
    }
    if (up && p.cash >= cost) {
      p.cash -= cost;
      if (p.holdPromo) { p.holdPromo = false; log(`🎫 ${p.name} 使用了「蜂蜜大促销」，升级费减半！`, "l-good"); }
      t.level = nextLv;
      updateTileVisual(t);
      log(`🔨 「${t.name}」升级到 Lv${nextLv}（-${cost}）`, "l-good");
    }
    updateUI();
  } else {
    const rent = computeRent(t);
    if (!fromClick) pendingTile = null;
    log(`⚠️ ${p.name} 踩到了 ${t.owner.name} 的「${t.name}」（Lv${t.level}${monopolyOwner(t.region, t.owner) ? " · 垄断×2" : ""}），需付过路费 ${rent}`, "l-bad");
    await sleep(900);
    await charge(p, rent, t.owner, `${t.name} 过路费`);
  }
}

/* v0.8：蜂巢实体牌堆抽卡——摊开 3 张背面朝上的卡，真人点选一张翻开 */
async function nestFlow(p, t) {
  const hand = [drawFrom(t), drawFrom(t), drawFrom(t)];
  log(`🃏 ${p.name} 翻开蜂巢牌堆，摊出 3 张牌…`, "l-card");
  invalidate();
  let card;
  if (p.isHuman) {
    card = await showPickSpread(p, hand, t);
  } else {
    await sleep(1000);
    card = aiPickCard(p, hand);
  }
  if (p.char.id === "yueyaer" && card.amount < 0 && Math.random() < 0.5) {
    card = BLESSING_FALLBACK;
    log(`🌙 ${p.name} 的占卜扭转了厄运（角色特性）`, "l-good");
  }
  log(`🃏 ${p.name} 抽到了「${card.name}」`, "l-card");
  if (!p.isHuman) {
    await showModal({
      title: `🐝 幸运蜂巢 · ${p.name} 选牌`,
      cardFace: card,
      buttons: [{ label: "执行效果", value: true }],
    });
  }
  await applyCard(p, card);
}

/* AI 选牌：给手牌打分，难度越高越会挑 */
function cardScore(c) {
  if (c.mode === "hold") return c.hold === "escape" ? 140 : 110;
  if (c.amount > 0) return c.amount;
  if (c.amount < 0) return c.amount * 0.8;
  if (c.name === "顺风快递" || c.name === "前往蜜金树") return 170;
  if (c.name === "冬眠") return -80;
  if (c.name === "迷路") return -20;
  return 20;
}
function aiPickCard(p, hand) {
  const sorted = [...hand].sort((a, b) => cardScore(b) - cardScore(a));
  if (aiDifficulty === "hard") return sorted[0];
  if (aiDifficulty === "normal") return sorted[Math.random() < 0.5 ? 0 : 1];
  return hand[Math.floor(Math.random() * hand.length)];
}

/* 真人摊牌选卡：点击卡背 → 翻面展示 → 1.4s 后自动收牌 */
function showPickSpread(p, hand, t) {
  return new Promise(resolve => {
    const rc = r => ({ "普通": "#8bc34a", "稀有": "#42a5f5", "史诗": "#ab47bc", "常备": "#78909c" }[r] || "#999");
    let html = `<h3>🐝 幸运蜂巢 · ${p.name} 抽卡</h3>
      <div class="pick-sub">牌堆剩 ${t.deck.length} 张 · 蜂婆婆把牌摊开了，点选一张翻开</div>
      <div class="pick-row">`;
    hand.forEach((c, i) => { html += `<div class="pick-card" data-i="${i}"><div class="pick-back">🐝<span>?</span></div></div>`; });
    html += `</div>`;
    modal.innerHTML = html;
    mask.style.display = "flex";
    mask.onclick = null;   // 摊牌必须选一张，不允许点空白关闭
    modal.querySelectorAll(".pick-card").forEach(el => {
      el.onclick = () => {
        const c = hand[+el.dataset.i];
        const col = rc(c.rarity);
        el.classList.add("picked");
        el.innerHTML = `<div class="pick-front" style="border-color:${col}">
          <div class="c-rarity" style="background:${col}22;color:${col}">🌈 ${c.rarity} · ${c.ref || ""}</div>
          <div class="c-name">🍯 ${c.name}</div>
          <div class="c-desc">${c.desc}</div>
        </div>`;
        modal.querySelectorAll(".pick-card").forEach(o => { if (o !== el) o.classList.add("dim"); });
        setTimeout(() => { mask.style.display = "none"; resolve(c); }, 1400);
      };
    });
  });
}

async function applyCard(p, card) {
  if (card.mode === "hold") {
    if (card.hold === "escape") {
      if (p.holdEscape) log(`😚 ${p.name} 手里已有逃脱卡，这张没拿住飘走了`, "l-sys");
      else { p.holdEscape = true; log(`🎫 ${p.name} 收好了「糖罐逃脱卡」`, "l-good"); }
    } else {
      if (p.holdPromo) log(`😚 ${p.name} 手里已有大促销，这张没拿住飘走了`, "l-sys");
      else { p.holdPromo = true; log(`🎫 ${p.name} 收好了「蜂蜜大促销」`, "l-good"); }
    }
    updateUI();
    return;
  }
  switch (card.name) {
    case "冬眠":
      p.skipTurns += 1;
      log(`😴 ${p.name} 开始冬眠，下回合跳过`, "l-bad");
      break;
    case "迷路":
      await movePlayer(p, 3, true);
      await resolveTile(p);
      break;
    case "顺风奔跑":
      await movePlayer(p, 3, false);
      await resolveTile(p);
      break;
    case "前往蜜金树": {
      while (p.pos !== 0) { p.pos = (p.pos + 1) % 32; await hopBear(p, p.pos); }
      await grantStart(p);
      break;
    }
    case "蜜税蜂": {
      const total = p.props.reduce((s, t) => s + t.price, 0);
      const tax = Math.round(total * 0.1);
      if (tax > 0) await charge(p, tax, null, "蜜税蜂缴税");
      else log(`😅 ${p.name} 没有产业，税务蜂白跑一趟`);
      break;
    }
    case "修屋顶费": {
      const n = p.props.filter(t => t.level >= 2).length;
      if (n > 0) await charge(p, n * card.amount, null, `修缮 ${n} 块 Lv2+ 产业`);
      else log(`😅 ${p.name} 没有 Lv2 以上产业，不用修`);
      break;
    }
    case "顺风快递": {
      log(`📦 ${p.name} 再掷一次！`, "l-card");
      await sleep(500);
      await doRoll(p);
      break;
    }
    case "搬家券": {
      const others = players.filter(o => o.alive && o !== p && o.props.length > 0);
      if (p.props.length === 0 || others.length === 0) { log(`😅 没有可交换的产业，搬家券作废`, "l-sys"); break; }
      p.props.sort((a, b) => a.price - b.price);
      const mine = p.props[0];
      // 困难档：优先换领先者最好的产业
      let o;
      if (aiDifficulty === "hard") {
        const lead = leaderPlayer();
        const pool = (lead && lead !== p && lead.alive && lead.props.length > 0) ? [lead] : others;
        o = pool[Math.floor(Math.random() * pool.length)];
      } else {
        o = others[Math.floor(Math.random() * others.length)];
      }
      o.props.sort((a, b) => b.price - a.price);
      const theirs = o.props[0];
      [mine.owner, theirs.owner] = [theirs.owner, mine.owner];
      p.props[p.props.indexOf(mine)] = theirs;
      o.props[o.props.indexOf(theirs)] = mine;
      updateTileVisual(mine); updateTileVisual(theirs);
      log(`📦 ${p.name} 用「${mine.name}」换来了 ${o.name} 的「${theirs.name}」！`, "l-card");
      break;
    }
    case "蜂蜜暴雨":
    case "生日派对":
    case "蜂王巡游": {
      for (const o of players.filter(x => x.alive && x !== p)) {
        if (!p.alive) break;
        await charge(o, card.amount, p, card.name);
        await sleep(250);
      }
      break;
    }
    default:
      if (card.amount > 0) { p.cash += card.amount; log(`💰 ${p.name} +${card.amount} 熊熊币`, "l-good"); }
      else if (card.amount < 0) await charge(p, -card.amount, null, card.name);
  }
  updateUI();
}

async function jarFlow(p) {
  if (p.holdEscape) {
    p.holdEscape = false;
    log(`🎫 ${p.name} 使用「糖罐逃脱卡」，洗个蜂蜜浴滑了出来！`, "l-good");
    updateUI();
    return;
  }
  if (p.isHuman) {
    const pay = await showModal({
      title: "🍯 掉进蜂蜜糖罐！",
      body: `被糖浆黏住啦！支付 ${CFG.JAR_PAY} 熊熊币请蜂婆婆帮你洗掉，或停留 1 回合。\n\n你的现金：${p.cash}`,
      buttons: [{ label: `付费脱身（-${CFG.JAR_PAY}）`, value: true }, { label: "黏一回合算了", value: false, secondary: true }],
    });
    if (pay && p.cash >= CFG.JAR_PAY) { p.cash -= CFG.JAR_PAY; log(`🧼 ${p.name} 花费 ${CFG.JAR_PAY} 洗掉了糖浆`, "l-sys"); }
    else { p.skipTurns += 1; log(`🍯 ${p.name} 被黏在糖罐里，下回合跳过`, "l-bad"); }
  } else {
    const jarWilling = aiDifficulty === "easy" ? 500 : aiDifficulty === "hard" ? 200 : 300;
    if (p.cash >= jarWilling) { p.cash -= CFG.JAR_PAY; log(`🧼 ${p.name} 花费 ${CFG.JAR_PAY} 洗掉了糖浆`, "l-sys"); }
    else { p.skipTurns += 1; log(`🍯 ${p.name} 被黏在糖罐里，下回合跳过`, "l-bad"); }
  }
  updateUI();
}

/* ---------------- UI 更新（v0.5：右上角紧凑徽章，点击看详情） ---------------- */
function playerBadges(p) {
  return (p.holdEscape ? "🎫逃脱卡 " : "") + (p.holdPromo ? "🎫大促销 " : "") + (p.hasLoaned ? "🍯已借款" : "");
}

function showPlayerCard(p) {
  showModal({
    title: `${p.alive ? "" : "☠ "}${p.name}（${p.char.species}）${p.isHuman ? " · 你" : ""}`,
    body: `特性：${p.char.trait}\n现金：🍯 ${p.cash}${p.debt > 0 ? `（欠债 ${p.debt}）` : ""}\n圈数：${p.laps}\n产业 ${p.props.length} 块：${p.props.map(t => `「${t.name}」Lv${t.level}`).join("、") || "无"}${playerBadges(p) ? "\n手牌：" + playerBadges(p).trim() : ""}`,
    buttons: [{ label: "关闭", value: true, secondary: true }],
  });
}

function updateUI() {
  playersEl.innerHTML = "";
  players.forEach((p, i) => {
    const c = document.createElement("div");
    c.className = "chip" + (i === turnIdx && running ? " current" : "") + (p.alive ? "" : " dead");
    c.innerHTML = `<span class="dot" style="background:#${p.color.toString(16).padStart(6, "0")}"></span>${p.name}${p.isHuman ? "(你)" : ""}${p.alive ? "" : " ☠"}`;
    c.onclick = () => showPlayerCard(p);
    playersEl.appendChild(c);
  });
  invalidate();
  if (running) {
    const cur = players[turnIdx];
    if (cur && cur.isHuman && rollBtn.style.display === "none") turnBanner.textContent = `🍯 轮到你了：${cur.name} · 掷骰子吧！`;
  }
}

/* ---------------- 开局 ---------------- */
function setupUI() {
  const bearPick = $("bear-pick");
  CHARS.forEach(ch => {
    const d = document.createElement("div");
    d.className = "bear" + (ch === humanChar ? " on" : "");
    d.innerHTML = `<div class="swatch" style="background:#${ch.color.toString(16).padStart(6, "0")}"></div>
      <div class="b-name">${ch.name}</div><div class="b-trait">${ch.species}<br>${ch.trait}</div>`;
    d.onclick = () => {
      humanChar = ch;
      bearPick.querySelectorAll(".bear").forEach(b => b.classList.remove("on"));
      d.classList.add("on");
    };
    bearPick.appendChild(d);
  });
  document.querySelectorAll(".count-btns button").forEach(b => {
    b.onclick = () => {
      totalPlayers = +b.dataset.n;
      document.querySelectorAll(".count-btns button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
    };
  });
  document.querySelectorAll(".diff-btns button").forEach(b => {
    b.onclick = () => {
      aiDifficulty = b.dataset.d;
      document.querySelectorAll(".diff-btns button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
    };
  });
  $("start-btn").onclick = startGame;
}

function startGame() {
  $("setup").style.display = "none";
  initScene();
  const chars = [...CHARS].sort(() => Math.random() - 0.5);
  players.push(makePlayer(humanChar, 0, true));
  for (let i = 1; i < totalPlayers; i++) {
    const ch = chars.find(c => !players.some(p => p.char === c));
    players.push(makePlayer(ch, i, false));
  }
  running = true;
  log(`🍯 蜜熊岛年度大富翁大赛开始！${totalPlayers} 位熊熊参赛（AI 难度：${DIFF_NAME[aiDifficulty]}），最后留下的成为首富！`, "l-card");
  log(`规则：淘汰制 · 踩自己地可升级(最高Lv3) · 垄断过路费×2 · 前 ${CFG.LOAN_LAPS} 圈破产可借款`, "l-sys");
  updateUI();
  nextTurn();
}

rollBtn.onclick = async () => {
  const p = players[turnIdx];
  rollBtn.style.display = "none";
  await doRoll(p);
  if (!running || checkWinner()) return;
  turnIdx = (turnIdx + 1) % players.length;
  nextTurn();
};

setupUI();

/* 调试/测试句柄（tools/logic-smoke-test.js 通过它读取脚本作用域状态） */
globalThis.__G = {
  get players() { return players; },
  get tiles() { return tiles; },
  get running() { return running; },
  get turnIdx() { return turnIdx; },
  get difficulty() { return aiDifficulty; },
  set difficulty(v) { aiDifficulty = v; },
  get pendingTile() { return pendingTile; },
};
