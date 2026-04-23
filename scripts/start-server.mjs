import { spawn } from "node:child_process";

const port = process.env.PORT || process.env.port || "3000";
const hostname = process.env.HOSTNAME || "0.0.0.0";

const child = spawn(
  process.execPath,
  [
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
