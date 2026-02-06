import { ethers } from "ethers";

/**
 * Expects:
 *  - req.body.message
 *  - req.body.signature
 *
 * Attaches:
 *  - req.wallet (lowercased)
 */
export function authWallet(req, res, next) {
  const { message, signature } = req.body;

  if (!message || !signature) {
    return res.status(401).json({ error: "Missing wallet authentication" });
  }

  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch {
    return res.status(401).json({ error: "Invalid signature" });
  }

  req.wallet = recovered.toLowerCase();
  next();
}
