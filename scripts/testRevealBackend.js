// testRevealBackend.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const BACKEND_URL = "http://localhost:3001"; // replace with your backend URL
const REVEAL_FILE = path.join("./reveal-sample.json"); // sample reveal JSON

async function testReveal() {
  try {
    if (!fs.existsSync(REVEAL_FILE)) {
      throw new Error(`Reveal file not found: ${REVEAL_FILE}`);
    }

    const text = fs.readFileSync(REVEAL_FILE, "utf-8");
    const data = JSON.parse(text);

    const { gameId, salt, nftContracts, tokenIds } = data;
    if (!gameId || !salt || !nftContracts || !tokenIds) {
      throw new Error("Reveal file missing required fields");
    }

    console.log("Posting reveal to backend...");
    const res = await fetch(`${BACKEND_URL}/games/${gameId}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        player: "0x3Fd2e5B4AC0efF6DFDF2446abddAB3f66B425099", // replace with test account
        salt: salt.toString(),
        nftContracts,
        tokenIds
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("Backend returned error:", result);
    } else {
      console.log("Backend reveal response:", result);

      const backupFile = path.join("./backend/reveal-backups", `game-${gameId}-0xYourTestAddressHere.json`);
      if (fs.existsSync(backupFile)) {
        console.log("Reveal backup file successfully saved:", backupFile);
        const backupData = JSON.parse(fs.readFileSync(backupFile, "utf-8"));
        console.log("Backup content:", backupData);
      } else {
        console.warn("Reveal backup file NOT found!");
      }
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testReveal();
