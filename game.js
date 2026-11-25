/* ============================================================
 * 《熊熊大富翁》可玩原型 v0.1
 * 规则来源：《核心玩法设计.md》GDD v0.5 + 经济调参表 v1
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

/* ---------------- Three.js 场景 ---------------- */
let scene, camera, renderer, raycaster;
const TILE_Y = 0.16;
const tileMeshes = [];        // 每格基座 mesh（含 userData.pos）
const ownerFrames = {};       // pos -> owner 边框 line
const buildingMeshes = {};    // pos -> 建筑 group
const bearGroups = {};        // playerId -> group

// 32 格 -> 10x8 方环坐标
function tileCoord(pos) {
  let x, z;
  if (pos <= 9)        { x = -4.5 + pos;        z = -3.5; }
  else if (pos <= 15)  { x = 4.5;               z = -2.5 + (pos - 10); }
  else if (pos <= 25)  { x = 4.5 - (pos - 16);  z = 3.5; }
  else                 { x = -4.5;              z = 3.5 - (pos - 26); }
  return new THREE.Vector3(x, TILE_Y, z);
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaee3f5);
  scene.fog = new THREE.Fog(0xaee3f5, 22, 40);

  camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(11, 12, 11);
  camera.lookAt(0, 0, 0);

  renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    $("scene-container").appendChild(renderer.domElement);
  } catch (e) {
    const tip = document.createElement("div");
    tip.style.cssText = "position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);background:#fff6e3;padding:20px 30px;border-radius:14px;color:#6b4a2b;font-size:15px;text-align:center;line-height:1.8;box-shadow:0 8px 30px rgba(0,0,0,.25)";
    tip.innerHTML = "⚠️ 当前环境不支持 WebGL（3D 棋盘无法显示）<br>请换用 Chrome / Edge / Safari 等现代浏览器打开";
    $("scene-container").appendChild(tip);
    return;
  }

  // 灯光
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2d0, 0.95);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  // 中央草地
  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.12, 5.6),
    new THREE.MeshLambertMaterial({ color: 0xa8d878 })
  );
  grass.position.y = 0.06;
  scene.add(grass);

  // 中央装饰：蜜金树
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.1, 7), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
  trunk.position.y = 0.7; scene.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf7b733 }));
  crown.position.y = 1.6; scene.add(crown);
  // 小树点缀
  for (let i = 0; i < 8; i++) {
    const tx = (Math.random() - 0.5) * 7.4, tz = (Math.random() - 0.5) * 4.6;
    if (Math.abs(tx) < 1.5 && Math.abs(tz) < 1.5) continue;
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.34, 6), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
    tr.position.y = 0.17;
    const cr = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 7), new THREE.MeshLambertMaterial({ color: i % 2 ? 0x7cb85c : 0x5da24a }));
    cr.position.y = 0.55;
    t.add(tr, cr); t.position.set(tx, 0.12, tz);
    scene.add(t);
  }

  // 棋盘格
  tiles.forEach(tile => {
    let color, w = 0.92;
    if (tile.type === "land") color = REGION_COLOR[tile.region];
    else if (tile.type === "start") { color = 0xf7b733; w = 1.0; }
    else if (tile.type === "nest") color = 0xffe066;
    else if (tile.type === "jar") color = 0xf39fb6;
    else color = 0xe8e2d4;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.16, w),
      new THREE.MeshLambertMaterial({ color })
    );
    const c = tileCoord(tile.pos);
    mesh.position.set(c.x, 0.08, c.z);
    mesh.userData.pos = tile.pos;
    scene.add(mesh);
    tileMeshes.push(mesh);

    // 特殊格小标志
    if (tile.type === "start") {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
      p.position.set(c.x, 0.4, c.z); scene.add(p);
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), new THREE.MeshLambertMaterial({ color: 0xffd75e }));
      g.position.set(c.x, 0.75, c.z); scene.add(g);
    } else if (tile.type === "nest") {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 6), new THREE.MeshLambertMaterial({ color: 0xe08e0b }));
      h.position.set(c.x, 0.32, c.z); scene.add(h);
    } else if (tile.type === "jar") {
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0xf78fb3 }));
      j.position.set(c.x, 0.3, c.z); scene.add(j);
    }
  });

  // 简易视角控制：拖动旋转 + 滚轮缩放
  let dragging = false, lastX = 0, lastY = 0, azimuth = Math.PI / 4, polar = 0.95, radius = 18;
  const updateCam = () => {
    camera.position.set(
      radius * Math.sin(polar) * Math.cos(azimuth),
      radius * Math.cos(polar),
      radius * Math.sin(polar) * Math.sin(azimuth)
    );
    camera.lookAt(0, 0, 0);
  };
  updateCam();
  renderer.domElement.addEventListener("pointerdown", e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  addEventListener("pointerup", () => dragging = false);
  addEventListener("pointermove", e => {
    if (!dragging) return;
    azimuth += (e.clientX - lastX) * 0.008;
    polar = Math.min(1.35, Math.max(0.45, polar - (e.clientY - lastY) * 0.006));
    lastX = e.clientX; lastY = e.clientY;
    updateCam();
  });
  renderer.domElement.addEventListener("wheel", e => {
    radius = Math.min(30, Math.max(9, radius + e.deltaY * 0.02));
    updateCam();
  }, { passive: true });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  (function loop() { requestAnimationFrame(loop); renderer.render(scene, camera); })();
}

