import { spawn } from 'child_process';
import { createServer } from 'net';
import { platform } from 'os';
import { fileURLToPath } from 'url';

const PORT = parseInt(process.env.PORT, 10) || 3000;
const serverPath = fileURLToPath(new URL('./server.js', import.meta.url));

async function findProcessOnPort(port) {
  if (platform() === 'win32') {
    const { execSync } = await import('child_process');
    try {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', timeout: 5000 });
      const lines = output.trim().split('\n').filter(l => l.includes('LISTENING'));
      if (lines.length === 0) return null;
      const parts = lines[0].trim().split(/\s+/);
      return parseInt(parts[parts.length - 1], 10);
    } catch { return null; }
  }

  try {
    const { execSync } = await import('child_process');
    const output = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8', timeout: 5000 });
    const pid = parseInt(output.trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch { return null; }
}

function killProcess(pid) {
  try {
    if (platform() === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return true;
  } catch { return false; }
}

function isPortFree(port) {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', err => resolve(err.code === 'EADDRINUSE' ? false : true));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '0.0.0.0');
  });
}

async function main() {
  const free = await isPortFree(PORT);
  if (!free) {
    const pid = await findProcessOnPort(PORT);
    if (pid) {
      process.stdout.write(`Port ${PORT} in use by PID ${pid}. Killing...\n`);
      killProcess(pid);
      await new Promise(r => setTimeout(r, 2000));
      const stillFree = await isPortFree(PORT);
      if (!stillFree) {
        process.stderr.write(`Could not free port ${PORT}. Aborting.\n`);
        process.exit(1);
      }
      process.stdout.write(`Freed port ${PORT}.\n`);
    } else {
      process.stderr.write(`Port ${PORT} in use but could not identify process. Aborting.\n`);
      process.exit(1);
    }
  }

  const child = spawn('node', [serverPath], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
