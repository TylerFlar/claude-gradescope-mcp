import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GradescopeAPI } from "../gradescope-api.js";
import { parseCourseGrades } from "../html-parser.js";

export function registerGradeTools(server: McpServer, api: GradescopeAPI): void {
  server.tool(
    "get-course-grades",
    "Get all your grades for a Gradescope course. Shows scores for each assignment.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
    },
    async (args) => {
      try {
        const html = await api.fetchPage(`/courses/${args.course_id}/assignments`);
        const grades = parseCourseGrades(html);
        if (grades.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No grade data found. The course may have no graded assignments yet.",
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(grades, null, 2) }],
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
    "export-grades",
    "Export grades as CSV. For instructors: exports the full gradebook or per-assignment scores. Returns the CSV content as text.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
      assignment_id: z
        .string()
        .optional()
        .describe(
          "If provided, export grades for this specific assignment. Otherwise exports the full course gradebook."
        ),
    },
    async (args) => {
      try {
        let csvPath: string;
        if (args.assignment_id) {
          csvPath = `/courses/${args.course_id}/assignments/${args.assignment_id}/scores.csv`;
        } else {
          csvPath = `/courses/${args.course_id}/gradebook.csv`;
        }

        const { data, contentType } = await api.fetchRaw(csvPath);

        if (contentType.includes("text/html")) {
          return {
            content: [
              {
                type: "text",
                text: "CSV export not available. You may not have instructor access to this course, or the export URL may have changed.",
              },
            ],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: data.toString("utf-8") }],
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
