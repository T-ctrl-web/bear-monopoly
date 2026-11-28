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

/* ---------------- 对局统计（v2.3：结算战报数据） ---------------- */
const matchStats = {
  wealth: [],      // 真人净资产曲线 [{t, v}]
  drama: [],       // 高光事件 [{emoji, text, by}]
  outOrder: [],    // 出局顺序（赢家不在内）
  turns: 0,        // 总回合数
  humanTurns: 0,   // 真人回合数
  peakWealth: CFG.START_CASH,  // 真人净资产峰值
  firstBuyDone: false,   // v2.4：首次买地成就只弹一次
  momentKinds: {},       // v2.4：情绪顶点分享每类只弹一次
  sharePings: 0,         // v2.4：本局已弹出的分享横幅数（上限 2）
};
const matchLog = [];   // 完整对局日志（战报挑素材用）

/* ---------------- DOM 引用 ---------------- */
const $ = id => document.getElementById(id);
const turnBanner = $("turn-banner"), playersEl = $("players"), logEl = $("log-box"),
      tileCardEl = $("tile-card"),
      rollBtn = $("roll-btn"), diceEl = $("dice-result"), mask = $("modal-mask"), modal = $("modal");

/* 日志：操作板内的滚动日志区（v1.0） */
function clearLog() { logEl.innerHTML = ""; }
function log(msg, cls) {
  const d = document.createElement("div");
  d.className = "ln" + (cls ? " " + cls : "");
  d.textContent = msg;
  logEl.appendChild(d);
  matchLog.push({ msg, cls: cls || "" });
  while (logEl.children.length > 40) logEl.removeChild(logEl.children[0]);
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
    // v0.8b：点击弹窗外空白处 = 关闭（无按钮时返回 null）
    mask.onclick = e => {
      if (e.target !== mask) return;
      mask.style.display = "none";
      resolve(buttons && buttons.length ? buttons[buttons.length - 1].value : null);
    };
  });
}

/* ============================================================
 * DOM 棋盘（v2.0：CSS Grid 方形棋盘，参照经典大富翁网页版式）
 * 9×9 网格环：4 个放大角格 + 每边 7 格 = 32 格；中央为场地
 * ============================================================ */
const css = n => "#" + n.toString(16).padStart(6, "0");
let boardEl = null;
const cellEls = [];        // pos -> 格子 DOM
const tokenEls = {};       // playerId -> 棋子 DOM

/* 32 格 -> 9×9 网格 [row, col]，每格严格正方形（等分 9 列 × 9 行）
 * 起点 0 = 右下角，逆时针一圈：
 *   底边 9 格：0[8,8] 1[8,7] … 8[8,0]（含右下角、左下角）
 *   左边 8 格：9[7,0] … 16[0,0]（含左上角）
 *   顶边 8 格：17[0,1] … 24[0,8]（含右上角）
 *   右边 7 格：25[1,8] … 31[7,8]
 *   合计 9+8+8+7 = 32 格，无重叠无空缺 */
function rcOf(pos) {
  if (pos <= 8)  return [8, 8 - pos];              // 底边 9 格
  if (pos <= 16) return [8 - (pos - 8), 0];        // 左边 8 格
  if (pos <= 24) return [0, pos - 16];             // 顶边 8 格
  return [pos - 24, 8];                            // 右边 7 格
}
function sideOf(pos) {
  if (pos % 8 === 0) return "corner";              // 0/8/16/24 四个角
  if (pos < 8) return "bottom";
  if (pos < 16) return "left";
  if (pos < 24) return "top";
  return "right";
}

