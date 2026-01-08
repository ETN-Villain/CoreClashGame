// convertMapping.cjs
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

// Paths
const csvPath = path.resolve("backend", "mapping.csv");
const jsonPath = path.resolve("src", "mapping.json");

console.log("📂 Reading CSV from:", csvPath);

try {
  if (!fs.existsSync(csvPath)) throw new Error("CSV file not found");

  const csvData = fs.readFileSync(csvPath, "utf8");
  if (!csvData.trim()) throw new Error("CSV file is empty");

  // Parse CSV
  const records = parse(csvData, {
    columns: true, // first row is headers
    skip_empty_lines: true,
    trim: true,
  });

  if (!records.length) throw new Error("No rows found in CSV");

  console.log(`📄 Parsed ${records.length} rows from CSV`);

  // Convert to mapping
  const mapping = {};
  records.forEach((row) => {
    const tokenId = row.token_id;
    const tokenURI = row.token_uri;

    if (!tokenId || !tokenURI) {
      console.warn("⚠️  Skipping row (missing token_id or token_uri):", row);
      return;
    }

    mapping[tokenId] = tokenURI;
  });

  fs.writeFileSync(jsonPath, JSON.stringify(mapping, null, 2));
  console.log(`✅ mapping.json created at ${jsonPath}`);
} catch (err) {
  console.error("❌ Failed to convert CSV to JSON:", err.message);
}
