import { test } from "node:test";
import assert from "node:assert/strict";
import { alice, guest } from "./_helpers.ts";
import {
  aadAudiences, canCreate, getUser, makeDevUser, makeGuestUser, meResponse, sessionCookie, signSession, verifyAadToken,
} from "../lib/server/auth.ts";
import { getEnv } from "../lib/server/env.ts";
import { sniffImage, readUpload } from "../lib/server/uploads.ts";
import { HttpError } from "../lib/server/errors.ts";

test("session cookie round trip", async () => {
  const token = await signSession(alice);
  const req = new Request("http://localhost/api/me", { headers: { cookie: `a=b; tp_session=${token}` } });
  const u = await getUser(req);
  assert.equal(u?.id, alice.id);
  assert.equal(u?.tenantId, alice.tenantId);
  assert.equal(await getUser(new Request("http://x/", { headers: { cookie: "tp_session=garbage" } })), null);
});

test("cookie attributes: SameSite=None; Secure on https, Lax on http", () => {
  const https = sessionCookie(new Request("http://x/", { headers: { "x-forwarded-proto": "https" } }), "t");
  assert.match(https, /tp_session=t/);
  assert.match(https, /HttpOnly/);
  assert.match(https, /SameSite=None/);
  assert.match(https, /Secure/);
  assert.match(https, /Max-Age=2592000/);
  const http = sessionCookie(new Request("http://x/"), "t");
  assert.match(http, /SameSite=Lax/);
  assert.doesNotMatch(http, /Secure/);
  assert.match(sessionCookie(new Request("http://x/"), null), /Max-Age=0/);
});

test("dev + guest users", () => {
  const d = makeDevUser({ name: " Ada  L ", email: "Ada.L@Example.com" });
  assert.deepEqual([d.id, d.kind, d.name, d.email, d.tenantId], ["dev_ada-l-example-com", "dev", "Ada L", "ada.l@example.com", "dev-org"]);
  assert.throws(() => makeDevUser({ name: "x", email: "nope" }), (e: unknown) => e instanceof HttpError && e.status === 400);
  const g = makeGuestUser({ name: "Guesty" });
  assert.match(g.id, /^guest_/);
  assert.equal(g.tenantId, null);
  assert.throws(() => makeGuestUser({ name: "  " }), (e: unknown) => e instanceof HttpError && e.status === 400);
});

test("canCreate + isAdmin + config", () => {
  assert.equal(canCreate(alice), true);
  assert.equal(canCreate(guest), false);
  assert.equal(canCreate(null), false);
  process.env.POLL_CREATORS = "admins";
  try {
    assert.equal(canCreate(alice), false);
    assert.equal(canCreate({ ...alice, email: "BOSS@example.com" }), true);
  } finally {
    process.env.POLL_CREATORS = "everyone";
  }
  const me = meResponse(null);
  assert.equal(me.config.authMode, "dev");
  assert.equal(me.config.clientId, null);
});

test("teams mode: dev sign-in disabled, dev sessions rejected, audiences, tenant lock", async () => {
  const devToken = await signSession(makeDevUser({ name: "D", email: "d@x.io" }));
  process.env.AZURE_CLIENT_ID = "abc-client";
  process.env.APP_BASE_URL = "https://polls.example.com";
  process.env.AZURE_TENANT_ID = "11111111-1111-1111-1111-111111111111";
  try {
    const env = getEnv();
    assert.throws(() => makeDevUser({ name: "D", email: "d@x.io" }), (e: unknown) => e instanceof HttpError && e.status === 403);
    assert.equal(await getUser(new Request("http://x/", { headers: { cookie: `tp_session=${devToken}` } })), null);
    assert.deepEqual(aadAudiences(env), ["api://polls.example.com/abc-client", "abc-client"]);
    // unsigned token from another tenant -> wrong_tenant before any network call
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const fake = `${b64({ alg: "RS256" })}.${b64({ tid: "22222222-2222-2222-2222-222222222222", oid: "x" })}.sig`;
    await assert.rejects(verifyAadToken(fake), (e: unknown) => e instanceof HttpError && e.code === "wrong_tenant");
    await assert.rejects(verifyAadToken("not-a-jwt-but-long-enough"), (e: unknown) => e instanceof HttpError && e.status === 401);
  } finally {
    process.env.AZURE_CLIENT_ID = "";
    process.env.APP_BASE_URL = "";
    process.env.AZURE_TENANT_ID = "";
  }
});

test("uploads: magic bytes and name validation", async () => {
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "png");
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpg");
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a")), "gif");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg></svg>")), null);
  assert.equal(await readUpload("../../package.json"), null);
  assert.equal(await readUpload("..%2f..%2fx.png"), null);
});

test("base URL: APP_BASE_URL, else Vercel production domain, else deployment URL, else localhost", () => {
  const keys = ["APP_BASE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;
  const saved = keys.map((k) => process.env[k]);
  try {
    for (const k of keys) process.env[k] = "";
    assert.equal(getEnv().baseUrl, "http://localhost:3200");
    process.env.VERCEL_URL = "pollyn-abc123.vercel.app";
    assert.equal(getEnv().baseUrl, "https://pollyn-abc123.vercel.app");
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "pollyn.vercel.app";
    assert.equal(getEnv().baseUrl, "https://pollyn.vercel.app");
    process.env.APP_BASE_URL = "https://polls.example.com/";
    assert.equal(getEnv().baseUrl, "https://polls.example.com");
  } finally {
    keys.forEach((k, i) => { process.env[k] = saved[i] ?? ""; });
  }
});
