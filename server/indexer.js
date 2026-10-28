import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as mm from "music-metadata";
import { db, initDatabase } from "./db.js";

const COVERS_DIR = path.resolve("./data/covers");
if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}

export function computeDecade(year) {
  if (!year || isNaN(year) || year < 1920 || year > 2099) return "Unknown";
  const start = Math.floor(year / 10) * 10;
  return `${start}s`;
}

function cleanString(str, fallback = "") {
  if (!str) return fallback;
  return String(str).trim();
}

function extractCoverArt(picture, albumDir) {
  if (picture && picture.data && picture.data.length > 0) {
    const hash = crypto.createHash("sha1").update(picture.data).digest("hex");
    const coverPath = path.join(COVERS_DIR, `${hash}.jpg`);
    if (!fs.existsSync(coverPath)) {
      fs.writeFileSync(coverPath, picture.data);
    }
    return hash;
  }

  // Fallback: check if directory has cover image
  const candidates = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "album.jpg", "front.jpg"];
  for (const c of candidates) {
    const p = path.join(albumDir, c);
    if (fs.existsSync(p)) {
      try {
        const data = fs.readFileSync(p);
        const hash = crypto.createHash("sha1").update(data).digest("hex");
        const coverPath = path.join(COVERS_DIR, `${hash}.jpg`);
        if (!fs.existsSync(coverPath)) {
          fs.writeFileSync(coverPath, data);
        }
        return hash;
      } catch (err) {
        // ignore
      }
    }
  }

  return null;
}

export async function scanDirectory(targetDir) {
  initDatabase();
  console.log(`Starting scan of directory: ${targetDir}`);

  if (!fs.existsSync(targetDir)) {
    console.error(`Target directory ${targetDir} does not exist!`);
    return { count: 0, errors: 0 };
  }

  const supportedExtensions = new Set([".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aac"]);
  const filesToProcess = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (supportedExtensions.has(ext)) {
          filesToProcess.push(fullPath);
        }
      }
    }
  }

  walk(targetDir);
  console.log(`Found ${filesToProcess.length} audio files. Extracting metadata...`);

  const insertStmt = db.prepare(`
    INSERT INTO tracks (
      file_path, title, artist, album_artist, album, year, decade, genre,
      track_no, disc_no, duration, bitrate, cover_hash, updated_at
    ) VALUES (
      @file_path, @title, @artist, @album_artist, @album, @year, @decade, @genre,
      @track_no, @disc_no, @duration, @bitrate, @cover_hash, CURRENT_TIMESTAMP
    )
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album_artist = excluded.album_artist,
      album = excluded.album,
      year = excluded.year,
      decade = excluded.decade,
      genre = excluded.genre,
      track_no = excluded.track_no,
      disc_no = excluded.disc_no,
      duration = excluded.duration,
      bitrate = excluded.bitrate,
      cover_hash = excluded.cover_hash,
      updated_at = CURRENT_TIMESTAMP
  `);

  let indexedCount = 0;
  let errorCount = 0;

  for (const filePath of filesToProcess) {
    try {
      const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: false });
      const common = metadata.common || {};
      const format = metadata.format || {};
      const dir = path.dirname(filePath);

      // Extract title, artist, album with smart heuristics
      const baseFilename = path.basename(filePath, path.extname(filePath));
      const parts = baseFilename.split(" - ").map(s => s.trim());

      let title = cleanString(common.title);
      let artist = cleanString(common.artist);
      let album = cleanString(common.album);
      let albumArtist = cleanString(common.albumartist, artist);

      // Fallback heuristics if tags are missing
      if (!title) {
        title = parts.length > 1 ? parts[parts.length - 1] : baseFilename;
      }
      if (!artist) {
        if (parts.length > 1) {
          artist = parts[0];
        } else {
          const parentDir = path.basename(path.dirname(filePath));
          artist = parentDir !== "." ? parentDir : "Unknown Artist";
        }
      }
      if (!album) {
        album = path.basename(dir) || "Unknown Album";
      }

      // Extract Year & Decade
      let year = common.year;
      if (!year && common.date) {
        const matched = String(common.date).match(/\b(19\d\d|20\d\d)\b/);
        if (matched) year = parseInt(matched[1], 10);
      }
      if (!year) {
        // Try to match year from folder or filename (e.g. "Polygondwanaland (2017)")
        const dirMatch = dir.match(/\((19\d\d|20\d\d)\)/) || filePath.match(/\b(19\d\d|20\d\d)\b/);
        if (dirMatch) year = parseInt(dirMatch[1], 10);
      }
      const decade = computeDecade(year);

      // Extract & Normalize Genre
      let genre = "Electronic / Psychedelic";
      if (Array.isArray(common.genre) && common.genre.length > 0) {
        genre = common.genre.join(", ");
      } else if (typeof common.genre === "string" && common.genre.trim()) {
        genre = common.genre.trim();
      } else {
        // Heuristic based on artist/path
        const lowerPath = filePath.toLowerCase();
        if (lowerPath.includes("king gizzard") || lowerPath.includes("polygondwanaland")) {
          genre = "Psychedelic Rock";
        } else if (lowerPath.includes("nine inch nails") || lowerPath.includes("ghosts")) {
          genre = "Ambient / Electronic";
        } else if (lowerPath.includes("sasha yeller") || lowerPath.includes("techno")) {
          genre = "Minimal Techno";
        } else if (lowerPath.includes("archangel") || lowerPath.includes("core")) {
          genre = "Electronic / Techno";
        }
      }

      // Extract cover artwork
      const picture = (common.picture && common.picture[0]) ? common.picture[0] : null;
      const coverHash = extractCoverArt(picture, dir);

      const trackNo = (common.track && common.track.no) ? common.track.no : 1;
      const discNo = (common.disk && common.disk.no) ? common.disk.no : 1;

      insertStmt.run({
        file_path: filePath,
        title,
        artist,
        album_artist: albumArtist,
        album,
        year: year || null,
        decade,
        genre,
        track_no: trackNo,
        disc_no: discNo,
        duration: format.duration || 0,
        bitrate: format.bitrate || 0,
        cover_hash: coverHash
      });

      indexedCount++;
      console.log(`[Indexed] ${artist} - ${title} (${album}, ${year || "N/A"}) [${genre}]`);
    } catch (err) {
      errorCount++;
      console.error(`[Error] Failed to process ${filePath}:`, err.message);
    }
  }

  console.log(`Scan complete! Successfully indexed: ${indexedCount}, Errors: ${errorCount}`);
  return { indexedCount, errorCount };
}

// Standalone execution
if (process.argv[1] && process.argv[1].endsWith("indexer.js")) {
  const target = process.env.MUSIC_DIR || path.resolve("./sample_music");
  scanDirectory(target).then(() => {
    process.exit(0);
  });
}
