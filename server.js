const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const port = process.env.PORT || process.env.port || "3000";
const hostname = "0.0.0.0";
const appRoot = __dirname;
const standaloneServer = path.join(appRoot, ".next", "standalone", "server.js");
const nextBin = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
const useStandalone = existsSync(standaloneServer);

const child = spawn(
  process.execPath,
  useStandalone
    ? [standaloneServer]
    : [
        nextBin,
        "start",
        "-H",
        hostname,
        "-p",
        String(port)
      ],
  {
    stdio: "inherit",
    cwd: appRoot,
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
