# Gradescope MCP Server

MCP server for accessing Gradescope from Claude Code. Supports courses, assignments, submissions, grades, roster, extensions, and regrade requests.

> **Note:** Gradescope has no official public API. This server uses session-based authentication (email/password) with reverse-engineered endpoints. HTML parsing may break if Gradescope changes their page structure.

## Setup

```bash
npm install
npm run build
```

## Configuration

Add to your Claude Code MCP settings (`~/.claude.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "gradescope": {
      "command": "node",
      "args": ["/path/to/claude-gradescope-mcp/dist/index.js"],
      "env": {
        "GRADESCOPE_EMAIL": "your-email@example.com",
        "GRADESCOPE_PASSWORD": "your-password"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list-courses` | List all enrolled courses with role |
| `get-course` | Get course details |
| `list-assignments` | List assignments with due dates and status |
| `get-assignment` | Get assignment details, instructions, rubric outline |
| `list-submissions` | List submissions (instructor: all students; student: own) |
| `get-submission` | Get submission detail with rubric feedback and comments |
| `submit-assignment` | Upload files to submit an assignment |
| `get-course-grades` | Get all grades for a course |
| `export-grades` | Export grades as CSV (instructor) |
| `list-roster` | List course members (instructor/TA) |
| `get-extensions` | View due date extensions (instructor/TA) |
| `set-extension` | Set a student's due date extension (instructor/TA) |
| `list-regrade-requests` | View regrade requests for an assignment |
| `create-regrade-request` | Submit a regrade request (student) |

## License

MIT
