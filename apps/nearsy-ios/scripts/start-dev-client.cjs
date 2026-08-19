/**
 * Start Expo Dev Client with EAS development env and an interactive-ish Metro
 * session that always prints the tunnel Development Client URL + QR.
 *
 * Why not `eas env:exec … expo start` alone?
 * eas env:exec captures child stdout as `[stdout]` lines and hides the QR.
 *
 * This script:
 * 1) briefly uses eas env:exec to dump env keys to a temp JSON (deleted after)
 * 2) spawns `expo start --dev-client --tunnel` with those env vars
 * 3) forwards Metro output and, once the tunnel is ready, prints the
 *    exp+… development-client deep link (tunnel host, not LAN) + ASCII QR
 *
 * Does not write .env files or log secret values.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');
const DUMP_REL = './scripts/_dump-eas-env.cjs';
const OUT_REL = './.nearsy-eas-env-dump.tmp.json';
const APP_SLUG = 'nearsy-ios';

function loadEasDevelopmentEnv() {
  const outFile = path.join(APP_ROOT, OUT_REL);
  const bashCmd = `node ${DUMP_REL} ${OUT_REL}`;

  try {
    const result = spawnSync(`eas env:exec development "${bashCmd}"`, {
      cwd: APP_ROOT,
      encoding: 'utf8',
      shell: true,
      env: {
        ...process.env,
        // Avoid evaluating Development app.config in the EAS CLI parent before
        // Google Dev vars are injected into the dump child.
        EXPO_PUBLIC_NEARSY_FIREBASE_ENV: '',
      },
    });

    if (result.status !== 0) {
      const errText = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
      throw new Error(
        `Failed to load EAS development env (exit ${result.status}). ${errText.slice(0, 500)}`,
      );
    }

    if (!fs.existsSync(outFile)) {
      throw new Error('EAS env dump file was not created.');
    }

    const loaded = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    const present = Object.keys(loaded).sort();
    console.log(
      `[start-dev-client] Loaded EAS development env keys (${present.length}): ${present.join(', ')}`,
    );

    if (!loaded.FIREBASE_APP_CHECK_DEBUG_TOKEN) {
      console.warn(
        '[start-dev-client] WARNING: FIREBASE_APP_CHECK_DEBUG_TOKEN missing from EAS load.',
      );
    }
    if (!loaded.EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY) {
      console.warn(
        '[start-dev-client] WARNING: EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY missing from EAS load.',
      );
    }

    return loaded;
  } finally {
    try {
      fs.unlinkSync(outFile);
    } catch {
      /* ignore */
    }
  }
}

function fetchNgrokHttpsUrl() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const https = (parsed.tunnels || []).find(
            (t) => typeof t.public_url === 'string' && t.public_url.startsWith('https://'),
          );
          resolve(https ? https.public_url.replace(/\/$/, '') : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function waitForTunnelUrl(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const url = await fetchNgrokHttpsUrl();
    if (url) return url;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

function printTunnelDevClientQr(tunnelHttpsUrl) {
  if (/10\.0\.0\.86/.test(tunnelHttpsUrl)) {
    console.error(
      '[start-dev-client] Refusing LAN address in tunnel URL:',
      tunnelHttpsUrl,
    );
    return;
  }

  const deepLink = `exp+${APP_SLUG}://expo-development-client/?url=${encodeURIComponent(
    tunnelHttpsUrl,
  )}`;

  console.log('');
  console.log(`› Metro waiting on ${deepLink}`);
  console.log('› Scan the QR code below with the Development Client (tunnel).');
  console.log('');

  try {
    const qrcode = require('qrcode-terminal');
    qrcode.generate(deepLink, { small: true });
  } catch (err) {
    console.warn(
      '[start-dev-client] qrcode-terminal unavailable; open the deep link manually.',
    );
  }

  console.log('');
  console.log(`[start-dev-client] tunnelHost=${new URL(tunnelHttpsUrl).host}`);
  console.log('[start-dev-client] development-client URL uses tunnel (not LAN).');
  console.log('');
}

function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      findFreePort(startPort + 1).then(resolve, reject);
    });
    server.listen(startPort, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : startPort;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

async function main() {
  const easEnv = loadEasDevelopmentEnv();
  const childEnv = {
    ...process.env,
    ...easEnv,
    CI: '0',
  };

  if (!childEnv.EXPO_PUBLIC_NEARSY_FIREBASE_ENV) {
    childEnv.EXPO_PUBLIC_NEARSY_FIREBASE_ENV = 'development';
  }
  if (!childEnv.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION) {
    childEnv.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION = 'us-central1';
  }

  // Avoid Expo's interactive "use another port?" prompt in non-TTY shells.
  const port = await findFreePort(8081);
  console.log(
    `[start-dev-client] Starting Metro (dev-client + tunnel) on port ${port} with EAS development env.`,
  );

  const child = spawn(
    'pnpm',
    ['exec', 'expo', 'start', '--dev-client', '--tunnel', '--port', String(port)],
    {
      cwd: APP_ROOT,
      env: childEnv,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    },
  );

  let tunnelAnnounceStarted = false;

  const onChunk = (buf, stream) => {
    const text = buf.toString('utf8');
    stream.write(buf);

    if (!tunnelAnnounceStarted && /Tunnel ready/i.test(text)) {
      tunnelAnnounceStarted = true;
      void (async () => {
        const tunnelUrl = await waitForTunnelUrl();
        if (!tunnelUrl) {
          console.error(
            '[start-dev-client] Tunnel ready but public URL was not found on ngrok :4040.',
          );
          return;
        }
        printTunnelDevClientQr(tunnelUrl);
      })();
    }
  };

  child.stdout.on('data', (buf) => onChunk(buf, process.stdout));
  child.stderr.on('data', (buf) => onChunk(buf, process.stderr));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[start-dev-client]', err instanceof Error ? err.message : err);
  process.exit(1);
});