function initScene() {
  boardEl = $("board");
  boardEl.innerHTML = "";
  cellEls.length = 0;

  // 中央场地：卡牌区 + 标题
  const center = document.createElement("div");
  center.id = "board-center";
  center.innerHTML = `
    <div class="bc-tree">🌳</div>
    <div class="bc-title">蜜熊岛大富翁</div>
    <div class="bc-sub">年度财富之争</div>
    <div class="pile-row">
      <div class="pile destiny" id="pile-destiny"><div class="p-name">🎴 命运</div><div class="p-sub">好事坏事，天注定</div></div>
      <div class="pile chance" id="pile-chance"><div class="p-name">🃏 机会</div><div class="p-sub">下一次，轮到你运气</div></div>
    </div>`;
  boardEl.appendChild(center);
  $("pile-destiny").onclick = () => showCardPool();
  $("pile-chance").onclick = () => showCardPool();

  // 32 个格子
  tiles.forEach(t => {
    const el = document.createElement("div");
    const side = sideOf(t.pos);
    el.className = "cell" + (side === "corner" ? " corner" : "");
    el.dataset.side = side;
    el.onclick = () => showTileInfo(t);
    boardEl.appendChild(el);
    cellEls[t.pos] = el;
    renderCell(t);
  });

  // 棋盘边长 = min(可用宽, 可用高, 860)。竖屏时可用宽是瓶颈 → 满铺整宽；
  // 高度富余则页面自然留白（不拉伸棋盘，避免格子变长方形）。
  const fitFonts = () => {
    const wrapEl = boardEl.parentElement;
    if (!wrapEl || !wrapEl.style) return;   // 无头环境/桩 DOM 兜底
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(wrapEl) : { paddingLeft: "0", paddingRight: "0" };
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const availW = ((document.getElementById("app") || {}).clientWidth || innerWidth) - padX;
    const availH = innerHeight - 250;
    const size = Math.max(260, Math.min(availW, availH, 860));
    wrapEl.style.setProperty("--bd-size", Math.floor(size) + "px");
    const cellPx = (size - 14 - 3 * 8) / 9;
    // 41px 格：名称 2 行 ~10px + 价格 ~8.5px，刚好填满色条以外的 ~31px
    wrapEl.style.setProperty("--fs-name", Math.max(8.5, cellPx * 0.25).toFixed(1) + "px");
    wrapEl.style.setProperty("--fs-price", Math.max(7.5, cellPx * 0.21).toFixed(1) + "px");
    wrapEl.style.setProperty("--fs-emoji", Math.max(10, cellPx * 0.34).toFixed(1) + "px");
  };
  fitFonts();
  setTimeout(fitFonts, 360);   // 等字体/flex 布局稳定后再校一次
  addEventListener("resize", () => setTimeout(fitFonts, 120));
  addEventListener("orientationchange", () => setTimeout(fitFonts, 300));
}

/* 渲染单个格子（状态即画面：任何状态变化后调用 updateCell 即可）
 * v2.1：格子只放「图标 + 名称」（+业主色条 / 星级），价格等细节进 tooltip 与详情弹窗，
 *       避免小格内文字溢出——这是「不再长方形乱摆」的关键 */
function renderCell(t) {
  const el = cellEls[t.pos]; if (!el) return;
  const side = el.dataset.side;
  const vert = side === "left" || side === "right";
  let bar = "", inner = "";

  if (t.type === "land") {
    const col = css(REGION_COLOR[t.region]);
    bar = `<div class="c-bar" style="background:${col}"></div>`;
    const nm = t.name.length > 3 ? t.name.slice(0, 3) : t.name;
    inner = `<div class="c-inner">
      <div class="c-name">${nm}</div>
      <div class="c-price">$${t.price}</div>
      ${t.owner ? `<div class="c-lv">${t.level}</div>` : ""}
    </div>`;
  } else if (t.type === "start") {
    inner = `<div class="c-inner"><div class="c-emoji">🌳</div><div class="c-name">起点</div><div class="c-price">+$${subsidy()}</div></div>`;
  } else if (t.type === "nest") {
    inner = `<div class="c-inner"><div class="c-emoji">🐝</div><div class="c-name">蜂巢</div><div class="c-sub">剩${t.deck ? t.deck.length : "?"}张</div></div>`;
  } else if (t.type === "jar") {
    inner = `<div class="c-inner"><div class="c-emoji">🍯</div><div class="c-name">糖罐</div><div class="c-sub">$${CFG.JAR_PAY}</div></div>`;
  } else {
    inner = `<div class="c-inner"><div class="c-emoji">🌼</div><div class="c-sub">小径</div></div>`;
  }
  el.innerHTML = bar + inner;
  el.title = tileTitle(t);

  const owned = t.type === "land" && t.owner;
  el.classList.toggle("owned", !!owned);
  if (owned) {
    el.style.setProperty("--owner", css(t.owner.color));
    el.insertAdjacentHTML("beforeend", `<div class="owner-flag"></div>`);
  } else {
    el.style.removeProperty("--owner");
  }
}

/* 格子 tooltip 文案（长按 / 悬停可见） */
function tileTitle(t) {
  if (t.type === "land") {
    const own = t.owner ? `${t.owner.name} · Lv${t.level} · 过路费 $${computeRent(t)}` : "无主";
    return `${t.name}（${t.region}）\n地价 $${t.price} · ${own}`;
  }
  if (t.type === "start") return `蜜金树·起点\n路过领 $${subsidy()}（并偿还欠款）`;
  if (t.type === "nest") return `幸运蜂巢\n牌堆剩 ${t.deck ? t.deck.length : 0} 张，摊开 3 张由你选`;
  if (t.type === "jar") return `蜂蜜糖罐\n支付 $${CFG.JAR_PAY} 或停 1 回合`;
  return "花田小径 · 无事发生";
}

function updateCell(t) { renderCell(t); }
/* 旧视觉刷新接口（兼容多处调用） */
function updateTileVisual(t) { updateCell(t); }

