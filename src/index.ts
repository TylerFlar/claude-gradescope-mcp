#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

if (process.env.MCP_TRANSPORT === "http") {
  const { default: express } = await import("express");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const crypto = await import("crypto");

  const app = express();
  app.use(express.json());

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.all("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "GET") {
      const transport = transports.get(sessionId!);
      if (!transport) { res.status(404).send("Session not found"); return; }
      await transport.handleRequest(req, res);
    } else if (req.method === "POST") {
      if (!sessionId) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => { transports.set(id, transport); },
        });
        transport.onclose = () => {
          if (transport.sessionId) transports.delete(transport.sessionId);
        };
        try { await server.close(); } catch {} await server.connect(transport);
        await transport.handleRequest(req, res);
      } else {
        const transport = transports.get(sessionId);
        if (!transport) { res.status(404).send("Session not found"); return; }
        await transport.handleRequest(req, res);
      }
    } else if (req.method === "DELETE") {
      const transport = transports.get(sessionId!);
      if (transport) { await transport.close(); transports.delete(sessionId!); }
      res.status(200).send();
    } else {
      res.status(405).send("Method not allowed");
    }
  });

  const PORT = parseInt(process.env.MCP_PORT || "3100");
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MCP server listening on http://0.0.0.0:${PORT}/mcp`);
  });
} else {
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const transport = new StdioServerTransport();
  try { await server.close(); } catch {} await server.connect(transport);
}
