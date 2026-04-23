const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");

const port = process.env.PORT || process.env.port || "3000";
const hostname = "0.0.0.0";
const standaloneServer = ".next/standalone/server.js";
const useStandalone = existsSync(standaloneServer);

const child = spawn(
  process.execPath,
  useStandalone
    ? [standaloneServer]
    : [
        "./node_modules/next/dist/bin/next",
        "start",
        "-H",
        hostname,
        "-p",
        String(port)
      ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: hostname
    }
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