/* 当前行动高亮：格子呼吸边框 + 棋子金环 */
function refreshActive() {
  cellEls.forEach(el => el && el.classList.remove("active"));
  if (running && players[turnIdx] && players[turnIdx].alive) {
    const el = cellEls[players[turnIdx].pos];
    if (el) el.classList.add("active");
  }
  Object.values(tokenEls).forEach(el => el.classList.remove("current"));
  if (running && players[turnIdx] && tokenEls[players[turnIdx].id]) {
    tokenEls[players[turnIdx].id].classList.add("current");
  }
}
function invalidate() { refreshActive(); }

/* ---------------- 熊熊棋子（DOM，格间平滑移动） ---------------- */
function tokenXY(pos, idx) {
  const [r, c] = rcOf(pos);
  // 多熊同格时四角微错开（格子约 40px，偏移 ±0.1 格 ≈ ±4px）
  const offs = [[-0.13, 0.10], [0.13, 0.10], [-0.13, -0.10], [0.13, -0.10]];
  const [dx, dy] = offs[idx % 4];
  const n = players.filter(p => p.alive && p.pos === pos).length;
  const scale = n > 1 ? 0.72 : 1;                    // 同格多熊自动缩小
  return {
    x: ((c + 0.5) / 9 + dx * scale / 9) * 100,
    y: ((r + 0.5) / 9 + dy * scale / 9) * 100,
  };
}
function createToken(p) {
  if (!boardEl || tokenEls[p.id]) return;
  let layer = boardEl.querySelector("#token-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "token-layer";
    boardEl.appendChild(layer);
  }
  const el = document.createElement("div");
  el.className = "token";
  el.innerHTML = `<div class="tk-body" style="--tk:${css(p.color)}">🐻</div><div class="tk-name">${p.name}</div>`;
  layer.appendChild(el);
  tokenEls[p.id] = el;
  placeToken(p);
}
function removeToken(p) { if (tokenEls[p.id]) { tokenEls[p.id].remove(); delete tokenEls[p.id]; } }
function placeToken(p) {
  const el = tokenEls[p.id]; if (!el) return;
  const { x, y } = tokenXY(p.pos, p.idx);
  el.style.left = x + "%"; el.style.top = y + "%";
}
async function hopBear(p, targetPos) {
  placeToken(p);   // p.pos 已更新，CSS transition 平滑移动
  await sleep(280);
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

/* ---------------- 玩家 ---------------- */
function makePlayer(char, idx, isHuman) {
  const p = {
    id: "p" + idx, idx, char, isHuman, name: char.name, color: char.color,
    cash: CFG.START_CASH, debt: 0, laps: 0, hasLoaned: false,
    pos: 0, alive: true, skipTurns: 0, holdEscape: false, holdPromo: false, props: [],
  };
  if (boardEl) createToken(p);
  refreshActive();
  return p;
}

/* ---------------- 经济结算 ---------------- */
function netWorth(p) { return p.cash + p.props.reduce((s, t) => s + t.price, 0); }
function recordWealth() {
  const h = players.find(p => p.isHuman);
  if (!h || !running) return;
  const v = netWorth(h);
  if (v > matchStats.peakWealth) matchStats.peakWealth = v;
  const last = matchStats.wealth[matchStats.wealth.length - 1];
  if (last && last.v === v) return;
  matchStats.wealth.push({ t: matchStats.turns, v });
  if (matchStats.wealth.length > 120) matchStats.wealth.shift();
}
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
  if (payee && /过路费/.test(reason) && amount >= 300) {
    matchStats.drama.push({ emoji: "💰", text: `${payee.name} 收 ${payer.name} ${amount} 过路费`, by: payee.name });
    if (payee.isHuman && amount >= 500) flashMoment("rent", `💰 一口气收了 ${amount} 过路费！`);
  }
  updateUI();
  return true;
}

async function eliminate(p, creditor, reason) {
  matchStats.outOrder.push({ name: p.name, isHuman: p.isHuman, idx: p.idx });
  if (creditor && creditor.isHuman) flashMoment("bankrupt", `👑 你把 ${p.name} 逼到破产出局！`);
  p.alive = false;
  (p.props || []).forEach(t => {
    t.owner = creditor && creditor.alive ? creditor : null;
    if (creditor && creditor.alive) creditor.props.push(t);
    updateTileVisual(t);
  });
  p.props = [];
  removeToken(p);
  refreshActive();
  log(`🍞 ${p.name} 破产出局（${reason}），去面包房打工啦——明年再见！` + (creditor ? `产业全部移交给 ${creditor.name}。` : ""), "l-bad");
  updateUI();
  await sleep(1200);
}

/* ============================================================
 * v2.3 结算战报卡片：把一局的高光时刻生成可保存/分享的图片
 * ============================================================ */
