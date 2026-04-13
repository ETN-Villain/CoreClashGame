import fs from "fs";
import path from "path";

const XP_FILE = path.resolve("backend/data/playerXp.json");
const XP_ACTIONS_FILE = path.resolve("backend/data/xpActions.json");

export const XP_REWARDS = {
  LOGIN: 5,
  ECOSYSTEM_CLICK: 5,
  CREATE_GAME: 25,
  JOIN_GAME: 30,
  REVEAL: 50,
  SETTLE: 100,
};

export const XP_LEVELS = [
  { level: 1, minXp: 0, bonuses: { attack: 2, defense: 0, vitality: 0, agility: 0 } },
  { level: 2, minXp: 200, bonuses: { attack: 2, defense: 4, vitality: 0, agility: 0 } },
  { level: 3, minXp: 500, bonuses: { attack: 2, defense: 4, vitality: 5, agility: 0 } },
  { level: 4, minXp: 1000, bonuses: { attack: 2, defense: 4, vitality: 5, agility: 5 } },
  { level: 5, minXp: 1750, bonuses: { attack: 7, defense: 4, vitality: 5, agility: 5 } },
  { level: 6, minXp: 2750, bonuses: { attack: 7, defense: 9, vitality: 5, agility: 5 } },
  { level: 7, minXp: 4250, bonuses: { attack: 7, defense: 9, vitality: 10, agility: 5 } },
  { level: 8, minXp: 6000, bonuses: { attack: 7, defense: 9, vitality: 10, agility: 15 } },
  { level: 9, minXp: 8000, bonuses: { attack: 17, defense: 9, vitality: 10, agility: 15 } },
  { level: 10, minXp: 12000, bonuses: { attack: 17, defense: 19, vitality: 10, agility: 15 } },
];

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  }
}

export function readPlayerXp() {
  ensureFile(XP_FILE);
  return JSON.parse(fs.readFileSync(XP_FILE, "utf8"));
}

export function writePlayerXp(data) {
  fs.writeFileSync(XP_FILE, JSON.stringify(data, null, 2));
}

export function readXpActions() {
  ensureFile(XP_ACTIONS_FILE);
  return JSON.parse(fs.readFileSync(XP_ACTIONS_FILE, "utf8"));
}

export function writeXpActions(data) {
  fs.writeFileSync(XP_ACTIONS_FILE, JSON.stringify(data, null, 2));
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