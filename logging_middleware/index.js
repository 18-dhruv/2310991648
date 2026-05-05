const axios = require("axios");

let accessToken = "";

function initLogger(token) {
  accessToken = token;
}

async function Log(stack, level, pkg, message) {
  console.log(`[${level}] ${stack}/${pkg}: ${message}`);

  try {
    await axios.post(
      "http://20.207.122.201/evaluation-service/logs",
      {
        stack: stack,
        level: level,
        package: pkg,
        message: message,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Log failed to send:", err.message);
  }
}

module.exports = { initLogger, Log };