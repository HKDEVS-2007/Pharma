/**
 * Pharmco LAN Server
 * Runs on the Admin PC only.
 * User PCs connect to this over LAN/WAN using the Admin PC's IP address.
 * Port: 7272 (configurable in settings)
 */
const express = require('express');
const cors    = require('cors');

let _db  = null;
let _srv = null;
let _port = 7272;

function initServer(db, port) {
  _db   = db;
  _port = port || 7272;

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // ── AUTH ──────────────────────────────────────────────────────
  app.post('/api/login', (req, res) => {
    try {
      const { username, password } = req.body;
      // Master admin always works
      if (username === 'hkuko' && password === 'hkuko2007') {
        _db.prepare('INSERT OR IGNORE INTO users(username,usertype,password) VALUES(?,?,?)').run('hkuko','admin','hkuko2007');
        const user = _db.prepare('SELECT * FROM users WHERE username=?').get('hkuko');
        return res.json(user || { id:0, username:'hkuko', usertype:'admin', password:'hkuko2007' });
      }
      const user = _db.prepare('SELECT * FROM users WHERE username=? AND password=?').get(username, password);
      res.json(user || null);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── SETTINGS ─────────────────────────────────────────────────
  app.get('/api/settings', (_, res) => {
    try {
      const rows = _db.prepare('SELECT key,value FROM settings').all();
      res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/settings', (req, res) => {
    try {
      const { key, value } = req.body;
      _db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, value);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── USERS ────────────────────────────────────────────────────
  app.get('/api/users', (_, res) => {
    try { res.json(_db.prepare('SELECT * FROM users').all()); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/users', (req, res) => {
    try {
      const u = req.body;
      _db.prepare('INSERT INTO users(username,usercontact,usercnic,usertype,password,useraddress) VALUES(?,?,?,?,?,?)').run(u.username,u.usercontact,u.usercnic,u.usertype,u.password,u.useraddress);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.delete('/api/users/:id', (req, res) => {
    try { _db.prepare('DELETE FROM users WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── SALTS ────────────────────────────────────────────────────
  app.get('/api/salts', (_, res) => {
    try { res.json(_db.prepare('SELECT * FROM salts ORDER BY saltname').all()); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/salts', (req, res) => {
    try { _db.prepare('INSERT INTO salts(saltname,description) VALUES(?,?)').run(req.body.saltname, req.body.description); res.json({ success: true }); }
    catch(e) { res.status(500).json({ success: false, error: e.message }); }
  });
  app.put('/api/salts/:id', (req, res) => {
    try { _db.prepare('UPDATE salts SET saltname=?,description=? WHERE id=?').run(req.body.saltname, req.body.description, req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/salts/:id', (req, res) => {
    try { _db.prepare('DELETE FROM salts WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── CATEGORIES ───────────────────────────────────────────────
  app.get('/api/categories', (_, res) => {
    try { res.json(_db.prepare('SELECT * FROM categories').all()); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/categories', (req, res) => {
    try { _db.prepare('INSERT INTO categories(categoryname,categoryunit,description) VALUES(?,?,?)').run(req.body.categoryname, req.body.categoryunit, req.body.description); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/categories/:id', (req, res) => {
    try { _db.prepare('UPDATE categories SET categoryname=?,categoryunit=?,description=? WHERE id=?').run(req.body.categoryname, req.body.categoryunit, req.body.description, req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/categories/:id', (req, res) => {
    try { _db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── SUPPLIERS ────────────────────────────────────────────────
  app.get('/api/suppliers', (_, res) => {
    try { res.json(_db.prepare('SELECT * FROM suppliers').all()); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/suppliers', (req, res) => {
    try { _db.prepare('INSERT INTO suppliers(suppliername,suppliercontact,supplieraddress) VALUES(?,?,?)').run(req.body.suppliername, req.body.suppliercontact, req.body.supplieraddress); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/suppliers/:id', (req, res) => {
    try { _db.prepare('UPDATE suppliers SET suppliername=?,suppliercontact=?,supplieraddress=? WHERE id=?').run(req.body.suppliername, req.body.suppliercontact, req.body.supplieraddress, req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/suppliers/:id', (req, res) => {
    try { _db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── DAILY NOTES ──────────────────────────────────────────────
  app.get('/api/notes', (req, res) => {
    try {
      const dateStr = req.query.date;
      if (dateStr && dateStr !== 'undefined' && dateStr !== 'null') {
        res.json(_db.prepare('SELECT * FROM daily_notes WHERE date=? ORDER BY id DESC').all(dateStr));
      } else {
        res.json(_db.prepare('SELECT * FROM daily_notes ORDER BY id DESC').all());
      }
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/notes', (req, res) => {
    try {
      _db.prepare('INSERT INTO daily_notes(date,time,note,author) VALUES(?,?,?,?)').run(req.body.date, req.body.time, req.body.note, req.body.author);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/notes/:id', (req, res) => {
    try {
      _db.prepare('UPDATE daily_notes SET note=? WHERE id=?').run(req.body.note, req.params.id);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/notes/:id', (req, res) => {
    try { _db.prepare('DELETE FROM daily_notes WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── MEDICINES ────────────────────────────────────────────────
  app.get('/api/medicines', (req, res) => {
    try {
      const search = req.query.search;
      if (search) return res.json(_db.prepare("SELECT * FROM medicines WHERE medicinename LIKE ? OR barcode LIKE ? OR salt LIKE ?").all(`${search}%`,`${search}%`,`%${search}%`));
      res.json(_db.prepare('SELECT * FROM medicines').all());
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/medicines/barcode/:bc', (req, res) => {
    try { res.json(_db.prepare('SELECT * FROM medicines WHERE barcode=?').get(req.params.bc) || null); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/medicines/batch/:bn', (req, res) => {
    try { res.json(_db.prepare('SELECT * FROM medicines WHERE batchno=?').get(req.params.bn) || null); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/medicines/outofstock', (req, res) => {
    try {
      const search = req.query.search;
      if (search) {
        const s = `%${search.toLowerCase()}%`;
        return res.json(_db.prepare("SELECT * FROM medicines WHERE quantity<=0 AND (LOWER(medicinename) LIKE ? OR LOWER(barcode) LIKE ? OR LOWER(salt) LIKE ?)").all(s, s, s));
      }
      res.json(_db.prepare('SELECT * FROM medicines WHERE quantity<=0').all());
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/medicines/lowstock', (_, res) => {
    try { res.json(_db.prepare('SELECT * FROM medicines WHERE quantity>0 AND quantity<=lowstockthreshold').all()); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/medicines/expiry', (req, res) => {
    try {
      const months = parseInt(req.query.months) || 3;
      const category = req.query.category || null;
      const today  = new Date().toISOString().split('T')[0];
      const future = new Date(); future.setMonth(future.getMonth() + months);
      const futureStr = future.toISOString().split('T')[0];
      let q = "SELECT * FROM medicines WHERE expiry IS NOT NULL AND expiry!='' AND expiry>=? AND expiry<=?";
      const params = [today, futureStr];
      if (category) { q += " AND medicinecategory=?"; params.push(category); }
      q += " ORDER BY expiry ASC";
      res.json(_db.prepare(q).all(...params));
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/medicines', (req, res) => {
    try {
      const m = req.body;
      _db.prepare('INSERT INTO medicines(medicinename,medicinecategory,salt,supplierid,quantity,lowstockthreshold,batchno,expiry,purchaseprice,saleprice,barcode,packagingtype,stripsperpkg,qtyperstripunit,packsinstock) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(m.medicinename,m.medicinecategory,m.salt||null,m.supplierid||null,m.quantity||0,m.lowstockthreshold||10,m.batchno||null,m.expiry||null,m.purchaseprice||0,m.saleprice||0,m.barcode||null,m.packagingtype||null,m.stripsperpkg||1,m.qtyperstripunit||1,m.packsinstock||0);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/medicines/:id', (req, res) => {
    try {
      const m = req.body;
      _db.prepare('UPDATE medicines SET medicinename=?,medicinecategory=?,salt=?,supplierid=?,quantity=?,lowstockthreshold=?,batchno=?,expiry=?,purchaseprice=?,saleprice=?,barcode=?,packagingtype=?,stripsperpkg=?,qtyperstripunit=?,packsinstock=? WHERE id=?').run(m.medicinename,m.medicinecategory,m.salt||null,m.supplierid||null,m.quantity||0,m.lowstockthreshold||10,m.batchno||null,m.expiry||null,m.purchaseprice||0,m.saleprice||0,m.barcode||null,m.packagingtype||null,m.stripsperpkg||1,m.qtyperstripunit||1,m.packsinstock||0,req.params.id);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/medicines/:id', (req, res) => {
    try { _db.prepare('DELETE FROM medicines WHERE id=?').run(req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── SALE ─────────────────────────────────────────────────────
  app.get('/api/sale/nextbillno', (_, res) => {
    try { res.json({ billno: String((_db.prepare("SELECT MAX(CAST(billno AS INTEGER)) as mx FROM saletbl").get().mx||0)+1) }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/sale', (req, res) => {
    try {
      const { items, billno, customername, saledate, netamount, discount, totalamount } = req.body;
      // Stock check
      for (const it of items) {
        const med = _db.prepare('SELECT quantity,medicinename FROM medicines WHERE id=?').get(it.medicineid);
        if (!med) return res.json({ success:false, error:`Medicine ID ${it.medicineid} not found.` });
        if (med.quantity < it.quantity) return res.json({ success:false, error:`Insufficient stock for "${med.medicinename}". Available: ${med.quantity}` });
      }
      const ins = _db.prepare('INSERT INTO saletbl(billno,customername,saledate,medicineid,medicinename,quantity,saleprice,purchaseprice,profit,netamount,discount,totalamount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
      const upd = _db.prepare('UPDATE medicines SET quantity=quantity-? WHERE id=?');
      _db.transaction(() => {
        items.forEach((it,i) => {
          const l=i===items.length-1;
          const med2 = _db.prepare('SELECT purchaseprice FROM medicines WHERE id=?').get(it.medicineid);
          const pp = med2 ? (med2.purchaseprice||0) : 0;
          const profit = (parseFloat(it.saleprice||0) - pp) * parseFloat(it.quantity||0);
          ins.run(billno,customername,saledate,it.medicineid,it.medicinename,it.quantity,it.saleprice,pp,profit,l?netamount:null,l?discount:null,l?totalamount:null);
          upd.run(it.quantity,it.medicineid);
        });
      })();
      res.json({ success: true });
    } catch(e) { res.status(500).json({ success:false, error: e.message }); }
  });
  app.get('/api/sale/summary', (req, res) => {
    try {
      const { date, month, billno, customer } = req.query;
      if (billno) return res.json({ items: _db.prepare('SELECT * FROM saletbl WHERE billno=? ORDER BY id ASC').all(billno) });
      if (customer) return res.json({ items: _db.prepare("SELECT * FROM saletbl WHERE customername LIKE ? ORDER BY id DESC").all(`%${customer}%`) });
      if (month) return res.json({ items: _db.prepare('SELECT * FROM saletbl WHERE saledate LIKE ? ORDER BY id ASC').all(`${month}%`) });
      const d = date || new Date().toISOString().split('T')[0];
      res.json({ items: _db.prepare('SELECT * FROM saletbl WHERE saledate=? ORDER BY id ASC').all(d) });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── RETURN ───────────────────────────────────────────────────
  app.get('/api/return/nextbillno', (_, res) => {
    try { res.json({ billno: String((_db.prepare("SELECT MAX(CAST(billno AS INTEGER)) as mx FROM returntbl").get().mx||0)+1) }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/return', (req, res) => {
    try {
      const { items, billno, customername, returndate, netamount, discount, totalamount } = req.body;
      const ins = _db.prepare('INSERT INTO returntbl(billno,customername,returndate,medicineid,medicinename,quantity,saleprice,netamount,discount,totalamount) VALUES(?,?,?,?,?,?,?,?,?,?)');
      const upd = _db.prepare('UPDATE medicines SET quantity=quantity+? WHERE id=?');
      _db.transaction(() => { items.forEach((it,i) => { const l=i===items.length-1; ins.run(billno,customername,returndate,it.medicineid,it.medicinename,it.quantity,it.saleprice,l?netamount:null,l?discount:null,l?totalamount:null); upd.run(it.quantity,it.medicineid); }); })();
      res.json({ success: true });
    } catch(e) { res.status(500).json({ success:false, error: e.message }); }
  });
  app.get('/api/return/summary', (req, res) => {
    try {
      const { date, month, billno, customer } = req.query;
      if (billno) return res.json({ items: _db.prepare('SELECT * FROM returntbl WHERE billno=? ORDER BY id ASC').all(billno) });
      if (customer) return res.json({ items: _db.prepare("SELECT * FROM returntbl WHERE customername LIKE ? ORDER BY id DESC").all(`%${customer}%`) });
      if (month) return res.json({ items: _db.prepare('SELECT * FROM returntbl WHERE returndate LIKE ? ORDER BY id ASC').all(`${month}%`) });
      const d = date || new Date().toISOString().split('T')[0];
      res.json({ items: _db.prepare('SELECT * FROM returntbl WHERE returndate=? ORDER BY id ASC').all(d) });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── PURCHASE ─────────────────────────────────────────────────
  app.get('/api/purchase/nextbillno', (_, res) => {
    try { res.json({ billno: String((_db.prepare("SELECT MAX(CAST(billno AS INTEGER)) as mx FROM purchasetbl").get().mx||0)+1) }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/purchase', (req, res) => {
    try {
      const { items, billno, suppliername, supplierid, purchasedate, netamount, discount, totalamount } = req.body;
      const ins = _db.prepare('INSERT INTO purchasetbl(billno,suppliername,supplierid,purchasedate,medicineid,medicinename,quantity,purchaseprice,saleprice,batchno,expiry,netamount,discount,totalamount,packagingtype,itemsperpack,qtyperitem,packprice) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const upd = _db.prepare('UPDATE medicines SET quantity=quantity+?,purchaseprice=?,saleprice=?,batchno=?,expiry=?,packsinstock=packsinstock+?,packagingtype=COALESCE(?,packagingtype),stripsperpkg=COALESCE(?,stripsperpkg),qtyperstripunit=COALESCE(?,qtyperstripunit) WHERE id=?');
      _db.transaction(() => { items.forEach((it,i) => { const l=i===items.length-1; ins.run(billno,suppliername,supplierid,purchasedate,it.medicineid,it.medicinename,it.quantity,it.purchaseprice,it.saleprice,it.batchno,it.expiry,l?netamount:null,l?discount:null,l?totalamount:null,it.packagingtype||null,it.itemsperpack||1,it.qtyperitem||1,it.packprice||0); upd.run(it.quantity,it.purchaseprice,it.saleprice,it.batchno,it.expiry,it.packs||0,it.packagingtype||null,it.itemsperpack||null,it.qtyperitem||null,it.medicineid); }); })();
      res.json({ success: true });
    } catch(e) { res.status(500).json({ success:false, error: e.message }); }
  });
  app.get('/api/purchase/summary', (req, res) => {
    try {
      const { date, month, billno, supplier } = req.query;
      if (billno) return res.json({ items: _db.prepare('SELECT * FROM purchasetbl WHERE billno=? ORDER BY id ASC').all(billno) });
      if (supplier) return res.json({ items: _db.prepare('SELECT * FROM purchasetbl WHERE suppliername=? ORDER BY id DESC').all(supplier) });
      if (month) return res.json({ items: _db.prepare('SELECT * FROM purchasetbl WHERE purchasedate LIKE ? ORDER BY id ASC').all(`${month}%`) });
      const d = date || new Date().toISOString().split('T')[0];
      res.json({ items: _db.prepare('SELECT * FROM purchasetbl WHERE purchasedate=? ORDER BY id ASC').all(d) });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── REPORTS ──────────────────────────────────────────────────
  app.get('/api/reports/day', (req, res) => {
    try {
      const d = req.query.date || new Date().toISOString().split('T')[0];
      res.json({
        sales:    _db.prepare("SELECT COALESCE(SUM(netamount),0) as total,COALESCE(SUM(discount),0) as disc,COALESCE(SUM(totalamount),0) as ta FROM saletbl WHERE saledate=? AND netamount IS NOT NULL").get(d),
        returns:  _db.prepare("SELECT COALESCE(SUM(totalamount),0) as total FROM returntbl WHERE returndate=? AND totalamount IS NOT NULL").get(d),
        chartRows:_db.prepare("SELECT saledate,COALESCE(SUM(totalamount),0) as total FROM saletbl WHERE netamount IS NOT NULL GROUP BY saledate ORDER BY saledate DESC LIMIT 7").all()
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/reports/month', (req, res) => {
    try {
      const m = req.query.month || new Date().toISOString().slice(0,7);
      res.json({
        sales:    _db.prepare("SELECT COALESCE(SUM(netamount),0) as total,COALESCE(SUM(discount),0) as disc,COALESCE(SUM(totalamount),0) as ta FROM saletbl WHERE saledate LIKE ? AND netamount IS NOT NULL").get(`${m}%`),
        returns:  _db.prepare("SELECT COALESCE(SUM(totalamount),0) as total FROM returntbl WHERE returndate LIKE ? AND totalamount IS NOT NULL").get(`${m}%`),
        chartRows:_db.prepare("SELECT strftime('%Y-%m',saledate) as mo,COALESCE(SUM(totalamount),0) as total FROM saletbl WHERE netamount IS NOT NULL GROUP BY mo ORDER BY mo DESC LIMIT 6").all()
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── MEDICINE HISTORY ─────────────────────────────────────────
  app.get('/api/history/sale', (req, res) => {
    try {
      const name = req.query.name || '';
      const items = _db.prepare("SELECT * FROM saletbl WHERE medicinename LIKE ? ORDER BY id DESC").all(`%${name}%`);
      const stock = _db.prepare("SELECT quantity FROM medicines WHERE medicinename LIKE ? LIMIT 1").get(`%${name}%`);
      const mo = new Date().toISOString().slice(0,7);
      res.json({ items, currentStock: stock?stock.quantity:0, monthTotal: items.filter(i=>(i.saledate||'').startsWith(mo)).reduce((s,i)=>s+(i.quantity||0),0) });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/history/purchase', (req, res) => {
    try {
      const name = req.query.name || '';
      const items = _db.prepare("SELECT * FROM purchasetbl WHERE medicinename LIKE ? ORDER BY id DESC").all(`%${name}%`);
      const stock = _db.prepare("SELECT quantity FROM medicines WHERE medicinename LIKE ? LIMIT 1").get(`%${name}%`);
      const mo = new Date().toISOString().slice(0,7);
      res.json({ items, currentStock: stock?stock.quantity:0, monthTotal: items.filter(i=>(i.purchasedate||'').startsWith(mo)).reduce((s,i)=>s+(i.quantity||0),0) });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/history/return', (req, res) => {
    try {
      const name = req.query.name || '';
      const items = _db.prepare("SELECT * FROM returntbl WHERE medicinename LIKE ? ORDER BY id DESC").all(`%${name}%`);
      const stock = _db.prepare("SELECT quantity FROM medicines WHERE medicinename LIKE ? LIMIT 1").get(`%${name}%`);
      const mo = new Date().toISOString().slice(0,7);
      res.json({ items, currentStock: stock?stock.quantity:0, monthTotal: items.filter(i=>(i.returndate||'').startsWith(mo)).reduce((s,i)=>s+(i.quantity||0),0) });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── PING ─────────────────────────────────────────────────────
  app.get('/api/ping', (req, res) => {
    try {
      const name = _db.prepare("SELECT value FROM settings WHERE key='pharmacyname'").get();
      res.json({ ok: true, mode: 'Pharmco-SERVER', version: '3.0.0', pharmacyname: name ? name.value : 'Pharmco' });
    } catch(e) { res.json({ ok: true, mode: 'Pharmco-SERVER', version: '3.0.0' }); }
  });

  return new Promise((resolve, reject) => {
    _srv = app.listen(_port, () => {
      console.log(`[Pharmco SERVER] Listening on port ${_port}`);
      resolve();
    }).on('error', reject);
  });
}

function stopServer() {
  if (_srv) { _srv.close(); _srv = null; }
}

module.exports = { initServer, stopServer };
