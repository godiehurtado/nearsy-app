/**
 * Start Expo Dev Client with EAS development env.
 *
 * Modes:
 *   (default) tunnel — `expo start --dev-client --tunnel` + QR for tunnel URL
 *   --lan            — `expo start --dev-client --lan` (same EAS env, no ngrok)
 *
 * Why not `eas env:exec … expo start` alone?
 * eas env:exec captures child stdout as `[stdout]` lines and hides the QR.
 *
 * This script:
 * 1) briefly uses eas env:exec to dump env keys to a temp JSON (deleted after)
 * 2) spawns expo with those env vars
 * 3) forwards Metro output; tunnel mode also prints the exp+ deep link + QR
 *
 * Does not write .env files or log secret values.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');
const DUMP_REL = './scripts/_dump-eas-env.cjs';
const OUT_REL = './.nearsy-eas-env-dump.tmp.json';
const APP_SLUG = 'nearsy-ios';
const DEFAULT_REGION = 'us-central1';

function parseNetworkMode(argv) {
  if (argv.includes('--lan')) return 'lan';
  if (argv.includes('--tunnel')) return 'tunnel';
  return 'tunnel';
}

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

function stripEmulatorVars(env) {
  delete env.EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST;
  delete env.EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT;
  delete env.FUNCTIONS_EMULATOR_HOST;
  delete env.FUNCTIONS_EMULATOR_PORT;
}

function printSafeRuntimeSummary(childEnv, networkMode) {
  const environment = String(
    childEnv.EXPO_PUBLIC_NEARSY_FIREBASE_ENV || '',
  ).trim();
  const projectId = String(
    childEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  ).trim();
  const region = String(
    childEnv.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || DEFAULT_REGION,
  ).trim();
  const emulatorHost = String(
    childEnv.EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST || '',
  ).trim();
  const functionsMode = emulatorHost ? 'emulator' : 'cloud';

  console.log(`[start-dev-client] environment=${environment || '(missing)'}`);
  console.log(`[start-dev-client] projectId=${projectId || '(missing)'}`);
  console.log(`[start-dev-client] region=${region || '(missing)'}`);
  console.log(`[start-dev-client] functionsMode=${functionsMode}`);
  console.log(`[start-dev-client] networkMode=${networkMode}`);

  if (environment !== 'development') {
    throw new Error(
      `Refusing to start: EXPO_PUBLIC_NEARSY_FIREBASE_ENV must be development (got ${environment || 'empty'}).`,
    );
  }
  if (projectId !== 'nearsy-dev') {
    throw new Error(
      `Refusing to start: EXPO_PUBLIC_FIREBASE_PROJECT_ID must be nearsy-dev (got ${projectId || 'empty'}).`,
    );
  }
  if (region !== DEFAULT_REGION) {
    throw new Error(
      `Refusing to start: Functions region must be ${DEFAULT_REGION} (got ${region}).`,
    );
  }
  if (functionsMode !== 'cloud') {
    throw new Error(
      'Refusing to start: Emulator host is set; physical QA requires cloud Functions.',
    );
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
            (t) =>
              typeof t.public_url === 'string' &&
              t.public_url.startsWith('https://'),
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

function printDevClientQr(metroHttpUrl, label) {
  const deepLink = `exp+${APP_SLUG}://expo-development-client/?url=${encodeURIComponent(
    metroHttpUrl,
  )}`;

  console.log('');
  console.log(`› Metro waiting on ${deepLink}`);
  console.log(`› Scan the QR code below with the Development Client (${label}).`);
  console.log('');

  try {
    const qrcode = require('qrcode-terminal');
    qrcode.generate(deepLink, { small: true });
  } catch {
    console.warn(
      '[start-dev-client] qrcode-terminal unavailable; open the deep link manually.',
    );
  }

  console.log('');
  console.log(`[start-dev-client] metroUrl=${metroHttpUrl}`);
  console.log(`[start-dev-client] development-client URL uses ${label}.`);
  console.log('');
}

function printTunnelDevClientQr(tunnelHttpsUrl) {
  if (/10\.0\.0\.86/.test(tunnelHttpsUrl)) {
    console.error(
      '[start-dev-client] Refusing LAN address in tunnel URL:',
      tunnelHttpsUrl,
    );
    return;
  }
  printDevClientQr(tunnelHttpsUrl, 'tunnel');
}

function pickLanIpv4() {
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (
        entry &&
        entry.family === 'IPv4' &&
        !entry.internal &&
        typeof entry.address === 'string'
      ) {
        return entry.address;
      }
    }
  }
  return null;
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
      const port =
        typeof address === 'object' && address ? address.port : startPort;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

async function main() {
  const networkMode = parseNetworkMode(process.argv.slice(2));
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
    childEnv.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION = DEFAULT_REGION;
  }

  // Physical QA must hit cloud Functions on nearsy-dev — never inherit emulator.
  stripEmulatorVars(childEnv);
  printSafeRuntimeSummary(childEnv, networkMode);

  const port = await findFreePort(8081);
  const networkFlag = networkMode === 'lan' ? '--lan' : '--tunnel';
  console.log(
    `[start-dev-client] Starting Metro (dev-client + ${networkMode}) on port ${port} with EAS development env.`,
  );
  if (networkMode === 'lan') {
    console.log(
      '[start-dev-client] Require iPhone and PC on the same Wi‑Fi. If the device cannot connect, allow inbound TCP on the Metro port in Windows Firewall.',
    );
  }

  const child = spawn(
    'pnpm',
    [
      'exec',
      'expo',
      'start',
      '--dev-client',
      networkFlag,
      '--port',
      String(port),
    ],
    {
      cwd: APP_ROOT,
      env: childEnv,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    },
  );

  let announced = false;

  const onChunk = (buf, stream) => {
    const text = buf.toString('utf8');
    stream.write(buf);

    if (announced) return;

    if (networkMode === 'tunnel' && /Tunnel ready/i.test(text)) {
      announced = true;
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
      return;
    }

    if (networkMode === 'lan') {
      const expMatch = text.match(/exp:\/\/([0-9.]+):(\d+)/);
      if (expMatch) {
        announced = true;
        printDevClientQr(`http://${expMatch[1]}:${expMatch[2]}`, 'lan');
        return;
      }
      if (/Metro waiting|Welcome to Expo|Starting Metro Bundler/i.test(text)) {
        const lanIp = pickLanIpv4();
        if (lanIp) {
          announced = true;
          printDevClientQr(`http://${lanIp}:${port}`, 'lan');
        }
      }
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
