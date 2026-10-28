import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as mm from "music-metadata";
import "dotenv/config";
import { db, initDatabase } from "./db.js";

const DATA_DIR = process.env.DATA_DIR || path.resolve("./data");
const COVERS_DIR = path.join(DATA_DIR, "covers");
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

export function isDateBatchFolder(name) {
  return /^\d{8}$/.test(name) || /^\d{4}[-_]\d{2}[-_]\d{2}$/.test(name);
}

/**
 * Evaluates candidate images found in an album folder to select the optimal front cover art.
 * Prioritizes standard front covers and high-resolution files while filtering out back covers,
 * proofs, disc scans, and tiny thumbnail files.
 */
export function scoreImageCandidate(filename, fileSize) {
  const lower = filename.toLowerCase();
  let score = 0;

  // Severely penalize non-front-cover images
  if (lower.includes("small") || lower.includes("thumb") || lower.includes("icon")) score -= 60;
  if (
    lower.includes("proof") ||
    lower.includes("back") ||
    lower.includes("rear") ||
    lower.includes("inlay") ||
    lower.includes("tray") ||
    lower.includes("cd") ||
    lower.includes("disc") ||
    lower.includes("matrix") ||
    lower.includes("spine") ||
    lower.includes("inside")
  ) {
    score -= 70;
  }

  // Reward front cover patterns
  if (/^cover\.(jpe?g|png|webp)$/i.test(filename)) score += 110;
  else if (/^folder\.(jpe?g|png|webp)$/i.test(filename)) score += 100;
  else if (/^front\.(jpe?g|png|webp)$/i.test(filename)) score += 95;
  else if (/^album\.(jpe?g|png|webp)$/i.test(filename)) score += 90;
  else if (/^art\.(jpe?g|png|webp)$/i.test(filename)) score += 85;
  else if (lower.includes("large")) score += 75;
  else if (lower.includes("cover") || lower.includes("front")) score += 70;
  else score += 30; // generic image candidate

  // Size rating: prefer clean high-res images (40KB - 8MB); penalize extremes
  if (fileSize >= 40 * 1024 && fileSize <= 8 * 1024 * 1024) {
    score += 25;
  } else if (fileSize < 10 * 1024) {
    score -= 40; // low-resolution icon
  } else if (fileSize > 20 * 1024 * 1024) {
    score -= 30; // excessively large raw scan
  }

  return score;
}

/**
 * Inspects an album folder to find the best candidate image file.
 */
function findBestFolderCover(albumDir) {
  const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  try {
    const entries = fs.readdirSync(albumDir, { withFileTypes: true });
    const candidates = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!imageExts.has(ext)) continue;

      const fullPath = path.join(albumDir, entry.name);
      try {
        const stats = fs.statSync(fullPath);
        const score = scoreImageCandidate(entry.name, stats.size);
        candidates.push({ path: fullPath, name: entry.name, size: stats.size, score });
      } catch (err) {
        // file may have been moved or locked
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score descending, then by file size descending (higher resolution preferred)
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.size - a.size;
    });

    return candidates[0].path;
  } catch (err) {
    return null;
  }
}

/**
 * Extracts and caches cover art locally in ./data/covers/${hash}.jpg to eliminate
 * redundant remote queries and deliver instant UI rendering.
 */
function extractCoverArt(picture, albumDir, albumCoverCache) {
  // Check in-memory cache for this album folder first
  if (albumCoverCache && albumCoverCache.has(albumDir)) {
    return albumCoverCache.get(albumDir);
  }

  // 1. Check album folder for highest-scoring image
  const bestFolderImage = findBestFolderCover(albumDir);
  if (bestFolderImage) {
    try {
      const data = fs.readFileSync(bestFolderImage);
      if (data && data.length > 0) {
        const hash = crypto.createHash("sha1").update(data).digest("hex");
        const coverPath = path.join(COVERS_DIR, `${hash}.jpg`);
        if (!fs.existsSync(coverPath)) {
          fs.writeFileSync(coverPath, data);
        }
        if (albumCoverCache) albumCoverCache.set(albumDir, hash);
        return hash;
      }
    } catch (err) {
      // fallback to embedded picture if reading fails
    }
  }

  // 2. Fallback to embedded audio metadata picture
  if (picture && picture.data && picture.data.length > 0) {
    const hash = crypto.createHash("sha1").update(picture.data).digest("hex");
    const coverPath = path.join(COVERS_DIR, `${hash}.jpg`);
    if (!fs.existsSync(coverPath)) {
      fs.writeFileSync(coverPath, picture.data);
    }
    if (albumCoverCache) albumCoverCache.set(albumDir, hash);
    return hash;
  }

  if (albumCoverCache) albumCoverCache.set(albumDir, null);
  return null;
}

