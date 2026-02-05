let locked = false;
const queue = [];

export async function withLock(fn) {
  if (locked) {
    await new Promise(resolve => queue.push(resolve));
  }

  locked = true;

  try {
    return await fn();
  } finally {
    locked = false;
    if (queue.length > 0) {
      const next = queue.shift();
      next();
    }
  }
}