/* ---------------- 低模熊熊 ---------------- */
function makeBear(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.55) });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat);
  body.scale.set(1, 1.15, 0.85); body.position.y = 0.24;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat);
  head.position.y = 0.52;
  const earGeo = new THREE.SphereGeometry(0.07, 7, 6);
  const e1 = new THREE.Mesh(earGeo, dark); e1.position.set(-0.12, 0.66, 0);
  const e2 = new THREE.Mesh(earGeo, dark); e2.position.set(0.12, 0.66, 0);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 6), new THREE.MeshLambertMaterial({ color: 0xfff1dc }));
  muzzle.position.set(0, 0.48, 0.14);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), dark);
  nose.position.set(0, 0.5, 0.2);
  g.add(body, head, e1, e2, muzzle, nose);
  return g;
}

function bearSlot(pos, playerIdx) {
  const c = tileCoord(pos);
  const offs = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]];
  const o = offs[playerIdx % 4];
  return new THREE.Vector3(c.x + o[0], TILE_Y, c.z + o[1]);
}

async function hopBear(p, targetPos) {
  const g = bearGroups[p.id];
  const from = g.position.clone();
  const to = bearSlot(targetPos, p.idx);
  const t0 = performance.now(), dur = 220;
  return new Promise(res => {
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / dur);
      g.position.lerpVectors(from, to, k);
      g.position.y = TILE_Y + Math.sin(k * Math.PI) * 0.28;
      if (k < 1) requestAnimationFrame(step); else res();
    })();
  });
}

/* ---------------- 地产 3D 状态 ---------------- */
function updateTileVisual(tile) {
  const c = tileCoord(tile.pos);
  if (ownerFrames[tile.pos]) { scene.remove(ownerFrames[tile.pos]); ownerFrames[tile.pos] = null; }
  if (buildingMeshes[tile.pos]) { scene.remove(buildingMeshes[tile.pos]); buildingMeshes[tile.pos] = null; }
  if (tile.type !== "land") return;
  if (tile.owner) {
    const oc = new THREE.Color(tile.owner.color);
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.06, 0.98)),
      new THREE.LineBasicMaterial({ color: oc })
    );
    frame.position.set(c.x, TILE_Y + 0.02, c.z);
    scene.add(frame);
    ownerFrames[tile.pos] = frame;
  }
  // 等级建筑：小摊/小店/大楼
  if (tile.owner && tile.level >= 1) {
    const b = new THREE.Group();
    const oc = new THREE.Color(tile.owner.color).lerp(new THREE.Color(0xffffff), 0.25);
    const heights = { 1: 0.22, 2: 0.42, 3: 0.72 };
    const h = heights[tile.level];
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, h, 0.34), new THREE.MeshLambertMaterial({ color: oc }));
    box.position.y = h / 2;
    b.add(box);
    if (tile.level >= 2) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 4), new THREE.MeshLambertMaterial({ color: 0xe07a5f }));
      roof.position.y = h + 0.1; roof.rotation.y = Math.PI / 4;
      b.add(roof);
    }
    if (tile.level >= 3) {
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), new THREE.MeshLambertMaterial({ color: 0xf7b733 }));
      top.position.y = h + 0.28;
      b.add(top);
    }
    b.position.set(c.x + 0.22, TILE_Y, c.z - 0.22);
    scene.add(b);
    buildingMeshes[tile.pos] = b;
  }
}

/* ---------------- 玩家 ---------------- */
function makePlayer(char, idx, isHuman) {
  const p = {
    id: "p" + idx, idx, char, isHuman, name: char.name, color: char.color,
    cash: CFG.START_CASH, debt: 0, laps: 0, hasLoaned: false,
    pos: 0, alive: true, skipTurns: 0, holdEscape: false, holdPromo: false, props: [],
  };
  const g = makeBear(char.color);
  g.position.copy(bearSlot(0, idx));
  scene.add(g);
  bearGroups[p.id] = g;
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
  scene.remove(bearGroups[p.id]);
  delete bearGroups[p.id];
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
