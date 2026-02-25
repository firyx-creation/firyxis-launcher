const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');

const APPS_CONFIG = require('./apps.json');

const LAUNCHER_VERSION = '1.1.0';
const GITHUB_REPO = 'firyx-creation/firyxis-launcher';
const GITHUB_VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/version.txt`;
const GITHUB_RELEASE_URL = `https://github.com/${GITHUB_REPO}`;

let mainWindow;
const activeInstalls = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300, height: 840,
    minWidth: 1050, minHeight: 700,
    frame: false,
    backgroundColor: '#0a0a0c',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // allow firebase cdn
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) > (pb[i]||0)) return 1;
    if ((pa[i]||0) < (pb[i]||0)) return -1;
  }
  return 0;
}

function sendProgress(id, progress, status = '') {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('install-progress', { id, progress, status });
}

// ── IPC basiques ──────────────────────────────────────────────────────────────
ipcMain.handle('get-apps', () => APPS_CONFIG);
ipcMain.handle('get-version', () => LAUNCHER_VERSION);
ipcMain.handle('open-url', (_, url) => shell.openExternal(url));
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.restore() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());

// ── Détection installée ───────────────────────────────────────────────────────
function checkInstalled(appData) {
  return new Promise((resolve) => {
    if (appData.detectCommand) {
      exec(appData.detectCommand, (err) => resolve(!err));
      return;
    }
    const wingetId = appData.wingetId || extractWingetId(appData.installCommand);
    if (wingetId) {
      exec(`winget list --id ${wingetId} --exact`, (err, stdout) => {
        resolve(!err && stdout && stdout.includes(wingetId));
      });
      return;
    }
    resolve(false);
  });
}

function extractWingetId(cmd) {
  if (!cmd) return null;
  const match = cmd.match(/winget install\s+(.+?)(\s|$)/i);
  return match ? match[1].trim() : null;
}

ipcMain.handle('check-all-installed', async () => {
  const results = {};
  for (const app of APPS_CONFIG) results[app.id] = await checkInstalled(app);
  return results;
});

ipcMain.handle('check-installed', async (_, appData) => {
  return { id: appData.id, installed: await checkInstalled(appData) };
});

// ── Annulation ────────────────────────────────────────────────────────────────
ipcMain.handle('cancel-install', async (_, id) => {
  const active = activeInstalls.get(id);
  if (!active) return { success: false };
  if (active.process) {
    try { exec(`taskkill /pid ${active.process.pid} /f /t`); } catch(e) {}
  }
  if (active.filePath && fs.existsSync(active.filePath)) {
    try { fs.unlinkSync(active.filePath); } catch(e) {}
  }
  activeInstalls.delete(id);
  return { success: true };
});

ipcMain.on('cancel-download', (_, id) => {
  const active = activeInstalls.get(id);
  if (active && active.response) try { active.response.destroy(); } catch(e) {}
});

// ── Désinstallation ───────────────────────────────────────────────────────────
ipcMain.handle('uninstall-app', async (_, appData) => {
  return new Promise((resolve) => {
    let cmd = appData.uninstallCommand;
    if (!cmd) {
      const wid = appData.wingetId || extractWingetId(appData.installCommand);
      if (wid) cmd = `winget uninstall --id ${wid} --exact --silent`;
    }
    if (!cmd) return resolve({ success: false, message: 'Aucune commande de désinstallation.' });
    exec(cmd, { timeout: 120000 }, (error, _, stderr) => {
      if (error) resolve({ success: false, message: stderr || error.message });
      else resolve({ success: true, message: `${appData.name} désinstallé.` });
    });
  });
});

// ── Installation commande ─────────────────────────────────────────────────────
ipcMain.handle('install-command', async (_, appData) => {
  return new Promise((resolve) => {
    const phases = [
      { until: 15, label: 'Recherche du paquet...' },
      { until: 40, label: 'Téléchargement...' },
      { until: 75, label: 'Vérification...' },
      { until: 90, label: 'Installation...' },
    ];
    let tick = 0;
    const interval = setInterval(() => {
      tick = Math.min(tick + 1, 45);
      const progress = Math.min(90, Math.round(tick * 2));
      const phase = phases.find(p => progress <= p.until) || phases[phases.length - 1];
      sendProgress(appData.id, progress, phase.label);
    }, 800);

    const proc = exec(appData.installCommand, { timeout: 300000 }, (error, _, stderr) => {
      clearInterval(interval);
      activeInstalls.delete(appData.id);
      if (error && error.killed) return resolve({ success: false, message: 'Annulé.', cancelled: true });
      sendProgress(appData.id, 100, 'Terminé !');
      if (error) resolve({ success: false, message: stderr || error.message });
      else resolve({ success: true, message: `${appData.name} installé !` });
    });
    activeInstalls.set(appData.id, { process: proc, filePath: null });
  });
});

