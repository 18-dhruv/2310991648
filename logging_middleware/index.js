const axios = require("axios");
require("dotenv").config({ path: "../.env" });

const TOKEN = process.env.TOKEN;
const BASE_URL = process.env.BASE_URL;

let accessToken = "";

function initLogger(token) {
  accessToken = token;
}

async function Log(stack, level, pkg, message) {
  console.log(`[${level}] ${stack}/${pkg}: ${message}`);

  try {
    await axios.post(
      `${BASE_URL}/logs`,
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