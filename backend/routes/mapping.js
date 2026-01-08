// backend/routes/mapping.js
import express from "express";
import fs from "fs";
import path from "path";
import csvParser from "csv-parser";

const router = express.Router();

router.get("/mapping", async (req, res) => {
  const results = {};
  fs.createReadStream(path.join(__dirname, "../mapping.csv"))
    .pipe(csvParser())
    .on("data", (row) => {
      results[row.token_id] = row.token_uri;
    })
    .on("end", () => res.json(results));
});

export default router;
