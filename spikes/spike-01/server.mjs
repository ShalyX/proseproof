import http from 'node:http';

const PORT = Number(process.env.PORT || 4199);

const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Spike Page</title></head>
<body>
  <h1>Spike Page</h1>
  <section><h2>Collected this month</h2><p>$12,480.00</p></section>
  <button id="hello">Say hello</button>
  <p id="out"></p>
  <a id="export" href="/export">Export</a>
  <script>
    document.getElementById('hello').addEventListener('click', () => {
      document.getElementById('out').textContent = 'Hello, world!';
    });
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/export') {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('export failed');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(page);
});

server.listen(PORT, () => console.log(`spike server on http://localhost:${PORT}`));
