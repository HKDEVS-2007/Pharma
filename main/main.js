const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const Database = require('better-sqlite3');
const { initServer, stopServer } = require('./server');
const net    = require('./netclient');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.hkdevs.pharma');
}

const APP_ICON = process.platform === 'win32'
  ? path.join(__dirname, '../src/assets/icon.ico')
  : path.join(__dirname, '../src/assets/icon.png');

// ── AUTO UPDATER CONFIG ──────────────────────────────────────────
autoUpdater.autoDownload = false; // We'll ask the user first
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

function checkUpdates() {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }
}

autoUpdater.on('update-available', (info) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progress);
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded');
  }
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

ipcMain.handle('start-update-download', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdates();
});

app.disableHardwareAcceleration();

let mainWindow;
let db;
const DB_PATH = path.join(app.getPath('userData'), 'pharmco.db');

// ── MODE ─────────────────────────────────────────────────────────
// 'local'   = Admin PC (has local DB, runs HTTP server)
// 'network' = User PC  (connects to Admin PC over LAN/WAN)
let MODE      = 'local';    // default until config loaded
let SERVER_PORT = 7272;

function getNetConfig() {
  try {
    const p = path.join(app.getPath('userData'), 'netconfig.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch(e) {}
  return null;
}
function saveNetConfig(cfg) {
  const p = path.join(app.getPath('userData'), 'netconfig.json');
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
}

// Helper: get local IP addresses
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

// ── DB INIT ──────────────────────────────────────────────────────
function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    const packagedDBPath = path.join(__dirname, 'pharmco.db');
    if (fs.existsSync(packagedDBPath)) {
      try {
        fs.copyFileSync(packagedDBPath, DB_PATH);
        console.log('Database successfully seeded from packaged file:', DB_PATH);
      } catch (err) {
        console.error('Failed to copy packaged database file:', err);
      }
    }
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
      usercontact TEXT, usercnic TEXT, usertype TEXT NOT NULL DEFAULT 'user',
      password TEXT NOT NULL, useraddress TEXT
    );
    CREATE TABLE IF NOT EXISTS salts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, saltname TEXT NOT NULL UNIQUE, description TEXT
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, categoryname TEXT NOT NULL,
      categoryunit TEXT, description TEXT
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, suppliername TEXT NOT NULL,
      suppliercontact TEXT, supplieraddress TEXT
    );
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT, medicinename TEXT NOT NULL,
      medicinecategory TEXT, salt TEXT, supplierid INTEGER,
      quantity INTEGER DEFAULT 0, lowstockthreshold INTEGER DEFAULT 10,
      batchno TEXT, expiry TEXT, purchaseprice REAL DEFAULT 0,
      saleprice REAL DEFAULT 0, barcode TEXT
    );
    CREATE TABLE IF NOT EXISTS purchasetbl (
      id INTEGER PRIMARY KEY AUTOINCREMENT, billno TEXT, suppliername TEXT,
      supplierid INTEGER, purchasedate TEXT, medicineid INTEGER,
      medicinename TEXT, quantity INTEGER, purchaseprice REAL, saleprice REAL,
      batchno TEXT, expiry TEXT, netamount REAL, discount REAL, totalamount REAL
    );
    CREATE TABLE IF NOT EXISTS saletbl (
      id INTEGER PRIMARY KEY AUTOINCREMENT, billno TEXT, customername TEXT,
      saledate TEXT, medicineid INTEGER, medicinename TEXT, quantity INTEGER,
      saleprice REAL, netamount REAL, discount REAL, totalamount REAL
    );
    CREATE TABLE IF NOT EXISTS returntbl (
      id INTEGER PRIMARY KEY AUTOINCREMENT, billno TEXT, customername TEXT,
      returndate TEXT, medicineid INTEGER, medicinename TEXT, quantity INTEGER,
      saleprice REAL, netamount REAL, discount REAL, totalamount REAL
    );
    CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(medicinename);
    CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(barcode);
    CREATE INDEX IF NOT EXISTS idx_saletbl_date ON saletbl(saledate);
    CREATE INDEX IF NOT EXISTS idx_purchasetbl_date ON purchasetbl(purchasedate);
    CREATE TABLE IF NOT EXISTS daily_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      note TEXT NOT NULL,
      author TEXT NOT NULL
    );
  `);
  ['salt TEXT','lowstockthreshold INTEGER DEFAULT 10'].forEach(col => {
    try { db.exec(`ALTER TABLE medicines ADD COLUMN ${col}`); } catch(e) {}
  });
  // Packaging info stored on medicines
  ['packagingtype TEXT','stripsperpkg INTEGER DEFAULT 1','qtyperstripunit INTEGER DEFAULT 1','packsinstock INTEGER DEFAULT 0'].forEach(col => {
    try { db.exec('ALTER TABLE medicines ADD COLUMN ' + col); } catch(e) {}
  });
  ['purchaseprice REAL DEFAULT 0','profit REAL DEFAULT 0'].forEach(col => {
    try { db.exec(`ALTER TABLE saletbl ADD COLUMN ${col}`); } catch(e) {}
  });

  // Permanent patients table
  db.exec(`CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile TEXT,
    address TEXT,
    illness TEXT,
    notes TEXT,
    createdate TEXT
  );`);

  // Patient dose tracking (which bills are linked to a patient + dose days)
  db.exec(`CREATE TABLE IF NOT EXISTS patient_doses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patientid INTEGER NOT NULL,
    billno TEXT NOT NULL,
    saledate TEXT,
    dosedays INTEGER DEFAULT 0,
    doseenddate TEXT,
    notified INTEGER DEFAULT 0,
    FOREIGN KEY(patientid) REFERENCES patients(id)
  );`);

  // Safe column migrations for saletbl (patient tracking)
  ['patientid INTEGER','dosedays INTEGER DEFAULT 0','doseenddate TEXT'].forEach(col => {
    try { db.exec('ALTER TABLE saletbl ADD COLUMN ' + col); } catch(e) {}
  });

  // Packaging fields for purchasetbl
  ['packagingtype TEXT','itemsperpack INTEGER DEFAULT 1','qtyperitem INTEGER DEFAULT 1','packprice REAL DEFAULT 0'].forEach(col => {
    try { db.exec('ALTER TABLE purchasetbl ADD COLUMN ' + col); } catch(e) {}
  });
  // Migrate lowstockthreshold from default 10 to 4 for existing items
  try { db.exec('UPDATE medicines SET lowstockthreshold = 4 WHERE lowstockthreshold = 10'); } catch(e) {}

  [['pharmacyname','Pharmco Medical Store'],['pharmacyaddress','123 Main Street, City'],
   ['pharmacydescription','Medicines can be returned within 3 days with receipt.'],
   ['pharmacylogo','']].forEach(([k,v]) => db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k,v));
  db.prepare('INSERT OR IGNORE INTO users(username,usertype,password) VALUES(?,?,?)').run('hkuko','admin','hkuko2007');
  // Remove old default admin if it exists and hkuko doesn't conflict
  try { db.exec("DELETE FROM users WHERE username='admin' AND password='admin123'"); } catch(e) {}
}

// ── APP READY ────────────────────────────────────────────────────
function createWindow() {
  Menu.setApplicationMenu(null);
  
  // Splash Screen
  const splash = new BrowserWindow({
    width: 400, height: 300, frame: false, transparent: false, alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    icon: APP_ICON
  });
  splash.loadFile(path.join(__dirname, '../src/pages/loading.html'));

  // Main Window
  mainWindow = new BrowserWindow({
    width:1280, height:800, minWidth:1024, minHeight:700,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: { nodeIntegration:false, contextIsolation:true, preload: path.join(__dirname,'preload.js') },
    icon: APP_ICON, show:false
  });
  
  mainWindow.on('closed', () => { mainWindow = null; });
  
  // Wait for it to be ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (splash && !splash.isDestroyed()) splash.close();
  });
  
  // Load the page
  mainWindow.loadFile(path.join(__dirname,'../src/pages/login.html'));
  mainWindow.maximize();
}

app.whenReady().then(async () => {
  initDB();
  const cfg = getNetConfig();
  if (cfg && cfg.mode === 'network' && cfg.serverUrl) {
    // User PC — connect to admin server
    MODE = 'network';
    net.setBase(cfg.serverUrl);
    console.log('[Pharmco] Network mode → connecting to', cfg.serverUrl);
  } else {
    // Admin PC — start local server
    MODE = 'local';
    SERVER_PORT = (cfg && cfg.port) || 7272;
    try {
      await initServer(db, SERVER_PORT);
      console.log(`[Pharmco] Local/Server mode → LAN server started on port ${SERVER_PORT}`);
    } catch(e) {
      console.error('[Pharmco] Could not start LAN server:', e.message);
    }
  }
  createWindow();
  checkUpdates();
});

app.on('window-all-closed', () => { stopServer(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

// ── UNIFIED API HELPER ────────────────────────────────────────────
// In LOCAL mode  → use db directly
// In NETWORK mode → forward to Admin server via HTTP
function isNet() { return MODE === 'network'; }

// ── WINDOW CONTROLS ──────────────────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('win-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.restore(); else mainWindow.maximize();
});
ipcMain.on('win-close', () => mainWindow && mainWindow.close());
ipcMain.handle('win-is-maximized', () => mainWindow ? mainWindow.isMaximized() : false);

// ── NAVIGATION ───────────────────────────────────────────────────
ipcMain.handle('navigate', (_, page) => {
  if (!mainWindow) return;
  console.log(`Navigating to: ${page}`);
  return mainWindow.loadFile(path.join(__dirname,'../src/pages',`${page}.html`));
});

// ── NETWORK CONFIG ───────────────────────────────────────────────
ipcMain.handle('getNetworkMode', () => ({
  mode: MODE,
  localIPs: getLocalIPs(),
  serverPort: SERVER_PORT,
  serverUrl: net.getBase() || ''
}));
ipcMain.handle('saveNetworkConfig', (_, cfg) => {
  saveNetConfig(cfg);
  return true;
});
ipcMain.handle('testConnection', async (_, url) => {
  const ok = await net.ping(url);
  return { ok };
});
ipcMain.handle('applyNetworkMode', (_, cfg) => {
  saveNetConfig(cfg);
  // Restart the app to apply
  app.relaunch();
  app.exit(0);
});

// ── LAN SCAN: discover admin servers on local network ────────────
ipcMain.handle('scanLAN', async () => {
  const fetch = require('node-fetch');
  const ifaces = os.networkInterfaces();
  const subnets = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        subnets.push(parts.slice(0,3).join('.'));
      }
    }
  }
  const ports = [7272];
  const found = [];
  const tasks = [];
  for (const subnet of [...new Set(subnets)]) {
    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`;
      for (const port of ports) {
        tasks.push((async () => {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 600);
            const res = await fetch(`http://${ip}:${port}/api/ping`, { signal: ctrl.signal });
            clearTimeout(t);
            if (res.ok) {
              const data = await res.json();
              if (data.ok) found.push({ ip, port, url: `http://${ip}:${port}`, name: data.pharmacyname || 'Pharmco Server' });
            }
          } catch(e) {}
        })());
      }
    }
  }
  await Promise.all(tasks);
  return found;
});