function humanRank() {
  const h = players.find(p => p.isHuman);
  if (!h) return players.length;
  if (h.alive) return 1;
  const i = matchStats.outOrder.findIndex(o => o.isHuman);
  return Math.max(2, players.length - Math.max(0, i));
}

function pickTitle(h, won, rank) {
  if (won) {
    if (matchStats.peakWealth >= 6000) return { name: "蜜熊岛霸主", sub: "整座岛的蜂蜜，基本都归你了" };
    if (matchStats.peakWealth >= 3500) return { name: "年度熊熊首富", sub: "最后站着的那只熊，就是传奇" };
    return { name: "险胜的幸运熊", sub: "运气也是实力的一部分" };
  }
  if (rank === 2) return { name: "差一点就加冕", sub: "冠军和你之间，只差一个掷骰子" };
  if (rank >= players.length) return { name: "蜜熊岛观光客", sub: "你来过、看过，也被收过租" };
  return { name: "首富路上的奋斗熊", sub: "倒在通往王座的路上，也是条好熊" };
}

function boastLine(h, won, rank) {
  if (won) return `我用${h.char.name}拿下首富，你来试试？`;
  if (rank === 2) return `就差一点点！我这${h.char.name}差点翻盘`;
  return `我当了一次${h.char.name}，被收租收到怀疑熊生`;
}

function buildReportData() {
  const h = players.find(p => p.isHuman) || players[0];
  const alive = players.filter(p => p.alive);
  const won = h.alive && alive.length === 1;
  const rank = humanRank();
  const myDrama = matchStats.drama.filter(d => d.by === h.name);
  let drama = (myDrama.length ? myDrama : matchStats.drama).slice(0, 3);
  if (!drama.length) {
    matchLog.filter(l => /l-good|l-card/.test(l.cls)).slice(-3).forEach(l => {
      drama.push({ emoji: "🍯", text: l.msg, by: "" });
    });
  }
  return {
    human: h, won, rank, total: players.length,
    title: pickTitle(h, won, rank),
    worth: netWorth(h), cash: h.cash, props: h.props.length,
    peak: matchStats.peakWealth,
    wealth: matchStats.wealth.slice(),
    drama,
    charName: h.char.name, species: h.char.species,
    diff: DIFF_NAME[aiDifficulty] || "普通",
    turns: matchStats.turns,
    boast: boastLine(h, won, rank),
  };
}

function drawReportCanvas(d) {
  const W = 750, H = 1200;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext && cv.getContext("2d");
  if (!ctx || typeof cv.toDataURL !== "function") return null;

  const F = (n, w) => `${w ? 500 : 400} ${n}px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`;
  const FS = n => `900 ${n}px "Noto Serif SC","Songti SC",serif`;
  const rr = (x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  ctx.fillStyle = "#f7f3e9"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#c9a94f"; ctx.lineWidth = 4; rr(18, 18, W - 36, H - 36, 24); ctx.stroke();

  ctx.fillStyle = "#161d26"; rr(34, 34, W - 68, 270, 18); ctx.fill();
  ctx.fillStyle = "#d8b45c"; ctx.font = F(22, 1); ctx.textAlign = "center";
  ctx.fillText("蜜 熊 岛 · 年 度 财 富 之 争", W / 2, 90);
  ctx.fillStyle = "#f3e6c0"; ctx.font = FS(60);
  ctx.fillText(d.title.name, W / 2, 178);
  ctx.fillStyle = "#a8b0bc"; ctx.font = F(24);
  ctx.fillText(d.title.sub, W / 2, 236);

  ctx.fillStyle = "#6f6248"; ctx.font = F(24); ctx.textAlign = "left";
  ctx.fillText("最终净资产", 70, 372);
  ctx.fillStyle = "#2c2418"; ctx.font = FS(68);
  ctx.fillText("🍯 " + d.worth.toLocaleString(), 68, 452);
  ctx.fillStyle = "#8a7a58"; ctx.font = F(22); ctx.textAlign = "right";
  ctx.fillText(`第 ${d.rank} / ${d.total} 名 · 产业 ${d.props} 块`, W - 70, 450);

  ctx.fillStyle = "#2c2418"; ctx.font = F(26); ctx.textAlign = "left";
  ctx.fillText("资产走势", 70, 520);
  const gx = 70, gy = 545, gw = W - 140, gh = 180;
  ctx.fillStyle = "#efe7d2"; rr(gx, gy, gw, gh, 12); ctx.fill();
  ctx.strokeStyle = "rgba(168,132,46,.25)"; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(gx, gy + gh * i / 4); ctx.lineTo(gx + gw, gy + gh * i / 4); ctx.stroke(); }
  const arr = d.wealth.length >= 2 ? d.wealth : [{ t: 0, v: 1500 }, { t: 1, v: d.worth }];
  const vs = arr.map(a => a.v);
  const vmin = Math.min.apply(null, vs.concat([0])), vmax = Math.max.apply(null, vs.concat([1500]));
  const span = Math.max(1, vmax - vmin);
  const pts = arr.map((a, i) => [gx + 12 + (gw - 24) * i / Math.max(1, arr.length - 1), gy + gh - 12 - ((a.v - vmin) / span) * (gh - 24)]);
  ctx.beginPath(); ctx.moveTo(pts[0][0], gy + gh - 12);
  pts.forEach(p => ctx.lineTo(p[0], p[1]));
  ctx.lineTo(pts[pts.length - 1][0], gy + gh - 12); ctx.closePath();
  ctx.fillStyle = "rgba(216,180,92,.28)"; ctx.fill();
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.strokeStyle = "#a8842e"; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#cf6b4f";
  pts.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); });

  ctx.fillStyle = "#2c2418"; ctx.font = F(26); ctx.textAlign = "left";
  ctx.fillText("本局高光", 70, 790);
  let yy = 836;
  const lines = (d.drama.length ? d.drama : [{ emoji: "🍯", text: "稳稳地掷出了每一次骰子" }]).slice(0, 3);
  lines.forEach((x, i) => {
    ctx.fillStyle = "#d8b45c"; rr(70, yy - 22, 34, 34, 8); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = F(20); ctx.textAlign = "center";
    ctx.fillText(x.emoji || "🍯", 87, yy + 1);
    ctx.fillStyle = "#4a4132"; ctx.font = F(23); ctx.textAlign = "left";
    const txt = (i + 1) + ". " + x.text;
    ctx.fillText(txt.length > 26 ? txt.slice(0, 26) + "…" : txt, 118, yy);
    yy += 48;
  });

  ctx.fillStyle = "#efe7d2"; rr(70, 985, W - 140, 70, 12); ctx.fill();
  ctx.fillStyle = "#6f6248"; ctx.font = F(22); ctx.textAlign = "center";
  ctx.fillText(`${d.charName} · ${d.species} · ${d.diff}难度 · 共 ${d.turns} 回合`, W / 2, 1028);

  ctx.fillStyle = "#161d26"; rr(34, 1080, W - 68, 86, 16); ctx.fill();
  ctx.fillStyle = "#f0d894"; ctx.font = F(28); ctx.textAlign = "center";
  ctx.fillText(d.boast, W / 2, 1125);
  ctx.fillStyle = "#8d97a4"; ctx.font = F(19);
  ctx.fillText("蜜熊岛大富翁 · 来挑战我的纪录", W / 2, 1156);

  return cv.toDataURL("image/png");
}

