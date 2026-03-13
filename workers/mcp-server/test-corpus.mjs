#!/usr/bin/env node
/**
 * Corpus test: 20 complex questions that should be answerable
 * by the RCSD MCP server, validated for correctness and completeness.
 *
 * Usage:
 *   node test-corpus.mjs                        # test production
 *   node test-corpus.mjs http://localhost:8787   # test local
 */

const BASE = process.argv[2] || "https://mcp.rcsd.info";
const MCP = `${BASE}/mcp`;
const HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json, text/event-stream",
};

let passed = 0;
let failed = 0;
const issues = [];

async function mcpCall(method, params = {}) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const text = await res.text();
  const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
  if (!dataLine) throw new Error(`No data in response`);
  return JSON.parse(dataLine.slice(5));
}

async function tool(name, args = {}) {
  const r = await mcpCall("tools/call", { name, arguments: args });
  if (r.result?.isError) throw new Error(r.result.content[0].text);
  return r.result.content[0].text;
}

// ---- Test harness ----

async function question(num, q, calls, validate) {
  const label = `Q${String(num).padStart(2, "0")}: ${q}`;
  try {
    const results = {};
    for (const [key, [toolName, args]] of Object.entries(calls)) {
      results[key] = await tool(toolName, args);
    }
    const problems = validate(results);
    if (problems.length === 0) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ ${label}`);
      for (const p of problems) {
        console.log(`      → ${p}`);
        issues.push({ q: num, question: q, issue: p });
      }
    }
  } catch (e) {
    failed++;
    console.log(`  ✗ ${label}`);
    console.log(`      → ERROR: ${e.message}`);
    issues.push({ q: num, question: q, issue: `ERROR: ${e.message}` });
  }
}

// ---- Corpus ----

console.log(`\nRCSD MCP Corpus Test — ${MCP}\n`);

// Initialize session
await mcpCall("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "corpus-test", version: "1.0.0" },
});

console.log("Questions:\n");

// 1. Cross-school comparison
await question(
  1,
  "Which RCSD school has the highest SpEd rate, and how does it compare to the district average?",
  {
    sped: ["get-sped-data", {}],
  },
  ({ sped }) => {
    const problems = [];
    if (!sped.includes("district average")) problems.push("Missing district average rate");
    if (!sped.includes("Total enrollment")) problems.push("Missing total enrollment for denominator");
    // Check all 12 schools are listed
    const schoolLines = sped.split("\n").filter((l) => l.match(/^\s+\w.*:\s+\d+\s+\/\s+\d+/));
    if (schoolLines.length !== 12) problems.push(`Expected 12 schools in per-school list, got ${schoolLines.length}`);
    // Check percentages are present for comparison
    if (!sped.includes("25.5%")) problems.push("Missing Taft's 25.5% (highest rate)");
    return problems;
  }
);

// 2. Multi-day calendar awareness
await question(
  2,
  "My family is planning a trip March 9-16, 2026. How many school days will my child miss?",
  {
    mon: ["check-calendar", { date: "2026-03-09" }],
    tue: ["check-calendar", { date: "2026-03-10" }],
    wed: ["check-calendar", { date: "2026-03-11" }],
    thu: ["check-calendar", { date: "2026-03-12" }],
    fri: ["check-calendar", { date: "2026-03-13" }],
    sat: ["check-calendar", { date: "2026-03-14" }],
    sun: ["check-calendar", { date: "2026-03-15" }],
    mon2: ["check-calendar", { date: "2026-03-16" }],
  },
  (r) => {
    const problems = [];
    // Mar 9 = Mon regular, 10 = Tue regular, 11 = Wed board meeting (school day),
    // 12 = Thu regular, 13 = Fri Lincoln's Day (no school),
    // 14 = Sat weekend, 15 = Sun weekend, 16 = Mon no school (planning day)
    if (!r.mon.includes("Regular")) problems.push("Mar 9 should be regular school day");
    if (!r.tue.includes("Regular")) problems.push("Mar 10 should be regular school day");
    if (!r.wed.includes("Board Meeting")) problems.push("Mar 11 should show board meeting");
    if (!r.thu.includes("Regular")) problems.push("Mar 12 should be regular school day");
    if (!r.fri.includes("no-school") || !r.fri.includes("Lincoln")) problems.push("Mar 13 should be Lincoln's Day no-school");
    if (!r.sat.includes("Weekend")) problems.push("Mar 14 should be weekend");
    if (!r.sun.includes("Weekend")) problems.push("Mar 15 should be weekend");
    if (!r.mon2.includes("no-school")) problems.push("Mar 16 should be no-school (planning day)");
    return problems;
  }
);

// 3. School comparison for choice decision
await question(
  3,
  "We're choosing between Orion and North Star for our 4th grader. Compare their enrollment, programs, and start times.",
  {
    orion: ["query-school", { school: "orion" }],
    ns: ["query-school", { school: "north-star" }],
  },
  ({ orion, ns }) => {
    const problems = [];
    if (!orion.includes("Enrollment:")) problems.push("Orion missing enrollment");
    if (!orion.includes("Program:")) problems.push("Orion missing program info");
    if (!orion.includes("Bell Schedule:")) problems.push("Orion missing bell schedule");
    if (!ns.includes("Enrollment:")) problems.push("North Star missing enrollment");
    if (!ns.includes("3-8")) problems.push("North Star missing grade range (should be 3-8)");
    if (!ns.includes("Bell Schedule:")) problems.push("North Star missing bell schedule");
    // Verify Orion goes TK-5 (4th grader fits) and NS goes 3-8 (also fits)
    if (!orion.includes("TK-5")) problems.push("Orion should show TK-5 grades");
    return problems;
  }
);

// 4. Lunch menu on a holiday
await question(
  4,
  "What's for lunch at Kennedy on March 13, 2026?",
  {
    cal: ["check-calendar", { date: "2026-03-13" }],
    lunch: ["get-lunch-menu", { school: "kennedy", date: "2026-03-13" }],
  },
  ({ cal, lunch }) => {
    const problems = [];
    if (!cal.includes("no-school")) problems.push("Calendar should show no-school");
    // Lunch should return no menu or school-closed message
    if (!lunch.includes("No menu") && !lunch.includes("holiday") && !lunch.includes("not be available") && !lunch.includes("closed") && !lunch.includes("No school lunch"))
      problems.push("Lunch should indicate no menu available on a no-school day");
    return problems;
  }
);

// 5. SpEd comparison between two schools
await question(
  5,
  "How does the special education inclusion rate at Hoover compare to Clifford? What percentage of IEP students are in regular classrooms >80% of the time?",
  {
    hoover: ["get-sped-data", { school: "hoover" }],
    clifford: ["get-sped-data", { school: "clifford" }],
  },
  ({ hoover, clifford }) => {
    const problems = [];
    if (!hoover.includes("LRE Placement")) problems.push("Hoover missing LRE placement data");
    if (!hoover.includes("Regular class >80%")) problems.push("Hoover missing >80% regular class stat");
    if (!clifford.includes("LRE Placement")) problems.push("Clifford missing LRE placement data");
    if (!clifford.includes("Regular class >80%")) problems.push("Clifford missing >80% regular class stat");
    // Both should have percentage for comparison
    const hooverMatch = hoover.match(/Regular class >80%:\s+(\d+)\s+\((\d+)%\)/);
    const cliffordMatch = clifford.match(/Regular class >80%:\s+(\d+)\s+\((\d+)%\)/);
    if (!hooverMatch) problems.push("Hoover: can't parse >80% count and percentage");
    if (!cliffordMatch) problems.push("Clifford: can't parse >80% count and percentage");
    return problems;
  }
);

// 6. Board meeting context for a specific school
await question(
  6,
  "What has the school board discussed about Roosevelt in the last year?",
  {
    items: ["get-school-board-items", { school: "roosevelt", limit: 20 }],
  },
  ({ items }) => {
    const problems = [];
    if (!items.includes("Roosevelt")) problems.push("Should mention Roosevelt");
    if (!items.includes("2026-")) problems.push("Should have recent 2026 items");
    // Should have at least a few items
    const dateMatches = items.match(/\d{4}-\d{2}-\d{2}:/g);
    if (!dateMatches || dateMatches.length < 2) problems.push(`Expected multiple board items, found ${dateMatches?.length || 0}`);
    return problems;
  }
);

// 7. Practical parent question: early release
await question(
  7,
  "What time does Garfield release on early release Wednesdays vs. regular days?",
  {
    school: ["query-school", { school: "garfield" }],
  },
  ({ school }) => {
    const problems = [];
    if (!school.includes("Bell Schedule:")) problems.push("Missing bell schedule");
    if (!school.includes("early release")) problems.push("Missing early release info");
    // Should show both regular and early release schedules with grade breakdowns
    if (!school.includes("Regular days")) problems.push("Missing regular days schedule");
    if (!school.includes("Thursday early release")) problems.push("Missing Thursday early release schedule");
    // Should have parseable times
    const hasRegularTime = school.match(/\d+:\d+ [AP]M\s+[–-]\s+\d+:\d+ [AP]M/);
    if (!hasRegularTime) problems.push("Can't parse regular schedule times");
    const hasDismissal = school.match(/dismissal\s+\d+:\d+ [AP]M/);
    if (!hasDismissal) problems.push("Can't parse early release dismissal times");
    return problems;
  }
);

// 8. Community school question
await question(
  8,
  "Which RCSD schools are community schools?",
  {
    schools: ["list-schools", {}],
    // Need to check individual schools since list doesn't show community school status
    adelante: ["query-school", { school: "adelante-selby" }],
    hoover: ["query-school", { school: "hoover" }],
    garfield: ["query-school", { school: "garfield" }],
  },
  ({ adelante, hoover, garfield }) => {
    const problems = [];
    if (!adelante.includes("Community School: Yes")) problems.push("Adelante Selby should be a community school");
    if (!hoover.includes("Community School: Yes")) problems.push("Hoover should be a community school");
    if (!garfield.includes("Community School: Yes")) problems.push("Garfield should be a community school");
    return problems;
  }
);

// 9. PTO funding comparison
await question(
  9,
  "How much PTO funding does Orion raise vs. Taft? What's the per-pupil difference?",
  {
    orion: ["query-school", { school: "orion" }],
    taft: ["query-school", { school: "taft" }],
  },
  ({ orion, taft }) => {
    const problems = [];
    if (!orion.includes("PTO:")) problems.push("Orion missing PTO info");
    if (!orion.includes("revenue")) problems.push("Orion missing revenue figure");
    // Check enrollment is present for per-pupil calculation
    if (!orion.includes("Enrollment:")) problems.push("Orion missing enrollment for per-pupil calc");
    if (!taft.includes("Enrollment:")) problems.push("Taft missing enrollment for per-pupil calc");
    // Taft has no PTO — RCEF supports schools without one. Verify this is clearly stated.
    if (!taft.includes("PTO:") && !taft.includes("No PTO") && !taft.includes("RCEF"))
      problems.push("Taft should either show PTO info or indicate it has no PTO");
    return problems;
  }
);

// 10. Spring break planning
await question(
  10,
  "When is spring break 2026, and is there school the Monday after?",
  {
    break_start: ["check-calendar", { date: "2026-04-06" }],
    break_end: ["check-calendar", { date: "2026-04-10" }],
    monday_after: ["check-calendar", { date: "2026-04-13" }],
  },
  ({ break_start, break_end, monday_after }) => {
    const problems = [];
    if (!break_start.includes("Spring Break")) problems.push("Apr 6 should be Spring Break");
    if (!break_end.includes("Spring Break")) problems.push("Apr 10 should still be Spring Break");
    if (!monday_after.includes("Regular school day")) problems.push("Apr 13 should be regular school day");
    return problems;
  }
);

// 11. Middle school options
await question(
  11,
  "What middle school options exist in RCSD? Compare Kennedy, McKinley, and North Star.",
  {
    kennedy: ["query-school", { school: "kennedy" }],
    mckinley: ["query-school", { school: "mckinley-mit" }],
    ns: ["query-school", { school: "north-star" }],
  },
  ({ kennedy, mckinley, ns }) => {
    const problems = [];
    // Kennedy should be 6-8 neighborhood
    if (!kennedy.includes("6-8")) problems.push("Kennedy should be 6-8");
    if (!kennedy.includes("neighborhood")) problems.push("Kennedy should be neighborhood");
    // McKinley should be 6-8 choice
    if (!mckinley.includes("6-8")) problems.push("McKinley should be 6-8");
    if (!mckinley.includes("choice")) problems.push("McKinley should be choice");
    // North Star should be 3-8 choice
    if (!ns.includes("3-8")) problems.push("North Star should be 3-8");
    if (!ns.includes("choice")) problems.push("North Star should be choice");
    return problems;
  }
);

// 12. Lunch menu comparison across schools on same day
await question(
  12,
  "Do all RCSD schools serve the same lunch? Compare Orion and Taft on March 12.",
  {
    orion: ["get-lunch-menu", { school: "orion", date: "2026-03-12" }],
    taft: ["get-lunch-menu", { school: "taft", date: "2026-03-12" }],
  },
  ({ orion, taft }) => {
    const problems = [];
    if (!orion.includes("Orion")) problems.push("Orion menu should include school name");
    if (!taft.includes("Taft")) problems.push("Taft menu should include school name");
    if (!orion.includes("Entree")) problems.push("Orion missing entree category");
    if (!taft.includes("Entree")) problems.push("Taft missing entree category");
    return problems;
  }
);

// 13. High-need school identification
await question(
  13,
  "Which RCSD schools have the highest percentage of high-need students?",
  {
    // Need individual school data since list-schools doesn't show high-need %
    hoover: ["query-school", { school: "hoover" }],
    garfield: ["query-school", { school: "garfield" }],
    taft: ["query-school", { school: "taft" }],
    ns: ["query-school", { school: "north-star" }],
  },
  ({ hoover, garfield, taft, ns }) => {
    const problems = [];
    for (const [name, data] of [["Hoover", hoover], ["Garfield", garfield], ["Taft", taft], ["North Star", ns]]) {
      if (!data.includes("High-Need:")) problems.push(`${name} missing High-Need percentage`);
    }
    // Verify relative ordering makes sense (Hoover/Garfield high, North Star low)
    const hooverPct = parseInt(hoover.match(/High-Need:\s+(\d+)%/)?.[1] || "0");
    const nsPct = parseInt(ns.match(/High-Need:\s+(\d+)%/)?.[1] || "100");
    if (hooverPct <= nsPct) problems.push(`Hoover (${hooverPct}%) should be higher need than North Star (${nsPct}%)`);
    return problems;
  }
);

// 14. Recent board meeting details
await question(
  14,
  "What was discussed at the most recent RCSD board meeting? Were there any school presentations?",
  {
    recent: ["get-meeting-summary", { limit: 1 }],
  },
  ({ recent }) => {
    const problems = [];
    if (!recent.includes("2026-")) problems.push("Should have a recent 2026 date");
    if (recent.length < 50) problems.push("Summary seems too short to be useful");
    // The most recent meeting (2026-03-11) had school presentations
    if (recent.includes("2026-03-11") && !recent.toLowerCase().includes("presentation"))
      problems.push("March 11 meeting had school presentations but summary doesn't mention them");
    return problems;
  }
);

// 15. Measure E / parcel tax
await question(
  15,
  "Has the board discussed a parcel tax recently? What are the details?",
  {
    meetings: ["get-meeting-summary", { limit: 10 }],
  },
  ({ meetings }) => {
    const problems = [];
    // The Feb 26 meeting was about Measure E parcel tax
    if (!meetings.toLowerCase().includes("parcel tax") && !meetings.includes("Measure E"))
      problems.push("Recent meetings should include Measure E parcel tax discussion");
    return problems;
  }
);

// 16. School contact info for enrollment
await question(
  16,
  "I want to enroll my child at Henry Ford. What's the school's phone number, address, and who's the principal?",
  {
    school: ["query-school", { school: "henry-ford" }],
  },
  ({ school }) => {
    const problems = [];
    if (!school.includes("Phone:")) problems.push("Missing phone number");
    if (!school.includes("Address:")) problems.push("Missing address");
    if (!school.includes("Principal:")) problems.push("Missing principal name");
    if (!school.includes("Website:")) problems.push("Missing website for enrollment info");
    // Verify specific data
    if (!school.includes("(650)")) problems.push("Phone should be a 650 area code number");
    if (!school.includes("Redwood City")) problems.push("Address should be in Redwood City");
    return problems;
  }
);

// 17. End of year planning
await question(
  17,
  "When is the last day of school for 2025-26? Are there any early release days in the final week?",
  {
    lastDay: ["check-calendar", { date: "2026-06-05" }],
    thu: ["check-calendar", { date: "2026-06-04" }],
    wed: ["check-calendar", { date: "2026-06-03" }],
  },
  ({ lastDay, thu, wed }) => {
    const problems = [];
    if (!lastDay.includes("Last Day")) problems.push("June 5 should be Last Day of School");
    // Verify the days before are identifiable
    if (!thu.includes("Regular") && !thu.includes("early") && !thu.includes("Last"))
      problems.push("June 4 should be categorizable (regular, early release, or event)");
    return problems;
  }
);

// 18. SpEd grade distribution
await question(
  18,
  "Are there more IEP students in upper grades at Kennedy than lower grades across the district?",
  {
    kennedy: ["get-sped-data", { school: "kennedy" }],
    district: ["get-sped-data", {}],
  },
  ({ kennedy, district }) => {
    const problems = [];
    // Kennedy is 6-8 so should have grade breakdown
    if (!kennedy.includes("By grade:")) problems.push("Kennedy missing per-grade IEP breakdown");
    if (!district.includes("By grade:")) problems.push("District missing per-grade IEP breakdown");
    // Verify grade numbers are parseable
    const districtGrades = district.match(/By grade:\s+(.*)/);
    if (!districtGrades) problems.push("Can't parse district grade distribution");
    else {
      const gradeStr = districtGrades[1];
      if (!gradeStr.includes("6:") || !gradeStr.includes("7:") || !gradeStr.includes("8:"))
        problems.push("District grade data missing middle school grades 6-8");
      if (!gradeStr.includes("1:") || !gradeStr.includes("2:"))
        problems.push("District grade data missing elementary grades");
    }
    return problems;
  }
);

// 19. Parent platform discovery
await question(
  19,
  "Does Roy Cloud use Konstella or ParentSquare? How do I connect with other parents?",
  {
    school: ["query-school", { school: "roy-cloud" }],
  },
  ({ school }) => {
    const problems = [];
    if (!school.includes("Parent Platform:")) problems.push("Missing parent platform info");
    if (!school.includes("PTO:")) problems.push("Missing PTO info for parent connection");
    return problems;
  }
);

// 20. Board meeting timeline for a school's HVAC project
await question(
  20,
  "Has the board discussed any construction or facilities projects at Orion or Clifford?",
  {
    orion: ["get-school-board-items", { school: "orion", limit: 15 }],
    clifford: ["get-school-board-items", { school: "clifford", limit: 15 }],
  },
  ({ orion, clifford }) => {
    const problems = [];
    // There should be at least some items for these schools
    const orionDates = orion.match(/\d{4}-\d{2}-\d{2}:/g);
    const cliffordDates = clifford.match(/\d{4}-\d{2}-\d{2}:/g);
    if (!orionDates || orionDates.length === 0) problems.push("No board items found for Orion");
    if (!cliffordDates || cliffordDates.length === 0) problems.push("No board items found for Clifford");
    // The HVAC Phase 2 item should show up for one of them
    const combined = orion + clifford;
    if (!combined.toLowerCase().includes("hvac") && !combined.toLowerCase().includes("construction") && !combined.toLowerCase().includes("facilities") && !combined.toLowerCase().includes("lease-leaseback") && !combined.toLowerCase().includes("blach"))
      problems.push("Expected facilities/construction items in board summaries but found none");
    return problems;
  }
);

// ---- Batch 2: Deep-dive questions (21-40) ----

console.log("\nBatch 2 — Schema deep-dives:\n");

// 21. Per-grade bell schedule: specific pickup time
await question(
  21,
  "What time do I pick up my kindergartner at Orion on a Thursday?",
  {
    school: ["query-school", { school: "orion" }],
  },
  ({ school }) => {
    const problems = [];
    if (!school.includes("Thursday early release")) problems.push("Missing Thursday early release section");
    // K Thursday dismissal at Orion is 1:00 PM
    if (!school.includes("K:") || !school.match(/K:.*1:00 PM/)) problems.push("Missing K Thursday dismissal (should be 1:00 PM)");
    return problems;
  }
);

// 22. Bell schedule comparison across schools for same grade
await question(
  22,
  "My TK kid could go to Taft or Henry Ford. Which has the later regular dismissal?",
  {
    taft: ["query-school", { school: "taft" }],
    hf: ["query-school", { school: "henry-ford" }],
  },
  ({ taft, hf }) => {
    const problems = [];
    // Both should have TK regular schedule
    const taftTk = taft.match(/TK:.*?(\d+:\d+ [AP]M)\s+[–-]\s+(\d+:\d+ [AP]M)/);
    const hfTk = hf.match(/TK:.*?(\d+:\d+ [AP]M)\s+[–-]\s+(\d+:\d+ [AP]M)/);
    if (!taftTk) problems.push("Taft missing TK regular schedule");
    if (!hfTk) problems.push("Henry Ford missing TK regular schedule");
    // Both should be 1:30 PM for TK
    if (taftTk && !taftTk[2].includes("1:30")) problems.push(`Taft TK end should be 1:30 PM, got ${taftTk[2]}`);
    if (hfTk && !hfTk[2].includes("1:30")) problems.push(`Henry Ford TK end should be 1:30 PM, got ${hfTk[2]}`);
    return problems;
  }
);

// 23. Super-minimum day awareness
await question(
  23,
  "Does Clifford have super-minimum days? What time does a 6th grader get out?",
  {
    school: ["query-school", { school: "clifford" }],
  },
  ({ school }) => {
    const problems = [];
    if (!school.includes("Super-minimum")) problems.push("Missing super-minimum section");
    if (!school.includes("no lunch served")) problems.push("Should note no lunch on super-min days");
    // Clifford super-min is 11:45 AM for all grades
    if (!school.match(/TK-8.*11:45 AM/)) problems.push("Clifford super-min should be 11:45 AM for TK-8");
    return problems;
  }
);

// 24. Schools without super-minimum data
await question(
  24,
  "Does Garfield publish super-minimum day times?",
  {
    school: ["query-school", { school: "garfield" }],
  },
  ({ school }) => {
    const problems = [];
    // Garfield has no super-minimum data — should NOT have a super-minimum section
    if (school.includes("Super-minimum")) problems.push("Garfield should not have super-minimum data (not published)");
    // But should still have regular and early release
    if (!school.includes("Regular days")) problems.push("Missing regular days schedule");
    if (!school.includes("Thursday early release")) problems.push("Missing early release schedule");
    return problems;
  }
);

// 25. Staggered start times
await question(
  25,
  "At Adelante Selby, do all grades start at the same time?",
  {
    school: ["query-school", { school: "adelante-selby" }],
  },
  ({ school }) => {
    const problems = [];
    // Adelante has staggered starts: TK 8:28, K 8:18, 1st 8:13, 2-3 8:08, 4-5 8:03
    const starts = school.match(/\d+:\d+ AM/g);
    if (!starts) problems.push("Can't find start times");
    const uniqueStarts = new Set(starts);
    if (uniqueStarts.size < 3) problems.push("Should show multiple different start times (staggered schedule)");
    if (!school.includes("8:03 AM")) problems.push("Missing 4-5 grade start of 8:03 AM");
    if (!school.includes("8:28 AM")) problems.push("Missing TK start of 8:28 AM");
    return problems;
  }
);

// 26. Community school + high-need correlation
await question(
  26,
  "Are all community schools also high-need? Which community schools have the lowest high-need percentage?",
  {
    adelante: ["query-school", { school: "adelante-selby" }],
    garfield: ["query-school", { school: "garfield" }],
    henry: ["query-school", { school: "henry-ford" }],
    hoover: ["query-school", { school: "hoover" }],
    kennedy: ["query-school", { school: "kennedy" }],
    mckinley: ["query-school", { school: "mckinley-mit" }],
    roosevelt: ["query-school", { school: "roosevelt" }],
    taft: ["query-school", { school: "taft" }],
  },
  (r) => {
    const problems = [];
    // All 8 should show Community School: Yes
    for (const [name, data] of Object.entries(r)) {
      if (!data.includes("Community School: Yes")) problems.push(`${name} should be community school`);
      if (!data.includes("High-Need:")) problems.push(`${name} missing High-Need`);
    }
    // Clifford is NOT a community school — verify it's not in our set
    // Adelante has lowest high-need at 65% among community schools
    const adelantePct = parseInt(r.adelante.match(/High-Need:\s+(\d+)%/)?.[1] || "0");
    if (adelantePct !== 65) problems.push(`Adelante high-need should be 65%, got ${adelantePct}%`);
    return problems;
  }
);

// 27. PTO compliance status comparison
await question(
  27,
  "Which RCSD PTOs have compliance issues with the CA Registry of Charitable Trusts?",
  {
    clifford: ["query-school", { school: "clifford" }],
    henry: ["query-school", { school: "henry-ford" }],
    orion: ["query-school", { school: "orion" }],
    kennedy: ["query-school", { school: "kennedy" }],
  },
  ({ clifford, henry, orion, kennedy }) => {
    const problems = [];
    // Clifford PTO has delinquency-notice, Henry Ford has missing-documents
    // But MCP output only shows revenue, not RCT status — so this tests whether
    // PTO data is rich enough for compliance questions
    if (!clifford.includes("PTO:")) problems.push("Clifford missing PTO info");
    if (!henry.includes("PTO:")) problems.push("Henry Ford missing PTO info");
    if (!orion.includes("PTO:")) problems.push("Orion missing PTO info");
    if (!kennedy.includes("PTO:")) problems.push("Kennedy missing PTO info");
    return problems;
  }
);

// 28. SpEd disability category breakdown (district only)
await question(
  28,
  "What are the most common disability categories in RCSD special education?",
  {
    district: ["get-sped-data", {}],
  },
  ({ district }) => {
    const problems = [];
    // District SpEd data should include aggregate numbers
    if (!district.includes("Total IEP students")) problems.push("Missing total IEP count");
    if (!district.includes("district average")) problems.push("Missing district average percentage");
    // Per-school should be listed
    if (!district.includes("Per school")) problems.push("Missing per-school breakdown");
    return problems;
  }
);

// 29. SpEd LRE placement comparison
await question(
  29,
  "What percentage of Orion's IEP students spend >80% of their day in regular classrooms vs Kennedy?",
  {
    orion: ["get-sped-data", { school: "orion" }],
    kennedy: ["get-sped-data", { school: "kennedy" }],
  },
  ({ orion, kennedy }) => {
    const problems = [];
    if (!orion.includes("LRE Placement")) problems.push("Orion missing LRE placement");
    if (!kennedy.includes("LRE Placement")) problems.push("Kennedy missing LRE placement");
    const orionPct = orion.match(/Regular class >80%:\s+\d+\s+\((\d+)%\)/);
    const kennedyPct = kennedy.match(/Regular class >80%:\s+\d+\s+\((\d+)%\)/);
    if (!orionPct) problems.push("Can't parse Orion >80% percentage");
    if (!kennedyPct) problems.push("Can't parse Kennedy >80% percentage");
    return problems;
  }
);

// 30. Separate school placement count
await question(
  30,
  "How many RCSD students with IEPs are placed in separate schools rather than regular classrooms?",
  {
    orion: ["get-sped-data", { school: "orion" }],
    hoover: ["get-sped-data", { school: "hoover" }],
  },
  ({ orion, hoover }) => {
    const problems = [];
    // Should show separate school placement count
    if (!orion.includes("Separate school:")) problems.push("Orion missing separate school placement");
    if (!hoover.includes("Separate school:")) problems.push("Hoover missing separate school placement");
    return problems;
  }
);

// 31. Calendar: early-release week details
await question(
  31,
  "When is parent-teacher conference week in 2025-26? Is it the whole week or just a few days?",
  {
    start: ["check-calendar", { date: "2025-09-15" }],
    end: ["check-calendar", { date: "2025-09-19" }],
    before: ["check-calendar", { date: "2025-09-12" }],
  },
  ({ start, end, before }) => {
    const problems = [];
    if (!start.includes("Parent Teacher Conference")) problems.push("Sep 15 should be PT conference week");
    if (!end.includes("Parent Teacher Conference")) problems.push("Sep 19 should be PT conference week");
    if (!start.includes("early-release")) problems.push("Conference week should be early-release type");
    // Should show date range
    if (!start.includes("2025-09-15") || !start.includes("2025-09-19")) problems.push("Should show full date range");
    // Day before should be regular
    if (!before.includes("Regular")) problems.push("Sep 12 should be regular day");
    return problems;
  }
);

// 32. Calendar: 2026-27 school year start
await question(
  32,
  "When does the 2026-27 school year start?",
  {
    firstDay: ["check-calendar", { date: "2026-08-12" }],
    dayBefore: ["check-calendar", { date: "2026-08-11" }],
  },
  ({ firstDay, dayBefore }) => {
    const problems = [];
    if (!firstDay.includes("First Day")) problems.push("Aug 12, 2026 should be first day of 2026-27");
    if (!firstDay.includes("2026-27")) problems.push("Should reference 2026-27 school year");
    // Day before should be outside school year
    if (dayBefore.includes("Regular") || dayBefore.includes("First Day"))
      problems.push("Aug 11 should NOT be a school day");
    return problems;
  }
);

// 33. Summer date: lunch tool should say no school
await question(
  33,
  "What's for lunch at Roy Cloud on July 15, 2026?",
  {
    lunch: ["get-lunch-menu", { school: "roy-cloud", date: "2026-07-15" }],
  },
  ({ lunch }) => {
    const problems = [];
    if (!lunch.includes("not in session")) problems.push("Should say school is not in session during summer");
    return problems;
  }
);

// 34. Lunch on a no-school teacher training day (not a holiday)
await question(
  34,
  "Can my kid get lunch at Taft on the September 29, 2025 planning day?",
  {
    cal: ["check-calendar", { date: "2025-09-29" }],
    lunch: ["get-lunch-menu", { school: "taft", date: "2025-09-29" }],
  },
  ({ cal, lunch }) => {
    const problems = [];
    if (!cal.includes("Planning")) problems.push("Sep 29 should be planning day");
    if (!cal.includes("no-school")) problems.push("Planning day should be no-school type");
    if (!lunch.includes("closed") && !lunch.includes("No school lunch"))
      problems.push("Should say no lunch — school is closed on planning day");
    return problems;
  }
);

// 35. School with Mandarin program and booster org
await question(
  35,
  "Does Orion have any fundraising organizations beyond its PTO?",
  {
    school: ["query-school", { school: "orion" }],
  },
  ({ school }) => {
    const problems = [];
    if (!school.includes("Starship Orion")) problems.push("Missing PTO name (Starship Orion)");
    // The MCP server currently doesn't expose miBooster — this tests a data gap
    // It's OK if it only shows PTO; the data exists but may not be formatted
    if (!school.includes("PTO:")) problems.push("Missing PTO section");
    return problems;
  }
);

// 36. TK-8 school: middle school vs elementary schedule difference
await question(
  36,
  "At Roy Cloud, do middle schoolers and elementary students have different dismissal times?",
  {
    school: ["query-school", { school: "roy-cloud" }],
  },
  ({ school }) => {
    const problems = [];
    // Roy Cloud: TK 1:30, K 1:45, 1-2 2:25, 3 2:25, 4-5 2:50, 6-8 2:50
    // So 4-5 and 6-8 have same time, but K and lower are earlier
    if (!school.match(/TK:.*1:30 PM/)) problems.push("Missing TK dismissal (1:30 PM)");
    if (!school.match(/6-8:.*2:50 PM/)) problems.push("Missing 6-8 dismissal (2:50 PM)");
    // Thursday: all grades at 12:50 PM (uniform)
    if (!school.match(/TK-8:.*12:50 PM/)) problems.push("Thursday should be uniform 12:50 PM for all grades");
    return problems;
  }
);

// 37. Supervision/drop-off time
await question(
  37,
  "What's the earliest I can drop off my kid at Roy Cloud?",
  {
    school: ["query-school", { school: "roy-cloud" }],
  },
  ({ school }) => {
    const problems = [];
    if (!school.includes("Supervision starts: 8:00 AM"))
      problems.push("Should show supervision starts at 8:00 AM");
    return problems;
  }
);

// 38. Board items across multiple schools in same agenda item
await question(
  38,
  "Has the board approved safety plans for all schools at once, or individually?",
  {
    orion: ["get-school-board-items", { school: "orion", limit: 20 }],
    taft: ["get-school-board-items", { school: "taft", limit: 20 }],
  },
  ({ orion, taft }) => {
    const problems = [];
    // The CSSP item from 2026-02-04 should appear for both schools
    const orionHasSafety = orion.toLowerCase().includes("safety");
    const taftHasSafety = taft.toLowerCase().includes("safety");
    if (!orionHasSafety) problems.push("Orion should have safety plan board item");
    if (!taftHasSafety) problems.push("Taft should have safety plan board item");
    // Both should show the same date
    if (orionHasSafety && taftHasSafety) {
      const orionDate = orion.match(/(\d{4}-\d{2}-\d{2}):.*?[Ss]afety/)?.[1];
      const taftDate = taft.match(/(\d{4}-\d{2}-\d{2}):.*?[Ss]afety/)?.[1];
      if (orionDate && taftDate && orionDate !== taftDate)
        problems.push(`Safety plans approved on different dates: Orion ${orionDate}, Taft ${taftDate}`);
    }
    return problems;
  }
);

// 39. SpEd per-grade: are there IEP students in every grade?
await question(
  39,
  "Does the district have IEP students in every grade level from TK through 8th?",
  {
    district: ["get-sped-data", {}],
  },
  ({ district }) => {
    const problems = [];
    if (!district.includes("By grade:")) problems.push("Missing grade breakdown");
    // Check that TK through 8 are all present
    for (const grade of ["TK:", "K:", "1:", "2:", "3:", "4:", "5:", "6:", "7:", "8:"]) {
      if (!district.includes(grade)) problems.push(`Missing grade ${grade} in district data`);
    }
    return problems;
  }
);

// 40. Multiple meeting summaries with date filtering
await question(
  40,
  "What was discussed at the February 2026 board meetings? Were there any special meetings?",
  {
    feb4: ["get-meeting-summary", { date: "2026-02-04" }],
    feb26: ["get-meeting-summary", { date: "2026-02-26" }],
  },
  ({ feb4, feb26 }) => {
    const problems = [];
    if (!feb4.includes("2026-02-04")) problems.push("Missing Feb 4 meeting");
    if (!feb26.includes("2026-02-26")) problems.push("Missing Feb 26 meeting");
    // Both should have substantive content
    if (feb4.length < 50) problems.push("Feb 4 summary too short");
    if (feb26.length < 50) problems.push("Feb 26 summary too short");
    return problems;
  }
);

// ---- Summary ----

const total = passed + failed;
console.log(`\n${"─".repeat(60)}`);
console.log(`${passed} passed, ${failed} failed out of ${total} questions\n`);

if (issues.length > 0) {
  console.log("Issues found:\n");
  for (const { q, question: qText, issue } of issues) {
    console.log(`  Q${String(q).padStart(2, "0")}: ${issue}`);
    console.log(`      (${qText})\n`);
  }
}

process.exit(failed > 0 ? 1 : 0);
