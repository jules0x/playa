# 🎵 Playa — Private Personal Media Vault

A fast, private, modern web application for organizing, multi-filtering, and streaming 1TB+ collections of MP3s (and future personal photo collections) without risking account suspensions from mainstream cloud providers.

---

## ⚡ Quick Start (Running Locally)

The server and local testing library are already set up and running on your machine:

```bash
# 1. Start the server (already running at http://localhost:3456)
npm start

# 2. Rescan or reindex your music directory anytime
npm run scan
```

Visit **`http://localhost:3456`** in your browser.

---

## 🎧 Features Implemented

1. **Multi-Dimensional Tag Filtering**:
   - **Decades Filter**: Filter by era (e.g. `1970s`, `1980s`, `1990s`, `2000s`, `2010s`, `2020s`).
   - **Genre Badges**: Categorized underground & electronic tags with track counts.
   - **Instant Full-Text Search**: Powered by SQLite FTS5 across tracks, artists, albums, and genres.
   - **Multi-View Modes**: Albums Grid, Tracks Table, and Artists Directory.

2. **Full-Featured Audio Player**:
   - HTTP Range streaming (`206 Partial Content`) for instantaneous seeking & scrubbing.
   - Persistent bottom player bar with scrubber, volume control, shuffle, and repeat.
   - Real-time Web Audio API frequency visualizer.
   - Up Next Queue drawer.
   - Keyboard shortcuts: `Space` (Play/Pause), `Right Arrow` (+5s), `Left Arrow` (-5s).

3. **Smart Ingestion Pipeline**:
   - Pure ID3v1/ID3v2/FLAC metadata parsing with `music-metadata`.
   - Automatic decade calculation from release year.
   - Cover art extraction and caching (embedded ID3 images + folder art detection).
   - Resilient fallback heuristics for un-tagged tape rips or underground bootlegs.

---

## ☁️ DigitalOcean Storage & Hosting Setup

### Why DigitalOcean Spaces?
- **Account Safety**: Unlike Google Drive or Dropbox, DigitalOcean Spaces is raw object storage infrastructure. DO **does not** run automated perceptual hash crawlers or DMCA scanners against private buckets.
- **Dedicated Keys**: Your music library uses an isolated S3 Access Key & Secret.
- **Bandwidth**: Outbound data from Spaces to a DigitalOcean Droplet in the same region is free and fast.

### Cost Breakdown
| Service | Capacity | Cost |
| :--- | :--- | :--- |
| **DigitalOcean Spaces** | 250 GB included | $5.00 / month |
| Additional Storage | +750 GB ($0.02 / GB) | $15.00 / month |
| **Total DO Spaces (1 TB)** | **1,000 GB** | **$20.00 / month** |
| **DO Droplet (Compute)** | 1 vCPU, 1GB RAM | $4.00 – $6.00 / month |

*(Alternative comparison: Hetzner Storage Box is ~€3.80 / $4.15 USD / month for 1 TB if you ever want to cut storage cost down further).*

---

### How to Upload Your 1TB Collection to DigitalOcean Spaces

Using **`rclone`** (fastest and most reliable for bulk uploads):

1. Install rclone:
   ```bash
   brew install rclone
   ```
2. Configure your DigitalOcean Space in `rclone config`:
   - Storage Type: `Amazon S3 Compliant`
   - Provider: `DigitalOcean`
   - Access Key & Secret Key: (From DO Cloud Console -> API -> Spaces Keys)
   - Endpoint: `nyc3.digitaloceanspaces.com` (or your chosen region)
3. Upload your library:
   ```bash
   rclone sync /path/to/your/mp3s do-spaces:my-music-vault/music --progress --transfers 16
   ```

---

## 🖼️ Future Phase: Photo Library Expansion (~250GB)

The schema in `server/db.js` is built with a media-agnostic structure. In Phase 2:
- Photos can be dumped into `/data/photos` or `do-spaces:my-music-vault/photos`.
- An EXIF parser will extract Date Taken, Camera, and Geolocation.
- A virtualized gallery timeline (by Year / Month) will sit alongside the Music views.
