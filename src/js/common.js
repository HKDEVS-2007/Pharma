// common.js — shared utilities v4
const SESSION_KEY = 'pharmco_user';
const THEME_KEY   = 'pharmco_theme';
const SIDEBAR_KEY = 'pharmco_sidebar_collapsed';

function getSession()       { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } }
function setSession(user)   { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function clearSession()     { sessionStorage.removeItem(SESSION_KEY); }

// ── THEME ────────────────────────────────────────────────────────
function getTheme() { return localStorage.getItem(THEME_KEY) || 'dark'; }
function setTheme(t) {
  localStorage.setItem(THEME_KEY, t);
  document.body.classList.remove('dark-theme', 'light-theme');
  document.body.classList.add(t + '-theme');
  document.documentElement.classList.remove('dark-pre');
  
  applyColorTheme();
  applyPerfMode();
  
  const btn = document.getElementById('themeToggle');
  if (btn) {
    const icon = t === 'dark' ? '☀' : '🌙';
    const label = t === 'dark' ? 'Light' : 'Dark';
    btn.innerHTML = `<span class="nav-icon">${icon}</span> <span>${label}</span>`;
  }
}
function applyTheme() { setTheme(getTheme()); }
function toggleTheme() {
  const newTheme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

// Automatically detect legacy hardware (very basic heuristic based on low core count)
function autoDetectLegacy() {
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
    setPerfMode('legacy');
  }
}

const COLOR_THEME_KEY = 'pharmco_color_theme';
const ALL_COLOR_THEMES = ['indigo', 'emerald', 'cyber', 'orchid', 'ocean', 'oceanic', 'grey', 'c8b6fe', '54acbf', 'minimal-green'];
function getColorTheme() { return localStorage.getItem(COLOR_THEME_KEY) || 'indigo'; }
function setColorTheme(c) {
  localStorage.setItem(COLOR_THEME_KEY, c);
  ALL_COLOR_THEMES.forEach(t => document.body.classList.remove('color-' + t));
  document.body.classList.add('color-' + c);
}
function applyColorTheme() { setColorTheme(getColorTheme()); }

const PERF_MODE_KEY = 'pharmco_perf_mode';
function getPerfMode() { 
  // If not explicitly set by user, run auto detection
  if (!localStorage.getItem(PERF_MODE_KEY)) {
    autoDetectLegacy();
  }
  return localStorage.getItem(PERF_MODE_KEY) || 'legacy'; 
}
function setPerfMode(m) {
  localStorage.setItem(PERF_MODE_KEY, m);
  document.body.classList.remove('perf-modern', 'perf-legacy');
  document.body.classList.add('perf-' + m);
}
function applyPerfMode() { setPerfMode(getPerfMode()); }

// ── SIDEBAR ──────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isCollapsed = sidebar.classList.toggle('collapsed');
  localStorage.setItem(SIDEBAR_KEY, isCollapsed ? 'true' : 'false');
}
function applySidebarState() {
  const isCollapsed = localStorage.getItem(SIDEBAR_KEY) === 'true';
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed', isCollapsed);
  
  // Restore scroll position
  const nav = document.querySelector('.sidebar-nav');
  if (nav) nav.scrollTop = localStorage.getItem('sidebarScroll') || 0;
}
function saveSidebarScroll() {
  const nav = document.querySelector('.sidebar-nav');
  if (nav) localStorage.setItem('sidebarScroll', nav.scrollTop);
}

// ── AUTH ─────────────────────────────────────────────────────────
function requireAuth() {
  const u = getSession();
  if (!u) { window.api.navigate('login'); return null; }
  return u;
}
const USER_ALLOWED = ['sale','salesummary','return','returnsummary','medicinehistory','patients','patientsummary','dashboard'];
function requireAuthWithAccess(page) {
  const u = requireAuth();
  if (!u) return null;
  if (u.usertype !== 'admin' && !USER_ALLOWED.includes(page)) {
    alert('Access Denied. Your account does not have permission for this page.');
    window.api.navigate('dashboard');
    return null;
  }
  return u;
}

