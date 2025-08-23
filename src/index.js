const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Hello, world! Server is running.");
});

const http = require('http');
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

console.log('DEBUG: PORT =', PORT, 'NODE_ENV =', process.env.NODE_ENV, 'PID =', process.pid);

if (global.__serverStarted) {
  console.log('Server already started in this process — skipping listen.');
} else {
  const server = http.createServer(app);
  server.listen(PORT, HOST, () => {
    console.log(`✅ Server listening on ${HOST}:${PORT} (PID ${process.pid})`);
  });

  server.on('error', (err) => {
    console.error('Server listen error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} already in use. Is another process running?`);
      process.exit(1);
    } else {
      process.exit(1);
    }
  });

  global.__serverStarted = true;
}
