/* ============================================================
 * 《熊熊大富翁》可玩原型 v0.2（2.5D 版）
 * 规则来源：《核心玩法设计.md》GDD v0.5 + 经济调参表 v1
 * 渲染：v0.2 起改为 2.5D 等轴 Canvas 2D（不依赖 WebGL，规则与数值与 v0.1 完全一致）
 * ============================================================ */
"use strict";

/* ---------------- 经济参数（与调参表一致，均可调） ---------------- */
const CFG = {
  START_CASH: 1500,        // 起步熊熊币
  START_SUBSIDY_RATE: 0.10,// 过起点补贴比例
  BASE_PRICE: 300,         // 基准地价
  DIST_DECAY: 0.01,        // 距起点每格折减
  RENT_MULT: { 1: 1.0, 2: 2.5, 3: 5.0 },  // 过路费倍率
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
const REGION_COLOR = { "蜂蜜广场": 0xe07a5f, "蜂蜜花田": 0xf0c95c, "渔夫湾": 0x5fa8d3, "竹笋竹林": 0x9fd8a8, "蘑菇密林": 0x8a7fb8 };

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

function drawCard() {
  const total = CARDS.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CARDS) { r -= c.weight; if (r <= 0) return c; }
  return CARDS[0];
}

/* ---------------- 全局状态 ---------------- */
let tiles = buildTiles();
let players = [];
let turnIdx = 0;
let running = false;
let totalPlayers = 3;
let humanChar = CHARS[0];

/* ---------------- DOM 引用 ---------------- */
const $ = id => document.getElementById(id);
const turnBanner = $("turn-banner"), playersEl = $("players"), logEl = $("log"),
      rollBtn = $("roll-btn"), diceEl = $("dice-result"), mask = $("modal-mask"), modal = $("modal");

function log(msg, cls) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = msg;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
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
  });
}

/* ============================================================
 * 2.5D 等轴 Canvas 场景（替代原 Three.js 3D，规则不变）
 * ============================================================ */
const ISO_HW = 46, ISO_HH = 23;          // 菱形半宽/半高（1 格）
const css = n => "#" + n.toString(16).padStart(6, "0");
let canvas, ctx, DPR = 1;
let viewScale = 1, viewOX = 0, viewOY = 0, fitScale = 1;
let dirty = true;                        // 脏标记：仅在需要时重绘
const bears = {};                        // playerId -> {sx, sy}（屏幕像素坐标）
let decoTrees = [];                      // 中央装饰（初始化时固定随机位置）

// 32 格 -> 10x8 方环网格坐标（与 v0.1 完全一致）
function tileGrid(pos) {
  if (pos <= 9)        return { x: -4.5 + pos,       z: -3.5 };
  if (pos <= 15)       return { x: 4.5,              z: -2.5 + (pos - 10) };
  if (pos <= 25)       return { x: 4.5 - (pos - 16), z: 3.5 };
  return { x: -4.5, z: 3.5 - (pos - 26) };
}
// 网格 -> 等轴屏幕坐标
function isoPt(x, z) { return { sx: (x - z) * ISO_HW, sy: (x + z) * ISO_HH }; }

function initScene() {
  canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
  $("scene-container").appendChild(canvas);
  ctx = canvas.getContext("2d");

  // 固定的中央装饰树位置（固定种子式的伪随机，保证每次重绘一致）
  decoTrees = [];
  let seed = 20261125;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 10; i++) {
    const tx = (rnd() - 0.5) * 7.4, tz = (rnd() - 0.5) * 4.6;
    if (Math.abs(tx) < 1.8 && Math.abs(tz) < 1.6) continue;
    decoTrees.push({ x: tx, z: tz, dark: i % 2 === 0 });
  }

  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const w = innerWidth, h = innerHeight;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    // 棋盘等轴范围：sx ±(8*ISO_HW+边距), sy ±(8*ISO_HH+建筑高度)
    fitScale = Math.min(w / 860, h / 560);
    dirty = true;
  };
  addEventListener("resize", resize);
  resize();

  // 视角控制：拖动平移 + 滚轮缩放（2D，开销极低）
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener("pointerdown", e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  addEventListener("pointerup", () => dragging = false);
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

function invalidate() { dirty = true; }

/* ---------------- 绘制基元 ---------------- */
function diamond(cx, cy, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
  ctx.closePath();
}

// 伪 3D 方块：底面菱形中心 (cx,cy)，高 h，尺寸 s（占格比例）
function drawBox(cx, cy, s, h, topColor, leftColor, rightColor) {
  const hw = ISO_HW * s, hh = ISO_HH * s;
  // 左面
  ctx.fillStyle = leftColor;
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx, cy + hh - h); ctx.lineTo(cx - hw, cy - h);
  ctx.closePath(); ctx.fill();
  // 右面
  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx, cy + hh - h); ctx.lineTo(cx + hw, cy - h);
  ctx.closePath(); ctx.fill();
  // 顶面
  ctx.fillStyle = topColor;
  diamond(cx, cy - h, hw, hh); ctx.fill();
}

