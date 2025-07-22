// Simple Express backend for authentication with NeonDB (PostgreSQL)
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Ensure users table exists and add profile fields if missing
(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
  )`);
  // Add profile columns if not exist
  const columns = [
    { name: 'first_name', type: 'VARCHAR(100)' },
    { name: 'last_name', type: 'VARCHAR(100)' },
    { name: 'phone', type: 'VARCHAR(20)' },
    { name: 'role', type: 'VARCHAR(100)' },
    { name: 'department', type: 'VARCHAR(100)' },
    { name: 'bio', type: 'TEXT' }
  ];
  for (const col of columns) {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
  }
})();

// Ensure delegations table exists
(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS delegations (
    id SERIAL PRIMARY KEY,
    task_name VARCHAR(255) NOT NULL,
    assigned_by VARCHAR(255) NOT NULL,
    assigned_to VARCHAR(255) NOT NULL,
    planned_date DATE,
    priority VARCHAR(20),
    message TEXT,
    attachments TEXT[],
    assigned_pc VARCHAR(100),
    group_name VARCHAR(100),
    notify_to VARCHAR(255),
    auditor VARCHAR(255),
    make_attachment_mandatory BOOLEAN,
    make_note_mandatory BOOLEAN,
    notify_doer VARCHAR(255),
    set_reminder BOOLEAN,
    reminder_mode VARCHAR(20),
    reminder_frequency VARCHAR(20),
    reminder_before_days INTEGER,
    reminder_starting_time VARCHAR(10),
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    notes TEXT
  )`);
})();

