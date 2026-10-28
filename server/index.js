import "dotenv/config";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import { db, initDatabase } from "./db.js";
import { scanDirectory } from "./indexer.js";
import { isSpacesConfigured, getPresignedStreamUrl } from "./s3.js";

const fastify = Fastify({ logger: false });

const PORT = parseInt(process.env.PORT || "3456", 10);
const HOST = process.env.HOST || "0.0.0.0";
const MUSIC_DIR = process.env.MUSIC_DIR || path.resolve("./sample_music");
const DATA_DIR = process.env.DATA_DIR || path.resolve("./data");
const COVERS_DIR = path.join(DATA_DIR, "covers");
const PUBLIC_DIR = path.resolve("./public");

// Ensure data dirs exist
if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

initDatabase();

await fastify.register(fastifyCors, { origin: true });

// Serve static frontend assets
await fastify.register(fastifyStatic, {
  root: PUBLIC_DIR,
  prefix: "/"
});

// Helper for default placeholder cover SVG
const DEFAULT_COVER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#181926"/>
      <stop offset="50%" stop-color="#24273a"/>
      <stop offset="100%" stop-color="#11121d"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#7f00ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
  <circle cx="200" cy="200" r="140" fill="none" stroke="#2f334d" stroke-width="3" stroke-dasharray="6,6"/>
  <circle cx="200" cy="200" r="100" fill="url(#glow)"/>
  <circle cx="200" cy="200" r="45" fill="#181926" stroke="#00f2fe" stroke-width="2.5"/>
  <circle cx="200" cy="200" r="14" fill="#00f2fe"/>
  <path d="M196 160 L196 230 A20 20 0 0 0 178 248 A20 20 0 1 0 196 228 L196 175 L225 168 L225 210 A20 20 0 0 0 207 228 A20 20 0 1 0 225 208 L225 152 Z" fill="#c6a0f6"/>
</svg>
`.trim();

// 1. Audio Streaming Endpoint with Full HTTP Range Support & S3 Pre-signed Streaming
fastify.get("/api/stream/:id", async (req, reply) => {
  const { id } = req.params;
  const track = db.prepare("SELECT file_path FROM tracks WHERE id = ?").get(id);

  if (!track) {
    return reply.status(404).send({ error: "Track not found" });
  }

  // If track is stored in DigitalOcean Spaces / S3
  if (track.file_path.startsWith("s3://") || track.file_path.startsWith("spaces://")) {
    const objectKey = track.file_path.replace(/^(s3|spaces):\/\/[^/]+\//, "").replace(/^(s3|spaces):\/\//, "");
    if (isSpacesConfigured()) {
      const presignedUrl = await getPresignedStreamUrl(objectKey);
      if (presignedUrl) {
        return reply.redirect(presignedUrl);
      }
    }
  }

  if (!fs.existsSync(track.file_path)) {
    return reply.status(404).send({ error: "Track file not found on disk" });
  }

  const filePath = track.file_path;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = mime.lookup(filePath) || "audio/mpeg";

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      reply.header("Content-Range", `bytes */${fileSize}`);
      return reply.status(416).send();
    }

    const chunksize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });

    return reply
      .status(206)
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Headers", "Range, Content-Range, Content-Type, Accept-Ranges")
      .header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type")
      .header("Content-Range", `bytes ${start}-${end}/${fileSize}`)
      .header("Accept-Ranges", "bytes")
      .header("Content-Length", chunksize)
      .header("Content-Type", contentType)
      .send(stream);
  } else {
    return reply
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Headers", "Range, Content-Range, Content-Type, Accept-Ranges")
      .header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type")
      .header("Content-Length", fileSize)
      .header("Accept-Ranges", "bytes")
      .header("Content-Type", contentType)
      .send(fs.createReadStream(filePath));
  }
});

// 2. Cover Art Endpoint with Permanent Browser Caching (Zero Remote Queries)
fastify.get("/api/cover/:hash", async (req, reply) => {
  const { hash } = req.params;
  if (!hash || hash === "null" || hash === "default") {
    return reply.type("image/svg+xml").send(DEFAULT_COVER_SVG);
  }

  const coverPath = path.join(COVERS_DIR, `${hash}.jpg`);
  if (fs.existsSync(coverPath)) {
    return reply
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .type("image/jpeg")
      .send(fs.createReadStream(coverPath));
  }

  return reply.type("image/svg+xml").send(DEFAULT_COVER_SVG);
});

// 3. Tracks List with Multi-Dimensional Filters, Search, and Flexible Column Sorting
fastify.get("/api/tracks", async (req) => {
  const { genre, decade, artist, album, search, sortBy = "artist", sortOrder = "ASC" } = req.query;
  const conditions = [];
  const params = {};

  if (genre) {
    conditions.push("tracks.genre LIKE @genre");
    params.genre = `%${genre}%`;
  }
  if (decade) {
    conditions.push("tracks.decade = @decade");
    params.decade = decade;
  }
  if (artist) {
    conditions.push("tracks.artist = @artist");
    params.artist = artist;
  }
  if (album) {
    conditions.push("tracks.album = @album");
    params.album = album;
  }

  const allowedSortFields = {
    track_no: "tracks.track_no",
    title: "tracks.title COLLATE NOCASE",
    artist: "tracks.artist COLLATE NOCASE",
    album: "tracks.album COLLATE NOCASE",
    genre: "tracks.genre COLLATE NOCASE",
    decade: "tracks.decade",
    year: "tracks.year",
    duration: "tracks.duration"
  };

  const safeSortField = allowedSortFields[sortBy] || "tracks.artist COLLATE NOCASE";
  const safeOrder = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";
  const orderClause = `${safeSortField} ${safeOrder}, tracks.album ASC, tracks.track_no ASC`;

  let sql = "";
  if (search && search.trim()) {
    const sanitizedSearch = search.trim().replace(/['"*]/g, "") + "*";
    sql = `
      SELECT tracks.* FROM tracks
      JOIN tracks_fts ON tracks.id = tracks_fts.rowid
      WHERE tracks_fts MATCH @search
      ${conditions.length ? "AND " + conditions.join(" AND ") : ""}
      ORDER BY ${orderClause}
    `;
    params.search = sanitizedSearch;
  } else {
    sql = `
      SELECT tracks.* FROM tracks
      ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
      ORDER BY ${orderClause}
    `;
  }

  const tracks = db.prepare(sql).all(params);
  return { count: tracks.length, tracks };
});

// Playlists API
fastify.get("/api/playlists", async () => {
  const playlists = db.prepare(`
    SELECT p.*,
           COUNT(pt.id) as track_count,
           COALESCE(SUM(t.duration), 0) as total_duration,
           (SELECT t2.cover_hash FROM playlist_tracks pt2
            JOIN tracks t2 ON pt2.track_id = t2.id
            WHERE pt2.playlist_id = p.id AND t2.cover_hash IS NOT NULL
            ORDER BY pt2.position ASC LIMIT 1) as cover_hash
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
    LEFT JOIN tracks t ON pt.track_id = t.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all();
  return playlists;
});