function shade(hexColor, f) {  // f<1 变暗，f>1 提亮
  const r = Math.min(255, Math.round(((hexColor >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hexColor >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hexColor & 255) * f));
  return css((r << 16) | (g << 8) | b);
}

/* ---------------- 主渲染 ---------------- */
function render() {
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 天空渐变
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#aee3f5"); sky.addColorStop(1, "#c9ecf7");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  ctx.setTransform(DPR * viewScale * fitScale, 0, 0, DPR * viewScale * fitScale,
    DPR * (W / DPR / 2 + viewOX * viewScale * fitScale), DPR * (H / DPR / 2 + 40 + viewOY * viewScale * fitScale));

  // 中央草地（大菱形）
  ctx.fillStyle = "#a8d878";
  ctx.strokeStyle = "#8fc763"; ctx.lineWidth = 2;
  diamond(0, 0, ISO_HW * 8.6, ISO_HH * 5.6); ctx.fill(); ctx.stroke();

  // 装饰小树（画在草地上，按深度无所谓，都在中央）
  decoTrees.forEach(t => {
    const p = isoPt(t.x, t.z);
    ctx.fillStyle = "#8a5a2b";
    ctx.fillRect(p.sx - 2.5, p.sy - 14, 5, 14);
    ctx.fillStyle = t.dark ? "#5da24a" : "#7cb85c";
    ctx.beginPath(); ctx.moveTo(p.sx, p.sy - 34); ctx.lineTo(p.sx + 11, p.sy - 12); ctx.lineTo(p.sx - 11, p.sy - 12);
    ctx.closePath(); ctx.fill();
  });

  // 中央蜜金树
  const treeP = isoPt(0, 0);
  ctx.fillStyle = "#8a5a2b";
  ctx.fillRect(treeP.sx - 7, treeP.sy - 46, 14, 46);
  ctx.fillStyle = "#c98f3d";
  ctx.fillRect(treeP.sx - 7, treeP.sy - 46, 6, 46);
  ctx.fillStyle = "#f7b733";
  ctx.beginPath(); ctx.arc(treeP.sx, treeP.sy - 62, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffd75e";
  ctx.beginPath(); ctx.arc(treeP.sx - 8, treeP.sy - 68, 10, 0, Math.PI * 2); ctx.fill();

  // 棋盘格（先画全部地面，按深度排序）
  const sorted = [...tiles].map(t => ({ t, g: tileGrid(t.pos) })).sort((a, b) => (a.g.x + a.g.z) - (b.g.x + b.g.z));

  // 第一遍：地面菱形
  sorted.forEach(({ t, g }) => {
    const p = isoPt(g.x, g.z);
    let fill;
    if (t.type === "land") fill = css(REGION_COLOR[t.region]);
    else if (t.type === "start") fill = "#f7b733";
    else if (t.type === "nest") fill = "#ffe066";
    else if (t.type === "jar") fill = "#f39fb6";
    else fill = "#e8e2d4";
    diamond(p.sx, p.sy, ISO_HW * 0.94, ISO_HH * 0.94);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = "rgba(90,60,20,.18)"; ctx.lineWidth = 1.2; ctx.stroke();

    // 业主色边框
    if (t.type === "land" && t.owner) {
      diamond(p.sx, p.sy, ISO_HW * 0.99, ISO_HH * 0.99);
      ctx.strokeStyle = css(t.owner.color); ctx.lineWidth = 4; ctx.stroke();
    }
  });

  // 第二遍：特殊格标志 + 建筑 + 熊熊（按深度统一排序绘制）
  const actors = [];
  sorted.forEach(({ t, g }) => actors.push({ depth: g.x + g.z, draw: () => drawTileProp(t, g) }));
  players.filter(p => p.alive).forEach(p => actors.push({
    depth: bearDepth(p), draw: () => drawBear(p)
  }));
  actors.sort((a, b) => a.depth - b.depth).forEach(a => a.draw());
}

function bearDepth(p) {
  // 与 bearSlot 的网格偏移一致
  const g = tileGrid(p.pos);
  const offs = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]];
  const o = offs[p.idx % 4];
  return g.x + o[0] + g.z + o[1];
}

