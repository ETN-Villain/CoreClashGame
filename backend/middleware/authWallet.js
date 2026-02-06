import { ethers } from "ethers";

export function authWallet(req, res, next) {
  try {
    const wallet =
      req.headers["x-wallet"] ||
      req.headers["x-address"] ||
      req.body?.player;

    if (!wallet || !ethers.isAddress(wallet)) {
      return res.status(401).json({ error: "Missing wallet authentication" });
    }

    // Normalize once, everywhere
    req.wallet = wallet.toLowerCase();
    next();
  } catch (err) {
    console.error("authWallet error:", err);
    return res.status(401).json({ error: "Wallet authentication failed" });
  }
}
