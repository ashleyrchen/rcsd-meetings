#!/usr/bin/env node
/**
 * Integration test for RCSD MCP Server.
 *
 * Usage:
 *   node test.mjs                          # test production (mcp.rcsd.info)
 *   node test.mjs http://localhost:8799    # test local dev server
 */

const BASE = process.argv[2] || "https://mcp.rcsd.info";
const MCP = `${BASE}/mcp`;
const HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json, text/event-stream",
};

let passed = 0;
let failed = 0;

async function mcpCall(id, method, params = {}) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const text = await res.text();
  const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
  if (!dataLine) throw new Error(`No data in response: ${text.slice(0, 200)}`);
  return JSON.parse(dataLine.slice(5));
}

async function toolCall(name, args = {}) {
  const r = await mcpCall(Date.now(), "tools/call", { name, arguments: args });
  if (r.result?.isError) throw new Error(r.result.content[0].text);
  return r.result.content[0].text;
}

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// Most recent weekday (today if Mon-Fri, else last Friday).
// HealthePro only serves a rolling window of ~recent/upcoming menus, so
// a hardcoded past date will eventually 400.
function recentWeekday() {
  const d = new Date();
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Most recent Saturday — for weekend-behavior checks.
function recentSaturday() {
  const d = new Date();
  while (d.getDay() !== 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

// ---- Tests ----

console.log(`\nTesting MCP server at ${MCP}\n`);

// Protocol
console.log("Protocol:");
await test("initialize returns server info", async () => {
  const r = await mcpCall(1, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "rcsd-test", version: "1.0.0" },
  });
  assert(r.result.serverInfo.name === "RCSD Open Data", "wrong server name");
  assert(r.result.serverInfo.version === "1.0.0", "wrong version");
  assert(r.result.capabilities.tools, "missing tools capability");
});

await test("tools/list returns 10 tools", async () => {
  const r = await mcpCall(2, "tools/list");
  const names = r.result.tools.map((t) => t.name).sort();
  assert(names.length === 10, `expected 10 tools, got ${names.length}`);
  for (const expected of [
    "check-calendar",
    "get-lunch-menu",
    "get-meeting-details",
    "get-meeting-summary",
    "get-policy",
    "get-school-board-items",
    "get-sped-data",
    "list-policies",
    "list-schools",
    "query-school",
  ]) {
    assert(names.includes(expected), `missing tool: ${expected}`);
  }
});

// Tools
console.log("\nTools:");

await test("list-schools returns 12 schools", async () => {
  const text = await toolCall("list-schools");
  const lines = text.trim().split("\n");
  assert(lines.length === 12, `expected 12 lines, got ${lines.length}`);
  assert(text.includes("orion"), "missing orion");
  assert(text.includes("kennedy"), "missing kennedy");
});

await test("query-school by slug", async () => {
  const text = await toolCall("query-school", { school: "orion" });
  assert(text.includes("Orion Alternative School"), "missing full name");
  assert(text.includes("Winnie Chen"), "missing principal");
  assert(text.includes("TK-5"), "missing grades");
});

await test("query-school by name", async () => {
  const text = await toolCall("query-school", { school: "Roy Cloud" });
  assert(text.includes("roy-cloud"), "missing slug");
  assert(text.includes("TK-8"), "missing grades");
});

await test("query-school rejects unknown school", async () => {
  const r = await mcpCall(99, "tools/call", {
    name: "query-school",
    arguments: { school: "hogwarts" },
  });
  assert(r.result.isError === true, "should be an error");
  assert(r.result.content[0].text.includes("not found"), "missing error message");
});

await test("check-calendar identifies no-school day", async () => {
  const text = await toolCall("check-calendar", { date: "2026-03-13" });
  assert(text.includes("no-school"), "should be no-school");
  assert(text.includes("Lincoln"), "should mention Lincoln's Day");
});

await test("check-calendar identifies multi-day event", async () => {
  const text = await toolCall("check-calendar", { date: "2026-04-07" });
  assert(text.includes("Spring Break"), "should be Spring Break");
  assert(text.includes("2026-04-06"), "should show range start");
  assert(text.includes("2026-04-10"), "should show range end");
});

await test("check-calendar identifies regular school day", async () => {
  const text = await toolCall("check-calendar", { date: "2026-03-10" });
  assert(text.includes("Regular school day"), "should be regular day");
});

await test("check-calendar identifies weekend", async () => {
  const text = await toolCall("check-calendar", { date: "2026-03-14" });
  assert(text.includes("Weekend"), "should be weekend");
});

await test("get-lunch-menu returns menu items", async () => {
  const text = await toolCall("get-lunch-menu", {
    school: "orion",
    date: recentWeekday(),
  });
  assert(text.includes("Orion"), "should include school name");
  assert(text.includes("Lunch Entree") || text.includes("Entree"), "should have entree category");
});

await test("get-lunch-menu weekend returns no lunch", async () => {
  const text = await toolCall("get-lunch-menu", {
    school: "orion",
    date: recentSaturday(),
  });
  assert(text.includes("weekend"), "should say weekend");
});

await test("get-meeting-summary returns summaries", async () => {
  const text = await toolCall("get-meeting-summary", { limit: 2 });
  assert(text.includes("2026-"), "should have recent dates");
  assert(text.length > 100, "should have substantial content");
});

await test("get-meeting-summary by date", async () => {
  const text = await toolCall("get-meeting-summary", { date: "2026-03-11" });
  assert(text.includes("2026-03-11"), "should include the date");
});

await test("get-school-board-items returns items", async () => {
  const text = await toolCall("get-school-board-items", {
    school: "orion",
    limit: 3,
  });
  assert(text.includes("Orion"), "should mention Orion");
});

await test("get-sped-data for specific school", async () => {
  const text = await toolCall("get-sped-data", { school: "taft" });
  assert(text.includes("Taft"), "should mention Taft");
  assert(text.includes("IEP Students"), "should have IEP count");
  assert(text.includes("%"), "should have percentage");
});

await test("get-sped-data district-wide", async () => {
  const text = await toolCall("get-sped-data", {});
  assert(text.includes("District"), "should mention district");
  assert(text.includes("Per school"), "should list per-school data");
});

await test("list-policies returns policies", async () => {
  const text = await toolCall("list-policies", { query: "Philosophy" });
  assert(text.includes("Philosophy"), "should include Philosophy policy");
  assert(text.includes("0100"), "should have code 0100");
});

await test("get-policy returns rules and citations", async () => {
  const text = await toolCall("get-policy", { code: "0100", type: "BP" });
  assert(text.includes("Philosophy"), "should mention Philosophy");
  assert(text.includes("Legal & Resource Citations"), "should include citations header");
  assert(text.includes("Ed. Code 51002"), "should have Education Code reference");
});

// Landing page
console.log("\nLanding page:");
await test("/ returns info page", async () => {
  const res = await fetch(BASE);
  assert(res.ok, `HTTP ${res.status}`);
  const text = await res.text();
  assert(text.includes("RCSD Open Data MCP Server"), "missing title");
  assert(text.includes("list-schools"), "missing tool list");
});

// Summary
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