function drawTileProp(t, g) {
  const p = isoPt(g.x, g.z);
  if (t.type === "start") {
    // 蜜金树小标志已在中央画过，这里画起点旗
    ctx.fillStyle = "#8a5a2b";
    ctx.fillRect(p.sx - 2, p.sy - 30, 4, 30);
    ctx.fillStyle = "#e08e0b";
    ctx.beginPath(); ctx.moveTo(p.sx + 2, p.sy - 30); ctx.lineTo(p.sx + 22, p.sy - 23); ctx.lineTo(p.sx + 2, p.sy - 16);
    ctx.closePath(); ctx.fill();
    ctx.font = "13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("GO", p.sx, p.sy + 5);
  } else if (t.type === "nest") {
    ctx.font = "17px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🐝", p.sx, p.sy - 8);
  } else if (t.type === "jar") {
    ctx.font = "17px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🍯", p.sx, p.sy - 8);
  } else if (t.type === "land" && t.owner) {
    // 建筑：Lv1 小摊 / Lv2 小店+屋顶 / Lv3 大楼+金顶
    const oc = t.owner.color;
    const heights = { 1: 16, 2: 30, 3: 46 };
    const h = heights[t.level];
    const bp = isoPt(g.x + 0.22, g.z - 0.22);
    drawBox(bp.sx, bp.sy, 0.34, h, shade(oc, 1.25), shade(oc, 0.55), shade(oc, 0.8));
    if (t.level >= 2) {
      // 红瓦尖顶
      ctx.fillStyle = "#e07a5f";
      ctx.beginPath();
      ctx.moveTo(bp.sx, bp.sy - h - 14);
      ctx.lineTo(bp.sx + ISO_HW * 0.34, bp.sy - h);
      ctx.lineTo(bp.sx, bp.sy - h + ISO_HH * 0.34);
      ctx.lineTo(bp.sx - ISO_HW * 0.34, bp.sy - h);
      ctx.closePath(); ctx.fill();
    }
    if (t.level >= 3) {
      ctx.fillStyle = "#f7b733";
      ctx.beginPath(); ctx.arc(bp.sx, bp.sy - h - 19, 5, 0, Math.PI * 2); ctx.fill();
    }
    // 地价名牌（Lv1 也显示名字缩写）
    ctx.font = "9px sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = "rgba(90,60,20,.75)";
    const nm = t.name.length > 4 ? t.name.slice(0, 4) : t.name;
    ctx.fillText(nm, p.sx, p.sy + ISO_HH * 0.62);
  }
}

/* ---------------- 2.5D 熊熊 ---------------- */
function makeBear() { /* 渲染层无预置对象，保留空实现以兼容调用 */ }

function bearSlot(pos, playerIdx) {
  const g = tileGrid(pos);
  const offs = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]];
  const o = offs[playerIdx % 4];
  return isoPt(g.x + o[0], g.z + o[1]);
}

function drawBear(p) {
  const b = bears[p.id];
  if (!b) return;
  const x = b.sx, y = b.sy;
  const col = css(p.color), dark = shade(p.color, 0.55);
  // 影子
  ctx.fillStyle = "rgba(60,40,10,.25)";
  ctx.beginPath(); ctx.ellipse(x, y + 3, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
  // 身体
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(x, y - 10, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
  // 耳朵
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(x - 8, y - 24, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 8, y - 24, 4.5, 0, Math.PI * 2); ctx.fill();
  // 头
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y - 20, 10, 0, Math.PI * 2); ctx.fill();
  // 口鼻
  ctx.fillStyle = "#fff1dc";
  ctx.beginPath(); ctx.ellipse(x, y - 17, 5.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(x, y - 18.5, 2, 0, Math.PI * 2); ctx.fill();
  // 名字牌
  ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,252,240,.9)";
  ctx.beginPath();
  const tw = ctx.measureText(p.name).width + 10;
  ctx.roundRect ? (ctx.beginPath(), ctx.roundRect(x - tw / 2, y - 46, tw, 14, 7), ctx.fill()) : ctx.fillRect(x - tw / 2, y - 46, tw, 14);
  ctx.fillStyle = "#6b4a2b";
  ctx.fillText(p.name, x, y - 35);
}

async function hopBear(p, targetPos) {
  const from = bears[p.id] ? { ...bears[p.id] } : bearSlot(p.pos, p.idx);
  const to = bearSlot(targetPos, p.idx);
  const t0 = performance.now(), dur = 200;
  return new Promise(res => {
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = k * k * (3 - 2 * k); // smoothstep
      bears[p.id] = {
        sx: from.sx + (to.sx - from.sx) * e,
        sy: from.sy + (to.sy - from.sy) * e - Math.sin(k * Math.PI) * 22,
      };
      dirty = true;
      if (k < 1) requestAnimationFrame(step); else res();
    })();
  });
}

/* ---------------- 地产视觉刷新（2.5D：状态即画面，标记重绘即可） ---------------- */
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
    await sleep(800);
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
  await sleep(450);
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

/* ---------------- 落格结算 ---------------- */
async function resolveTile(p) {
  if (!p.alive || !running) return;
  const t = tiles[p.pos];
  if (t.type === "land") await resolveLand(p, t);
  else if (t.type === "nest") await nestFlow(p);
  else if (t.type === "jar") await jarFlow(p);
  else if (t.type === "path") { log(`🌿 ${p.name} 在花田小径散了个步`); await sleep(500); }
}

async function resolveLand(p, t) {
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
      bought = p.cash - price >= CFG.AI_RESERVE;
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
      up = p.cash - cost >= CFG.AI_RESERVE + 100;
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
    log(`⚠️ ${p.name} 踩到了 ${t.owner.name} 的「${t.name}」（Lv${t.level}${monopolyOwner(t.region, t.owner) ? " · 垄断×2" : ""}），需付过路费 ${rent}`, "l-bad");
    await sleep(600);
    await charge(p, rent, t.owner, `${t.name} 过路费`);
  }
}

async function nestFlow(p) {
  let card = drawCard();
  if (p.char.id === "yueyaer" && card.amount < 0 && Math.random() < 0.5) {
    card = BLESSING_FALLBACK;
    log(`🌙 ${p.name} 的占卜扭转了厄运（角色特性）`, "l-good");
  }
  log(`🃏 ${p.name} 抽到了「${card.name}」`, "l-card");
  await showModal({
    title: `🐝 幸运蜂巢 · ${p.name} 抽卡`,
    cardFace: card,
    buttons: [{ label: "执行效果", value: true }],
  });
  await applyCard(p, card);
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
      const o = others[Math.floor(Math.random() * others.length)];
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
    if (p.cash >= 300) { p.cash -= CFG.JAR_PAY; log(`🧼 ${p.name} 花费 ${CFG.JAR_PAY} 洗掉了糖浆`, "l-sys"); }
    else { p.skipTurns += 1; log(`🍯 ${p.name} 被黏在糖罐里，下回合跳过`, "l-bad"); }
  }
  updateUI();
}

/* ---------------- UI 更新 ---------------- */
function updateUI() {
  playersEl.innerHTML = "";
  players.forEach((p, i) => {
    const c = document.createElement("div");
    c.className = "player-card" + (i === turnIdx && running ? " current" : "") + (p.alive ? "" : " dead");
    const badges =
      (p.holdEscape ? `<span class="badge">🎫逃脱卡</span>` : "") +
      (p.holdPromo ? `<span class="badge">🎫大促销</span>` : "") +
      (p.hasLoaned ? `<span class="badge" style="background:#fbd3d0;color:#a33">已借款</span>` : "");
    c.innerHTML = `
      <div class="p-head"><span class="dot" style="background:#${p.color.toString(16).padStart(6, "0")}"></span>
        ${p.name}${p.isHuman ? "（你）" : ""}${p.alive ? "" : " · 出局"}</div>
      <div class="p-trait">${p.char.species} · ${p.char.trait}</div>
      <div class="p-money">🍯 ${p.cash}${p.debt > 0 ? `<span class="debt">欠债 ${p.debt}</span>` : ""}</div>
      <div class="p-props">产业 ${p.props.length} 块${badges ? " · " + badges : ""}</div>`;
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
  log(`🍯 蜜熊岛年度大富翁大赛开始！${totalPlayers} 位熊熊参赛，最后留下的成为首富！`, "l-card");
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
};
