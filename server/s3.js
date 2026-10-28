import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const KEY = process.env.SPACES_KEY || process.env.DO_SPACES_KEY;
const SECRET = process.env.SPACES_SECRET || process.env.DO_SPACES_SECRET;
const ENDPOINT = process.env.SPACES_ENDPOINT || process.env.DO_SPACES_ENDPOINT;
const BUCKET = process.env.SPACES_BUCKET || process.env.DO_SPACES_BUCKET;
const REGION = process.env.SPACES_REGION || process.env.DO_SPACES_REGION || "us-east-1";

let s3Client = null;

export function isSpacesConfigured() {
  return Boolean(KEY && SECRET && ENDPOINT && BUCKET);
}

export function getS3Client() {
  if (!isSpacesConfigured()) return null;
  if (!s3Client) {
    let cleanEndpoint = ENDPOINT.startsWith("http") ? ENDPOINT : `https://${ENDPOINT}`;
    cleanEndpoint = cleanEndpoint.replace(/\/+$/, "");

    // If user provided bucket in endpoint (e.g. https://playa.syd1.digitaloceanspaces.com),
    // strip the bucket prefix so AWS S3 SDK doesn't double it with forcePathStyle: false
    if (BUCKET) {
      try {
        const u = new URL(cleanEndpoint);
        const prefix = `${BUCKET.toLowerCase()}.`;
        if (u.hostname.toLowerCase().startsWith(prefix)) {
          u.hostname = u.hostname.slice(prefix.length);
          cleanEndpoint = u.origin;
        }
      } catch (e) {
        // ignore url parsing error and fallback to cleanEndpoint
      }
    }

    s3Client = new S3Client({
      endpoint: cleanEndpoint,
      region: REGION,
      credentials: {
        accessKeyId: KEY,
        secretAccessKey: SECRET
      },
      forcePathStyle: false
    });
  }
  return s3Client;
}

// Generate pre-signed URL for direct browser-to-Spaces streaming
export async function getPresignedStreamUrl(objectKey, expiresInSeconds = 3600) {
  const client = getS3Client();
  if (!client) return null;

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: objectKey
  });

  return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// Stream bytes from Spaces through the server with HTTP Range
export async function getSpacesObjectStream(objectKey, rangeHeader = null) {
  const client = getS3Client();
  if (!client) throw new Error("Spaces not configured");

  const params = {
    Bucket: BUCKET,
    Key: objectKey
  };
  if (rangeHeader) {
    params.Range = rangeHeader;
  }

  const command = new GetObjectCommand(params);
  return await client.send(command);
}

// Recursively list all audio files in the Spaces bucket
export async function listSpacesAudioFiles(prefix = "") {
  const client = getS3Client();
  if (!client) return [];

  const audioExtensions = new Set([".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aac"]);
  const files = [];
  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken
    });

    const response = await client.send(command);
    if (response.Contents) {
      for (const obj of response.Contents) {
        const lowerKey = obj.Key.toLowerCase();
        const ext = lowerKey.slice(lowerKey.lastIndexOf("."));
        if (audioExtensions.has(ext)) {
          files.push({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified
          });
        }
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return files;
}
