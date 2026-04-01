import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GradescopeAPI } from "../gradescope-api.js";
import { parseRoster } from "../html-parser.js";

export function registerRosterTools(server: McpServer, api: GradescopeAPI): void {
  server.tool(
    "list-roster",
    "List all members (students, instructors, TAs) in a Gradescope course. Requires instructor or TA access.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
    },
    async (args) => {
      try {
        const html = await api.fetchPage(`/courses/${args.course_id}/memberships`);
        const roster = parseRoster(html);
        if (roster.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No roster entries found. You may not have permission to view the roster, or the page structure has changed.",
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(roster, null, 2) }],
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
