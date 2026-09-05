import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Auto-discover and mount all API handlers
function discoverApiFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...discoverApiFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const apiDir = path.join(__dirname, 'api');
const apiFiles = discoverApiFiles(apiDir);

let mountedCount = 0;
for (const filePath of apiFiles) {
  const relativePath = path.relative(__dirname, filePath);
  const routePath = '/' + relativePath.replace(/\\/g, '/').replace(/\.js$/, '');
  try {
    const mod = await import(pathToFileURL(filePath).href);
    if (typeof mod.default === 'function') {
      app.all(routePath, mod.default);
      console.log(`  API: ${routePath}`);
      mountedCount++;
    }
  } catch (err) {
    console.warn(`  SKIP: ${routePath} — ${err.message}`);
  }
}

// Serve static files
app.use(express.static(__dirname, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.webmanifest')) {
      res.set('Content-Type', 'application/manifest+json');
    }
  }
}));

// Fallback: serve index.html for unmatched routes (SPA support for manager/fitter)
app.use((req, res) => {
  const staticPath = path.join(__dirname, req.path, 'index.html');
  if (fs.existsSync(staticPath)) {
    res.sendFile(staticPath);
  } else {
    res.status(404).json({ error: 'Not found', path: req.path });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nDynaHaul X v2 — Server running`);
  console.log(`  Local:    http://127.0.0.1:${PORT}`);
  console.log(`  Network:  http://<your-ip>:${PORT}`);
  console.log(`\n  Manager:  http://127.0.0.1:${PORT}/manager/`);
  console.log(`  Fitter:   http://127.0.0.1:${PORT}/fitter/`);
  console.log(`  Reports:  http://127.0.0.1:${PORT}/manager/reports/`);
  console.log(`  Setup:    http://127.0.0.1:${PORT}/setup.html`);
  console.log(`\n  APIs mounted: ${mountedCount} / ${apiFiles.length}`);
});
