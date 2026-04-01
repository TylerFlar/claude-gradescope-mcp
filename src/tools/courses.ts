import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GradescopeAPI } from "../gradescope-api.js";
import { parseDashboard } from "../html-parser.js";

export function registerCourseTools(server: McpServer, api: GradescopeAPI): void {
  server.tool(
    "list-courses",
    "List all Gradescope courses you are enrolled in, with course names, IDs, terms, and your role (student/instructor/TA).",
    {},
    async () => {
      try {
        const html = await api.fetchPage("/account");
        const courses = parseDashboard(html);
        if (courses.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No courses found. This could mean the account has no courses, or the Gradescope page structure has changed.",
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(courses, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "debug-page",
    "Fetch a Gradescope page and return a portion of its raw HTML for debugging. Use this to inspect the actual HTML structure.",
    {
      path: z.string().describe("The Gradescope URL path (e.g., /account, /courses/123/assignments)"),
      start: z.number().optional().describe("Start character index (default 0)"),
      length: z.number().optional().describe("Number of characters to return (default 5000)"),
    },
    async (args) => {
      try {
        const html = await api.fetchPage(args.path);
        const start = args.start ?? 0;
        const len = args.length ?? 5000;
        const snippet = html.substring(start, start + len);
        return {
          content: [
            {
              type: "text",
              text: `Total HTML length: ${html.length} chars\n\n--- HTML[${start}:${start + len}] ---\n${snippet}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-course",
    "Get details for a specific Gradescope course by its ID. Returns course page information.",
    {
      course_id: z.string().describe("The Gradescope course ID (numeric)"),
    },
    async (args) => {
      try {
        const html = await api.fetchPage(`/courses/${args.course_id}`);
        // Extract course-specific info from the page
        const { parse: parseHTML } = await import("node-html-parser");
        const root = parseHTML(html);

        const title =
          root.querySelector("h1, .courseHeader--title, [class*='course-name']")?.textContent?.trim() ?? "";
        const description =
          root.querySelector(".course-description, [class*='description']")?.textContent?.trim() ?? null;

        // Try to get staff/instructor list
        const staffEls = root.querySelectorAll(
          ".courseHeader--staff a, [class*='instructor'], [class*='staff']"
        );
        const staff = staffEls.map((el) => el.textContent?.trim()).filter(Boolean);

        const result = {
          id: args.course_id,
          title,
          description,
          staff,
          url: `/courses/${args.course_id}`,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