function showReport(opts) {
  opts = opts || {};
  const moment = opts.moment || null;   // v2.4：情绪顶点传入的高光文案
  recordWealth();
  const d = buildReportData();
  if (moment) {
    d.title = { name: "高光时刻", sub: moment.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, "") };
    d.drama = [{ emoji: "✨", text: moment, by: d.human.name }].concat(d.drama).slice(0, 3);
    d.boast = "这一刻，值得晒出来！你来你也行？";
  }
  const png = drawReportCanvas(d);
  reportPng = png;
  const summary = `称号：${d.title.name}\n净资产：🍯 ${d.worth.toLocaleString()}（第 ${d.rank}/${d.total} 名）\n高光：${d.drama.map(x => x.text).join("；") || "稳扎稳打"}`;
  modal.innerHTML = `<h3>${moment ? "📸 高光战报" : "🏆 本局战报"} · ${d.charName}</h3>
    <div class="report-wrap">${png
      ? `<img class="report-img" src="${png}" alt="战报卡片">`
      : `<div class="report-fallback">${summary.replace(/\n/g, "<br>")}</div>`}</div>
    <div class="report-tip">${png ? "长按图片保存到相册，或点下方按钮下载" : "当前环境不支持生成图片，已显示文字战报"}</div>
    <div class="m-btns">
      <button id="rp-save" class="secondary" ${png ? "" : "disabled"}>保存战报</button>
      ${moment
        ? `<button id="rp-again">继续游戏</button>`
        : `<button id="rp-link" class="secondary">复制挑战链接</button><button id="rp-again">再来一局</button>`}
    </div>`;
  mask.style.display = "flex";
  mask.onclick = moment ? (e => { if (e.target === mask) mask.style.display = "none"; }) : null;
  const save = $("rp-save"), again = $("rp-again");
  if (save) save.onclick = () => {
    if (!reportPng) return;
    const a = document.createElement("a");
    a.href = reportPng;
    a.download = (moment ? "蜜熊岛高光-" : "蜜熊岛战报-") + Date.now() + ".png";
    if (document.body && document.body.appendChild) document.body.appendChild(a);
    if (typeof a.click === "function") a.click();
    if (a.remove) a.remove();
  };
  if (again) again.onclick = () => {
    if (moment) mask.style.display = "none"; else location.reload();
  };
  const linkBtn = $("rp-link");
  if (linkBtn) linkBtn.onclick = () => {
    const url = scoreLink(d);
    if (!url) { showToast("生成链接失败，请直接截图分享", 3000); return; }
    copyText(url).then(ok => {
      showToast(ok ? "⚔️ 挑战链接已复制，发给好友来超越你！" : "复制失败，长按地址栏分享本页", 3200);
    });
  };
}

