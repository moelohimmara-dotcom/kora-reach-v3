import http from 'http';

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8099');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Content-Type', 'application/json');

  const url = req.url.split('?')[0];
  console.log('MOCK', req.method, url);

  if (url === '/api/auth/me') {
    res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }
  if (url === '/api/settings') {
    res.end(JSON.stringify({ ok: true, app_name: 'KORA Agent', settings: {} }));
    return;
  }
  if (url === '/api/health') {
    res.end(JSON.stringify({ ok: true, status: 'up' }));
    return;
  }
  if (url === '/api/hitl') {
    res.end(JSON.stringify([]));
    return;
  }
  if (url === '/api/last') {
    res.end(JSON.stringify({ result: null }));
    return;
  }
  if (url === '/api/audit') {
    res.end(JSON.stringify({ days: [], total: 0 }));
    return;
  }
  if (url === '/api/whitelist') {
    res.end(JSON.stringify([]));
    return;
  }
  if (url === '/api/auth/users') {
    res.end(JSON.stringify({ ok: true, users: [] }));
    return;
  }
  if (url === '/api/hitl/trash') {
    res.end(JSON.stringify({ ok: true, items: [] }));
    return;
  }
  // default
  res.end(JSON.stringify({ ok: true }));
});

server.listen(8766, '127.0.0.1', () => console.log('mock backend on 8766'));
