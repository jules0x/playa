import fs from "fs";
import path from "path";
import { getS3Client, getBucketName, uploadSpacesCover } from "../server/s3.js";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

const COVERS_DIR = path.resolve("./data/covers");

async function syncCovers() {
  const client = getS3Client();
  const bucket = getBucketName();

  if (!client || !bucket) {
    console.error("❌ Spaces not configured!");
    process.exit(1);
  }

  if (!fs.existsSync(COVERS_DIR)) {
    console.error(`❌ Covers directory ${COVERS_DIR} does not exist!`);
    process.exit(1);
  }

  const localFiles = fs.readdirSync(COVERS_DIR).filter(f => f.endsWith(".jpg"));
  console.log(`📁 Found ${localFiles.length} local cover images.`);

  // List existing covers in Spaces to avoid redundant uploads
  console.log("☁️ Listing existing covers in Spaces...");
  const existingSpacesCovers = new Set();
  let token = undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "covers/",
      ContinuationToken: token
    }));
    if (res.Contents) {
      for (const item of res.Contents) {
        existingSpacesCovers.add(path.basename(item.Key));
      }
    }
    token = res.NextContinuationToken;
  } while (token);

  console.log(`☁️ Found ${existingSpacesCovers.size} existing covers in Spaces.`);

  const toUpload = localFiles.filter(f => !existingSpacesCovers.has(f));
  console.log(`🚀 ${toUpload.length} new covers need to be uploaded to Spaces.\n`);

  if (toUpload.length === 0) {
    console.log("✨ All covers are already synced in Spaces!");
    return;
  }

  let uploaded = 0;
  let failed = 0;
  const CONCURRENCY = 15;
  let cursor = 0;

  async function worker() {
    while (cursor < toUpload.length) {
      const idx = cursor++;
      const file = toUpload[idx];
      const hash = file.replace(/\.jpg$/, "");
      const fullPath = path.join(COVERS_DIR, file);

      try {
        const data = fs.readFileSync(fullPath);
        const ok = await uploadSpacesCover(hash, data, "image/jpeg");
        if (ok) {
          uploaded++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        console.error(`Error uploading ${file}:`, err.message);
      }

      if ((uploaded + failed) % 50 === 0 || uploaded + failed === toUpload.length) {
        console.log(`[Upload Progress: ${uploaded + failed}/${toUpload.length}] (Uploaded: ${uploaded}, Failed: ${failed})`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log(`\n🎉 Cover sync complete! Uploaded: ${uploaded} | Failed: ${failed}`);
}

syncCovers().catch(err => {
  console.error("Fatal sync error:", err);
  process.exit(1);
});
