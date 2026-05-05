const axios = require("axios");
require("dotenv").config({ path: "../.env" });
const { initLogger, Log } = require("../logging_middleware/index.js");

const TOKEN = process.env.TOKEN;
const BASE_URL = process.env.BASE_URL;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

// build dp table to find max impact within hour budget
function knapsack(capacity, tasks) {
  const n = tasks.length;
  const dp = Array.from({ length: n + 1 }, () =>
    new Array(capacity + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = tasks[i - 1];
    for (let w = 0; w <= capacity; w++) {
      // skip this task
      dp[i][w] = dp[i - 1][w];
      // include this task if it fits and gives better impact
      if (Duration <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - Duration] + Impact);
      }
    }
  }

  // backtrack to find which tasks were selected
  const selected = [];
  let w = capacity;
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(tasks[i - 1]);
      w -= tasks[i - 1].Duration;
    }
  }

  return { selected, totalImpact: dp[n][capacity] };
}

async function main() {
  initLogger(TOKEN);

  await Log("backend", "info", "service", "Fetching depots");
  const depotsRes = await axios.get(`${BASE_URL}/depots`, { headers });
  const depots = depotsRes.data.depots;

  await Log("backend", "info", "service", "Fetching vehicles");
  const vehiclesRes = await axios.get(`${BASE_URL}/vehicles`, { headers });
  const vehicles = vehiclesRes.data.vehicles;

  for (const depot of depots) {
    await Log("backend", "info", "service", `Running scheduler for depot ${depot.ID}`);
    const { selected, totalImpact } = knapsack(depot.MechanicHours, vehicles);

    console.log(`\nDepot ${depot.ID} | Budget: ${depot.MechanicHours}hrs | Impact: ${totalImpact}`);
    selected.forEach((t) => {
      console.log(`  Task: ${t.TaskID} | Duration: ${t.Duration} | Impact: ${t.Impact}`);
    });
  }
}

main();