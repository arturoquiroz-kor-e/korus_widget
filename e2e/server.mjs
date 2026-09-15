// Servidor estático mínimo: sirve e2e/pages y dist/widget.js en el puerto dado.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }

export function serve(port, root) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const file = url.pathname === '/widget.js' ? join(root, 'dist/widget.js') : join(root, 'e2e/pages', url.pathname.replace(/^\//, '') || 'host.html')
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404); res.end('not found')
    }
  })
  return new Promise(resolve => server.listen(port, () => resolve(server)))
}
