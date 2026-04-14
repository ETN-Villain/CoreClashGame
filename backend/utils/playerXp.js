import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { RPC_URL, BACKEND_PRIVATE_KEY, CORE_TOKEN_ADDRESS } from "../config.js";

const DATA_DIR = "/backend/data";
const XP_FILE = path.join(DATA_DIR, "playerXp.json");
const XP_ACTIONS_FILE = path.join(DATA_DIR, "xpActions.json");

const CORE_REWARD_LEVELS = [1, 2, 3, 4, 5];
const CORE_REWARD_AMOUNT = "10";

const ERC20ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
];

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

///* ---------------- Core Token Reward Logic ---------------- */
function getRewardableLevelsCrossed(oldLevel, newLevel, rewardedLevels = []) {
  const alreadyRewarded = new Set(rewardedLevels);
  const crossed = [];

  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
    if (CORE_REWARD_LEVELS.includes(lvl) && !alreadyRewarded.has(lvl)) {
      crossed.push(lvl);
    }
  }

  return crossed;
}

async function sendCoreReward(toWallet, level) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const adminWallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
  const coreToken = new ethers.Contract(CORE_TOKEN_ADDRESS, ERC20_REWARD_ABI, adminWallet);

  const amountWei = ethers.parseUnits(CORE_REWARD_AMOUNT, 18);

  const tx = await coreToken.transfer(toWallet, amountWei);
  await tx.wait(1);

  return {
    level,
    amount: CORE_REWARD_AMOUNT,
    txHash: tx.hash,
  };
}

///* ---------------- XP & Leveling Logic ---------------- */
export async function adjustXp(wallet, amount) {
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

  const oldLevel = all[walletLc].level || 0;
  const rewardedLevels = Array.isArray(all[walletLc].rewardedLevels)
    ? all[walletLc].rewardedLevels
    : [];

  all[walletLc].xp = Math.max(0, all[walletLc].xp + amount);

  const levelData = getLevelData(all[walletLc].xp);
  const newLevel = levelData.level;

  all[walletLc].level = newLevel;
  all[walletLc].statsBonus = levelData.bonuses;
  all[walletLc].rewardedLevels = rewardedLevels;
  all[walletLc].updatedAt = new Date().toISOString();

  writePlayerXp(all);

  const crossedRewardLevels = getRewardableLevelsCrossed(
    oldLevel,
    newLevel,
    rewardedLevels
  );

  for (const lvl of crossedRewardLevels) {
    try {
      const reward = await sendCoreReward(walletLc, lvl);
      rewardResults.push(reward);

      all[walletLc].rewardedLevels.push(lvl);
      all[walletLc].updatedAt = new Date().toISOString();
      writePlayerXp(all);

      console.log(
        `CORE reward sent: level ${lvl}, wallet ${walletLc}, tx ${reward.txHash}`
      );
    } catch (err) {
      console.error(
        `Failed to send CORE reward for wallet ${walletLc} at level ${lvl}:`,
        err.message || err
      );
    }
  }

  return {
    ...all[walletLc],
    rewardResults,
  };
}

export async function awardXp(wallet, amount) {
  return adjustXp(wallet, Math.abs(amount));
}

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
      rewardedLevels: [],
      updatedAt: new Date().toISOString(),
    };
    writePlayerXp(all);
  }

  return all[walletLc];
}

///* ---------------- Daily Login XP ---------------- */
export async function awardDailyLoginXp(wallet) {
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

  const player = await awardXp(walletLc, XP_REWARDS.LOGIN);
  return { awarded: true, amount: XP_REWARDS.LOGIN, player };
}

///* ---------------- Ecosystem Click XP ---------------- */
export async function awardEcosystemClickXp(wallet, linkKey) {
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

  const player = await awardXp(walletLc, XP_REWARDS.ECOSYSTEM_CLICK);
  return { awarded: true, amount: XP_REWARDS.ECOSYSTEM_CLICK, player };
}

console.log("[XP] DATA_DIR:", DATA_DIR);
console.log("[XP] XP_FILE:", XP_FILE);
console.log("[XP] XP_ACTIONS_FILE:", XP_ACTIONS_FILE);