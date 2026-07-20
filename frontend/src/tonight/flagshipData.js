// 012 第三轮旗舰路径示例数据（第一检查点：不接真实模型）
// 故事线：刷到黄焖鸡 → 对照现实冰箱 → 得到今晚能行动的决定

export const DISH_SAMPLE = {
  name: "黄焖鸡",
  post: {
    author: "@阿强的深夜灶台",
    caption: "汤汁拌饭能吃三碗的黄焖鸡，砂锅一上桌全屋都香了",
    likes: "12.4w",
  },
  imageUrl: "/demo-assets/菜/黄焖鸡-示例.png",
  candidates: ["黄焖鸡", "干锅鸡块"],
  cookTime: "约 40 分钟",
  cookMinutes: 40,
  difficulty: "焖煮为主，新手可试",
  // match: 与确认库存匹配时接受的叫法
  needed: [
    { id: "chicken", name: "鸡腿", detail: "2 只，请摊主剁块", match: ["鸡腿", "鸡肉", "琵琶腿", "鸡块"], price: "约 12 元" },
    { id: "potato", name: "土豆", detail: "1-2 个", match: ["土豆", "马铃薯"], price: "" },
    { id: "mushroom", name: "鲜香菇", detail: "4-5 朵，提鲜关键", match: ["鲜香菇", "香菇"], price: "约 6 元" },
    { id: "pepper", name: "青椒", detail: "1 个，出锅前放", match: ["青椒", "尖椒", "彩椒"], price: "约 3 元" },
    { id: "scallion", name: "小葱", detail: "1 把，爆香用", match: ["小葱", "香葱", "大葱", "葱"], price: "" },
    { id: "seasoning", name: "酱油、料酒、姜", detail: "按家里常备算", staple: true, price: "" },
  ],
  steps: [
    "鸡腿冷水下锅焯出血沫，捞出冲净。",
    "少油爆香葱姜，下鸡块炒到表面微黄。",
    "加酱油、料酒和热水没过鸡块，放土豆、香菇。",
    "小火焖 20 分钟，出锅前 3 分钟放青椒。",
    "大火收汁到能挂在鸡块上，直接连锅上桌。",
  ],
  tips: [
    "新手别加大料硬炒糖色，酱油调色就够。",
    "焖煮全程小火，土豆才不会散成泥。",
    "肉类熟度要在锅里确认：筷子能轻松穿透、没有血水。",
  ],
};

export const FRIDGE_SAMPLE = {
  imageUrl: "/demo-assets/fridge-images/f63de1c0794c76a412b9f06f0d919044.png",
  seen: [
    { name: "土豆", detail: "约 4 个", zone: "中层左侧" },
    { name: "小葱", detail: "1 把", zone: "中层" },
    { name: "上海青", detail: "2 棵", zone: "下层左侧" },
    { name: "黄瓜", detail: "1 根", zone: "下层右侧" },
    { name: "玉米", detail: "1 根", zone: "中层右侧" },
    { name: "豆腐", detail: "1 盒", zone: "上层右侧" },
    { name: "鸡蛋", detail: "约 6 个", zone: "下层蛋盒" },
    { name: "酸奶", detail: "1 大瓶", zone: "上层" },
  ],
  unsure: [
    { id: "bag", description: "两袋鼓起的透明袋装食材", reason: "隔着袋子看不清内容，不能算进库存" },
    { id: "jar", description: "上层一只玻璃罐", reason: "标签被挡住，不知道是不是调料" },
  ],
  warnings: ["照片看不出新鲜度和保质期，入口前需要你自己确认。"],
};

export const ALT_PLAN = {
  name: "土豆烧豆腐",
  why: "不补货、不出门，冰箱里的土豆和豆腐今晚就能成菜。",
  cookTime: "约 25 分钟",
  cookMinutes: 25,
  needed: [
    { id: "potato", name: "土豆", match: ["土豆", "马铃薯"] },
    { id: "tofu", name: "豆腐", match: ["豆腐", "北豆腐", "老豆腐"] },
    { id: "scallion", name: "小葱", match: ["小葱", "香葱", "大葱", "葱"] },
    { id: "seasoning", name: "酱油、蒜", staple: true },
  ],
  steps: [
    "土豆切滚刀块，豆腐切厚片。",
    "少油把土豆煎到边角微焦。",
    "加热水和酱油焖 10 分钟，下豆腐再焖 5 分钟。",
    "大火收汁，撒葱花出锅。",
  ],
  tips: ["豆腐下锅后少翻动，用锅铲背轻推，不容易碎。"],
};

export const TIME_OPTIONS = ["15 分钟", "25 分钟", "40 分钟", "不限"];

export function timeToMinutes(label) {
  const hit = String(label).match(/(\d+)/);
  return hit ? Number(hit[1]) : 999;
}

export function itemInInventory(need, inventoryNames) {
  if (need.staple) return true;
  const pool = [need.name, ...(need.match || [])];
  return inventoryNames.some((held) => pool.some((alias) => held.includes(alias) || alias.includes(held)));
}

// 汇总一道菜相对当前确认库存的「已有 / 还差」
export function coverageFor(plan, inventoryNames, cartNames = []) {
  const missing = [];
  const have = [];
  const simulated = [];
  for (const need of plan.needed) {
    if (need.staple) {
      have.push({ ...need, via: "staple" });
    } else if (itemInInventory(need, inventoryNames)) {
      have.push({ ...need, via: "fridge" });
    } else if (cartNames.includes(need.name)) {
      simulated.push({ ...need, via: "cart" });
    } else {
      missing.push(need);
    }
  }
  return { have, simulated, missing };
}
