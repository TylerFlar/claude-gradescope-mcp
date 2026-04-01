import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GradescopeAPI } from "../gradescope-api.js";
import { parseExtensions } from "../html-parser.js";

export function registerExtensionTools(server: McpServer, api: GradescopeAPI): void {
  server.tool(
    "get-extensions",
    "View all due date extensions for a Gradescope assignment. Requires instructor or TA access.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
      assignment_id: z.string().describe("The Gradescope assignment ID"),
    },
    async (args) => {
      try {
        const html = await api.fetchPage(
          `/courses/${args.course_id}/assignments/${args.assignment_id}/extensions`
        );
        const extensions = parseExtensions(html);
        if (extensions.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No extensions found for this assignment.",
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(extensions, null, 2) }],
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
    "set-extension",
    "Set or update a due date extension for a student on a Gradescope assignment. Requires instructor or TA access.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
      assignment_id: z.string().describe("The Gradescope assignment ID"),
      student_email: z.string().describe("The student's email address"),
      due_date: z
        .string()
        .describe("New due date (e.g., '2025-04-15 23:59' or ISO 8601 format)"),
      late_due_date: z
        .string()
        .optional()
        .describe("Optional late due date for the extension"),
    },
    async (args) => {
      try {
        // Gradescope extension endpoints may vary. Try the common patterns.
        const data: Record<string, string> = {
          "extension[student_email]": args.student_email,
          "extension[due_date]": args.due_date,
        };
        if (args.late_due_date) {
          data["extension[late_due_date]"] = args.late_due_date;
        }

        const result = await api.postForm(
          `/courses/${args.course_id}/assignments/${args.assignment_id}/extensions`,
          data
        );

        if (result.status === 302 || result.status === 301) {
          return {
            content: [
              {
                type: "text",
                text: `Extension set successfully for ${args.student_email}. New due date: ${args.due_date}`,
              },
            ],
          };
        }

        if (result.status >= 200 && result.status < 300) {
          return {
            content: [
              {
                type: "text",
                text: `Extension request completed (status ${result.status}) for ${args.student_email}.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Extension request returned status ${result.status}. The extension may not have been set. Check Gradescope to confirm.`,
            },
          ],
          isError: true,
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
