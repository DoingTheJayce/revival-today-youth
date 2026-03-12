const { neon } = require("@neondatabase/serverless");
const crypto = require("crypto");
const sql = neon(process.env.DATABASE_URL);
function hashPin(pin) {
  return crypto.createHash("sha256").update(String(pin) + "rty_salt_2026").digest("hex");
}
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  const path = event.path.replace("/.netlify/functions/db", "").replace(/^\//, "");
  const method = event.httpMethod;
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}
  try {
    if (path === "setup") {
      await sql`CREATE TABLE IF NOT EXISTS rty_staff (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, avatar TEXT,
        color TEXT DEFAULT '#4ECDC4', pin_hash TEXT, role TEXT DEFAULT 'worker'
      )`;
      await sql`CREATE TABLE IF NOT EXISTS rty_assignments (
        id SERIAL PRIMARY KEY, title TEXT NOT NULL, type TEXT DEFAULT 'Task',
        assignee INTEGER, priority TEXT DEFAULT 'Medium', status TEXT DEFAULT 'To Do',
        due DATE, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      )`;
      const existing = await sql`SELECT COUNT(*) as count FROM rty_staff`;
      if (Number(existing[0].count) === 0) {
        const adminPin = hashPin("0000");
        await sql`INSERT INTO rty_staff (name, avatar, color, pin_hash, role) VALUES ('Admin', 'AD', '#f97316', ${adminPin}, 'admin')`;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (path === "login" && method === "POST") {
      const { staff_id, pin } = body;
      const hash = hashPin(String(pin));
      const rows = await sql`SELECT id, name, avatar, color, role FROM rty_staff WHERE id=${staff_id} AND pin_hash=${hash}`;
      if (rows.length === 0) return { statusCode: 401, headers, body: JSON.stringify({ error: "Wrong PIN" }) };
      return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
    }
    if (path === "staff" && method === "GET") {
      const rows = await sql`SELECT id, name, avatar, color, role FROM rty_staff ORDER BY id`;
      return { statusCode: 200, headers, body: JSON.stringify(rows) };
    }
    if (path === "staff" && method === "POST") {
      const { name, avatar, color, pin, role } = body;
      const pin_hash = hashPin(String(pin));
      const rows = await sql`INSERT INTO rty_staff (name, avatar, color, pin_hash, role) VALUES (${name}, ${avatar}, ${color}, ${pin_hash}, ${role||'worker'}) RETURNING id, name, avatar, color, role`;
      return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
    }
    if (path.startsWith("staff/") && method === "PUT") {
      const id = path.split("/")[1];
      const { name, avatar, color, pin, role } = body;
      if (pin) {
        const pin_hash = hashPin(String(pin));
        const rows = await sql`UPDATE rty_staff SET name=${name}, avatar=${avatar}, color=${color}, pin_hash=${pin_hash}, role=${role||'worker'} WHERE id=${id} RETURNING id, name, avatar, color, role`;
        return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
      }
      const rows = await sql`UPDATE rty_staff SET name=${name}, avatar=${avatar}, color=${color}, role=${role||'worker'} WHERE id=${id} RETURNING id, name, avatar, color, role`;
      return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
    }
    if (path.startsWith("staff/") && method === "DELETE") {
      const id = path.split("/")[1];
      await sql`DELETE FROM rty_staff WHERE id=${id}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (path === "assignments" && method === "GET") {
      const staffId = event.queryStringParameters && event.queryStringParameters.staff_id;
      const role = event.queryStringParameters && event.queryStringParameters.role;
      if (role === "worker" && staffId) {
        const rows = await sql`SELECT * FROM rty_assignments WHERE assignee=${staffId} ORDER BY created_at DESC`;
        return { statusCode: 200, headers, body: JSON.stringify(rows) };
      }
      const rows = await sql`SELECT * FROM rty_assignments ORDER BY created_at DESC`;
      return { statusCode: 200, headers, body: JSON.stringify(rows) };
    }
    if (path === "assignments" && method === "POST") {
      const { title, type, assignee, priority, status, due, description } = body;
      const rows = await sql`INSERT INTO rty_assignments (title, type, assignee, priority, status, due, description) VALUES (${title}, ${type}, ${assignee||null}, ${priority}, ${status}, ${due||null}, ${description||''}) RETURNING *`;
      return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
    }
    if (path.startsWith("assignments/") && method === "PUT") {
      const id = path.split("/")[1];
      const { title, type, assignee, priority, status, due, description, role, staff_id } = body;
      if (role === "worker") {
        const check = await sql`SELECT id FROM rty_assignments WHERE id=${id} AND assignee=${staff_id}`;
        if (check.length === 0) return { statusCode: 403, headers, body: JSON.stringify({ error: "Not allowed" }) };
        const rows = await sql`UPDATE rty_assignments SET status=${status} WHERE id=${id} RETURNING *`;
        return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
      }
      const rows = await sql`UPDATE rty_assignments SET title=${title}, type=${type}, assignee=${assignee||null}, priority=${priority}, status=${status}, due=${due||null}, description=${description||''} WHERE id=${id} RETURNING *`;
      return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
    }
    if (path.startsWith("assignments/") && method === "DELETE") {
      const id = path.split("/")[1];
      await sql`DELETE FROM rty_assignments WHERE id=${id}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
