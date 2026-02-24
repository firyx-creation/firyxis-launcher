const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getApps:           ()      => ipcRenderer.invoke('get-apps'),
  getVersion:        ()      => ipcRenderer.invoke('get-version'),
  checkUpdate:       ()      => ipcRenderer.invoke('check-update'),
  checkAllInstalled: ()      => ipcRenderer.invoke('check-all-installed'),
  checkInstalled:    (app)   => ipcRenderer.invoke('check-installed', app),
  installCommand:    (app)   => ipcRenderer.invoke('install-command', app),
  installUrl:        (app)   => ipcRenderer.invoke('install-url', app),
  cancelInstall:     (id)    => ipcRenderer.invoke('cancel-install', id),
  cancelDownload:    (id)    => ipcRenderer.send('cancel-download', id),
  uninstallApp:      (app)   => ipcRenderer.invoke('uninstall-app', app),
  launchApp:         (app)   => ipcRenderer.invoke('launch-app', app),
  openUrl:           (url)   => ipcRenderer.invoke('open-url', url),
  minimize:          ()      => ipcRenderer.send('window-minimize'),
  maximize:          ()      => ipcRenderer.send('window-maximize'),
  close:             ()      => ipcRenderer.send('window-close'),

  onProgress:           (cb) => ipcRenderer.on('install-progress',  (_, d) => cb(d)),
  onUpdateAvailable:    (cb) => ipcRenderer.on('update-available',   (_, d) => cb(d)),
});
