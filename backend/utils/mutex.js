let locked = false;
const queue = [];

export async function withLock(fn) {
  if (locked) {
    await new Promise((resolve) => queue.push(resolve));
  }

  locked = true;

  try {
    return await fn();
  } finally {
    const next = queue.shift();

    if (next) {
      next(); // hand off to next waiter
    } else {
      locked = false;
    }
  }
}