// ── TOPBAR ───────────────────────────────────────────────────────
function updateDateTime() {
  const el = document.getElementById('lblDT');
  if (!el) return;
  const tick = () => { el.textContent = new Date().toLocaleDateString('en-PK') + '  ' + new Date().toLocaleTimeString('en-PK'); };
  tick(); setInterval(tick, 1000);
}

// ── TITLEBAR ────────────────────────────────────────────────────
function injectTitlebar(title) {
  let bar = document.getElementById('winTitlebar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'winTitlebar';
    bar.className = 'win-titlebar';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  
  const displayTitle = title ? `Pharmco - ${title}` : 'Pharmco Quantum';
  
  bar.innerHTML = `
    <span class="win-title-label">${displayTitle}</span>
    <div class="win-controls">
      <button class="win-btn" id="winMin" title="Minimize">&#8211;</button>
      <button class="win-btn maximize" id="winMax" title="Maximize">&#9633;</button>
      <button class="win-btn close" id="winClose" title="Close">&#10005;</button>
    </div>`;
    
  document.getElementById('winMin').onclick   = () => window.api.winMinimize();
  document.getElementById('winMax').onclick   = async () => {
    window.api.winMaximize();
    const btn = document.getElementById('winMax');
    setTimeout(async () => {
      const max = await window.api.winIsMaximized();
      btn.innerHTML = max ? '&#10697;' : '&#9633;';
    }, 100);
  };
  document.getElementById('winClose').onclick = () => window.api.winClose();
}

function initAppLayout() {
  if (document.getElementById('appContainer')) return;
  
  applyTheme();

  // Create Sidebar
  const sidebar = document.createElement('aside');
  sidebar.id = 'sidebar';
  sidebar.className = 'sidebar';
  
  const user = getSession() || { username: 'Guest', usertype: 'user' };
  
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">💊</div>
      <div class="sidebar-title">PHARMCO</div>
      <button class="sidebar-toggle" onclick="toggleSidebar()" title="Toggle Sidebar">≡</button>
    </div>
    <nav class="sidebar-nav">
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('dashboard')" id="nav-dashboard"><span class="nav-icon">📊</span> <span>Dashboard</span></a>
      
      <div class="nav-group-label">Operations</div>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('sale')" id="nav-sale"><span class="nav-icon">🛒</span> <span>Sale Bill</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('return')" id="nav-return"><span class="nav-icon">↩</span> <span>Returns</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('purchase')" id="nav-purchase"><span class="nav-icon">📦</span> <span>Purchases</span></a>
      
      <div class="nav-group-label">Inventory</div>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('medicines')" id="nav-medicines"><span class="nav-icon">💊</span> <span>Stock List</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('outofstock')" id="nav-outofstock"><span class="nav-icon">🚫</span> <span>Out of Stock</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('salts')" id="nav-salts"><span class="nav-icon">🧪</span> <span>Salts / Generic</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('categories')" id="nav-categories"><span class="nav-icon">🗂</span> <span>Categories</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('suppliers')" id="nav-suppliers"><span class="nav-icon">🤝</span> <span>Suppliers</span></a>
      
      <div class="nav-group-label">History & Records</div>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('salesummary')" id="nav-salesummary"><span class="nav-icon">📄</span> <span>Sale Summary</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('purchasesummary')" id="nav-purchasesummary"><span class="nav-icon">📦</span> <span>Purchase Summary</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('returnsummary')" id="nav-returnsummary"><span class="nav-icon">↩</span> <span>Return Summary</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('medicinehistory')" id="nav-medicinehistory"><span class="nav-icon">📜</span> <span>Med. History</span></a>
      
      <div class="nav-group-label">Patients & Reports</div>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('patients')" id="nav-patients"><span class="nav-icon">👥</span> <span>Patients</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('patientsummary')" id="nav-patientsummary"><span class="nav-icon">📋</span> <span>Patient History</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('reports')" id="nav-reports"><span class="nav-icon">📈</span> <span>Reports</span></a>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); window.api.navigate('settings')" id="nav-settings"><span class="nav-icon">⚙️</span> <span>Settings</span></a>

      <div class="nav-group-label">Appearance</div>
      <a class="nav-item" href="#" onclick="event.preventDefault(); saveSidebarScroll(); toggleTheme()" id="themeToggle"></a>
    </nav>
    <div class="sidebar-footer">
      <div class="user-info">
        <div class="user-avatar" style="background:var(--primary); color:white; font-weight:bold;">${user.username[0].toUpperCase()}</div>
        <div class="user-details">
          <div class="user-name" style="color:var(--text-main); font-weight:bold;">${user.username}</div>
          <div class="user-role" style="color:var(--text-muted); font-size:11px;">${user.usertype}</div>
        </div>
      </div>
      <button class="btn btn-secondary w-full" style="margin-top:12px; padding:10px;" onclick="clearSession(); window.api.navigate('login')">Logout</button>
    </div>
  `;

  // Create App Container
  const container = document.createElement('div');
  container.id = 'appContainer';
  container.className = 'app-container';
  
  // Create Main Content
  const main = document.createElement('main');
  main.id = 'mainContent';
  main.className = 'main-content';
  
  // Move existing content (except titlebar) into a content-body
  const bodyContent = document.createElement('div');
  bodyContent.className = 'content-body';
  
  // Identify the existing content areas to move
  const pageBody = document.querySelector('.page-body');
  const loginCard = document.querySelector('.login-card');
  
  if (pageBody) {
    // Add a header to the main content
    const existingHeader = pageBody.querySelector('.page-header');
    const pageTitle = existingHeader?.querySelector('h1')?.textContent || 'Pharmco';
    injectTitlebar(pageTitle.replace(/[^\w\s]/gi, '').trim()); // Clean emojis for window title

    main.innerHTML = `
      <header class="content-header">
        <div class="header-title"><h1>${pageTitle}</h1></div>
        <div class="header-actions" id="headerActions">
          <span id="lblDT" class="lbl-dt"></span>
        </div>
      </header>
    `;
    
    // Move any buttons from old header to new header actions
    if (existingHeader) {
      const buttons = existingHeader.querySelectorAll('button, .btn');
      const actions = main.querySelector('#headerActions');
      buttons.forEach(btn => {
        btn.classList.add('btn-back');
        actions.appendChild(btn);
      });
      existingHeader.remove();
    }
    
    bodyContent.appendChild(pageBody);
    main.appendChild(bodyContent);
    container.appendChild(sidebar);
    container.appendChild(main);
    document.body.appendChild(container);
    
    // Hide old topbar if it exists
    const oldTopbar = document.querySelector('.topbar');
    if (oldTopbar) oldTopbar.style.display = 'none';
  } else if (loginCard) {
    // Don't inject sidebar on login page
    // Style the login container instead
    document.body.classList.add('login-page');
  }

  // Set active nav item based on current page
  const currentPage = window.location.pathname.split('/').pop().split('.')[0];
  const activeNav = document.getElementById('nav-' + currentPage);
  if (activeNav) activeNav.classList.add('active');
  
  // Update theme toggle text
  setTheme(getTheme());
  applySidebarState();
}

async function loadTopBar() {
  injectTitlebar();
  initAppLayout();
  
  const user = getSession();
  const s = await window.api.getSettings();
  
  const tr = document.getElementById('headerActions');
  if (tr) {
    // Re-add badges to the new header actions area
    setupBadges(tr);
    setupAutoUpdater(tr);
  }
  
  updateDateTime();
}

async function setupBadges(container) {
  try {
    const low = await window.api.getLowStock();
    if (low && low.length > 0 && !document.getElementById('lowStockBadge')) {
      const b = document.createElement('span');
      b.id = 'lowStockBadge'; b.className = 'badge low-stock-badge';
      b.textContent = '⚠ Low Stock: ' + low.length;
      b.onclick = () => alert('Low Stock Items:\n' + low.map(m=>`• ${m.medicinename}: ${m.quantity}`).join('\n'));
      container.insertBefore(b, container.firstChild);
    }
    const expiring = await window.api.getExpiryAlert({ months: 1 });
    if (expiring && expiring.length > 0 && !document.getElementById('expiryBadge')) {
      const eb = document.createElement('span');
      eb.id = 'expiryBadge'; eb.className = 'badge expiry-badge';
      eb.textContent = '📅 Expiring: ' + expiring.length;
      eb.onclick = () => {
        const list = expiring.map(m => `• ${m.medicinename} (${m.expiry})`).join('\n');
        alert('⚠ Near Expiry:\n' + list);
      };
      container.insertBefore(eb, container.firstChild);
    }
    const dueDoses = await window.api.getDuePatientDoses();
    if (dueDoses && dueDoses.length > 0 && !document.getElementById('doseBadge')) {
      const db = document.createElement('span');
      db.id = 'doseBadge'; db.className = 'badge dose-badge';
      db.textContent = '⏰ Due Doses: ' + dueDoses.length;
      db.onclick = () => {
        const list = dueDoses.map(d => `• ${d.name}: ${d.mobile || 'No phone'}`).join('\n');
        if (confirm('⚠ Due Doses:\n' + list + '\n\nGo to Patient Summary to manage?')) {
          window.api.navigate('patientsummary');
        }
      };
      container.insertBefore(db, container.firstChild);
    }
  } catch(e) {}
}

// ── AUTO UPDATER UI ─────────────────────────────────────────────
function setupAutoUpdater(container) {
  window.api.onUpdateAvailable((info) => {
    if (document.getElementById('updateBadge')) return;
    const b = document.createElement('span');
    b.id = 'updateBadge';
    b.className = 'badge update-badge';
    b.textContent = '🚀 Update: v' + info.version;
    b.onclick = () => {
      if (confirm(`A new version (v${info.version}) is available. Download now?`)) {
        b.textContent = '📥 Downloading...';
        window.api.startUpdateDownload();
      }
    };
    container.insertBefore(b, container.firstChild);
  });

  window.api.onUpdateDownloadProgress((progress) => {
    const b = document.getElementById('updateBadge');
    if (b) b.textContent = `📥 ${Math.round(progress.percent)}%`;
  });

  window.api.onUpdateDownloaded(() => {
    const b = document.getElementById('updateBadge');
    if (b) {
      b.textContent = '✅ Update Ready';
      b.onclick = () => { if (confirm('Restart and install now?')) window.api.installUpdate(); };
    }
  });

  window.api.onUpdateError((err) => {
    const b = document.getElementById('updateBadge');
    if (b) { b.textContent = '❌ Error'; setTimeout(() => b.remove(), 5000); }
  });
}


// ── ALERTS ───────────────────────────────────────────────────────
function showAlert(id, msg, type='danger') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type} show`;
  el.textContent = msg;
  setTimeout(() => { el.className = `alert alert-${type}`; }, 4500);
}

// ── HELPERS ──────────────────────────────────────────────────────
function formatCurrency(v) { return parseFloat(v||0).toFixed(2); }
function todayStr() { return new Date().toISOString().split('T')[0]; }

function buildTable(tbodyId, rows, columns) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    if (row.quantity !== undefined && row.lowstockthreshold !== undefined
        && row.quantity > 0 && row.quantity <= row.lowstockthreshold)
      tr.classList.add('low-stock-row');
    columns.forEach(col => {
      const td = document.createElement('td');
      if (col.render) td.innerHTML = col.render(row);
      else td.textContent = (row[col.key] !== null && row[col.key] !== undefined) ? row[col.key] : '';
      tr.appendChild(td);
    });
    tr.addEventListener('click', () => {
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      tr.dispatchEvent(new CustomEvent('row-selected', { detail: row, bubbles: true }));
    });
    tbody.appendChild(tr);
  });
}

