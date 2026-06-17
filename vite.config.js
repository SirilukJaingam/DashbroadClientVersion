import { defineConfig } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getLanIP() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

const lanIP = getLanIP()

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'DashbroadClientVersion'
const repoBase = `/${repoName}/`
const usePagesBase = process.env.GITHUB_PAGES === 'true' || process.env.npm_lifecycle_event === 'build:pages'

export default defineConfig({
  base: usePagesBase ? repoBase : '/',
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        tallyFloat: resolve(__dirname, 'pages/tally-float.html'),
        aScanFloat: resolve(__dirname, 'pages/aScan-float.html'),
      },
    },
  },
  plugins: [
    {
      name: 'inject-lan-ip',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `  <meta name="network-lan-ip" content="${lanIP}">\n</head>`
        )
      },
    },
  ],
})
