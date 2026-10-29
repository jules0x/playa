import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as mm from "music-metadata";
import "dotenv/config";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { db, initDatabase } from "./db.js";
import { getS3Client, getBucketName, isSpacesConfigured } from "./s3.js";

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
  if (!name) return false;
  return (
    /^\d{8}$/.test(name) ||
    /^\d{4}[-_]\d{2}[-_]\d{2}$/.test(name) ||
    /^(batch|chunk|upload|part)[-_]?\d+$/i.test(name)
  );
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
 * Inspects a local album folder to find the best candidate image file.
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
 * Extracts and caches cover art locally in ./data/covers/${hash}.jpg
 */
function extractCoverArt(picture, albumDir, albumCoverCache) {
  if (albumCoverCache && albumCoverCache.has(albumDir)) {
    return albumCoverCache.get(albumDir);
  }

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
      // fallback
    }
  }

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

const INSERT_TRACK_SQL = `
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
`;

/**
 * Ultra-fast native DigitalOcean Spaces scanner using AWS S3 SDK and HTTP Range Requests.
 * Eliminates FUSE s3fs overhead, redundantly downloading cover art, and per-track SQLite fsyncs.
 */
export async function scanSpacesBucket(options = {}) {
  initDatabase();
  const startTime = Date.now();
  const client = getS3Client();
  const bucket = getBucketName();

  if (!client || !bucket) {
    throw new Error("DigitalOcean Spaces is not configured. Check SPACES_KEY, SPACES_SECRET, SPACES_BUCKET, SPACES_ENDPOINT in .env");
  }

  const mountDir = process.env.LOCAL_MOUNT_DIR || process.env.MUSIC_DIR || "/home/bobohilife/spaces_mount";
  console.log(`\n⚡ Starting native DigitalOcean Spaces scan [Bucket: ${bucket}]`);

  const audioExtensions = new Set([".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aac"]);
  const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

  const audioFiles = [];
  const folderImages = new Map(); // folderDir -> [{ key, name, size }]

  let continuationToken = undefined;
  console.time("⚡ S3 bucket listing");
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken
    }));

    if (res.Contents) {
      for (const item of res.Contents) {
        if (!item.Key || item.Key.endsWith("/") || item.Size === 0) continue;
        const ext = path.extname(item.Key).toLowerCase();
        const dir = path.dirname(item.Key);
        const name = path.basename(item.Key);

        if (audioExtensions.has(ext)) {
          audioFiles.push({
            key: item.Key,
            dir,
            name,
            ext,
            size: item.Size,
            mtime: item.LastModified ? item.LastModified.getTime() : 0
          });
        } else if (imageExtensions.has(ext)) {
          let list = folderImages.get(dir);
          if (!list) {
            list = [];
            folderImages.set(dir, list);
          }
          list.push({ key: item.Key, name, size: item.Size });
        }
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);
  console.timeEnd("⚡ S3 bucket listing");

  console.log(`📁 Found ${audioFiles.length} audio tracks and ${folderImages.size} album folders in Spaces.`);

  // Rank candidate images per album folder
  const bestFolderImageMap = new Map();
  for (const [folderDir, candidates] of folderImages.entries()) {
    const scored = candidates.map((c) => ({
      ...c,
      score: scoreImageCandidate(c.name, c.size)
    }));
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.size - a.size;
    });
    if (scored.length > 0) {
      bestFolderImageMap.set(folderDir, scored[0]);
    }
  }

  // Load existing records from SQLite for instant incremental check
  const existingTracks = new Map();
  const rows = db.prepare("SELECT file_path, file_size, mtime, cover_hash FROM tracks").all();
  for (const r of rows) {
    existingTracks.set(r.file_path, r);
  }

  const insertStmt = db.prepare(INSERT_TRACK_SQL);
  const insertMany = db.transaction((batch) => {
    for (const record of batch) {
      insertStmt.run(record);
    }
  });

  const albumCoverCache = new Map();

  async function resolveFolderCover(folderDir) {
    if (albumCoverCache.has(folderDir)) {
      return albumCoverCache.get(folderDir);
    }
    const bestImage = bestFolderImageMap.get(folderDir);
    if (!bestImage) {
      return null;
    }
    try {
      const imgRes = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: bestImage.key
      }));
      const chunks = [];
      for await (const chunk of imgRes.Body) chunks.push(chunk);
      const data = Buffer.concat(chunks);
      if (data && data.length > 0) {
        const hash = crypto.createHash("sha1").update(data).digest("hex");
        const coverPath = path.join(COVERS_DIR, `${hash}.jpg`);
        if (!fs.existsSync(coverPath)) {
          fs.writeFileSync(coverPath, data);
        }
        albumCoverCache.set(folderDir, hash);
        return hash;
      }
    } catch (err) {
      // fallback
    }
    albumCoverCache.set(folderDir, null);
    return null;
  }

  let indexedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Filter out unchanged files
  const pendingFiles = [];
  for (const item of audioFiles) {
    const filePath = path.join(mountDir, item.key);
    const existing = existingTracks.get(filePath);

    if (
      !options.force &&
      existing &&
      existing.file_size === item.size &&
      Math.abs(existing.mtime - item.mtime) < 1000 &&
      existing.cover_hash
    ) {
      skippedCount++;
    } else {
      pendingFiles.push(item);
    }
  }

  console.log(`⚡ ${skippedCount} tracks unchanged (incremental skip). Indexing ${pendingFiles.length} tracks...`);

  // Concurrent worker pool
  const CONCURRENCY = options.concurrency || 10;
  let cursor = 0;
  const writeBuffer = [];

  function flushBatch() {
    if (writeBuffer.length > 0) {
      insertMany(writeBuffer);
      writeBuffer.length = 0;
    }
  }

  async function worker() {
    while (cursor < pendingFiles.length) {
      const index = cursor++;
      const item = pendingFiles[index];
      const filePath = path.join(mountDir, item.key);

      try {
        // Resolve album cover once per folder
        let folderCoverHash = await resolveFolderCover(item.dir);
        const hasFolderCover = Boolean(folderCoverHash);

        // Fetch initial byte range (256 KB)
        const initialBytes = 262144;
        const rangeHeader = `bytes=0-${Math.min(initialBytes - 1, item.size - 1)}`;
        const res = await client.send(new GetObjectCommand({
          Bucket: bucket,
          Key: item.key,
          Range: rangeHeader
        }));

        const chunks = [];
        for await (const chunk of res.Body) chunks.push(chunk);
        let buf = Buffer.concat(chunks);

        // If MP3 and ID3v2 tag is larger than initial buffer, fetch remaining tag bytes
        if (buf.toString("ascii", 0, 3) === "ID3") {
          const tagSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
          const needed = tagSize + 10;
          if (needed > buf.length && needed < item.size) {
            const fetchUntil = Math.min(needed + 4096, item.size - 1);
            const moreRes = await client.send(new GetObjectCommand({
              Bucket: bucket,
              Key: item.key,
              Range: `bytes=${buf.length}-${fetchUntil}`
            }));
            const moreChunks = [];
            for await (const c of moreRes.Body) moreChunks.push(c);
            buf = Buffer.concat([buf, ...moreChunks]);
          }
        }

        const mimeType = item.ext === ".mp3" ? "audio/mpeg" : (item.ext === ".m4a" ? "audio/mp4" : "audio/flac");
        const metadata = await mm.parseBuffer(buf, {
          mimeType,
          duration: false,
          skipCovers: hasFolderCover
        });

        const common = metadata.common || {};
        const format = metadata.format || {};

        // Intelligent Title, Artist, Album resolution
        const baseFilename = path.basename(item.name, item.ext);
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
            const parentDir = path.basename(item.dir);
            artist = (!parentDir || parentDir === "." || isDateBatchFolder(parentDir)) ? "Unknown Artist" : parentDir;
          }
        }
        if (!album) {
          const albumDirName = path.basename(item.dir);
          album = (!albumDirName || isDateBatchFolder(albumDirName)) ? (parts.length > 1 ? parts[1] : "Unknown Album") : albumDirName;
        }

        // Year & Decade
        let year = common.year;
        if (!year && common.date) {
          const matched = String(common.date).match(/\b(19\d\d|20\d\d)\b/);
          if (matched) year = parseInt(matched[1], 10);
        }
        if (!year) {
          const dirMatch = item.dir.match(/\((19\d\d|20\d\d)\)/) || item.name.match(/\b(19\d\d|20\d\d)\b/);
          if (dirMatch) year = parseInt(dirMatch[1], 10);
        }
        const decade = computeDecade(year);

        // Genre
        let genre = "Other";
        if (Array.isArray(common.genre) && common.genre.length > 0) {
          genre = common.genre.join(", ");
        } else if (typeof common.genre === "string" && common.genre.trim()) {
          genre = common.genre.trim();
        }

        // Cover art hash
        let coverHash = folderCoverHash;
        if (!coverHash && common.picture && common.picture[0] && common.picture[0].data) {
          const picData = common.picture[0].data;
          const hash = crypto.createHash("sha1").update(picData).digest("hex");
          const coverPath = path.join(COVERS_DIR, `${hash}.jpg`);
          if (!fs.existsSync(coverPath)) {
            fs.writeFileSync(coverPath, picData);
          }
          coverHash = hash;
          albumCoverCache.set(item.dir, hash);
        }

        // Track duration
        let duration = format.duration || 0;
        if ((!duration || duration < 10) && format.bitrate && format.bitrate > 0) {
          duration = (item.size * 8) / format.bitrate;
        }

        const trackNo = common.track && common.track.no ? common.track.no : 1;
        const discNo = common.disk && common.disk.no ? common.disk.no : 1;

        writeBuffer.push({
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
          duration: Math.round(duration * 100) / 100,
          bitrate: format.bitrate || 0,
          cover_hash: coverHash,
          file_size: item.size,
          mtime: item.mtime,
          storage_source: "spaces"
        });

        indexedCount++;
        if (writeBuffer.length >= 50) {
          flushBatch();
        }

        if (indexedCount % 50 === 0 || indexedCount === 1) {
          console.log(`[⚡ Fast Indexed #${indexedCount}/${pendingFiles.length}] ${artist} - ${title} (${album})`);
        }
      } catch (err) {
        errorCount++;
        console.error(`[Error] Failed to process Spaces object ${item.key}:`, err.message);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  flushBatch();

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `\n✨ Spaces Scan complete in ${durationSec}s! Total files: ${audioFiles.length} | Indexed: ${indexedCount} | Skipped: ${skippedCount} | Errors: ${errorCount}`
  );

  return {
    totalFiles: audioFiles.length,
    indexedCount,
    skippedCount,
    errorCount,
    durationSec
  };
}

