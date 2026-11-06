const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const DIR = __dirname;

const server = http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url;
  let filePath = path.join(DIR, file);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Page not found');
      return;
    }
    const ext = path.extname(filePath);
    const contentType = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : 'text/css';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock Kenyan Portals running at http://localhost:${PORT}`);
});

