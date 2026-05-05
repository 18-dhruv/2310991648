const axios = require("axios");
require("dotenv").config({ path: "../.env" });

const TOKEN = process.env.TOKEN;
const BASE_URL = process.env.BASE_URL;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

const LIMIT = 10;

function getWeight(type) {
  if (type === "Placement") return 3;
  if (type === "Result") return 2;
  return 1;
}

function getScore(n) {
  const typeWeight = getWeight(n.Type);

  const minutesSinceCreated =
    (Date.now() - new Date(n.Timestamp).getTime()) / 60000;

  const recencyScore = Math.max(0, 1000 - minutesSinceCreated);

  return typeWeight * 1000 + recencyScore;
}

class MinHeap {
  constructor() {
    this.heap = [];
  }

  size() {
    return this.heap.length;
  }

  peek() {
    return this.heap[0];
  }

  push(val) {
    this.heap.push(val);
    this.up();
  }

  pop() {
    if (this.size() === 1) return this.heap.pop();
    const root = this.heap[0];
    this.heap[0] = this.heap.pop();
    this.down();
    return root;
  }

  up() {
    let i = this.heap.length - 1;
    while (i > 0) {
      let p = Math.floor((i - 1) / 2);
      if (this.heap[p].score <= this.heap[i].score) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }

  down() {
    let i = 0;
    while (true) {
      let l = 2 * i + 1;
      let r = 2 * i + 2;
      let s = i;

      if (l < this.heap.length && this.heap[l].score < this.heap[s].score)
        s = l;
      if (r < this.heap.length && this.heap[r].score < this.heap[s].score)
        s = r;

      if (s === i) break;
      [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]];
      i = s;
    }
  }
}

async function main() {
  try {
    const res = await axios.get(`${BASE_URL}/notifications`, { headers });
    const notifications = res.data.notifications;

    const heap = new MinHeap();

    for (let n of notifications) {
      const item = { ...n, score: getScore(n) };

      if (heap.size() < LIMIT) {
        heap.push(item);
      } else if (item.score > heap.peek().score) {
        heap.pop();
        heap.push(item);
      }
    }

    const result = heap.heap.sort((a, b) => b.score - a.score);

    console.log("\nTop 10 Priority Notifications:\n");

    result.forEach((n) => {
      console.log(
        `ID: ${n.ID} | Type: ${n.Type} | Score: ${n.score.toFixed(2)}`
      );
      console.log(`Message: ${n.Message}`);
      console.log(`Timestamp: ${n.Timestamp}\n`);
    });
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
}

main();