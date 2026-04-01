import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GradescopeAPI } from "../gradescope-api.js";
import { parseRegradeRequests } from "../html-parser.js";

export function registerRegradeTools(server: McpServer, api: GradescopeAPI): void {
  server.tool(
    "list-regrade-requests",
    "List all regrade requests for a Gradescope assignment. Instructors see all requests; students see their own.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
      assignment_id: z.string().describe("The Gradescope assignment ID"),
    },
    async (args) => {
      try {
        const html = await api.fetchPage(
          `/courses/${args.course_id}/assignments/${args.assignment_id}/regrade_requests`
        );
        const requests = parseRegradeRequests(html);
        if (requests.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No regrade requests found for this assignment.",
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(requests, null, 2) }],
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
    "create-regrade-request",
    "Submit a regrade request for a specific question on your Gradescope submission. Provide an explanation of why you believe the grading should be changed.",
    {
      course_id: z.string().describe("The Gradescope course ID"),
      assignment_id: z.string().describe("The Gradescope assignment ID"),
      question_id: z
        .string()
        .describe("The question ID or number to request a regrade for"),
      explanation: z
        .string()
        .describe("Your explanation for why a regrade is warranted"),
    },
    async (args) => {
      try {
        // First visit the submission page to get context
        await api.fetchPage(
          `/courses/${args.course_id}/assignments/${args.assignment_id}/submissions`
        );

        const data: Record<string, string> = {
          "regrade_request[question_id]": args.question_id,
          "regrade_request[explanation]": args.explanation,
        };

        const result = await api.postForm(
          `/courses/${args.course_id}/assignments/${args.assignment_id}/regrade_requests`,
          data
        );

        if (result.status === 302 || result.status === 301) {
          return {
            content: [
              {
                type: "text",
                text: "Regrade request submitted successfully.",
              },
            ],
          };
        }

        if (result.status >= 200 && result.status < 300) {
          return {
            content: [
              {
                type: "text",
                text: `Regrade request submitted (status ${result.status}).`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Regrade request returned status ${result.status}. It may not have been created. Check Gradescope to confirm.`,
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
