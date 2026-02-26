import fs from "fs";

const FILE = path.join(__dirname, "burnTotal.json");

export function readBurnTotal() {
  try {
    if (!fs.existsSync(FILE)) return 0n;
    const data = JSON.parse(fs.readFileSync(FILE));
    return BigInt(data.totalBurnWei);
  } catch {
    return 0n;
  }
}

export function writeBurnTotal(totalWei) {
  fs.writeFileSync(
    FILE,
    JSON.stringify({ totalBurnWei: totalWei.toString() }, null, 2)
  );
}