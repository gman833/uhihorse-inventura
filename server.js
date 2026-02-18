const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'uhihorse-inventory-secret-change-me';

// ─── Database Setup ──────────────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'inventory.db');
let db;

// Auto-save db to file periodically and on changes
function saveDb() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scan_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE
    )
  `);

  // Create default admin if none exists
  const adminCheck = db.exec("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!adminCheck.length || !adminCheck[0].values.length) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      ['admin', hash, 'Administrator', 'admin']);
    console.log('✅ Default admin created: admin / admin123');
  }

  saveDb();

  // Auto-save every 30 seconds
  setInterval(saveDb, 30000);
}

// ─── DB Helper Functions ─────────────────────────────────────────
function queryAll(sql, params = []) {
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return { lastId: db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] };
}

// ─── Middleware ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Prijava je potrebna' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Samo za administratorje' });
  next();
}

// ─── Auth Routes ─────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Vnesi uporabniško ime in geslo' });

    const user = queryOne('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
    if (!user) return res.status(401).json({ error: 'Napačno uporabniško ime ali geslo' });

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Napačno uporabniško ime ali geslo' });
    }

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;
    req.session.displayName = user.display_name;

    res.json({ id: user.id, username: user.username, displayName: user.display_name, role: user.role });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Napaka pri prijavi' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ id: req.session.userId, username: req.session.username, displayName: req.session.displayName, role: req.session.role });
});

// ─── User Management (Admin) ────────────────────────────────────
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = queryAll(`
    SELECT id, username, display_name, role, active, created_at,
      (SELECT COUNT(*) FROM scan_sessions WHERE user_id = users.id) as session_count,
      (SELECT COUNT(*) FROM scan_items si JOIN scan_sessions ss ON si.session_id = ss.id WHERE ss.user_id = users.id) as total_scans
    FROM users ORDER BY created_at DESC
  `);
  res.json(users);
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password || !displayName) return res.status(400).json({ error: 'Vsa polja so obvezna' });

    const existing = queryOne('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return res.status(409).json({ error: 'Uporabniško ime že obstaja' });

    const hash = bcrypt.hashSync(password, 10);
    const result = runSql('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      [username, hash, displayName, role || 'user']);

    res.json({ id: result.lastId, username, displayName, role: role || 'user' });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Napaka pri ustvarjanju uporabnika' });
  }
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const { displayName, password, active, role } = req.body;
    const userId = parseInt(req.params.id);

    if (userId === req.session.userId && active === 0) return res.status(400).json({ error: 'Ne moreš deaktivirati sebe' });

    if (displayName !== undefined) runSql('UPDATE users SET display_name = ? WHERE id = ?', [displayName, userId]);
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      runSql('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
    }
    if (active !== undefined) runSql('UPDATE users SET active = ? WHERE id = ?', [active ? 1 : 0, userId]);
    if (role !== undefined) runSql('UPDATE users SET role = ? WHERE id = ?', [role, userId]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Napaka pri posodabljanju' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.session.userId) return res.status(400).json({ error: 'Ne moreš izbrisati sebe' });

  runSql('DELETE FROM scan_items WHERE session_id IN (SELECT id FROM scan_sessions WHERE user_id = ?)', [userId]);
  runSql('DELETE FROM scan_sessions WHERE user_id = ?', [userId]);
  runSql('DELETE FROM users WHERE id = ?', [userId]);
  res.json({ ok: true });
});

// ─── Scan Sessions (User) ───────────────────────────────────────
app.get('/api/sessions', requireAuth, (req, res) => {
  const sessions = queryAll(`
    SELECT ss.*,
      (SELECT COUNT(*) FROM scan_items WHERE session_id = ss.id) as item_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM scan_items WHERE session_id = ss.id) as total_quantity
    FROM scan_sessions ss WHERE ss.user_id = ? ORDER BY ss.created_at DESC
  `, [req.session.userId]);
  res.json(sessions);
});

app.post('/api/sessions', requireAuth, (req, res) => {
  const { name } = req.body;
  const sessionName = name || `Skeniranje ${new Date().toLocaleDateString('sl-SI')} ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`;

  const result = runSql('INSERT INTO scan_sessions (user_id, name) VALUES (?, ?)', [req.session.userId, sessionName]);

  res.json({ id: result.lastId, name: sessionName, status: 'active', item_count: 0, total_quantity: 0 });
});

app.put('/api/sessions/:id/complete', requireAuth, (req, res) => {
  const sess = queryOne('SELECT * FROM scan_sessions WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  if (!sess) return res.status(404).json({ error: 'Seja ni najdena' });

  runSql('UPDATE scan_sessions SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', ['completed', req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/sessions/:id', requireAuth, (req, res) => {
  const sess = queryOne('SELECT * FROM scan_sessions WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  if (!sess) return res.status(404).json({ error: 'Seja ni najdena' });

  runSql('DELETE FROM scan_items WHERE session_id = ?', [req.params.id]);
  runSql('DELETE FROM scan_sessions WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ─── Scan Items ──────────────────────────────────────────────────
app.get('/api/sessions/:id/items', requireAuth, (req, res) => {
  const sess = queryOne('SELECT * FROM scan_sessions WHERE id = ?', [req.params.id]);
  if (!sess) return res.status(404).json({ error: 'Seja ni najdena' });
  if (sess.user_id !== req.session.userId && req.session.role !== 'admin') return res.status(403).json({ error: 'Ni dovoljenja' });

  const items = queryAll('SELECT * FROM scan_items WHERE session_id = ? ORDER BY scanned_at DESC', [req.params.id]);
  res.json(items);
});

app.post('/api/sessions/:id/items', requireAuth, (req, res) => {
  const sess = queryOne("SELECT * FROM scan_sessions WHERE id = ? AND user_id = ? AND status = 'active'", [req.params.id, req.session.userId]);
  if (!sess) return res.status(404).json({ error: 'Aktivna seja ni najdena' });

  const { sku, quantity } = req.body;
  if (!sku) return res.status(400).json({ error: 'SKU je obvezen' });

  const result = runSql('INSERT INTO scan_items (session_id, sku, quantity) VALUES (?, ?, ?)', [parseInt(req.params.id), sku.trim(), quantity || 1]);

  res.json({ id: result.lastId, session_id: parseInt(req.params.id), sku: sku.trim(), quantity: quantity || 1, scanned_at: new Date().toISOString() });
});

app.put('/api/items/:id', requireAuth, (req, res) => {
  const item = queryOne(`
    SELECT si.* FROM scan_items si JOIN scan_sessions ss ON si.session_id = ss.id
    WHERE si.id = ? AND ss.user_id = ? AND ss.status = 'active'
  `, [req.params.id, req.session.userId]);
  if (!item) return res.status(404).json({ error: 'Artikel ni najden' });

  const { quantity } = req.body;
  runSql('UPDATE scan_items SET quantity = ? WHERE id = ?', [quantity, req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
  const item = queryOne(`
    SELECT si.* FROM scan_items si JOIN scan_sessions ss ON si.session_id = ss.id
    WHERE si.id = ? AND ss.user_id = ?
  `, [req.params.id, req.session.userId]);
  if (!item) return res.status(404).json({ error: 'Artikel ni najden' });

  runSql('DELETE FROM scan_items WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ─── Admin: View All Sessions ────────────────────────────────────
app.get('/api/admin/sessions', requireAdmin, (req, res) => {
  const { userId, status, from, to } = req.query;

  let sql = `
    SELECT ss.*, u.username, u.display_name,
      (SELECT COUNT(*) FROM scan_items WHERE session_id = ss.id) as item_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM scan_items WHERE session_id = ss.id) as total_quantity
    FROM scan_sessions ss JOIN users u ON ss.user_id = u.id WHERE 1=1
  `;
  const params = [];

  if (userId) { sql += ' AND ss.user_id = ?'; params.push(parseInt(userId)); }
  if (status) { sql += ' AND ss.status = ?'; params.push(status); }
  if (from) { sql += ' AND ss.created_at >= ?'; params.push(from); }
  if (to) { sql += ' AND ss.created_at <= ?'; params.push(to); }

  sql += ' ORDER BY ss.created_at DESC';

  res.json(queryAll(sql, params));
});

// ─── Export ──────────────────────────────────────────────────────
app.get('/api/admin/export', requireAdmin, async (req, res) => {
  try {
    const { format, userId, status, from, to } = req.query;

    let sql = `
      SELECT u.display_name as uporabnik, u.username, ss.name as seja, ss.status as status_seje,
        ss.created_at as seja_ustvarjena, ss.completed_at as seja_zakljucena,
        si.sku, si.quantity as kolicina, si.scanned_at as skenirano
      FROM scan_items si
      JOIN scan_sessions ss ON si.session_id = ss.id
      JOIN users u ON ss.user_id = u.id WHERE 1=1
    `;
    const params = [];

    if (userId) { sql += ' AND ss.user_id = ?'; params.push(parseInt(userId)); }
    if (status) { sql += ' AND ss.status = ?'; params.push(status); }
    if (from) { sql += ' AND ss.created_at >= ?'; params.push(from); }
    if (to) { sql += ' AND ss.created_at <= ?'; params.push(to); }

    sql += ' ORDER BY u.display_name, ss.created_at DESC, si.scanned_at DESC';

    const rows = queryAll(sql, params);

    if (format === 'csv') {
      const header = 'Uporabnik,Username,Seja,Status,Ustvarjena,Zaključena,SKU,Količina,Skenirano\n';
      const csvRows = rows.map(r =>
        `"${r.uporabnik}","${r.username}","${r.seja}","${r.status_seje}","${r.seja_ustvarjena || ''}","${r.seja_zakljucena || ''}","${r.sku}",${r.kolicina},"${r.skenirano}"`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="inventura_${Date.now()}.csv"`);
      res.send('\ufeff' + header + csvRows);
    } else {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'UHIHORSE Inventory';

      const sheet = workbook.addWorksheet('Inventura');
      sheet.columns = [
        { header: 'Uporabnik', key: 'uporabnik', width: 20 },
        { header: 'Username', key: 'username', width: 15 },
        { header: 'Seja', key: 'seja', width: 25 },
        { header: 'Status', key: 'status_seje', width: 12 },
        { header: 'Seja ustvarjena', key: 'seja_ustvarjena', width: 20 },
        { header: 'Seja zaključena', key: 'seja_zakljucena', width: 20 },
        { header: 'SKU', key: 'sku', width: 20 },
        { header: 'Količina', key: 'kolicina', width: 12 },
        { header: 'Skenirano', key: 'skenirano', width: 20 },
      ];

      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3436' } };
      rows.forEach(r => sheet.addRow(r));

      // Summary sheet
      const summary = workbook.addWorksheet('Povzetek');
      summary.columns = [
        { header: 'Uporabnik', key: 'user', width: 20 },
        { header: 'Število sej', key: 'sessions', width: 15 },
        { header: 'Skupaj artiklov', key: 'items', width: 18 },
        { header: 'Skupaj količina', key: 'quantity', width: 18 },
      ];
      summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3436' } };

      let summarySql = `
        SELECT u.display_name as user, COUNT(DISTINCT ss.id) as sessions,
          COUNT(si.id) as items, COALESCE(SUM(si.quantity), 0) as quantity
        FROM users u LEFT JOIN scan_sessions ss ON u.id = ss.user_id
        LEFT JOIN scan_items si ON ss.id = si.session_id WHERE u.role = 'user'
      `;
      const summaryParams = [];
      if (userId) { summarySql += ' AND u.id = ?'; summaryParams.push(parseInt(userId)); }
      summarySql += ' GROUP BY u.id ORDER BY u.display_name';

      queryAll(summarySql, summaryParams).forEach(r => summary.addRow(r));

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="inventura_${Date.now()}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
    }
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Napaka pri izvozu' });
  }
});