// ── Installation URL ──────────────────────────────────────────────────────────
ipcMain.handle('install-url', async (_, appData) => {
  return new Promise((resolve) => {
    const tmpDir = path.join(os.tmpdir(), 'firyxis-launcher');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const url = appData.downloadUrl;
    const ext = url.includes('.msi') ? '.msi' : url.includes('.zip') ? '.zip' : '.exe';
    const filePath = path.join(tmpDir, `${appData.id}${ext}`);
    let cancelled = false;
    activeInstalls.set(appData.id, { process: null, filePath });
    sendProgress(appData.id, 1, 'Connexion...');

    const cancelHandler = (_, cancelId) => {
      if (cancelId === appData.id) {
        cancelled = true;
        if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch(e) {}
        activeInstalls.delete(appData.id);
        resolve({ success: false, message: 'Annulé.', cancelled: true });
        ipcMain.removeListener('cancel-download', cancelHandler);
      }
    };
    ipcMain.on('cancel-download', cancelHandler);

    function doDownload(dlUrl, redirects = 0) {
      if (redirects > 5 || cancelled) return;
      const proto = dlUrl.startsWith('https') ? https : http;
      proto.get(dlUrl, (response) => {
        if ([301,302,303,307,308].includes(response.statusCode))
          return doDownload(response.headers.location, redirects + 1);
        if (response.statusCode !== 200)
          return resolve({ success: false, message: `HTTP ${response.statusCode}` });

        const total = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;
        const file = fs.createWriteStream(filePath);
        activeInstalls.set(appData.id, { process: null, filePath, response });

        response.on('data', chunk => {
          if (cancelled) { response.destroy(); file.close(); return; }
          downloaded += chunk.length;
          const progress = total ? Math.round((downloaded / total) * 80) : Math.min(75, Math.round((downloaded / 10000000) * 75));
          sendProgress(appData.id, progress, `Téléchargement ${formatBytes(downloaded)}${total ? ' / ' + formatBytes(total) : '...'}`);
        });

        response.pipe(file);
        file.on('finish', () => {
          if (cancelled) return;
          file.close();
          sendProgress(appData.id, 85, "Lancement de l'installateur...");
          const cmd = ext === '.msi' ? `msiexec /i "${filePath}" /passive /norestart` : `"${filePath}"`;
          const proc = exec(cmd, (error) => {
            activeInstalls.delete(appData.id);
            ipcMain.removeListener('cancel-download', cancelHandler);
            sendProgress(appData.id, 100, 'Terminé !');
            if (error) resolve({ success: false, message: error.message });
            else resolve({ success: true, message: `${appData.name} installé !` });
          });
          activeInstalls.set(appData.id, { process: proc, filePath });
        });
        file.on('error', err => { if (!cancelled) resolve({ success: false, message: err.message }); });
      }).on('error', err => { if (!cancelled) resolve({ success: false, message: err.message }); });
    }
    doDownload(url);
  });
});

// ── Lancement ─────────────────────────────────────────────────────────────────
ipcMain.handle('launch-app', async (_, appData) => {
  return new Promise((resolve) => {
    if (!appData.launchCommand) return resolve({ success: false, message: 'Aucune commande.' });
    exec(appData.launchCommand, (error) => {
      if (error) resolve({ success: false, message: error.message });
      else resolve({ success: true });
    });
  });
});

// ── Update ────────────────────────────────────────────────────────────────────
function checkUpdate() {
  return new Promise((resolve) => {
    https.get(GITHUB_VERSION_URL, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const remote = data.trim();
        resolve({ hasUpdate: compareVersions(remote, LAUNCHER_VERSION) > 0, remoteVersion: remote, currentVersion: LAUNCHER_VERSION, releaseUrl: GITHUB_RELEASE_URL });
      });
    }).on('error', () => resolve({ hasUpdate: false, error: true }));
  });
}
ipcMain.handle('check-update', () => checkUpdate());

app.whenReady().then(() => {
  createWindow();
  setTimeout(async () => {
    const r = await checkUpdate().catch(() => null);
    if (r && r.hasUpdate) mainWindow.webContents.send('update-available', r);
  }, 4000);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
