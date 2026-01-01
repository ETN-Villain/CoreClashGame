import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const METADATA_JSON_DIR = path.join(__dirname, "metadata-cache", "json");
export const MAPPING_FILE = path.join(__dirname, "mapping.csv");

// Directory where reveal backup JSONs will be saved
export const REVEAL_DIR = path.join(__dirname, "reveals");