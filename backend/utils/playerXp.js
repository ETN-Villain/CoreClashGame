import fs from "fs";
import path from "path";

const DATA_DIR = "/backend/data";
const XP_FILE = path.join(DATA_DIR, "playerXp.json");
const XP_ACTIONS_FILE = path.join(DATA_DIR, "xpActions.json");

export const XP_REWARDS = {
  LOGIN: 5,
  ECOSYSTEM_CLICK: 5,
  CREATE_GAME: 25,
  JOIN_GAME: 15,
  REVEAL: 25,
  SETTLE: 30,
};

export const XP_LEVELS = [
  { level: 0, minXp: 0, bonuses: { attack: 0, defense: 0, vitality: 0, agility: 0 } },
  { level: 1, minXp: 50, bonuses: { attack: 2, defense: 0, vitality: 0, agility: 0 } },
  { level: 2, minXp: 100, bonuses: { attack: 2, defense: 4, vitality: 0, agility: 0 } },
  { level: 3, minXp: 200, bonuses: { attack: 2, defense: 4, vitality: 5, agility: 0 } },
  { level: 4, minXp: 400, bonuses: { attack: 2, defense: 4, vitality: 5, agility: 5 } },
  { level: 5, minXp: 800, bonuses: { attack: 7, defense: 4, vitality: 5, agility: 5 } },
  { level: 6, minXp: 1600, bonuses: { attack: 7, defense: 9, vitality: 5, agility: 5 } },
  { level: 7, minXp: 3200, bonuses: { attack: 7, defense: 9, vitality: 10, agility: 5 } },
  { level: 8, minXp: 6400, bonuses: { attack: 7, defense: 9, vitality: 10, agility: 15 } },
  { level: 9, minXp: 12800, bonuses: { attack: 17, defense: 9, vitality: 10, agility: 15 } },
  { level: 10, minXp: 25600, bonuses: { attack: 17, defense: 19, vitality: 10, agility: 15 } },
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureFile(filePath) {
  ensureDir(path.dirname(filePath));

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2), "utf8");
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2), "utf8");
  }
}

function readJsonFile(filePath) {
  ensureFile(filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, data) {
  ensureFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function readPlayerXp() {
  return readJsonFile(XP_FILE);
}

export function writePlayerXp(data) {
  writeJsonFile(XP_FILE, data);
}

export function readXpActions() {
  return readJsonFile(XP_ACTIONS_FILE);
}

export function writeXpActions(data) {
  writeJsonFile(XP_ACTIONS_FILE, data);
}

export function getLevelData(xp = 0) {
  let current = XP_LEVELS[0];

  for (const lvl of XP_LEVELS) {
    if (xp >= lvl.minXp) current = lvl;
    else break;
  }

  return current;
}

export function ensurePlayer(wallet) {
  const walletLc = String(wallet).toLowerCase();
  const all = readPlayerXp();

  if (!all[walletLc]) {
    const levelData = getLevelData(0);
    all[walletLc] = {
      wallet: walletLc,
      xp: 0,
      level: levelData.level,
      statsBonus: levelData.bonuses,
      updatedAt: new Date().toISOString(),
    };
    writePlayerXp(all);
  }

  return all[walletLc];
}

export function awardXp(wallet, amount) {
  const walletLc = String(wallet).toLowerCase();
  const all = readPlayerXp();

  if (!all[walletLc]) {
    const levelData = getLevelData(0);
    all[walletLc] = {
      wallet: walletLc,
      xp: 0,
      level: levelData.level,
      statsBonus: levelData.bonuses,
      updatedAt: new Date().toISOString(),
    };
  }

  all[walletLc].xp += amount;

  const levelData = getLevelData(all[walletLc].xp);
  all[walletLc].level = levelData.level;
  all[walletLc].statsBonus = levelData.bonuses;
  all[walletLc].updatedAt = new Date().toISOString();

  writePlayerXp(all);

  return all[walletLc];
}

export function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function awardDailyLoginXp(wallet) {
  const walletLc = String(wallet).toLowerCase();
  const actions = readXpActions();
  const today = getTodayDateString();

  if (!actions[walletLc]) {
    actions[walletLc] = {
      dailyLogin: { lastClaimedDate: null },
      ecosystemClicks: {},
    };
  }

  if (actions[walletLc].dailyLogin?.lastClaimedDate === today) {
    return { awarded: false, reason: "already_claimed_today" };
  }

  actions[walletLc].dailyLogin = { lastClaimedDate: today };
  writeXpActions(actions);

  const player = awardXp(walletLc, XP_REWARDS.LOGIN);
  return { awarded: true, amount: XP_REWARDS.LOGIN, player };
}

export function awardEcosystemClickXp(wallet, linkKey) {
  const walletLc = String(wallet).toLowerCase();
  const actions = readXpActions();
  const today = getTodayDateString();

  if (!actions[walletLc]) {
    actions[walletLc] = {
      dailyLogin: { lastClaimedDate: null },
      ecosystemClicks: {},
    };
  }

  const clicks = actions[walletLc].ecosystemClicks || {};

  if (clicks[linkKey] === today) {
    return { awarded: false, reason: "already_claimed_for_link_today" };
  }

  clicks[linkKey] = today;
  actions[walletLc].ecosystemClicks = clicks;
  writeXpActions(actions);

  const player = awardXp(walletLc, XP_REWARDS.ECOSYSTEM_CLICK);
  return { awarded: true, amount: XP_REWARDS.ECOSYSTEM_CLICK, player };
}

console.log("[XP] DATA_DIR:", DATA_DIR);
console.log("[XP] XP_FILE:", XP_FILE);
console.log("[XP] XP_ACTIONS_FILE:", XP_ACTIONS_FILE);