// ── MEDICINE SELECTED LISTENER (single, stable) ──────────────────
// Registered ONCE per page — never inside renderTable
let _medSelectCb = null;
function registerMedicineSelectedListener(cb) {
  window.api.removeMedicineSelectedListener();
  _medSelectCb = cb;
  window.api.onMedicineSelected(med => { if (_medSelectCb) _medSelectCb(med); });
}

// ── BARCODE SCANNER DETECTOR ──────────────────────────────────────
// Barcode scanners type very fast (< 50 ms between chars) and end with Enter.
// This class intercepts that globally so no dedicated barcode field is needed —
// just scan anywhere on the page while filling a bill.
class BarcodeScanner {
  constructor(onScanned) {
    this._buf   = '';
    this._timer = null;
    this._cb    = onScanned;
    this._handler = this._onKey.bind(this);
    document.addEventListener('keydown', this._handler, true); // capture phase
  }
  _onKey(e) {
    // Only intercept when a plain input/textarea is NOT the scanner target
    // We accumulate chars and if Enter arrives within 100 ms of first char → it's a scanner
    if (e.key === 'Enter' && this._buf.length >= 3) {
      e.preventDefault();
      e.stopPropagation();
      const code = this._buf;
      this._buf = '';
      clearTimeout(this._timer);
      this._cb(code.trim());
      return;
    }
    if (e.key.length === 1) {                     // printable char
      if (!this._buf) {
        // Start timer — if no Enter within 150 ms, discard (human typing)
        this._timer = setTimeout(() => { this._buf = ''; }, 150);
      }
      this._buf += e.key;
    }
  }
  destroy() { document.removeEventListener('keydown', this._handler, true); }
}

