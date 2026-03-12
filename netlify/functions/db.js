const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

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
    // ── SETUP: create tables if they don't exist ──
    if (path === "setup") {
      await sql`
        CREATE TABLE IF NOT EXISTS staff (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          avatar TEXT,
          color TEXT DEFAULT '#4ECDC4'
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS assignments (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          type TEXT DEFAULT 'Task',
          assignee INTEGER REFERENCES staff(id) ON DELETE SET NULL,
          priority TEXT DEFAULT 'Medium',
          status TEXT DEFAULT 'To Do',
          due DATE,
          description TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )`;
      // Seed staff if empty
      const existing = await sql`SELECT COUNT(*) as count FROM staff`;
      if (Number(existing[0].count) === 0) {
        await sql`INSERT INTO staff (name, avatar, color) VALUES
          ('Alex Rivera','AR','#E8C547'),
          ('Jordan Kim','JK','#4ECDC4'),
          ('Sam Patel','SP','#FF6B6B'),
          ('Casey Morgan','CM','#A78BFA'),
          ('Taylor Brooks','TB','#F97316')`;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── STAFF ──
    if (path === "staff" && method === "GET") {
      const rows = await sql`SELECT * FROM staff ORDER BY id`;
      return { statusCode: 200, headers, body: JSON.stringify(rows) };
    }
    if (path === "staff" && method === "POST") {
      const { name, avatar, color } = body;
      const rows = await sql`INSERT INTO staff (name,avatar,color) VALUES (${name},${avatar},${color}) RETURNING *`;
      return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
    }
    if (path.startsWith("staff/") && method === "PUT") {
      const id = path.split("/")[1];
      const { name, avatar, color } = body;
      const rows = await sql`UPDATE staff SET name=${name},avatar=${avatar},color=${color} WHERE id=${id} RETURNING *`;
      return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
    }
    if (path.startsWith("staff/") && method === "DELETE") {
      const id = path.split("/")[1];
      await sql`DELETE FROM staff WHERE id=${id}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── ASSIGNMENTS ──
    if (path === "assignments" && method === "GET") {
      const rows = await sql`SELECT * FROM assignments ORDER BY created_at DESC`;
      return { statusCode: 200, headers, body: JSON.stringify(rows) };
    }
    if (path === "assignments" && method === "POST") {
      const { title, type, assignee, priority, status, due, description } = body;
      const rows = await sql`
        INSERT INTO assignments (title,type,assignee,priority,status,due,description)
        VALUES (${title},${type},${assignee||null},${priority},${status},${due||null},${description||""})
        RETURNING *`;
      return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
    }
    if (path.startsWith("assignments/") && method === "PUT") {
      const id = path.split("/")[1];
      const { title, type, assignee, priority, status, due, description } = body;
      const rows = await sql`
        UPDATE assignments SET title=${title},type=${type},assignee=${assignee||null},
        priority=${priority},status=${status},due=${due||null},description=${description||""}
        WHERE id=${id} RETURNING *`;
      return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
    }
    if (path.startsWith("assignments/") && method === "DELETE") {
      const id = path.split("/")[1];
      await sql`DELETE FROM assignments WHERE id=${id}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
