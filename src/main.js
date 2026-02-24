const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');

const APPS_CONFIG = require('./apps.json');

const LAUNCHER_VERSION = '1.0.0';
const GITHUB_REPO = 'VOTRE_USERNAME/firyxis-launcher';
const GITHUB_VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/version.txt`;
const GITHUB_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

let mainWindow;

// Processus en cours d'installation { appId -> { process, filePath, abortController } }
const activeInstalls = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 1000, minHeight: 680,
    frame: false,
    backgroundColor: '#0a0a0c',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
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

// ── Détection si une app est installée ───────────────────────────────────────
// On cherche dans le registre Windows via winget list ou reg query
function checkInstalled(appData) {
  return new Promise((resolve) => {
    if (!appData.detectCommand && !appData.wingetId && !appData.installCommand) {
      return resolve(false);
    }

    // Méthode 1 : commande de détection custom
    if (appData.detectCommand) {
      exec(appData.detectCommand, (err) => resolve(!err));
      return;
    }

    // Méthode 2 : winget list pour vérifier si installé
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

// ── IPC : get-apps avec état installé ────────────────────────────────────────
ipcMain.handle('get-apps', () => APPS_CONFIG);
ipcMain.handle('get-version', () => LAUNCHER_VERSION);
ipcMain.handle('open-url', (_, url) => shell.openExternal(url));

ipcMain.handle('check-installed', async (_, appData) => {
  const installed = await checkInstalled(appData);
  return { id: appData.id, installed };
});

ipcMain.handle('check-all-installed', async () => {
  const results = {};
  for (const app of APPS_CONFIG) {
    results[app.id] = await checkInstalled(app);
  }
  return results;
});

// ── IPC : Annulation ──────────────────────────────────────────────────────────
ipcMain.handle('cancel-install', async (_, id) => {
  const active = activeInstalls.get(id);
  if (!active) return { success: false, message: 'Aucune installation active.' };

  // Tuer le processus
  if (active.process) {
    try {
      process.platform === 'win32'
        ? exec(`taskkill /pid ${active.process.pid} /f /t`)
        : active.process.kill('SIGTERM');
    } catch (e) {}
  }

  // Supprimer le fichier téléchargé si partiel
  if (active.filePath && fs.existsSync(active.filePath)) {
    try { fs.unlinkSync(active.filePath); } catch (e) {}
  }

  activeInstalls.delete(id);
  sendProgress(id, 0, 'Annulé');
  return { success: true };
});

// ── IPC : Désinstallation ─────────────────────────────────────────────────────
ipcMain.handle('uninstall-app', async (_, appData) => {
  return new Promise((resolve) => {
    let cmd = appData.uninstallCommand;

    // Fallback : winget uninstall
    if (!cmd) {
      const wingetId = appData.wingetId || extractWingetId(appData.installCommand);
      if (wingetId) {
        cmd = `winget uninstall --id ${wingetId} --exact --silent`;
      }
    }

    if (!cmd) {
      resolve({ success: false, message: 'Aucune commande de désinstallation disponible.' });
      return;
    }

    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) resolve({ success: false, message: stderr || error.message });
      else resolve({ success: true, message: `${appData.name} désinstallé.` });
    });
  });
});

// ── IPC : Installation via commande ──────────────────────────────────────────
ipcMain.handle('install-command', async (_, appData) => {
  return new Promise((resolve) => {
    let tick = 0;
    const phases = [
      { until: 15, label: 'Recherche du paquet...' },
      { until: 40, label: 'Téléchargement...' },
      { until: 75, label: 'Vérification...' },
      { until: 90, label: 'Installation...' },
    ];

    const interval = setInterval(() => {
      tick = Math.min(tick + 1, 45);
      const progress = Math.min(90, Math.round(tick * 2));
      const phase = phases.find(p => progress <= p.until) || phases[phases.length - 1];
      sendProgress(appData.id, progress, phase.label);
    }, 800);

    const proc = exec(appData.installCommand, { timeout: 300000 }, (error, stdout, stderr) => {
      clearInterval(interval);
      activeInstalls.delete(appData.id);

      if (error && error.killed) {
        resolve({ success: false, message: 'Installation annulée.', cancelled: true });
        return;
      }

      sendProgress(appData.id, 100, 'Terminé !');
      if (error) resolve({ success: false, message: stderr || error.message });
      else resolve({ success: true, message: `${appData.name} installé avec succès !` });
    });

    activeInstalls.set(appData.id, { process: proc, filePath: null });
  });
});

// ── IPC : Installation via URL ────────────────────────────────────────────────
ipcMain.handle('install-url', async (_, appData) => {
  return new Promise((resolve) => {
    const tmpDir = path.join(os.tmpdir(), 'firyxis-launcher');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const url = appData.downloadUrl;
    const ext = url.includes('.msi') ? '.msi' : url.includes('.zip') ? '.zip' : '.exe';
    const filePath = path.join(tmpDir, `${appData.id}${ext}`);

    sendProgress(appData.id, 1, 'Connexion...');

    // Enregistrer le filePath pour pouvoir l'annuler
    activeInstalls.set(appData.id, { process: null, filePath });

    let cancelled = false;
    let currentRequest = null;

    function doDownload(dlUrl, redirectCount = 0) {
      if (redirectCount > 5) return resolve({ success: false, message: 'Trop de redirections.' });
      if (cancelled) return;

      const proto = dlUrl.startsWith('https') ? https : http;
      currentRequest = proto.get(dlUrl, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          return doDownload(response.headers.location, redirectCount + 1);
        }
        if (response.statusCode !== 200) {
          return resolve({ success: false, message: `HTTP ${response.statusCode}` });
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;
        const file = fs.createWriteStream(filePath);

        // Mettre à jour la référence pour l'annulation
        activeInstalls.set(appData.id, { process: null, filePath, response, file });

        response.on('data', (chunk) => {
          if (cancelled) { response.destroy(); file.close(); return; }
          downloaded += chunk.length;
          if (totalSize) {
            const progress = Math.round((downloaded / totalSize) * 80);
            sendProgress(appData.id, progress,
              `Téléchargement ${formatBytes(downloaded)} / ${formatBytes(totalSize)}`);
          } else {
            const progress = Math.min(75, Math.round((downloaded / 10000000) * 75));
            sendProgress(appData.id, progress, `Téléchargement ${formatBytes(downloaded)}...`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          if (cancelled) return;
          file.close();
          sendProgress(appData.id, 85, "Lancement de l'installateur...");

          const installCmd = ext === '.msi'
            ? `msiexec /i "${filePath}" /passive /norestart`
            : `"${filePath}"`;

          const proc = exec(installCmd, (error) => {
            activeInstalls.delete(appData.id);
            sendProgress(appData.id, 100, 'Terminé !');
            if (error) resolve({ success: false, message: error.message });
            else resolve({ success: true, message: `${appData.name} installé !` });
          });

          activeInstalls.set(appData.id, { process: proc, filePath });
        });

        file.on('error', (err) => {
          if (!cancelled) resolve({ success: false, message: err.message });
        });
      }).on('error', (err) => {
        if (!cancelled) resolve({ success: false, message: err.message });
      });
    }

    doDownload(url);

    // Écouter l'annulation depuis le renderer
    const cancelHandler = (_, cancelId) => {
      if (cancelId === appData.id) {
        cancelled = true;
        if (currentRequest) try { currentRequest.destroy(); } catch(e) {}
        if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch(e) {}
        activeInstalls.delete(appData.id);
        resolve({ success: false, message: 'Installation annulée.', cancelled: true });
        ipcMain.removeListener('cancel-download', cancelHandler);
      }
    };
    ipcMain.on('cancel-download', cancelHandler);
  });
});

// ── IPC : Launch ──────────────────────────────────────────────────────────────
ipcMain.handle('launch-app', async (_, appData) => {
  return new Promise((resolve) => {
    if (!appData.launchCommand) return resolve({ success: false, message: 'Aucune commande.' });
    exec(appData.launchCommand, (error) => {
      if (error) resolve({ success: false, message: error.message });
      else resolve({ success: true });
    });
  });
});

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.restore() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());

// ── Update check ──────────────────────────────────────────────────────────────
ipcMain.handle('check-update', () => checkUpdate());

function checkUpdate() {
  return new Promise((resolve) => {
    https.get(GITHUB_VERSION_URL, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const remoteVersion = data.trim();
        const hasUpdate = compareVersions(remoteVersion, LAUNCHER_VERSION) > 0;
        resolve({ hasUpdate, remoteVersion, currentVersion: LAUNCHER_VERSION, releaseUrl: GITHUB_RELEASE_URL });
      });
    }).on('error', () => resolve({ hasUpdate: false, error: true }));
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  setTimeout(async () => {
    const result = await checkUpdate().catch(() => null);
    if (result && result.hasUpdate) {
      mainWindow.webContents.send('update-available', result);
    }
  }, 4000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