// ── PARALLEL BILL MANAGER ────────────────────────────────────────
class BillManager {
  constructor(renderFn) {
    this.bills     = [{ id:1, items:[{ medicineid:'', medicinename:'', salt:'', quantity:1, saleprice:'', purchaseprice:0, maxqty:9999 }], customername:'', discount:0 }];
    this.activeIdx = 0;
    this.renderFn  = renderFn;
    this.nextId    = 2;
  }
  get active() { return this.bills[this.activeIdx]; }
  addBill() {
    if (this.bills.length >= 5) { alert('Maximum 5 parallel bills.'); return; }
    this.bills.push({ id:this.nextId++, items:[{ medicineid:'', medicinename:'', salt:'', quantity:1, saleprice:'', purchaseprice:0, maxqty:9999 }], customername:'', discount:0 });
    this.activeIdx = this.bills.length - 1;
    this.renderTabs(); this.renderFn();
  }
  switchTo(idx) { this.activeIdx = idx; this.renderTabs(); this.renderFn(); }
  closeCurrent() {
    if (this.bills.length === 1) {
      this.bills[0] = { id:this.bills[0].id, items:[{ medicineid:'', medicinename:'', salt:'', quantity:1, saleprice:'', purchaseprice:0, maxqty:9999 }], customername:'', discount:0 };
    } else {
      this.bills.splice(this.activeIdx, 1);
      this.activeIdx = Math.min(this.activeIdx, this.bills.length - 1);
    }
    this.renderTabs(); this.renderFn();
  }
  renderTabs() {
    const c = document.getElementById('billTabs'); if (!c) return;
    c.innerHTML = '';
    this.bills.forEach((b, idx) => {
      const t = document.createElement('button');
      t.className = 'bill-tab' + (idx === this.activeIdx ? ' active' : '');
      t.textContent = `Bill ${b.id} (${b.items.length})`;
      t.onclick = () => this.switchTo(idx);
      c.appendChild(t);
    });
    const a = document.createElement('button');
    a.className = 'bill-tab-add'; a.textContent = '+ F5'; a.title = 'New parallel bill (F5)';
    a.onclick = () => this.addBill();
    c.appendChild(a);
  }
}