// JWT authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Register endpoint with debug logging
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  console.log('[REGISTER] Incoming data:', { email, password: password ? '***' : undefined });
  if (!email || !password) {
    console.log('[REGISTER] Missing fields');
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    console.log('[REGISTER] Hashed password, attempting DB insert...');
    await pool.query('INSERT INTO users (email, password) VALUES ($1, $2)', [email, hashed]);
    console.log('[REGISTER] Insert successful for', email);
    res.json({ success: true });
  } catch (err) {
    console.error('[REGISTER] Error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    // Generate JWT
    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile by email (now protected)
app.get('/profile', authenticateToken, async (req, res) => {
  const email = req.user.email;
  try {
    const result = await pool.query('SELECT email, first_name, last_name, phone, role, department, bio FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile (now protected)
app.put('/profile', authenticateToken, async (req, res) => {
  const email = req.user.email;
  const { first_name, last_name, phone, role, department, bio } = req.body;
  try {
    await pool.query(
      `UPDATE users SET first_name=$1, last_name=$2, phone=$3, role=$4, department=$5, bio=$6 WHERE email=$7`,
      [first_name, last_name, phone, role, department, bio, email]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password endpoint
app.post('/change-password', authenticateToken, async (req, res) => {
  const email = req.user.email;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(currentPassword, user.password);

    if (!match) {
      return res.status(401).json({ error: 'Invalid current password' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashed, email]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all delegations
app.get('/delegations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM delegations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new delegation
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
app.post('/delegations', async (req, res) => {
  const d = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO delegations (
        task_name, assigned_by, assigned_to, planned_date, priority, message, attachments, assigned_pc, group_name, notify_to, auditor, make_attachment_mandatory, make_note_mandatory, notify_doer, set_reminder, reminder_mode, reminder_frequency, reminder_before_days, reminder_starting_time, status, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *`,
      [
        d.taskName, d.assignedBy, d.assignedTo, d.plannedDate, d.priority, d.message, d.attachments || [], d.assignedPC, d.groupName, d.notifyTo, d.auditor, d.makeAttachmentMandatory, d.makeNoteMandatory, d.notifyDoer, d.setReminder, d.reminderMode, d.reminderFrequency, d.reminderBeforeDays, d.reminderStartingTime, d.status, d.notes
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Update a delegation
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
app.put('/delegations/:id', async (req, res) => {
  const { id } = req.params;
  const d = req.body;
  try {
    await pool.query(
      `UPDATE delegations SET
        task_name=$1, assigned_by=$2, assigned_to=$3, planned_date=$4, priority=$5, message=$6, attachments=$7, assigned_pc=$8, group_name=$9, notify_to=$10, auditor=$11, make_attachment_mandatory=$12, make_note_mandatory=$13, notify_doer=$14, set_reminder=$15, reminder_mode=$16, reminder_frequency=$17, reminder_before_days=$18, reminder_starting_time=$19, status=$20, completed_at=$21, notes=$22
      WHERE id=$23`,
      [
        d.taskName,
        d.assignedBy?.email || null,
        d.assignedTo?.email || null,
        d.plannedDate,
        d.priority,
        d.message,
        Array.isArray(d.attachments) ? d.attachments.map(f => f.name || f) : [],
        d.assignedPC,
        d.groupName,
        d.notifyTo?.email || null,
        d.auditor?.email || null,
        d.makeAttachmentMandatory,
        d.makeNoteMandatory,
        d.notifyDoer,
        d.setReminder,
        d.reminderMode,
        d.reminderFrequency,
        d.reminderBeforeDays,
        d.reminderStartingTime,
        d.status,
        d.completedAt,
        d.notes,
        id
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Delete a delegation
app.delete('/delegations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM delegations WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Analytics endpoint
app.get('/analytics', async (req, res) => {
  try {
    // Total delegations
    const totalResult = await pool.query('SELECT COUNT(*) FROM delegations');
    const completedResult = await pool.query("SELECT COUNT(*) FROM delegations WHERE status = 'Completed'");
    const pendingResult = await pool.query("SELECT COUNT(*) FROM delegations WHERE status = 'Pending'");
    const overdueResult = await pool.query("SELECT COUNT(*) FROM delegations WHERE status = 'Overdue'");

    // Top performers (users with most completed delegations)
    const topPerformersResult = await pool.query(`
      SELECT assigned_to, COUNT(*) as completed
      FROM delegations
      WHERE status = 'Completed'
      GROUP BY assigned_to
      ORDER BY completed DESC
      LIMIT 3
    `);
    // Get user names for top performers
    const topPerformers = await Promise.all(topPerformersResult.rows.map(async row => {
      const userRes = await pool.query('SELECT first_name, last_name FROM users WHERE email = $1', [row.assigned_to]);
      const name = userRes.rows[0] ? `${userRes.rows[0].first_name || ''} ${userRes.rows[0].last_name || ''}`.trim() : row.assigned_to;
      return { name, completed: Number(row.completed) };
    }));

    // Recent activity (last 3 completed delegations)
    const recentActivityResult = await pool.query(`
      SELECT task_name, assigned_to, completed_at FROM delegations WHERE status = 'Completed' ORDER BY completed_at DESC LIMIT 3
    `);
    const recentActivity = await Promise.all(recentActivityResult.rows.map(async row => {
      const userRes = await pool.query('SELECT first_name, last_name FROM users WHERE email = $1', [row.assigned_to]);
      const user = userRes.rows[0] ? `${userRes.rows[0].first_name || ''} ${userRes.rows[0].last_name || ''}`.trim() : row.assigned_to;
      return { task: row.task_name, user, date: row.completed_at };
    }));

    res.json({
      totalDelegations: Number(totalResult.rows[0].count),
      completedDelegations: Number(completedResult.rows[0].count),
      pendingDelegations: Number(pendingResult.rows[0].count),
      overdueDelegations: Number(overdueResult.rows[0].count),
      topPerformers,
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Team endpoint
app.get('/team', async (req, res) => {
  try {
    const usersResult = await pool.query('SELECT email, first_name, last_name, role, department, phone FROM users');
    const users = await Promise.all(usersResult.rows.map(async user => {
      // Task stats
      const assignedResult = await pool.query('SELECT COUNT(*) FROM delegations WHERE assigned_to = $1', [user.email]);
      const completedResult = await pool.query("SELECT COUNT(*) FROM delegations WHERE assigned_to = $1 AND status = 'Completed'", [user.email]);
      const inProgressResult = await pool.query("SELECT COUNT(*) FROM delegations WHERE assigned_to = $1 AND status = 'In Progress'", [user.email]);
      const pendingResult = await pool.query("SELECT COUNT(*) FROM delegations WHERE assigned_to = $1 AND status = 'Pending'", [user.email]);
      const overdueResult = await pool.query("SELECT COUNT(*) FROM delegations WHERE assigned_to = $1 AND status = 'Overdue'", [user.email]);
      // Performance score: percent completed
      const totalTasks = Number(assignedResult.rows[0].count);
      const completedTasks = Number(completedResult.rows[0].count);
      const performanceScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      return {
        id: user.email,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        email: user.email,
        role: user.role,
        department: user.department,
        phone: user.phone,
        status: 'Active',
        tasksAssigned: totalTasks,
        tasksCompleted: completedTasks,
        tasksInProgress: Number(inProgressResult.rows[0].count),
        tasksPending: Number(pendingResult.rows[0].count),
        tasksOverdue: Number(overdueResult.rows[0].count),
        performanceScore
      };
    }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.listen(port, () => {
  console.log(`Auth server running on http://localhost:${port}`);
});