let reportPng = null;

/* ---------------- v2.4 首局引导 + 情绪顶点分享 ---------------- */
let toastTimer = null, momentTimer = null;

/* 轻量提示条：不打断操作，几秒后自动消失 */
function showToast(text, ms) {
  const el = $("toast");
  if (!el || !el.style) return;   // 无头环境兜底
  el.innerHTML = `<span>${text}</span>`;
  el.style.display = "block";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = "none"; }, ms || 3000);
}

/* 情绪顶点横幅：把分享点前移到爽的那一刻，节流且不强制 */
function flashMoment(kind, text) {
  if (!running || matchStats.sharePings >= 2 || matchStats.momentKinds[kind]) return;
  matchStats.momentKinds[kind] = true;
  matchStats.sharePings++;
  const el = $("moment-banner");
  if (!el || !el.style) return;
  el.innerHTML = `<span class="mb-text">${text}</span>
    <button id="mb-share" class="mb-share">📸 晒一下</button>
    <button id="mb-close" class="mb-close" aria-label="关闭">×</button>`;
  el.style.display = "flex";
  const share = $("mb-share"), close = $("mb-close");
  if (share) share.onclick = () => { hideMoment(); showReport({ moment: text }); };
  if (close) close.onclick = hideMoment;
  if (momentTimer) clearTimeout(momentTimer);
  momentTimer = setTimeout(hideMoment, 6500);
}
function hideMoment() {
  const el = $("moment-banner");
  if (el && el.style) el.style.display = "none";
  if (momentTimer) { clearTimeout(momentTimer); momentTimer = null; }
}

