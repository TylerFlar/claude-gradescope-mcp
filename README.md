# @tasque/gradescope-mcp

MCP server for Gradescope via reverse-engineered session-based API and HTML scraping.

> **Warning** — Gradescope has no official public API. This uses reverse-engineered endpoints that may break or violate their Terms of Service.

## Tools

| Tool | Description |
|------|-------------|
| `list-courses` | List all enrolled Gradescope courses |
| `get-course` | Get details for a specific course |
| `debug-page` | Fetch a Gradescope page and return raw HTML |
| `list-assignments` | List assignments for a course |
| `get-assignment` | Get detailed assignment info |
| `list-submissions` | List submissions for an assignment |
| `get-submission` | Get detailed submission with scores and rubric |
| `submit-assignment` | Upload and submit files to an assignment |
| `get-course-grades` | Get all grades for a course |
| `export-grades` | Export grades as CSV (instructor only) |
| `list-roster` | List course members (instructor/TA only) |
| `get-extensions` | View due date extensions (instructor/TA only) |
| `set-extension` | Set a student's due date extension (instructor/TA only) |
| `list-regrade-requests` | List regrade requests for an assignment |
| `create-regrade-request` | Submit a regrade request |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GRADESCOPE_EMAIL` | Yes | Gradescope account email |
| `GRADESCOPE_PASSWORD` | Yes | Gradescope account password |

## Auth Setup

Set both environment variables. The server authenticates via form-based login with CSRF token extraction. Sessions are maintained in memory and re-authenticated automatically on expiration.

## Development

```bash
npm install
npm run build
npm start        # stdio mode
```
