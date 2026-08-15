// Minimal "not-found" mock of the ENSRainbow API for self-hosted ENSIndexer
// parity runs. ENSIndexer hard-requires a reachable rainbow for label
// healing; answering NotFound for every hash degrades healing to unhealed
// labels (fine for parity scope: beta names carry labels on-chain in
// LabelRegistered). Run: node scripts/rainbow-mock.js (listens on :3223)
const http = require('node:http')

const server = http.createServer((req, res) => {
  const url = req.url || '/'
  if (url === '/health' || url === '/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }
  if (url.startsWith('/v1/heal/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'error',
        error: 'label not found (parity-run mock)',
        errorCode: 404,
      }),
    )
    return
  }
  if (url.startsWith('/v1/config')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      serverLabelSet: { labelSetId: 'subgraph', highestLabelSetVersion: 5 },
      versionInfo: { ensRainbow: '2.0.0' },
    }))
    return
  }
  if (url.startsWith('/v1/labels/count')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'success', count: 0, timestamp: new Date().toISOString() }))
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'error', error: 'not found', errorCode: 400 }))
})

server.listen(3223, () => console.log('rainbow-mock listening on :3223'))
