import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import "dotenv/config";

const DATA_DIR = path.resolve("./data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "playa.db");
export const db = new Database(DB_PATH);

// Enable WAL mode for high concurrent read performance
db.pragma("journal_mode = WAL");

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album_artist TEXT,
      album TEXT NOT NULL,
      year INTEGER,
      decade TEXT,
      genre TEXT,
      track_no INTEGER DEFAULT 1,
      disc_no INTEGER DEFAULT 1,
      duration REAL DEFAULT 0,
      bitrate INTEGER DEFAULT 0,
      cover_hash TEXT,
      file_size INTEGER DEFAULT 0,
      mtime REAL DEFAULT 0,
      storage_source TEXT DEFAULT 'local',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
    CREATE INDEX IF NOT EXISTS idx_tracks_decade ON tracks(decade);
    CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(year);

    -- Full Text Search virtual table
    CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
      title,
      artist,
      album,
      genre,
      decade,
      content='tracks',
      content_rowid='id'
    );

    -- Triggers to keep FTS index synchronized
    CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
      INSERT INTO tracks_fts(rowid, title, artist, album, genre, decade)
      VALUES (new.id, new.title, new.artist, new.album, new.genre, new.decade);
    END;

    CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre, decade)
      VALUES('delete', old.id, old.title, old.artist, old.album, old.genre, old.decade);
    END;

    CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre, decade)
      VALUES('delete', old.id, old.title, old.artist, old.album, old.genre, old.decade);
      INSERT INTO tracks_fts(rowid, title, artist, album, genre, decade)
      VALUES (new.id, new.title, new.artist, new.album, new.genre, new.decade);
    END;

    -- Playlists tables for persistent playlist storage
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      track_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pid ON playlist_tracks(playlist_id);
  `);

  // Safe runtime migrations for existing databases
  const cols = db.pragma("table_info(tracks)").map((c) => c.name);
  if (!cols.includes("file_size")) {
    db.exec("ALTER TABLE tracks ADD COLUMN file_size INTEGER DEFAULT 0");
  }
  if (!cols.includes("mtime")) {
    db.exec("ALTER TABLE tracks ADD COLUMN mtime REAL DEFAULT 0");
  }
  if (!cols.includes("storage_source")) {
    db.exec("ALTER TABLE tracks ADD COLUMN storage_source TEXT DEFAULT 'local'");
  }

  console.log("Database initialized at", DB_PATH);
}
