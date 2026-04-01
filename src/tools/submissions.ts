import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GradescopeAPI } from "../gradescope-api.js";
import { parseSubmissionList, parseSubmissionDetail } from "../html-parser.js";

export function registerSubmissionTools(server: McpServer, api: GradescopeAPI): void {
  server.tool(
    "list-submissions",
    "List all submissions for a Gradescope assignment. Instructor/TA view shows all student submissions with scores. Student view shows your own submissions.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
      assignment_id: z.string().describe("The Gradescope assignment ID"),
    },
    async (args) => {
      try {
        const html = await api.fetchPage(
          `/courses/${args.course_id}/assignments/${args.assignment_id}/submissions`
        );
        const submissions = parseSubmissionList(html);
        if (submissions.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No submissions found. This could mean no one has submitted yet, you don't have permission to view submissions, or the page structure has changed.",
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(submissions, null, 2) }],
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
    "get-submission",
    "Get detailed information about a specific submission, including scores per question, applied rubric items, and grader comments.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
      assignment_id: z.string().describe("The Gradescope assignment ID"),
      submission_id: z.string().describe("The Gradescope submission ID"),
    },
    async (args) => {
      try {
        const html = await api.fetchPage(
          `/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/${args.submission_id}`
        );
        const detail = parseSubmissionDetail(html);

        const result = {
          id: args.submission_id,
          assignmentId: args.assignment_id,
          courseId: args.course_id,
          url: `/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/${args.submission_id}`,
          ...detail,
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

  server.tool(
    "submit-assignment",
    "Upload and submit files to a Gradescope assignment. Provide absolute file paths to the files you want to submit.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
      assignment_id: z.string().describe("The Gradescope assignment ID"),
      file_paths: z
        .array(z.string())
        .min(1)
        .describe("Absolute paths to files to upload (e.g., PDF, code files, images)"),
    },
    async (args) => {
      try {
        // First, visit the submission page to get the form and fresh CSRF token
        await api.fetchPage(
          `/courses/${args.course_id}/assignments/${args.assignment_id}/submissions/new`
        );

        const result = await api.postMultipart(
          `/courses/${args.course_id}/assignments/${args.assignment_id}/submissions`,
          args.file_paths
        );

        if (result.status === 302 || result.status === 301) {
          return {
            content: [
              {
                type: "text",
                text: `Submission successful! Redirected to: ${result.location ?? "submission page"}`,
              },
            ],
          };
        }

        if (result.status >= 200 && result.status < 300) {
          return {
            content: [
              {
                type: "text",
                text: "Submission uploaded successfully.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Submission returned status ${result.status}. The upload may or may not have succeeded. Check Gradescope to confirm.`,
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
}
