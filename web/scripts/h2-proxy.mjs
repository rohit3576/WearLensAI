import http2 from "node:http2";
import http from "node:http";
import fs from "node:fs";

const UPSTREAM = { host: "127.0.0.1", port: 3211 };

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
]);

const proxy = http2.createSecureServer(
  {
    key: fs.readFileSync(".data/key.pem"),
    cert: fs.readFileSync(".data/cert.pem"),
    allowHTTP1: true,
  },
  (req, res) => {
    const headers = Object.fromEntries(
      Object.entries(req.headers).filter(([name]) => !name.startsWith(":") && !HOP_BY_HOP.has(name)),
    );
    headers["host"] = "localhost";
    const upstream = http.request(
      { ...UPSTREAM, path: req.url, method: req.method, headers },
      (upstreamRes) => {
        const responseHeaders = Object.fromEntries(
          Object.entries(upstreamRes.headers).filter(
            ([name]) => !HOP_BY_HOP.has(name) && !name.startsWith(":"),
          ),
        );
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
        upstreamRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end("upstream error");
    });
    req.pipe(upstream);
  },
);

proxy.listen(3212, "127.0.0.1", () => {
  console.log("h2 proxy on https://localhost:3212");
});