fastify.post("/api/playlists", async (req, reply) => {
  const { name, description = "" } = req.body || {};
  if (!name || !name.trim()) {
    return reply.status(400).send({ error: "Playlist name is required" });
  }

  try {
    const stmt = db.prepare("INSERT INTO playlists (name, description) VALUES (?, ?)");
    const info = stmt.run(name.trim(), description.trim());
    return { id: info.lastInsertRowid, name: name.trim(), description: description.trim() };
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return reply.status(409).send({ error: "A playlist with this name already exists" });
    }
    return reply.status(500).send({ error: err.message });
  }
});

fastify.get("/api/playlists/:id", async (req, reply) => {
  const { id } = req.params;
  const playlist = db.prepare("SELECT * FROM playlists WHERE id = ?").get(id);
  if (!playlist) return reply.status(404).send({ error: "Playlist not found" });

  const tracks = db.prepare(`
    SELECT t.*, pt.position, pt.added_at as in_playlist_since
    FROM playlist_tracks pt
    JOIN tracks t ON pt.track_id = t.id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC, pt.id ASC
  `).all(id);

  return { ...playlist, tracks };
});

fastify.delete("/api/playlists/:id", async (req, reply) => {
  const { id } = req.params;
  db.prepare("DELETE FROM playlists WHERE id = ?").run(id);
  return { success: true };
});

