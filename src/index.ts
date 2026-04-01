#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GradescopeAPI } from "./gradescope-api.js";

import { registerCourseTools } from "./tools/courses.js";
import { registerAssignmentTools } from "./tools/assignments.js";
import { registerSubmissionTools } from "./tools/submissions.js";
import { registerGradeTools } from "./tools/grades.js";
import { registerRosterTools } from "./tools/roster.js";
import { registerExtensionTools } from "./tools/extensions.js";
import { registerRegradeTools } from "./tools/regrade-requests.js";

const email = process.env.GRADESCOPE_EMAIL;
const password = process.env.GRADESCOPE_PASSWORD;

if (!email || !password) {
  console.error(
    "Error: GRADESCOPE_EMAIL and GRADESCOPE_PASSWORD environment variables are required.\n" +
      "Set them to your Gradescope login credentials."
  );
  process.exit(1);
}

const api = new GradescopeAPI(email, password);

const server = new McpServer({
  name: "gradescope-mcp",
  version: "1.0.0",
});

registerCourseTools(server, api);
registerAssignmentTools(server, api);
registerSubmissionTools(server, api);
registerGradeTools(server, api);
registerRosterTools(server, api);
registerExtensionTools(server, api);
registerRegradeTools(server, api);

const transport = new StdioServerTransport();
await server.connect(transport);
