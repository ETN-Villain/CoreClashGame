// resyncGames.js (CommonJS)
const fs = "fs";
const path = "path";

// Path to games.json
const DB_FILE = path.join(__dirname, "games.json");

// Load games.json
const loadGames = () => {
  if (!fs.existsSync(DB_FILE)) {
    console.log("games.json not found, creating empty array...");
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
    return [];
  }

  try {
    const data = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading games.json:", err);
    return [];
  }
};

// Save games.json
const saveGames = (games) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(games, null, 2));
    console.log("games.json updated successfully.");
  } catch (err) {
    console.error("Error writing games.json:", err);
  }
};

// Example: resync logic
const resyncGames = () => {
  const games = loadGames();

  const updatedGames = games.map((g, index) => ({
    id: g.id ?? index,
    creator: g.creator ?? "0x0",
    player2: g.player2 ?? null,
    player2JoinedAt: g.player2JoinedAt ?? null,
    stakeToken: g.stakeToken ?? "",
    stakeAmount: g.stakeAmount ?? "0",
    tokenURI: g.tokenURI ?? "",
    tokenURI2: g.tokenURI2 ?? null,
    meta1: g.meta1 ?? null,
    meta2: g.meta2 ?? null,
    createdAt: g.createdAt ?? new Date().toISOString(),
    settledAt: g.settledAt ?? null,
  }));

  saveGames(updatedGames);
  console.log(`Resynced ${updatedGames.length} games.`);
};

// Run
resyncGames();
