import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Objects are stored gzipped. Next (since 15.5.29) drops Content-Encoding from route handler responses,
// so what leaves storage for a response must be plain JSON.

const send = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public input: unknown) {}
  }
  return { S3Client: class { send = send; }, GetObjectCommand: Command, PutObjectCommand: Command, HeadBucketCommand: Command, CreateBucketCommand: Command, DeleteObjectCommand: Command };
});

process.env.S3_BUCKET = "test-bucket";
const { getJsonStream } = await import("@/lib/storage");

describe("stored JSON in responses", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("comes out of storage inflated", async () => {
    const json = JSON.stringify({ kind: "spectrum", r: Array.from({ length: 5000 }, (_, i) => i / 7) });
    send.mockResolvedValue({ Body: { transformToWebStream: () => new Blob([gzipSync(json)]).stream() } });
    const stream = await getJsonStream("results/p/r.json.gz");
    expect(await new Response(stream).text()).toBe(json);
  });

  it("is null when the object is missing, and other errors are not hidden", async () => {
    send.mockRejectedValue(Object.assign(new Error("gone"), { name: "NoSuchKey" }));
    await expect(getJsonStream("missing")).resolves.toBeNull();
    send.mockRejectedValue(new Error("connection refused"));
    await expect(getJsonStream("any")).rejects.toThrow("connection refused");
  });

  it("is what every route sends, without a Content-Encoding header Next would drop", () => {
    for (const route of ["api/results/[id]", "api/projects/[slug]/versions/[n]/results/[id]", "api/v1/results/[id]", "api/v1/feedback/[id]/answers/[answerId]/data"]) {
      const source = readFileSync(join(__dirname, "..", "..", "src", "app", route, "route.ts"), "utf8");
      expect(source, route).toContain("getJsonStream");
      expect(source, route).not.toMatch(/content-encoding/i);
    }
  });
});