/* ---------------- v2.5 URL 战绩码：把成绩编进链接，好友点开直接看到挑战目标 ---------------- */
function encodeScore(d) {
  try {
    const o = { n: d.charName, w: d.worth, r: d.rank, t: d.total, u: d.turns, h: d.title.name, f: d.diff };
    return btoa(encodeURIComponent(JSON.stringify(o))).replace(/\+/g, "-").replace(/\//g, "_");
  } catch (e) { return null; }
}
function decodeScore(str) {
  try {
    return JSON.parse(decodeURIComponent(atob(str.replace(/-/g, "+").replace(/_/g, "/"))));
  } catch (e) { return null; }
}
function scoreLink(d) {
  const code = encodeScore(d);
  if (!code) return null;
  const base = (typeof location !== "undefined" && location.href || "").split("#")[0];
  return base + "#r=" + code;
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => copyFallback(text));
  }
  return Promise.resolve(copyFallback(text));
}
function copyFallback(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    if (document.body) document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand("copy");
    if (ta.remove) ta.remove();
    return !!ok;
  } catch (e) { return false; }
}
/* 开局页顶部：带着 #r= 链接进来时展示挑战横幅 */
function showChallengeBanner() {
  const m = (location.hash || "").match(/#r=([A-Za-z0-9\-_=]+)/);
  if (!m) return;
  const s = decodeScore(m[1]);
  const box = $("challenge-box");
  if (!s || !box || !box.style) return;
  box.innerHTML = `⚔️ <b>${s.n}</b> 刚刚打出「${s.h}」<br>
    净资产 🍯 ${(s.w || 0).toLocaleString()} · 第 ${s.r || "?"}/${s.t || "?"} 名 · ${s.u || "?"} 回合（${s.f || "普通"}难度）<br>
    <span class="cb-go">点「开始比赛」，超越他！</span>`;
  box.style.display = "block";
  log(`⚔️ 挑战开启：${s.n} 的成绩是 🍯${s.w}，看你的了！`, "l-card");
}

function checkWinner() {
  const alive = players.filter(p => p.alive);
  if (alive.length === 1 && running) {
    recordWealth();
    running = false;
    const w = alive[0];
    log(`👑 ${w.name} 成为年度熊熊首富！金蜂蜜王冠加冕！`, "l-good");
    showReport();
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
  matchStats.turns++;
  turnIdx = aliveIdxFrom(turnIdx);
  const p = players[turnIdx];
  if (p.isHuman) matchStats.humanTurns++;
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
    turnBanner.textContent = matchStats.humanTurns === 1
      ? `👆 轮到你了：${p.name} · 点下方金色「掷骰子」开始！`
      : `🍯 轮到你了：${p.name} · 掷骰子吧！`;
    rollBtn.style.display = "block";
    rollBtn.disabled = false;
    if (matchStats.humanTurns === 1 && rollBtn.classList) rollBtn.classList.add("guide");
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
  if (rollBtn.classList) rollBtn.classList.remove("guide");
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
 * v1.0：真人落格后操作出现在下屏操作板（#tile-card），不再依赖点击棋盘
 */
let panelPending = null;   // { tile, act } 供操作板按钮 / 冒烟测试调用

async function resolveTile(p) {
  if (!p.alive || !running) return;
  const t = tiles[p.pos];
  if (t.type === "land") {
    if (p.isHuman) { await panelTileAction(p, t); return; }
    await resolveLand(p, t);
  } else if (t.type === "nest") await nestFlow(p, t);
  else if (t.type === "jar") await jarFlow(p);
  else if (t.type === "path") {
    log(`🌿 ${p.name} 在花田小径散了个步`, "l-sys");
    showTileCard(t, null, null);
    await sleep(600);
  }
}

/* 操作板：显示当前格信息与操作按钮 */
function showTileCard(t, body, buttons) {
  const regColor = t.type === "land" ? css(REGION_COLOR[t.region]) : "#9a7b1e";
  let html = `<div class="tc-title"><span class="reg" style="background:${regColor}">${t.type === "land" ? t.region : { start: "起点", nest: "蜂巢", jar: "糖罐", path: "小径" }[t.type] || ""}</span>${t.name}</div>`;
  html += body ? `<div class="tc-body">${body}</div>` : "";
  if (buttons && buttons.length) {
    html += `<div class="tc-btns">` + buttons.map((b, i) =>
      `<button data-i="${i}" class="${b.secondary ? "tc-secondary" : ""}" ${b.disabled ? "disabled" : ""}>${b.label}</button>`).join("") + `</div>`;
  }
  tileCardEl.innerHTML = html;
  if (buttons) {
    tileCardEl.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => buttons[+btn.dataset.i].onClick();
    });
  }
  invalidate();
}
function clearTileCard(msg) {
  tileCardEl.innerHTML = `<div class="tc-empty">${msg || "轮到别的熊熊行动了…"}</div>`;
}

/* 真人落格：操作板出按钮，点击后执行并恢复回合 */
async function panelTileAction(p, t) {
  showTileCard(t, tileCardBody(t, p), null);
  await sleep(700);
  return new Promise(resolve => {
    let settled = false;   // v2.2 修复：一次落格只允许一次操作，点击后立即锁死并清空按钮
    const done = async (fn) => {
      if (settled) return;
      settled = true;
      panelPending = null;
      clearTileCard();     // 立刻移除按钮，杜绝 AI 回合期间连点旧按钮重复买/升
      try { if (fn) await fn(); } finally { resolve(); }
    };
    if (!t.owner) {
      const price = buyPrice(t, p);
      if (p.cash >= price) {
        showTileCard(t, tileCardBody(t, p), [
          { label: `买下（-${price}）`, onClick: () => done(() => resolveLand(p, t, true, true)) },
          { label: "放弃", secondary: true, onClick: () => done() },
        ]);
        panelPending = { tile: t, act: () => done(() => resolveLand(p, t, true, true)) };
      } else {
        showTileCard(t, tileCardBody(t, p) + `\n\n⚠️ 现金不足（需 $${price}）`, [
          { label: "知道了", secondary: true, onClick: () => done() },
        ]);
        panelPending = { tile: t, act: () => done() };
      }
    } else if (t.owner === p) {
      if (t.level >= CFG.MAX_LEVEL) {
        showTileCard(t, tileCardBody(t, p), [{ label: "已满级 · 继续", secondary: true, onClick: () => done() }]);
        panelPending = { tile: t, act: () => done() };
      } else {
        const cost = upgradeCost(t, p);
        if (p.cash >= cost) {
          showTileCard(t, tileCardBody(t, p), [
            { label: `升级到 Lv${t.level + 1}（-${cost}）`, onClick: () => done(() => resolveLand(p, t, true, true)) },
            { label: "下次再说", secondary: true, onClick: () => done() },
          ]);
          panelPending = { tile: t, act: () => done(() => resolveLand(p, t, true, true)) };
        } else {
          showTileCard(t, tileCardBody(t, p) + `\n\n⚠️ 现金不足升级（需 $${cost}）`, [
            { label: "知道了", secondary: true, onClick: () => done() },
          ]);
          panelPending = { tile: t, act: () => done() };
        }
      }
    } else {
      const rent = computeRent(t);
      showTileCard(t, tileCardBody(t, p), [
        { label: `支付过路费（-${rent}）`, onClick: () => done(async () => {
          log(`💰 ${p.name} 支付过路费 ${rent} 给 ${t.owner.name}`, "l-bad");
          await charge(p, rent, t.owner, `${t.name} 过路费`);
        }) },
      ]);
      panelPending = { tile: t, act: () => done(async () => {
        log(`💰 ${p.name} 支付过路费 ${rent} 给 ${t.owner.name}`, "l-bad");
        await charge(p, rent, t.owner, `${t.name} 过路费`);
      }) };
    }
  });
}

/* 操作板格子说明文案 */
function tileCardBody(t, p) {
  if (t.type === "land") {
    const mono = monopolyOwner(t.region, t.owner) ? "（垄断 ×2）" : "";
    if (!t.owner) {
      return `地价 <b>$${t.price}</b>${buyPrice(t, p) !== t.price ? `（角色折扣价 $${buyPrice(t, p)}）` : ""}\nLv1 过路费 $${Math.round(t.price * CFG.RENT_MULT[1])} · Lv3 过路费 $${Math.round(t.price * CFG.RENT_MULT[3])}`;
    }
    if (t.owner === p) {
      return `你的产业 · Lv${t.level}${mono}\n当前过路费 $${Math.round(t.price * CFG.RENT_MULT[t.level])}${t.level < CFG.MAX_LEVEL ? ` → Lv${t.level + 1} 过路费 $${Math.round(t.price * CFG.RENT_MULT[t.level + 1])}` : "（满级）"}`;
    }
    return `业主：<b>${t.owner.name}</b> · Lv${t.level}${mono}\n过路费 <b>$${computeRent(t)}</b>`;
  }
  if (t.type === "nest") return `牌堆剩 ${t.deck ? t.deck.length : 0} 张 · 摊开 3 张由你亲手选一张`;
  if (t.type === "jar") return `支付 $${CFG.JAR_PAY} 或停 1 回合`;
  if (t.type === "start") return `路过领 $${subsidy()}（并偿还欠款）`;
  return "花田小径，无事发生";
}

async function resolveLand(p, t, fromClick, confirmed) {
  if (!t.owner) {
    const price = buyPrice(t, p);
    let bought = false;
    if (p.isHuman) {
      if (confirmed) bought = true;   // 操作板按钮即确认，不再二次弹窗
      else bought = await showModal({
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
      if (p.isHuman && !matchStats.firstBuyDone) {
        matchStats.firstBuyDone = true;
        showToast("🏠 第一块产业到手！踩自己的地能升级收租", 4200);
      }
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
      if (confirmed) up = true;   // 操作板按钮即确认
      else up = await showModal({
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
    log(`⚠️ ${p.name} 踩到了 ${t.owner.name} 的「${t.name}」（Lv${t.level}${monopolyOwner(t.region, t.owner) ? " · 垄断×2" : ""}），需付过路费 ${rent}`, "l-bad");
    await sleep(900);
    await charge(p, rent, t.owner, `${t.name} 过路费`);
  }
}

/* v0.8：蜂巢实体牌堆抽卡——摊开 3 张背面朝上的卡，真人点选一张翻开 */
async function nestFlow(p, t) {
  const hand = [drawFrom(t), drawFrom(t), drawFrom(t)];
  log(`🃏 ${p.name} 翻开蜂巢牌堆，摊出 3 张牌…`, "l-card");
  updateCell(t);   // 刷新蜂巢格上的剩余牌堆数
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
  if (card.rarity === "稀有" || card.rarity === "史诗") {
    matchStats.drama.push({ emoji: "🃏", text: `${p.name} 抽到${card.rarity}卡「${card.name}」`, by: p.name });
    if (p.isHuman) flashMoment("card", `${card.rarity === "史诗" ? "🌟" : "✨"} ${p.name} 抽到${card.rarity}卡「${card.name}」！`);
  }
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
  recordWealth();
  playersEl.innerHTML = "";
  players.forEach((p, i) => {
    const c = document.createElement("div");
    c.className = "chip" + (i === turnIdx && running ? " current" : "") + (p.alive ? "" : " dead");
    c.innerHTML = `<span class="dot" style="background:#${p.color.toString(16).padStart(6, "0")}"></span>${p.name}${p.isHuman ? "(你)" : ""}${p.alive ? "" : " ☠"}<span class="cash">🍯${p.cash}${p.debt > 0 ? " 欠" + p.debt : ""}</span>`;
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
  showChallengeBanner();
}

function startGame() {
  matchStats.wealth.length = 0;
  matchStats.drama.length = 0;
  matchStats.outOrder.length = 0;
  matchStats.turns = 0;
  matchStats.humanTurns = 0;
  matchStats.peakWealth = CFG.START_CASH;
  matchStats.firstBuyDone = false;
  matchStats.momentKinds = {};
  matchStats.sharePings = 0;
  matchLog.length = 0;
  hideMoment();
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
  get pendingTile() { return panelPending; },
  get reportData() { return buildReportData(); },
  get reportPng() { return reportPng; },
  get stats() { return matchStats; },
  drawReportCanvas,
};
