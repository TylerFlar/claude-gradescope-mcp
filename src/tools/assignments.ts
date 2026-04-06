import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GradescopeAPI } from "../gradescope-api.js";
import { parseAssignmentList, parseAssignmentDetail } from "../html-parser.js";

export function registerAssignmentTools(server: McpServer, api: GradescopeAPI): void {
  server.tool(
    "list-assignments",
    "List all assignments for a Gradescope course. Shows assignment names, due dates, submission status, and scores.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
    },
    async (args) => {
      try {
        // Instructor view lives at /courses/ID/assignments; student view lives
        // on the course dashboard /courses/ID. Try the instructor URL first,
        // then fall back to the dashboard for student-enrolled courses.
        let html = await api.fetchPage(`/courses/${args.course_id}/assignments`);
        let assignments = parseAssignmentList(html);
        if (assignments.length === 0) {
          html = await api.fetchPage(`/courses/${args.course_id}`);
          assignments = parseAssignmentList(html);
        }
        if (assignments.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No assignments found for this course. The course may have no assignments, or the page structure may have changed.",
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(assignments, null, 2) }],
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
    "get-assignment",
    "Get detailed information about a specific Gradescope assignment, including instructions, point values, and question outline.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
      assignment_id: z.string().describe("The Gradescope assignment ID"),
    },
    async (args) => {
      try {
        const html = await api.fetchPage(
          `/courses/${args.course_id}/assignments/${args.assignment_id}`
        );

        // Get basic info from the assignment list parser first
        let listHtml = await api.fetchPage(`/courses/${args.course_id}/assignments`);
        let allAssignments = parseAssignmentList(listHtml);
        if (allAssignments.length === 0) {
          listHtml = await api.fetchPage(`/courses/${args.course_id}`);
          allAssignments = parseAssignmentList(listHtml);
        }
        const baseInfo = allAssignments.find((a) => a.id === args.assignment_id);

        // Get detailed info from the assignment page
        const detail = parseAssignmentDetail(html);

        const result = {
          id: args.assignment_id,
          courseId: args.course_id,
          name: baseInfo?.name ?? "",
          type: baseInfo?.type ?? "unknown",
          dueDate: baseInfo?.dueDate ?? null,
          lateDueDate: baseInfo?.lateDueDate ?? null,
          released: baseInfo?.released ?? true,
          submissionStatus: baseInfo?.submissionStatus ?? null,
          pointsPossible: baseInfo?.pointsPossible ?? detail.totalPoints ?? null,
          pointsAwarded: baseInfo?.pointsAwarded ?? null,
          url: `/courses/${args.course_id}/assignments/${args.assignment_id}`,
          instructions: detail.instructions,
          totalPoints: detail.totalPoints,
          submissionType: detail.submissionType,
          groupSubmission: detail.groupSubmission,
          questions: detail.questions,
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
