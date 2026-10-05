// Phusion Passenger entry point for cPanel "Setup Node.js App" (Application startup file).
// Runs the Atrium renderer (Next.js) in platform mode or single-site file mode.
// Application root: {{appDir}}/apps/renderer   ·   Node.js version: 22+ (24 recommended)
// Environment variables are set in the cPanel UI (see renderer.env in this folder).
const { createServer } = require('node:http');
const { parse } = require('node:url');
const next = require('next');

const port = Number(process.env.PORT || 3001); // Passenger injects PORT
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res, parse(req.url, true))).listen(port, () => {
    console.log(`atrium renderer listening on ${port}`);
  });
});
