const http = require("node:http");
const requestHandler = require("../lib/request-handler");

const port = Number(process.env.PORT) || 3000;
const server = http.createServer(requestHandler);

server.listen(port, "0.0.0.0", () => {
  console.log(`QuickPaste is running at http://localhost:${port}`);
});