// ─── Admin: All Items ────────────────────────────────────────
app.get('/api/admin/items', requireAdmin, (req, res) => {
  const { search, userId, sessionId } = req.query;

  let sql = `
    SELECT si.id, si.sku, si.quantity, si.scanned_at,
      ss.id as session_id, ss.name as session_name, ss.status as session_status,
      u.id as user_id, u.display_name, u.username
    FROM scan_items si
    JOIN scan_sessions ss ON si.session_id = ss.id
    JOIN users u ON ss.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (search) { sql += ' AND si.sku LIKE ?'; params.push('%' + search + '%'); }
  if (userId) { sql += ' AND u.id = ?'; params.push(parseInt(userId)); }
  if (sessionId) { sql += ' AND ss.id = ?'; params.push(parseInt(sessionId)); }

  sql += ' ORDER BY si.scanned_at DESC LIMIT 500';

  res.json(queryAll(sql, params));
});

// ─── Admin: Dashboard Stats ─────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({
    totalUsers: queryOne("SELECT COUNT(*) as c FROM users WHERE role = 'user'")?.c || 0,
    activeUsers: queryOne("SELECT COUNT(*) as c FROM users WHERE role = 'user' AND active = 1")?.c || 0,
    totalSessions: queryOne('SELECT COUNT(*) as c FROM scan_sessions')?.c || 0,
    activeSessions: queryOne("SELECT COUNT(*) as c FROM scan_sessions WHERE status = 'active'")?.c || 0,
    totalScans: queryOne('SELECT COUNT(*) as c FROM scan_items')?.c || 0,
    totalQuantity: queryOne('SELECT COALESCE(SUM(quantity), 0) as c FROM scan_items')?.c || 0,
  });
});

// ─── SPA Routing ─────────────────────────────────────────────────
app.get('/scanner', (req, res) => res.sendFile(path.join(__dirname, 'public', 'scanner.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// ─── Start ───────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════╗
║   🐴 UHIHORSE Inventory System          ║
║   Running on http://localhost:${PORT}       ║
║                                          ║
║   Default admin: admin / admin123        ║
║   ⚠️  Spremeni geslo po prvi prijavi!    ║
╚══════════════════════════════════════════╝
    `);
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

// Save db on exit
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });
