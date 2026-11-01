import { gzipSync } from "node:zlib";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// S3-compatible object storage for large payloads (result JSON). MinIO in docker-compose,
// any S3 service in production. Objects are stored gzipped and served as-is with
// Content-Encoding: gzip, so the server never inflates multi-megabyte field data.

let client: S3Client | null = null;
let bucketReady: Promise<void> | null = null;

function config() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not set (object storage is required for results)");
  return {
    bucket,
    client: (client ??= new S3Client({
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    })),
  };
}

/** Create the bucket on first use when allowed (S3_CREATE_BUCKET=true, the compose default). */
function ensureBucket(): Promise<void> {
  const { bucket, client } = config();
  bucketReady ??= (async () => {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      if (process.env.S3_CREATE_BUCKET !== "true") throw new Error(`bucket ${bucket} does not exist`);
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  })().catch((err) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

export async function putJson(key: string, json: string): Promise<{ sizeBytes: number }> {
  await ensureBucket();
  const { bucket, client } = config();
  const body = gzipSync(Buffer.from(json, "utf8"));
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/json", ContentEncoding: "gzip" }),
  );
  return { sizeBytes: Buffer.byteLength(json, "utf8") };
}

/** Gzipped bytes as a web stream, for responses with Content-Encoding: gzip. */
export async function getGzipStream(key: string): Promise<ReadableStream | null> {
  const { bucket, client } = config();
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return out.Body ? out.Body.transformToWebStream() : null;
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
}

export async function getJsonText(key: string): Promise<string | null> {
  const { bucket, client } = config();
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!out.Body) return null;
    const bytes = Buffer.from(await out.Body.transformToByteArray());
    const { gunzipSync } = await import("node:zlib");
    return gunzipSync(bytes).toString("utf8");
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { bucket, client } = config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function storageHealthy(): Promise<boolean> {
  try {
    await ensureBucket();
    return true;
  } catch {
    return false;
  }
}

export const resultKey = (projectId: string, resultId: string) => `results/${projectId}/${resultId}.json.gz`;
