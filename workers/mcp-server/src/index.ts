/**
 * RCSD Open Data MCP Server
 *
 * Remote MCP server on Cloudflare Workers providing access to
 * Redwood City School District data. Public, no auth required.
 *
 * Tools:
 *   list-schools        — List all 12 RCSD schools
 *   query-school        — Detailed info for a specific school
 *   check-calendar      — Is there school on a given date?
 *   get-lunch-menu      — Live lunch menu from HealthePro API
 *   get-meeting-summary — Board meeting summaries
 *   get-school-board-items — Board items for a specific school
 *   get-sped-data       — Special education stats
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";

const DATA_BASE = "https://data.rcsd.info/json";

// ---- Data fetching with caching ----

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchJSON(path: string): Promise<any> {
  const now = Date.now();
  const cached = cache.get(path);
  if (cached && cached.expires > now) return cached.data;

  const res = await fetch(`${DATA_BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const data = await res.json();
  cache.set(path, { data, expires: now + CACHE_TTL });
  return data;
}

// ---- Helper: find a school by slug or name ----

function findSchool(schools: any[], query: string) {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  return schools.find(
    (s: any) =>
      s.slug.replace(/-/g, "") === q ||
      s.nameShort.toLowerCase().replace(/[^a-z0-9]/g, "") === q ||
      s.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(q)
  );
}

// ---- Helper: format school info ----

function formatSchool(s: any): string {
  const lines = [
    s.name,
    `  Slug: ${s.slug}`,
    `  Grades: ${s.grades} | Type: ${s.type}${s.program ? ` | Program: ${s.program}` : ""}`,
    `  Enrollment: ${s.enrollment} | High-Need: ${s.highNeedPct}%`,
    `  Principal: ${s.principal}`,
    `  Address: ${s.address}`,
    `  Phone: ${s.phone}`,
    `  Website: ${s.website}`,
    `  Bell Schedule: ${s.bellSchedule.start} – ${s.bellSchedule.end} (early release: ${s.bellSchedule.earlyRelease})`,
    `  Lunch Menu: ${s.lunchUrl}`,
    `  Community School: ${s.communitySchool ? "Yes" : "No"}`,
    `  CDS Code: ${s.cdsCode}`,
  ];
  if (s.parentLinks) {
    lines.push(`  Parent Platform: ${s.parentLinks.platform}`);
  }
  if (s.pto) {
    lines.push(
      `  PTO: ${s.pto.name} — $${s.pto.revenue?.toLocaleString() || "?"} revenue (${s.pto.revenueFY})`
    );
  } else {
    lines.push("  PTO: None — school is supported by RCEF (Redwood City Education Foundation)");
  }
  return lines.join("\n");
}

// ---- Helper: parse HealthePro menu ID from lunch URL ----

function parseMenuId(lunchUrl: string): number | null {
  const match = lunchUrl.match(/menus\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// ---- Server factory (create per-request to prevent cross-client leakage) ----

function createServer(): McpServer {
  const server = new McpServer({
    name: "RCSD Open Data",
    version: "1.0.0",
    description: "Public data for the Redwood City School District — schools, calendars, lunch menus, board meetings, demographics, and special education",
    icons: [
      {
        src: "https://data.rcsd.info/logos/district.jpg",
        mimeType: "image/jpeg",
      },
    ],
  });

  // ---- list-schools ----
  server.tool(
    "list-schools",
    "List all 12 RCSD schools with key info (name, grades, type, enrollment)",
    {},
    async () => {
      const data = await fetchJSON("schools.json");
      const lines = data.schools.map(
        (s: any) =>
          `${s.slug.padEnd(16)} ${s.nameShort.padEnd(20)} ${s.grades.padEnd(6)} ${s.type.padEnd(14)} ${s.enrollment} students`
      );
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );

  // ---- query-school ----
  server.tool(
    "query-school",
    "Get detailed information about a specific RCSD school by name or slug",
    { school: z.string().describe("School name or slug (e.g. 'orion', 'Roy Cloud', 'kennedy')") },
    async ({ school }) => {
      const data = await fetchJSON("schools.json");
      const found = findSchool(data.schools, school);
      if (!found) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `School not found: "${school}". Available: ${data.schools.map((s: any) => s.slug).join(", ")}`,
            },
          ],
        };
      }
      return { content: [{ type: "text", text: formatSchool(found) }] };
    }
  );

  // ---- check-calendar ----
  server.tool(
    "check-calendar",
    "Check if there is school on a given date, or what event falls on that date",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { isError: true, content: [{ type: "text", text: "Date must be YYYY-MM-DD format" }] };
      }

      const calendars = await Promise.all([
        fetchJSON("district-calendar-2025-26.json"),
        fetchJSON("district-calendar-2026-27.json"),
      ]);

      // Check for matching event
      for (const cal of calendars) {
        for (const evt of cal.events) {
          const start = evt.date;
          const end = evt.dateEnd || evt.date;
          if (date >= start && date <= end) {
            const range = evt.dateEnd ? ` (${start} to ${end})` : "";
            return {
              content: [{ type: "text", text: `${date}: ${evt.en} (${evt.type})${range}` }],
            };
          }
        }
      }

      // Check if within school year
      for (const cal of calendars) {
        const first = cal.events.find((e: any) => e.en.includes("First Day"));
        const last = cal.events.find((e: any) => e.en.includes("Last Day"));
        if (first && last && date >= first.date && date <= last.date) {
          const dayOfWeek = new Date(date + "T12:00:00").getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            return { content: [{ type: "text", text: `${date}: Weekend — no school` }] };
          }
          return {
            content: [{ type: "text", text: `${date}: Regular school day (${cal.schoolYear})` }],
          };
        }
      }

      return { content: [{ type: "text", text: `${date}: Not within a school year calendar range` }] };
    }
  );

  // ---- get-lunch-menu ----
  server.tool(
    "get-lunch-menu",
    "Get the lunch menu for a school on a specific date (fetches live from HealthePro)",
    {
      school: z.string().describe("School name or slug"),
      date: z.string().describe("Date in YYYY-MM-DD format"),
    },
    async ({ school, date }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { isError: true, content: [{ type: "text", text: "Date must be YYYY-MM-DD format" }] };
      }

      // Check if this is a no-school day before fetching menu
      const dayOfWeek = new Date(date + "T12:00:00").getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return { content: [{ type: "text", text: `${date} is a weekend — no school lunch.` }] };
      }
      try {
        const calendars = await Promise.all([
          fetchJSON("district-calendar-2025-26.json"),
          fetchJSON("district-calendar-2026-27.json"),
        ]);
        // Check no-school days (holidays, teacher training, planning days, breaks)
        for (const cal of calendars) {
          for (const evt of cal.events) {
            if (evt.type === "no-school") {
              const start = evt.date;
              const end = evt.dateEnd || evt.date;
              if (date >= start && date <= end) {
                return {
                  content: [{ type: "text", text: `No school lunch on ${date} — ${evt.en}. School is closed.` }],
                };
              }
            }
            // Super-minimum / minimum days: students dismissed before lunch
            if (evt.type === "minimum-day" || evt.type === "super-minimum") {
              const start = evt.date;
              const end = evt.dateEnd || evt.date;
              if (date >= start && date <= end) {
                return {
                  content: [{ type: "text", text: `No school lunch on ${date} — ${evt.en}. Students are dismissed before lunch on super-minimum days.` }],
                };
              }
            }
          }
        }
        // Check if date falls outside school year (summer, pre-session)
        let withinSchoolYear = false;
        for (const cal of calendars) {
          const first = cal.events.find((e: any) => e.en.includes("First Day"));
          const last = cal.events.find((e: any) => e.en.includes("Last Day"));
          if (first && last && date >= first.date && date <= last.date) {
            withinSchoolYear = true;
            break;
          }
        }
        if (!withinSchoolYear) {
          return {
            content: [{ type: "text", text: `No school lunch on ${date} — school is not in session.` }],
          };
        }
      } catch {
        // Calendar check failed — proceed with menu fetch anyway
      }

      const data = await fetchJSON("schools.json");
      const found = findSchool(data.schools, school);
      if (!found) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `School not found: "${school}". Available: ${data.schools.map((s: any) => s.slug).join(", ")}`,
            },
          ],
        };
      }

      const menuId = parseMenuId(found.lunchUrl);
      if (!menuId) {
        return {
          isError: true,
          content: [{ type: "text", text: `Could not parse menu URL for ${found.nameShort}` }],
        };
      }

      const [year, monthStr] = date.split("-");
      const month = parseInt(monthStr);
      const url = `https://menus.healthepro.com/api/organizations/1184/menus/${menuId}/year/${year}/month/${month}/date_overwrites`;

      const res = await fetch(url);
      if (!res.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `HealthePro API returned ${res.status}` }],
        };
      }

      const json: any = await res.json();
      const days = json.data || [];
      const dayData = days.find((d: any) => d.day === date);

      if (!dayData) {
        const dayOfWeek = new Date(date + "T12:00:00").getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return { content: [{ type: "text", text: `${date} is a weekend — no school lunch.` }] };
        }
        return {
          content: [
            {
              type: "text",
              text: `No menu published for ${found.nameShort} on ${date}. The menu may not be available yet or it may be a holiday.`,
            },
          ],
        };
      }

      const setting = JSON.parse(dayData.setting);
      const items = setting.current_display || [];
      const lines: string[] = [`${found.nameShort} Lunch — ${date}`];
      for (const item of items) {
        if (item.type === "category") {
          lines.push(`  [${item.name}]`);
        } else if (item.type === "recipe") {
          lines.push(`    ${item.name}`);
        }
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ---- get-meeting-summary ----
  server.tool(
    "get-meeting-summary",
    "Get board meeting summaries. Returns the most recent meetings or a specific date.",
    {
      date: z
        .string()
        .optional()
        .describe("Specific meeting date (YYYY-MM-DD), or omit for recent meetings"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(5)
        .optional()
        .describe("Number of recent meetings to return (default 5)"),
    },
    async ({ date, limit }) => {
      const summaries = await fetchJSON("meeting-summaries.json");
      const dates = Object.keys(summaries).sort().reverse();

      if (date) {
        const summary = summaries[date];
        if (!summary) {
          const nearest = dates.slice(0, 5).join(", ");
          return {
            content: [
              {
                type: "text",
                text: `No meeting summary for ${date}. Recent meetings: ${nearest}`,
              },
            ],
          };
        }
        return { content: [{ type: "text", text: `Board Meeting ${date}:\n${summary}` }] };
      }

      const count = limit || 5;
      const lines = dates.slice(0, count).map((d) => `${d}: ${summaries[d]}`);
      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    }
  );

  // ---- get-school-board-items ----
  server.tool(
    "get-school-board-items",
    "Get board agenda items related to a specific school",
    {
      school: z.string().describe("School name or slug"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .optional()
        .describe("Max items to return (default 10)"),
    },
    async ({ school, limit }) => {
      const data = await fetchJSON("schools.json");
      const found = findSchool(data.schools, school);
      if (!found) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `School not found: "${school}". Available: ${data.schools.map((s: any) => s.slug).join(", ")}`,
            },
          ],
        };
      }

      const summaries = await fetchJSON("school-board-summaries.json");
      const entries: { date: string; title: string; summary: string }[] = [];

      for (const [key, schools] of Object.entries(summaries)) {
        const schoolData = (schools as Record<string, any>)[found.slug];
        if (schoolData) {
          const [date, ...titleParts] = key.split("|");
          entries.push({
            date,
            title: titleParts.join("|"),
            summary: schoolData.en,
          });
        }
      }

      entries.sort((a, b) => b.date.localeCompare(a.date));
      const count = limit || 10;
      const result = entries.slice(0, count);

      if (result.length === 0) {
        return {
          content: [
            { type: "text", text: `No school-specific board items found for ${found.nameShort}` },
          ],
        };
      }

      const lines = result.map((m) => `${m.date}: ${m.title}\n  ${m.summary}`);
      return {
        content: [
          { type: "text", text: `Board items for ${found.nameShort}:\n\n${lines.join("\n\n")}` },
        ],
      };
    }
  );

  // ---- get-sped-data ----
  server.tool(
    "get-sped-data",
    "Get special education (IEP) enrollment data for a school or district-wide",
    {
      school: z
        .string()
        .optional()
        .describe("School name or slug (omit for district-wide totals)"),
    },
    async ({ school }) => {
      const [sped, cats] = await Promise.all([
        fetchJSON("sped-enrollment.json"),
        fetchJSON("sped-categories.json"),
      ]);

      if (!school) {
        // District-wide
        const d = sped.district;
        const schoolsData = await fetchJSON("schools.json");
        const totalEnrollment = schoolsData.schools.reduce((sum: number, s: any) => sum + s.enrollment, 0);
        const districtPct = ((d.total / totalEnrollment) * 100).toFixed(1);
        const lines = [
          `RCSD District Special Education (${sped._source.year})`,
          `  Total enrollment: ${totalEnrollment.toLocaleString()}`,
          `  Total IEP students: ${d.total} (${districtPct}% district average)`,
          `  By grade: ${Object.entries(d.grades)
            .map(([g, n]) => `${g}: ${n}`)
            .join(", ")}`,
          "",
          "Per school:",
        ];
        for (const [slug, data] of Object.entries(sped.schools) as [string, any][]) {
          lines.push(`  ${slug}: ${data.total} / ${data.totalEnrollment} students (${data.pct}%)`);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      const schoolsData = await fetchJSON("schools.json");
      const found = findSchool(schoolsData.schools, school);
      if (!found) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `School not found: "${school}". Available: ${schoolsData.schools.map((s: any) => s.slug).join(", ")}`,
            },
          ],
        };
      }

      const schoolSped = sped.schools[found.slug];
      if (!schoolSped) {
        return { content: [{ type: "text", text: `No SpEd data available for ${found.nameShort}` }] };
      }

      const lines = [
        `${found.name} — Special Education (${sped._source.year})`,
        `  IEP Students: ${schoolSped.total} / ${schoolSped.totalEnrollment} (${schoolSped.pct}%)`,
      ];

      if (schoolSped.grades) {
        lines.push(
          `  By grade: ${Object.entries(schoolSped.grades)
            .map(([g, n]) => `${g}: ${n}`)
            .join(", ")}`
        );
      }

      const schoolCats = cats.schools?.[found.slug];
      if (schoolCats?.placement) {
        const p = schoolCats.placement;
        lines.push(
          "",
          "  LRE Placement:",
          `    Regular class >80%: ${p.regularGt80} (${Math.round((p.regularGt80 / p.total) * 100)}%)`,
          `    Regular class 40-79%: ${p.regular40to79}`,
          `    Regular class <40%: ${p.regularLt40}`,
          `    Separate school: ${p.separateSchool}`
        );
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  return server;
}

// ---- Worker entry point ----

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Serve MCP at /mcp
    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      const server = createServer();
      return createMcpHandler(server)(request, env, ctx);
    }

    // Landing page
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        `RCSD Open Data MCP Server

Connect this MCP server to Claude Desktop, claude.ai, VS Code, Cursor, or any MCP client.

Endpoint: ${url.origin}/mcp

Tools available:
  list-schools         — List all 12 RCSD schools
  query-school         — Detailed school info by name or slug
  check-calendar       — Is there school on a given date?
  get-lunch-menu       — Live lunch menu from HealthePro
  get-meeting-summary  — Board meeting summaries
  get-school-board-items — Board items for a specific school
  get-sped-data        — Special education enrollment data

Data source: https://rcsd.info
GitHub: https://github.com/dweekly/rcsd-meetings
`,
        {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }
      );
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler;
