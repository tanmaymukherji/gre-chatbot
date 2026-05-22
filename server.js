const { createServer } = require("node:http");
const { parse } = require("node:url");
const { existsSync } = require("node:fs");
const path = require("node:path");

const hostname = "0.0.0.0";
const port = Number(process.env.PORT || process.env.port || 3000);
const standaloneServer = path.join(__dirname, ".next", "standalone", "server.js");

if (existsSync(standaloneServer)) {
  process.env.PORT = String(port);
  process.env.HOSTNAME = hostname;
  require(standaloneServer);
  return;
}

const next = require("next");

const app = next({
  dev: false,
  hostname,
  port,
});

const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    }).listen(port, hostname, () => {
      console.log(`AskGRE server ready on http://${hostname}:${port}`);
    });
  })
  .catch((error) => {
    console.error("AskGRE server failed to start", error);
    process.exit(1);
  });