fastify.post("/api/playlists/:id/tracks", async (req, reply) => {
  const { id } = req.params;
  const { trackId, trackIds } = req.body || {};

  const playlist = db.prepare("SELECT * FROM playlists WHERE id = ?").get(id);
  if (!playlist) return reply.status(404).send({ error: "Playlist not found" });

  const idsToAdd = Array.isArray(trackIds) ? trackIds : (trackId ? [trackId] : []);
  if (idsToAdd.length === 0) {
    return reply.status(400).send({ error: "trackId or trackIds array required" });
  }

  const maxPosRow = db.prepare("SELECT COALESCE(MAX(position), -1) as max_pos FROM playlist_tracks WHERE playlist_id = ?").get(id);
  let nextPos = maxPosRow.max_pos + 1;

  const insertStmt = db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((tracks) => {
    let added = 0;
    for (const tid of tracks) {
      insertStmt.run(id, tid, nextPos++);
      added++;
    }
    db.prepare("UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return added;
  });

  const addedCount = insertMany(idsToAdd);
  return { success: true, added: addedCount };
});

fastify.delete("/api/playlists/:id/tracks/:trackId", async (req, reply) => {
  const { id, trackId } = req.params;
  db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?").run(id, trackId);
  db.prepare("UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  return { success: true };
});

// Helper to build SQL WHERE conditions for aggregations
function buildFilterConditions(query, excludeKey = null) {
  const conditions = [];
  const params = {};

  if (query.genre && excludeKey !== "genre") {
    conditions.push("tracks.genre LIKE @genre");
    params.genre = `%${query.genre}%`;
  }
  if (query.decade && excludeKey !== "decade") {
    conditions.push("tracks.decade = @decade");
    params.decade = query.decade;
  }
  if (query.artist && excludeKey !== "artist") {
    conditions.push("tracks.artist = @artist");
    params.artist = query.artist;
  }
  if (query.album && excludeKey !== "album") {
    conditions.push("tracks.album = @album");
    params.album = query.album;
  }

  let joinFts = "";
  if (query.search && query.search.trim()) {
    joinFts = "JOIN tracks_fts ON tracks.id = tracks_fts.rowid";
    conditions.push("tracks_fts MATCH @search");
    params.search = query.search.trim().replace(/['"*]/g, "") + "*";
  }

  const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  return { joinFts, whereClause, params };
}

// 4. Decades Aggregation with Faceted Counts
fastify.get("/api/decades", async (req) => {
  const { joinFts, whereClause, params } = buildFilterConditions(req.query, "decade");
  const sql = `
    SELECT tracks.decade, COUNT(*) as track_count, COUNT(DISTINCT tracks.album) as album_count
    FROM tracks
    ${joinFts}
    ${whereClause}
    ${whereClause ? "AND" : "WHERE"} tracks.decade IS NOT NULL AND tracks.decade != 'Unknown'
    GROUP BY tracks.decade
    ORDER BY tracks.decade ASC
  `;
  return db.prepare(sql).all(params);
});

// 5. Genres Aggregation with Faceted Counts
fastify.get("/api/genres", async (req) => {
  const { joinFts, whereClause, params } = buildFilterConditions(req.query, "genre");
  const sql = `
    SELECT tracks.genre, COUNT(*) as track_count
    FROM tracks
    ${joinFts}
    ${whereClause}
    ${whereClause ? "AND" : "WHERE"} tracks.genre IS NOT NULL
    GROUP BY tracks.genre
    ORDER BY track_count DESC, tracks.genre ASC
  `;
  return db.prepare(sql).all(params);
});

// 6. Artists Aggregation with Faceted Counts
fastify.get("/api/artists", async (req) => {
  const { joinFts, whereClause, params } = buildFilterConditions(req.query, "artist");
  const sql = `
    SELECT tracks.artist, COUNT(*) as track_count, COUNT(DISTINCT tracks.album) as album_count,
           MAX(tracks.cover_hash) as cover_hash
    FROM tracks
    ${joinFts}
    ${whereClause}
    GROUP BY tracks.artist
    ORDER BY tracks.artist COLLATE NOCASE ASC
  `;
  return db.prepare(sql).all(params);
});

// 7. Albums Aggregation with Faceted Counts
fastify.get("/api/albums", async (req) => {
  const { joinFts, whereClause, params } = buildFilterConditions(req.query, "album");
  const sql = `
    SELECT tracks.album, tracks.artist, tracks.year, tracks.decade, tracks.genre, tracks.cover_hash,
           COUNT(*) as track_count, SUM(tracks.duration) as total_duration
    FROM tracks
    ${joinFts}
    ${whereClause}
    GROUP BY tracks.album, tracks.artist
    ORDER BY tracks.year DESC, tracks.album COLLATE NOCASE ASC
  `;
  return db.prepare(sql).all(params);
});

// 8. Global Stats with Active Faceted Counts
fastify.get("/api/stats", async (req) => {
  const { joinFts, whereClause, params } = buildFilterConditions(req.query);
  const sql = `
    SELECT 
      COUNT(*) as total_tracks,
      COUNT(DISTINCT tracks.album) as total_albums,
      COUNT(DISTINCT tracks.artist) as total_artists,
      COUNT(DISTINCT tracks.genre) as total_genres,
      COALESCE(SUM(tracks.duration), 0) as total_duration
    FROM tracks
    ${joinFts}
    ${whereClause}
  `;
  return db.prepare(sql).get(params);
});

// Scan State Tracker
let scanState = {
  isScanning: false,
  directory: null,
  startTime: null,
  lastResult: null
};

// 9. Scan Status API
fastify.get("/api/scan/status", async () => {
  return scanState;
});

// 10. Trigger Ingestion Rescan API
fastify.post("/api/scan", async (req, reply) => {
  if (scanState.isScanning) {
    return reply.status(409).send({
      error: "Scan already in progress",
      status: "scanning",
      directory: scanState.directory
    });
  }

  const target = req.body?.dir || MUSIC_DIR;
  const force = Boolean(req.body?.force);

  scanState.isScanning = true;
  scanState.directory = target;
  scanState.startTime = new Date().toISOString();

  // Run asynchronously without blocking HTTP response
  scanDirectory(target, { force })
    .then((result) => {
      scanState.isScanning = false;
      scanState.lastResult = { ...result, completedAt: new Date().toISOString() };
    })
    .catch((err) => {
      scanState.isScanning = false;
      scanState.lastResult = { error: err.message, failedAt: new Date().toISOString() };
    });

  return { status: "scanning_started", directory: target };
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n🎵 Playa Audio Server active at: http://localhost:${PORT}`);
    console.log(`📂 Music Vault Target: ${MUSIC_DIR}`);
  } catch (err) {
    console.error("Server start failure:", err);
    process.exit(1);
  }
};

start();