// ── BACKUP / RESTORE ─────────────────────────────────────────────
ipcMain.handle('backupDB', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Database Backup',
    defaultPath: `pharma_backup_${new Date().toISOString().split('T')[0]}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };
  try {
    if (MODE === 'local') {
      fs.copyFileSync(DB_PATH, result.filePath);
    } else {
      // Network mode: backup is not available (data is on admin PC)
      return { success: false, error: 'Backup must be done from the Admin PC.' };
    }
    return { success: true, path: result.filePath };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('restoreDB', async () => {
  if (MODE !== 'local') return { success: false, error: 'Restore must be done from the Admin PC.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup File to Restore',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { success: false };
  try {
    const backupSrc = result.filePaths[0];
    // Verify it looks like a SQLite file
    const header = Buffer.alloc(16);
    const fd = fs.openSync(backupSrc, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (!header.toString('ascii').startsWith('SQLite format')) {
      return { success: false, error: 'Selected file is not a valid SQLite database.' };
    }
    // Close existing DB connection, copy file, reopen
    db.close();
    fs.copyFileSync(backupSrc, DB_PATH);
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('getDBInfo', () => {
  try {
    const stats = fs.statSync(DB_PATH);
    const meds  = db.prepare('SELECT COUNT(*) as n FROM medicines').get().n;
    const sales = db.prepare('SELECT COUNT(*) as n FROM saletbl WHERE netamount IS NOT NULL').get().n;
    const purch = db.prepare('SELECT COUNT(*) as n FROM purchasetbl WHERE netamount IS NOT NULL').get().n;
    return { size: stats.size, modified: stats.mtime, path: DB_PATH, meds, sales, purch };
  } catch(e) { return null; }
});

// ── AUTH ─────────────────────────────────────────────────────────
// Master admin (hkuko) ALWAYS authenticates locally, even in network/client mode.
// This ensures the installer/owner can always access any PC regardless of LAN status.
const MASTER_USER = 'hkuko';
const MASTER_PASS = 'hkuko2007';

ipcMain.handle('login', async (_, { username, password }) => {
  // Master admin: always check local DB first, works on ANY PC in any mode
  if (username === MASTER_USER && password === MASTER_PASS) {
    // Ensure master user exists in local DB
    db.prepare('INSERT OR IGNORE INTO users(username,usertype,password) VALUES(?,?,?)').run(MASTER_USER,'admin',MASTER_PASS);
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(MASTER_USER);
    return user || { id:0, username:MASTER_USER, usertype:'admin', password:MASTER_PASS };
  }
  // All other users: use network mode if configured, local otherwise
  if (isNet()) {
    try {
      const netUser = await net.post('/api/login', { username, password });
      return netUser;
    } catch(e) {
      // If network fails, fall back to local DB (so users can still login if server is temporarily down)
      console.warn('[Pharmco] Network login failed, falling back to local:', e.message);
      return db.prepare('SELECT * FROM users WHERE username=? AND password=?').get(username, password) || null;
    }
  }
  return db.prepare('SELECT * FROM users WHERE username=? AND password=?').get(username, password) || null;
});

// ── SETTINGS ─────────────────────────────────────────────────────
ipcMain.handle('getSettings', async () => {
  if (isNet()) return net.get('/api/settings');
  return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r=>[r.key,r.value]));
});
ipcMain.handle('saveSetting', async (_, { key, value }) => {
  if (isNet()) return net.post('/api/settings', { key, value });
  db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, value);
  return true;
});
ipcMain.handle('browseImage', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties:['openFile'], filters:[{name:'Images',extensions:['png','jpg','jpeg','gif','bmp']}] });
  if (r.canceled || !r.filePaths.length) return null;
  const data = fs.readFileSync(r.filePaths[0]);
  return `data:image/${path.extname(r.filePaths[0]).slice(1)};base64,` + data.toString('base64');
});

// ── USERS ─────────────────────────────────────────────────────────
ipcMain.handle('getUsers', async () => {
  if (isNet()) return net.get('/api/users');
  return db.prepare('SELECT * FROM users').all();
});
ipcMain.handle('addUser', async (_, u) => {
  if (isNet()) return net.post('/api/users', u);
  try { db.prepare('INSERT INTO users(username,usercontact,usercnic,usertype,password,useraddress) VALUES(?,?,?,?,?,?)').run(u.username,u.usercontact,u.usercnic,u.usertype,u.password,u.useraddress); return {success:true}; }
  catch(e) { return {success:false,error:e.message}; }
});
ipcMain.handle('deleteUser', async (_, id) => {
  if (isNet()) return net.del(`/api/users/${id}`);
  db.prepare('DELETE FROM users WHERE id=?').run(id); return true;
});

// ── SALTS ─────────────────────────────────────────────────────────
ipcMain.handle('getSalts', async () => {
  if (isNet()) return net.get('/api/salts');
  return db.prepare('SELECT * FROM salts ORDER BY saltname').all();
});
ipcMain.handle('addSalt', async (_, s) => {
  if (isNet()) return net.post('/api/salts', s);
  try { db.prepare('INSERT INTO salts(saltname,description) VALUES(?,?)').run(s.saltname,s.description); return {success:true}; }
  catch(e) { return {success:false,error:e.message}; }
});
ipcMain.handle('updateSalt', async (_, s) => {
  if (isNet()) return net.put(`/api/salts/${s.id}`, s);
  db.prepare('UPDATE salts SET saltname=?,description=? WHERE id=?').run(s.saltname,s.description,s.id); return true;
});
ipcMain.handle('deleteSalt', async (_, id) => {
  if (isNet()) return net.del(`/api/salts/${id}`);
  db.prepare('DELETE FROM salts WHERE id=?').run(id); return true;
});

// ── CATEGORIES ────────────────────────────────────────────────────
ipcMain.handle('getCategories', async () => {
  if (isNet()) return net.get('/api/categories');
  return db.prepare('SELECT * FROM categories').all();
});
ipcMain.handle('addCategory', async (_, c) => {
  if (isNet()) return net.post('/api/categories', c);
  db.prepare('INSERT INTO categories(categoryname,categoryunit,description) VALUES(?,?,?)').run(c.categoryname,c.categoryunit,c.description); return true;
});
ipcMain.handle('updateCategory', async (_, c) => {
  if (isNet()) return net.put(`/api/categories/${c.id}`, c);
  db.prepare('UPDATE categories SET categoryname=?,categoryunit=?,description=? WHERE id=?').run(c.categoryname,c.categoryunit,c.description,c.id); return true;
});
ipcMain.handle('deleteCategory', async (_, id) => {
  if (isNet()) return net.del(`/api/categories/${id}`);
  db.prepare('DELETE FROM categories WHERE id=?').run(id); return true;
});

// ── DAILY NOTES ──────────────────────────────────────────────────
ipcMain.handle('getDailyNotes', async (_, dateStr) => {
  if (isNet()) return net.get(`/api/notes?date=${dateStr}`);
  if (dateStr) {
    return db.prepare('SELECT * FROM daily_notes WHERE date=? ORDER BY id DESC').all(dateStr);
  }
  return db.prepare('SELECT * FROM daily_notes ORDER BY id DESC').all();
});
ipcMain.handle('addDailyNote', async (_, n) => {
  if (isNet()) return net.post('/api/notes', n);
  db.prepare('INSERT INTO daily_notes(date,time,note,author) VALUES(?,?,?,?)').run(n.date, n.time, n.note, n.author);
  return true;
});
ipcMain.handle('deleteDailyNote', async (_, id) => {
  if (isNet()) return net.del(`/api/notes/${id}`);
  db.prepare('DELETE FROM daily_notes WHERE id=?').run(id);
  return true;
});
ipcMain.handle('editDailyNote', async (_, { id, note }) => {
  if (isNet()) return net.put(`/api/notes/${id}`, { note });
  db.prepare('UPDATE daily_notes SET note=? WHERE id=?').run(note, id);
  return true;
});

// ── SUPPLIERS ────────────────────────────────────────────────────
ipcMain.handle('getSuppliers', async () => {
  if (isNet()) return net.get('/api/suppliers');
  return db.prepare('SELECT * FROM suppliers').all();
});
ipcMain.handle('addSupplier', async (_, s) => {
  if (isNet()) return net.post('/api/suppliers', s);
  db.prepare('INSERT INTO suppliers(suppliername,suppliercontact,supplieraddress) VALUES(?,?,?)').run(s.suppliername,s.suppliercontact,s.supplieraddress); return true;
});
ipcMain.handle('updateSupplier', async (_, s) => {
  if (isNet()) return net.put(`/api/suppliers/${s.id}`, s);
  db.prepare('UPDATE suppliers SET suppliername=?,suppliercontact=?,supplieraddress=? WHERE id=?').run(s.suppliername,s.suppliercontact,s.supplieraddress,s.id); return true;
});
ipcMain.handle('deleteSupplier', async (_, id) => {
  if (isNet()) return net.del(`/api/suppliers/${id}`);
  db.prepare('DELETE FROM suppliers WHERE id=?').run(id); return true;
});

// ── MEDICINES ────────────────────────────────────────────────────
ipcMain.handle('getMedicines', async (_, search) => {
  if (isNet()) return net.get(`/api/medicines${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  if (search) return db.prepare("SELECT * FROM medicines WHERE medicinename LIKE ? OR barcode LIKE ? OR salt LIKE ?").all(`${search}%`,`${search}%`,`%${search}%`);
  return db.prepare('SELECT * FROM medicines').all();
});
ipcMain.handle('getMedicineById', async (_, id) => {
  if (isNet()) return net.get(`/api/medicines/${id}`);
  return db.prepare('SELECT * FROM medicines WHERE id=?').get(id);
});
ipcMain.handle('getMedicineByBarcode', async (_, bc) => {
  if (isNet()) return net.get(`/api/medicines/barcode/${encodeURIComponent(bc)}`);
  return db.prepare('SELECT * FROM medicines WHERE barcode=?').get(bc);
});
ipcMain.handle('getMedicineByBatch', async (_, bn) => {
  if (isNet()) return net.get(`/api/medicines/batch/${encodeURIComponent(bn)}`);
  return db.prepare('SELECT * FROM medicines WHERE batchno=?').get(bn);
});
ipcMain.handle('addMedicine', async (_, m) => {
  if (isNet()) return net.post('/api/medicines', m);
  db.prepare('INSERT INTO medicines(medicinename,medicinecategory,salt,supplierid,quantity,lowstockthreshold,batchno,expiry,purchaseprice,saleprice,barcode,packagingtype,stripsperpkg,qtyperstripunit,packsinstock) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(m.medicinename,m.medicinecategory,m.salt||null,m.supplierid||null,m.quantity||0,m.lowstockthreshold||10,m.batchno||null,m.expiry||null,m.purchaseprice||0,m.saleprice||0,m.barcode||null,m.packagingtype||null,m.stripsperpkg||1,m.qtyperstripunit||1,m.packsinstock||0); return true;
});
ipcMain.handle('updateMedicine', async (_, m) => {
  if (isNet()) return net.put(`/api/medicines/${m.id}`, m);
  db.prepare('UPDATE medicines SET medicinename=?,medicinecategory=?,salt=?,supplierid=?,quantity=?,lowstockthreshold=?,batchno=?,expiry=?,purchaseprice=?,saleprice=?,barcode=?,packagingtype=?,stripsperpkg=?,qtyperstripunit=?,packsinstock=? WHERE id=?').run(m.medicinename,m.medicinecategory,m.salt||null,m.supplierid||null,m.quantity||0,m.lowstockthreshold||10,m.batchno||null,m.expiry||null,m.purchaseprice||0,m.saleprice||0,m.barcode||null,m.packagingtype||null,m.stripsperpkg||1,m.qtyperstripunit||1,m.packsinstock||0,m.id); return true;
});
ipcMain.handle('deleteMedicine', async (_, id) => {
  if (isNet()) return net.del(`/api/medicines/${id}`);
  db.prepare('DELETE FROM medicines WHERE id=?').run(id); return true;
});
ipcMain.handle('getOutOfStock', async (_, search) => {
  if (isNet()) return net.get(search ? `/api/medicines/outofstock?search=${encodeURIComponent(search)}` : '/api/medicines/outofstock');
  if (search) {
    const s = `%${search.toLowerCase()}%`;
    return db.prepare("SELECT * FROM medicines WHERE quantity<=0 AND (LOWER(medicinename) LIKE ? OR LOWER(barcode) LIKE ? OR LOWER(salt) LIKE ?)").all(s, s, s);
  }
  return db.prepare('SELECT * FROM medicines WHERE quantity<=0').all();
});
ipcMain.handle('getLowStock', async () => {
  if (isNet()) return net.get('/api/medicines/lowstock');
  return db.prepare('SELECT * FROM medicines WHERE quantity>0 AND quantity<=lowstockthreshold').all();
});
ipcMain.handle('getExpiryAlert', async (_, { months, category }) => {
  if (isNet()) return net.get(`/api/medicines/expiry?months=${months||3}${category?'&category='+encodeURIComponent(category):''}`);
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(); future.setMonth(future.getMonth()+(parseInt(months)||3));
  const futureStr = future.toISOString().split('T')[0];
  let q = "SELECT * FROM medicines WHERE expiry IS NOT NULL AND expiry!='' AND expiry>=? AND expiry<=?";
  const params = [today, futureStr];
  if (category) { q += " AND medicinecategory=?"; params.push(category); }
  q += " ORDER BY expiry ASC";
  return db.prepare(q).all(...params);
});

// ── MEDICINE HISTORIES ────────────────────────────────────────────
ipcMain.handle('getMedicineSaleHistory', async (_, name) => {
  if (isNet()) return net.get(`/api/history/sale?name=${encodeURIComponent(name)}`);
  const items = db.prepare("SELECT * FROM saletbl WHERE medicinename LIKE ? ORDER BY id DESC").all(`%${name}%`);
  const stock = db.prepare("SELECT quantity FROM medicines WHERE medicinename LIKE ? LIMIT 1").get(`%${name}%`);
  const mo = new Date().toISOString().slice(0,7);
  return { items, currentStock: stock?stock.quantity:0, monthTotal: items.filter(i=>(i.saledate||'').startsWith(mo)).reduce((s,i)=>s+(i.quantity||0),0) };
});
ipcMain.handle('getMedicinePurchaseHistory', async (_, name) => {
  if (isNet()) return net.get(`/api/history/purchase?name=${encodeURIComponent(name)}`);
  const items = db.prepare("SELECT * FROM purchasetbl WHERE medicinename LIKE ? ORDER BY id DESC").all(`%${name}%`);
  const stock = db.prepare("SELECT quantity FROM medicines WHERE medicinename LIKE ? LIMIT 1").get(`%${name}%`);
  const mo = new Date().toISOString().slice(0,7);
  return { items, currentStock: stock?stock.quantity:0, monthTotal: items.filter(i=>(i.purchasedate||'').startsWith(mo)).reduce((s,i)=>s+(i.quantity||0),0) };
});
ipcMain.handle('getMedicineReturnHistory', async (_, name) => {
  if (isNet()) return net.get(`/api/history/return?name=${encodeURIComponent(name)}`);
  const items = db.prepare("SELECT * FROM returntbl WHERE medicinename LIKE ? ORDER BY id DESC").all(`%${name}%`);
  const stock = db.prepare("SELECT quantity FROM medicines WHERE medicinename LIKE ? LIMIT 1").get(`%${name}%`);
  const mo = new Date().toISOString().slice(0,7);
  return { items, currentStock: stock?stock.quantity:0, monthTotal: items.filter(i=>(i.returndate||'').startsWith(mo)).reduce((s,i)=>s+(i.quantity||0),0) };
});

// ── PURCHASE ──────────────────────────────────────────────────────
ipcMain.handle('getNextPurchaseBillNo', async () => {
  if (isNet()) return (await net.get('/api/purchase/nextbillno')).billno;
  return String((db.prepare("SELECT MAX(CAST(billno AS INTEGER)) as mx FROM purchasetbl").get().mx||0)+1);
});
ipcMain.handle('savePurchaseBill', async (_, data) => {
  if (isNet()) return net.post('/api/purchase', data);
  const { items, billno, suppliername, supplierid, purchasedate, netamount, discount, totalamount } = data;
  const ins = db.prepare('INSERT INTO purchasetbl(billno,suppliername,supplierid,purchasedate,medicineid,medicinename,quantity,purchaseprice,saleprice,batchno,expiry,netamount,discount,totalamount,packagingtype,itemsperpack,qtyperitem,packprice) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const upd = db.prepare('UPDATE medicines SET quantity=quantity+?,purchaseprice=?,saleprice=?,batchno=?,expiry=?,packsinstock=packsinstock+?,packagingtype=COALESCE(?,packagingtype),stripsperpkg=COALESCE(?,stripsperpkg),qtyperstripunit=COALESCE(?,qtyperstripunit) WHERE id=?');
  db.transaction(()=>{ items.forEach((it,i)=>{ const l=i===items.length-1; ins.run(billno,suppliername,supplierid,purchasedate,it.medicineid,it.medicinename,it.quantity,it.purchaseprice,it.saleprice,it.batchno,it.expiry,l?netamount:null,l?discount:null,l?totalamount:null,it.packagingtype||null,it.itemsperpack||1,it.qtyperitem||1,it.packprice||0); upd.run(it.quantity,it.purchaseprice,it.saleprice,it.batchno,it.expiry,it.packs||0,it.packagingtype||null,it.itemsperpack||null,it.qtyperitem||null,it.medicineid); }); })();
  return {success:true};
});
ipcMain.handle('getPurchaseSummary', async (_, { date, month, billno, supplier }) => {
  if (isNet()) return net.get(`/api/purchase/summary?${billno?'billno='+billno:supplier?'supplier='+encodeURIComponent(supplier):month?'month='+month:'date='+(date||new Date().toISOString().split('T')[0])}`);
  if (billno && billno.trim()) return {items:db.prepare('SELECT * FROM purchasetbl WHERE billno=? ORDER BY id ASC').all(billno.trim())};
  if (supplier) return {items:db.prepare('SELECT * FROM purchasetbl WHERE suppliername=? ORDER BY id DESC').all(supplier)};
  if (month && month.trim()) return {items:db.prepare('SELECT * FROM purchasetbl WHERE purchasedate LIKE ? ORDER BY id ASC').all(`${month.trim()}%`)};
  return {items:db.prepare('SELECT * FROM purchasetbl WHERE purchasedate=? ORDER BY id ASC').all(date||new Date().toISOString().split('T')[0])};
});

// ── SALE ──────────────────────────────────────────────────────────
ipcMain.handle('getNextSaleBillNo', async () => {
  if (isNet()) return (await net.get('/api/sale/nextbillno')).billno;
  return String((db.prepare("SELECT MAX(CAST(billno AS INTEGER)) as mx FROM saletbl").get().mx||0)+1);
});
ipcMain.handle('saveSaleBill', async (_, data) => {
  if (isNet()) return net.post('/api/sale', data);
  const { items, billno, customername, saledate, netamount, discount, totalamount } = data;
  for (const it of items) {
    const med = db.prepare('SELECT quantity,medicinename FROM medicines WHERE id=?').get(it.medicineid);
    if (!med) return {success:false,error:`Medicine not found.`};
    if (med.quantity < it.quantity) return {success:false,error:`Insufficient stock for "${med.medicinename}". Available: ${med.quantity}`};
  }
  const ins = db.prepare('INSERT INTO saletbl(billno,customername,saledate,medicineid,medicinename,quantity,saleprice,purchaseprice,profit,netamount,discount,totalamount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  const upd = db.prepare('UPDATE medicines SET quantity=quantity-? WHERE id=?');
  db.transaction(()=>{
    items.forEach((it,i)=>{
      const l=i===items.length-1;
      const med2 = db.prepare('SELECT purchaseprice FROM medicines WHERE id=?').get(it.medicineid);
      const pp = med2 ? (med2.purchaseprice||0) : (it.purchaseprice||0);
      const itemProfit = (parseFloat(it.saleprice||0) - pp) * parseFloat(it.quantity||0);
      ins.run(billno,customername,saledate,it.medicineid,it.medicinename,it.quantity,it.saleprice,pp,itemProfit,l?netamount:null,l?discount:null,l?totalamount:null);
      upd.run(it.quantity,it.medicineid);
    });
  })();
  return {success:true};
});
ipcMain.handle('getSaleSummary', async (_, { date, month, billno, customer }) => {
  if (isNet()) return net.get(`/api/sale/summary?${billno?'billno='+billno:customer?'customer='+encodeURIComponent(customer):month?'month='+month:'date='+(date||new Date().toISOString().split('T')[0])}`);
  if (billno && billno.trim()) return {items:db.prepare('SELECT * FROM saletbl WHERE billno=? ORDER BY id ASC').all(billno.trim())};
  if (customer && customer.trim()) return {items:db.prepare("SELECT * FROM saletbl WHERE customername LIKE ? ORDER BY id DESC").all(`%${customer.trim()}%`)};
  if (month && month.trim()) return {items:db.prepare('SELECT * FROM saletbl WHERE saledate LIKE ? ORDER BY id ASC').all(`${month.trim()}%`)};
  return {items:db.prepare('SELECT * FROM saletbl WHERE saledate=? ORDER BY id ASC').all(date||new Date().toISOString().split('T')[0])};
});

// ── RETURN ────────────────────────────────────────────────────────
ipcMain.handle('getNextReturnBillNo', async () => {
  if (isNet()) return (await net.get('/api/return/nextbillno')).billno;
  return String((db.prepare("SELECT MAX(CAST(billno AS INTEGER)) as mx FROM returntbl").get().mx||0)+1);
});
ipcMain.handle('saveReturnBill', async (_, data) => {
  if (isNet()) return net.post('/api/return', data);
  const { items, billno, customername, returndate, netamount, discount, totalamount } = data;
  const ins = db.prepare('INSERT INTO returntbl(billno,customername,returndate,medicineid,medicinename,quantity,saleprice,netamount,discount,totalamount) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const upd = db.prepare('UPDATE medicines SET quantity=quantity+? WHERE id=?');
  db.transaction(()=>{ items.forEach((it,i)=>{ const l=i===items.length-1; ins.run(billno,customername,returndate,it.medicineid,it.medicinename,it.quantity,it.saleprice,l?netamount:null,l?discount:null,l?totalamount:null); upd.run(it.quantity,it.medicineid); }); })();
  return {success:true};
});
ipcMain.handle('getReturnSummary', async (_, { date, month, billno, customer }) => {
  if (isNet()) return net.get(`/api/return/summary?${billno?'billno='+billno:customer?'customer='+encodeURIComponent(customer):month?'month='+month:'date='+(date||new Date().toISOString().split('T')[0])}`);
  if (billno && billno.trim()) return {items:db.prepare('SELECT * FROM returntbl WHERE billno=? ORDER BY id ASC').all(billno.trim())};
  if (customer && customer.trim()) return {items:db.prepare("SELECT * FROM returntbl WHERE customername LIKE ? ORDER BY id DESC").all(`%${customer.trim()}%`)};
  if (month && month.trim()) return {items:db.prepare('SELECT * FROM returntbl WHERE returndate LIKE ? ORDER BY id ASC').all(`${month.trim()}%`)};
  return {items:db.prepare('SELECT * FROM returntbl WHERE returndate=? ORDER BY id ASC').all(date||new Date().toISOString().split('T')[0])};
});

// ── REPORTS ───────────────────────────────────────────────────────
ipcMain.handle('getDayReport', async (_, date) => {
  if (isNet()) return net.get(`/api/reports/day?date=${date||new Date().toISOString().split('T')[0]}`);
  const d = date||new Date().toISOString().split('T')[0];
  return {
    sales:    db.prepare("SELECT COALESCE(SUM(netamount),0) as total,COALESCE(SUM(discount),0) as disc,COALESCE(SUM(totalamount),0) as ta,COALESCE(SUM(profit),0) as profit FROM saletbl WHERE saledate=? AND netamount IS NOT NULL").get(d),
    returns:  db.prepare("SELECT COALESCE(SUM(totalamount),0) as total FROM returntbl WHERE returndate=? AND totalamount IS NOT NULL").get(d),
    chartRows:db.prepare("SELECT saledate,COALESCE(SUM(totalamount),0) as total,COALESCE(SUM(profit),0) as profit FROM saletbl WHERE netamount IS NOT NULL GROUP BY saledate ORDER BY saledate DESC LIMIT 7").all()
  };
});
ipcMain.handle('getMonthReport', async (_, month) => {
  if (isNet()) return net.get(`/api/reports/month?month=${month||new Date().toISOString().slice(0,7)}`);
  const m = month||new Date().toISOString().slice(0,7);
  return {
    sales:    db.prepare("SELECT COALESCE(SUM(netamount),0) as total,COALESCE(SUM(discount),0) as disc,COALESCE(SUM(totalamount),0) as ta,COALESCE(SUM(profit),0) as profit FROM saletbl WHERE saledate LIKE ? AND netamount IS NOT NULL").get(`${m}%`),
    returns:  db.prepare("SELECT COALESCE(SUM(totalamount),0) as total FROM returntbl WHERE returndate LIKE ? AND totalamount IS NOT NULL").get(`${m}%`),
    // Per-day breakdown for the selected month (this is what makes the chart update per month)
    chartRows:db.prepare("SELECT saledate,COALESCE(SUM(totalamount),0) as total,COALESCE(SUM(profit),0) as profit FROM saletbl WHERE saledate LIKE ? AND netamount IS NOT NULL GROUP BY saledate ORDER BY saledate ASC").all(`${m}%`)
  };
});

// ── PATIENTS ─────────────────────────────────────────────────────
ipcMain.handle('getPatients', async () => {
  if (isNet()) return net.get('/api/patients');
  return db.prepare('SELECT * FROM patients ORDER BY name').all();
});
ipcMain.handle('addPatient', async (_, p) => {
  if (isNet()) return net.post('/api/patients', p);
  db.prepare('INSERT INTO patients(name,mobile,address,illness,notes,createdate) VALUES(?,?,?,?,?,?)').run(p.name,p.mobile||null,p.address||null,p.illness||null,p.notes||null,new Date().toISOString().split('T')[0]);
  return { success:true };
});
ipcMain.handle('updatePatient', async (_, p) => {
  if (isNet()) return net.put(`/api/patients/${p.id}`, p);
  db.prepare('UPDATE patients SET name=?,mobile=?,address=?,illness=?,notes=? WHERE id=?').run(p.name,p.mobile||null,p.address||null,p.illness||null,p.notes||null,p.id);
  return true;
});
ipcMain.handle('deletePatient', async (_, id) => {
  if (isNet()) return net.del(`/api/patients/${id}`);
  db.prepare('DELETE FROM patients WHERE id=?').run(id); return true;
});
ipcMain.handle('savePatientDose', async (_, data) => {
  if (isNet()) return net.post('/api/patients/dose', data);
  const { patientid, billno, saledate, dosedays } = data;
  const end = new Date(saledate); end.setDate(end.getDate()+parseInt(dosedays||0));
  const doseenddate = end.toISOString().split('T')[0];
  db.prepare('INSERT OR REPLACE INTO patient_doses(patientid,billno,saledate,dosedays,doseenddate,notified) VALUES(?,?,?,?,?,0)').run(patientid,billno,saledate,dosedays,doseenddate);
  db.prepare("UPDATE saletbl SET patientid=?,dosedays=?,doseenddate=? WHERE billno=? AND netamount IS NOT NULL").run(patientid,dosedays,doseenddate,billno);
  return { success:true, doseenddate };
});
ipcMain.handle('getPatientSaleHistory', async (_, patientid) => {
  if (isNet()) return net.get(`/api/patients/${patientid}/sales`);
  return db.prepare('SELECT s.*,pd.dosedays,pd.doseenddate,pd.notified FROM saletbl s LEFT JOIN patient_doses pd ON s.billno=pd.billno AND pd.patientid=? WHERE s.patientid=? ORDER BY s.id DESC').all(patientid,patientid);
});
ipcMain.handle('getDuePatientDoses', async () => {
  if (isNet()) return net.get('/api/patients/doses/due');
  const tmr = new Date(); tmr.setDate(tmr.getDate()+1);
  return db.prepare('SELECT pd.*,p.name,p.mobile,p.illness FROM patient_doses pd JOIN patients p ON pd.patientid=p.id WHERE pd.doseenddate<=? AND pd.notified=0 ORDER BY pd.doseenddate ASC').all(tmr.toISOString().split('T')[0]);
});
ipcMain.handle('markDoseNotified', async (_, id) => {
  if (isNet()) return net.post(`/api/patients/doses/${id}/notify`,{});
  db.prepare('UPDATE patient_doses SET notified=1 WHERE id=?').run(id); return true;
});

// ── STOCK SUMMARY ─────────────────────────────────────────────────
ipcMain.handle('getStockSummary', async () => {
  if (isNet()) return net.get('/api/stock/summary');
  return db.prepare('SELECT COUNT(*) as totalItems,SUM(quantity) as totalQty,SUM(quantity*purchaseprice) as totalCostValue,SUM(quantity*saleprice) as totalSaleValue,SUM(quantity*(saleprice-purchaseprice)) as totalPotentialProfit FROM medicines WHERE quantity>0').get();
});

// ── PRINT ─────────────────────────────────────────────────────────
ipcMain.handle('printBill', (_, { billno, items, header, totals, type }) => {
  const printWin = new BrowserWindow({ width:440, height:800, show:true, webPreferences:{ nodeIntegration:true, contextIsolation:false }, icon: APP_ICON });
  Menu.setApplicationMenu(null);
  const typeLabel = type==='purchase'?'PURCHASE INVOICE':type==='return'?'RETURN RECEIPT':'SALE INVOICE';
  const rows = items.map(i=>`<tr><td>${i.medicinename||''}</td><td>${i.quantity||0}</td><td>${parseFloat(i.saleprice||0).toFixed(2)}</td><td>${(parseFloat(i.quantity||0)*parseFloat(i.saleprice||0)).toFixed(2)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:12px;background:#fff}
    .c{text-align:center}.logo{max-width:65px;max-height:65px;border-radius:50%;display:block;margin:0 auto 5px}
    .pname{font-size:17px;font-weight:900;letter-spacing:1px}.addr{font-size:10px;color:#333;margin:2px 0}
    .tlabel{font-size:10px;font-weight:700;border:1px solid #000;display:inline-block;padding:1px 8px;margin:3px 0}
    .hr{border:none;border-top:1px dashed #000;margin:5px 0}.hrs{border:none;border-top:2px solid #000;margin:5px 0}
    .row{display:flex;justify-content:space-between;font-size:11px;margin:1px 0}
    table{width:100%;border-collapse:collapse;margin:3px 0}th{font-size:10px;padding:3px 2px;border-bottom:1px solid #000;text-align:left}
    th:nth-child(n+2){text-align:right}td{font-size:11px;padding:2px;border-bottom:1px dotted #ccc}td:nth-child(n+2){text-align:right}
    .tt td{border:none;padding:2px;font-size:12px}.gt{font-size:14px;font-weight:900}
    .footer{font-size:9px;color:#444;text-align:center;margin-top:5px;line-height:1.5}
    .dev{font-size:8px;color:#888;text-align:center;margin-top:6px;border-top:1px solid #ddd;padding-top:3px}
  </style></head><body>
  <div class="c">${header.logo?`<img src="${header.logo}" class="logo"/>`:''}
    <div class="pname">${header.pharmacyname||'Pharmco'}</div>
    <div class="addr">${header.address||''}</div>
    <span class="tlabel">${typeLabel}</span></div>
  <div class="hr"></div>
  <div class="row"><span><b>Invoice#:</b> ${billno}</span><span><b>By:</b> ${header.user||''}</span></div>
  <div class="row"><span><b>Date:</b> ${new Date().toLocaleDateString('en-PK')}</span><span>${new Date().toLocaleTimeString('en-PK')}</span></div>
  ${header.customer?`<div class="row"><span><b>Customer:</b> ${header.customer}</span></div>`:''}
  <div class="hr"></div>
  <table><thead><tr><th>Medicine</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="hrs"></div>
  <table class="tt">
    <tr><td>Gross Total:</td><td style="text-align:right">${parseFloat(totals.netamount||0).toFixed(2)}</td></tr>
    <tr><td>Discount:</td><td style="text-align:right">- ${parseFloat(totals.discount||0).toFixed(2)}</td></tr>
    <tr class="gt"><td><b>Net Payable:</b></td><td style="text-align:right"><b>${parseFloat(totals.totalamount||0).toFixed(2)}</b></td></tr>
  </table>
  <div class="hrs"></div>
  <div class="footer">${header.description||''}</div>
  <div class="dev">Software by HKUKO | Hamdan Kaleem | 03243441834 | hamdankaleem2007@gmail.com</div>
  <script>window.onload=function(){window.print();setTimeout(()=>window.close(),4000);}<\/script>
  </body></html>`;
  printWin.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  return true;
});

// ── MEDICINE SELECTION WINDOW ─────────────────────────────────────
ipcMain.handle('openMedicineSelection', () => {
  BrowserWindow.getAllWindows().forEach(w => { if(w !== mainWindow) w.close(); });
  const win = new BrowserWindow({
    width:780, height:580, frame:false, resizable:true,
    parent:mainWindow, modal:false, alwaysOnTop:true,
    webPreferences:{ nodeIntegration:false, contextIsolation:true, preload:path.join(__dirname,'preload.js') },
    icon: APP_ICON
  });
  win.loadFile(path.join(__dirname,'../src/pages/medicineselection.html'));
  return true;
});
ipcMain.on('medicine-chosen', (_, medicine) => {
  if(mainWindow) mainWindow.webContents.send('medicine-selected', medicine);
  BrowserWindow.getAllWindows().forEach(w=>{ if(w!==mainWindow) w.close(); });
});
ipcMain.on('close-med-selection', () => {
  BrowserWindow.getAllWindows().forEach(w=>{ if(w!==mainWindow) w.close(); });
});
;
;
