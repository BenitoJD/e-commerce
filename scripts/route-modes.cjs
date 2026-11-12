// Lists App Router pages and whether they render on the server or only in the browser.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'apps', 'storefront', 'app');
const rows = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name === 'page.js') {
      const first = fs.readFileSync(p, 'utf8').split('\n')[0].trim();
      const route = '/' + path.relative(ROOT, p).replace(/\\/g, '/').replace(/\/page\.js$/, '').replace(/^page\.js$/, '');
      rows.push({ route, mode: first === "'use client';" ? 'client' : 'server' });
    }
  }
}

walk(ROOT);
rows.sort((a, b) => a.mode.localeCompare(b.mode) || a.route.localeCompare(b.route));
for (const r of rows) console.log(`${r.mode.padEnd(7)} ${r.route}`);
console.log(`\nserver: ${rows.filter((r) => r.mode === 'server').length}, client: ${rows.filter((r) => r.mode === 'client').length}`);