export async function scanDirectory(targetDir, options = {}) {
  initDatabase();
  const startTime = Date.now();
  console.log(`\n🎧 Starting vault scan of: ${targetDir}`);

  if (!fs.existsSync(targetDir)) {
    console.error(`❌ Target directory ${targetDir} does not exist!`);
    return { count: 0, indexedCount: 0, skippedCount: 0, errorCount: 0 };
  }

  const supportedExtensions = new Set([".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aac"]);
  const filesToProcess = [];

  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue; // skip hidden dirs / trash
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
    } catch (err) {
      console.warn(`[Warning] Could not read directory ${dir}: ${err.message}`);
    }
  }

  walk(targetDir);
  console.log(`📂 Found ${filesToProcess.length} audio files in vault.`);

  const getExistingStmt = db.prepare("SELECT file_size, mtime, cover_hash FROM tracks WHERE file_path = ?");
  const insertStmt = db.prepare(`
    INSERT INTO tracks (
      file_path, title, artist, album_artist, album, year, decade, genre,
      track_no, disc_no, duration, bitrate, cover_hash, file_size, mtime, storage_source, updated_at
    ) VALUES (
      @file_path, @title, @artist, @album_artist, @album, @year, @decade, @genre,
      @track_no, @disc_no, @duration, @bitrate, @cover_hash, @file_size, @mtime, @storage_source, CURRENT_TIMESTAMP
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
      file_size = excluded.file_size,
      mtime = excluded.mtime,
      storage_source = excluded.storage_source,
      updated_at = CURRENT_TIMESTAMP
  `);

  const albumCoverCache = new Map();
  let indexedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const isSpaces = targetDir.includes("spaces_mount") || targetDir.includes("playa");
  const storageSource = isSpaces ? "spaces" : "local";

  for (const filePath of filesToProcess) {
    try {
      const stats = fs.statSync(filePath);
      const existing = getExistingStmt.get(filePath);

      // Fast incremental skip: file already indexed and unchanged
      if (
        !options.force &&
        existing &&
        existing.file_size === stats.size &&
        Math.abs(existing.mtime - stats.mtimeMs) < 1000 &&
        existing.cover_hash
      ) {
        skippedCount++;
        continue;
      }

      const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: false });
      const common = metadata.common || {};
      const format = metadata.format || {};
      const dir = path.dirname(filePath);

      // Smart heuristics for Title, Artist, and Album
      const baseFilename = path.basename(filePath, path.extname(filePath));
      const parts = baseFilename.split(" - ").map((s) => s.trim());

      let title = cleanString(common.title);
      let artist = cleanString(common.artist);
      let album = cleanString(common.album);
      let albumArtist = cleanString(common.albumartist, artist);

      if (!title) {
        title = parts.length > 1 ? parts[parts.length - 1] : baseFilename;
      }
      if (!artist) {
        if (parts.length > 1) {
          artist = parts[0];
        } else {
          const parentDir = path.basename(path.dirname(filePath));
          artist = (!parentDir || parentDir === "." || isDateBatchFolder(parentDir)) ? "Unknown Artist" : parentDir;
        }
      }
      if (!album) {
        const albumDirName = path.basename(dir);
        album = (!albumDirName || isDateBatchFolder(albumDirName)) ? (parts.length > 1 ? parts[1] : "Unknown Album") : albumDirName;
      }

      // Year & Decade detection
      let year = common.year;
      if (!year && common.date) {
        const matched = String(common.date).match(/\b(19\d\d|20\d\d)\b/);
        if (matched) year = parseInt(matched[1], 10);
      }
      if (!year) {
        const dirMatch = dir.match(/\((19\d\d|20\d\d)\)/) || filePath.match(/\b(19\d\d|20\d\d)\b/);
        if (dirMatch) year = parseInt(dirMatch[1], 10);
      }
      const decade = computeDecade(year);

      // Genre normalization
      let genre = "Other";
      if (Array.isArray(common.genre) && common.genre.length > 0) {
        genre = common.genre.join(", ");
      } else if (typeof common.genre === "string" && common.genre.trim()) {
        genre = common.genre.trim();
      }

      // Best cover selection & local caching
      const picture = common.picture && common.picture[0] ? common.picture[0] : null;
      const coverHash = extractCoverArt(picture, dir, albumCoverCache);

      const trackNo = common.track && common.track.no ? common.track.no : 1;
      const discNo = common.disk && common.disk.no ? common.disk.no : 1;

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
        cover_hash: coverHash,
        file_size: stats.size,
        mtime: stats.mtimeMs,
        storage_source: storageSource
      });

      indexedCount++;
      if (indexedCount % 20 === 0 || indexedCount === 1) {
        console.log(`[Indexed #${indexedCount}] ${artist} - ${title} (${album})`);
      }
    } catch (err) {
      errorCount++;
      console.error(`[Error] Failed to process ${filePath}:`, err.message);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `\n✨ Scan complete in ${durationSec}s! Total files: ${filesToProcess.length} | Indexed: ${indexedCount} | Skipped (unchanged): ${skippedCount} | Errors: ${errorCount}`
  );

  return {
    totalFiles: filesToProcess.length,
    indexedCount,
    skippedCount,
    errorCount,
    durationSec
  };
}

// Standalone execution support
if (process.argv[1] && process.argv[1].endsWith("indexer.js")) {
  const target = process.env.MUSIC_DIR || process.env.LOCAL_MOUNT_DIR || path.resolve("./sample_music");
  scanDirectory(target).then(() => {
    process.exit(0);
  });
}