/**
 * Standard scanDirectory entrypoint.
 * Automatically delegates to native scanSpacesBucket when Spaces is configured.
 */
export async function scanDirectory(targetInput, options = {}) {
  initDatabase();
  const mountDir = process.env.LOCAL_MOUNT_DIR || process.env.MUSIC_DIR || "/home/bobohilife/spaces_mount";
  const targetStr = Array.isArray(targetInput) ? targetInput.join(" ") : String(targetInput || "");

  // Auto-delegate to Spaces native scan if Spaces is configured
  if (isSpacesConfigured() && (!options.localOnly && (targetStr.includes("spaces") || targetStr.includes(mountDir) || !targetStr))) {
    return await scanSpacesBucket(options);
  }

  // Local filesystem scanning fallback
  const startTime = Date.now();
  const targets = (Array.isArray(targetInput) ? targetInput : String(targetInput).split(/[,;]/))
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`\n🎧 Starting local filesystem scan of: ${targets.join(", ")}`);

  const supportedExtensions = new Set([".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aac"]);
  const filesToProcess = [];

  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
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

  for (const targetDir of targets) {
    if (!fs.existsSync(targetDir)) {
      console.error(`❌ Target directory ${targetDir} does not exist!`);
      continue;
    }
    walk(targetDir);
  }

  console.log(`📂 Found ${filesToProcess.length} audio files on local disk.`);

  const getExistingStmt = db.prepare("SELECT file_size, mtime, cover_hash FROM tracks WHERE file_path = ?");
  const insertStmt = db.prepare(INSERT_TRACK_SQL);
  const insertMany = db.transaction((batch) => {
    for (const record of batch) {
      insertStmt.run(record);
    }
  });

  const albumCoverCache = new Map();
  const writeBuffer = [];
  let indexedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const filePath of filesToProcess) {
    try {
      const stats = fs.statSync(filePath);
      const existing = getExistingStmt.get(filePath);

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

      const dir = path.dirname(filePath);
      const hasFolderCover = albumCoverCache.has(dir) && albumCoverCache.get(dir) !== null;

      const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: hasFolderCover });
      const common = metadata.common || {};
      const format = metadata.format || {};

      const baseFilename = path.basename(filePath, path.extname(filePath));
      const parts = baseFilename.split(" - ").map((s) => s.trim());

      let title = cleanString(common.title);
      let artist = cleanString(common.artist);
      let album = cleanString(common.album);
      let albumArtist = cleanString(common.albumartist, artist);

      if (!title) title = parts.length > 1 ? parts[parts.length - 1] : baseFilename;
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

      let genre = "Other";
      if (Array.isArray(common.genre) && common.genre.length > 0) {
        genre = common.genre.join(", ");
      } else if (typeof common.genre === "string" && common.genre.trim()) {
        genre = common.genre.trim();
      }

      const picture = common.picture && common.picture[0] ? common.picture[0] : null;
      const coverHash = extractCoverArt(picture, dir, albumCoverCache);

      writeBuffer.push({
        file_path: filePath,
        title,
        artist,
        album_artist: albumArtist,
        album,
        year: year || null,
        decade,
        genre,
        track_no: common.track && common.track.no ? common.track.no : 1,
        disc_no: common.disk && common.disk.no ? common.disk.no : 1,
        duration: format.duration || 0,
        bitrate: format.bitrate || 0,
        cover_hash: coverHash,
        file_size: stats.size,
        mtime: stats.mtimeMs,
        storage_source: "local"
      });

      indexedCount++;
      if (writeBuffer.length >= 50) {
        insertMany(writeBuffer);
        writeBuffer.length = 0;
      }

      if (indexedCount % 50 === 0 || indexedCount === 1) {
        console.log(`[Local Indexed #${indexedCount}] ${artist} - ${title} (${album})`);
      }
    } catch (err) {
      errorCount++;
      console.error(`[Error] Failed to process ${filePath}:`, err.message);
    }
  }

  if (writeBuffer.length > 0) {
    insertMany(writeBuffer);
    writeBuffer.length = 0;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `\n✨ Local Scan complete in ${durationSec}s! Total files: ${filesToProcess.length} | Indexed: ${indexedCount} | Skipped: ${skippedCount} | Errors: ${errorCount}`
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
  scanDirectory(target)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Scan failed:", err);
      process.exit(1);
    });
}
