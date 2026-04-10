# gradescope-mcp

MCP server for integrating [Gradescope](https://www.gradescope.com) with Claude Code / Claude Desktop, providing programmatic access to courses, assignments, submissions, grades, rosters, extensions, and regrade requests.

> **⚠️ Disclaimer** — Gradescope has no official public API. This server uses session-based authentication with reverse-engineered endpoints and HTML scraping. It may break if Gradescope changes their page structure, and usage may violate Gradescope's Terms of Service.

## Architecture

The server communicates with Claude via **stdio** transport using the Model Context Protocol SDK. Authentication is handled by posting email/password credentials to Gradescope's login form with CSRF token extraction — sessions are maintained via in-memory cookie storage with automatic re-authentication on expiration. Internally, a `GradescopeAPI` class wraps all HTTP interactions with `fetch`, and a separate HTML parser module (`node-html-parser`) extracts structured data from Gradescope's server-rendered pages.

## Prerequisites

- Node.js >= 18
- A Gradescope account (email and password)

## Setup

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GRADESCOPE_EMAIL` | Yes | Your Gradescope account email address |
| `GRADESCOPE_PASSWORD` | Yes | Your Gradescope account password |

### 3. MCP Client Configuration

Add to `~/.claude.json` or `.mcp.json` (Claude Code), or `claude_desktop_config.json` (Claude Desktop):

```json
{
  "mcpServers": {
    "gradescope": {
      "command": "node",
      "args": ["/absolute/path/to/claude-gradescope-mcp/dist/index.js"],
      "env": {
        "GRADESCOPE_EMAIL": "your-email@example.com",
        "GRADESCOPE_PASSWORD": "your-password"
      }
    }
  }
}
```

## Tools Reference

### Courses (3 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list-courses` | _(none)_ | List all Gradescope courses you are enrolled in, with course names, IDs, terms, and your role (student/instructor/TA) |
| `get-course` | `course_id: string` | Get details for a specific course including title, description, and staff list |
| `debug-page` | `path: string, start?: number, length?: number` | Fetch a Gradescope page and return raw HTML for debugging |

### Assignments (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list-assignments` | `course_id: string` | List all assignments for a course with names, due dates, submission status, and scores |
| `get-assignment` | `course_id: string, assignment_id: string` | Get detailed assignment info including instructions, point values, and question outline |

### Submissions (3 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list-submissions` | `course_id: string, assignment_id: string` | List submissions for an assignment. Instructors see all students; students see their own |
| `get-submission` | `course_id: string, assignment_id: string, submission_id: string` | Get detailed submission with scores per question, applied rubric items, and grader comments |
| `submit-assignment` | `course_id: string, assignment_id: string, file_paths: string[]` | Upload and submit files to an assignment (absolute paths to PDFs, code files, images) |

### Grades (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get-course-grades` | `course_id: string` | Get all your grades for a course with scores for each assignment |
| `export-grades` | `course_id: string, assignment_id?: string` | Export grades as CSV. Omit `assignment_id` for full gradebook. Requires instructor access |

### Roster (1 tool)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list-roster` | `course_id: string` | List all members (students, instructors, TAs) in a course. Requires instructor/TA access |

### Extensions (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get-extensions` | `course_id: string, assignment_id: string` | View all due date extensions for an assignment. Requires instructor/TA access |
| `set-extension` | `course_id: string, assignment_id: string, student_email: string, due_date: string, late_due_date?: string` | Set or update a student's due date extension. Requires instructor/TA access |

### Regrade Requests (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list-regrade-requests` | `course_id: string, assignment_id: string` | List regrade requests for an assignment. Instructors see all; students see their own |
| `create-regrade-request` | `course_id: string, assignment_id: string, question_id: string, explanation: string` | Submit a regrade request for a specific question with an explanation |

## Internal API Layer

### `GradescopeAPI`

- **Purpose**: Wraps all HTTP communication with Gradescope, handling authentication, session management, CSRF tokens, and request throttling.
- **Auth flow**: Fetches `/login` to extract CSRF token from `<meta name="csrf-token">` → POSTs email/password with CSRF token → follows redirect → stores session cookies in memory. Automatically re-authenticates when a login redirect (302/301 to `/login`) is detected.
- **Key methods**:
  - `fetchPage(path: string): Promise<string>` — GET HTML page with session handling
  - `fetchJSON<T>(path: string): Promise<T>` — GET JSON endpoint
  - `fetchRaw(path: string): Promise<{data: Buffer, contentType: string}>` — GET binary data
  - `postForm(path: string, data: Record<string, string>): Promise<Response>` — POST URL-encoded form data with CSRF token
  - `postJSON<T>(path: string, body: unknown): Promise<T>` — POST JSON
  - `putJSON<T>(path: string, body: unknown): Promise<T>` — PUT JSON
  - `patchJSON<T>(path: string, body: unknown): Promise<T>` — PATCH JSON
  - `postMultipart(path: string, formData: FormData): Promise<Response>` — POST multipart form (file uploads)
- **Rate limiting**: Enforces a minimum 1-second interval between requests.
- **Error handling**: Throws native `Error` with descriptive messages including HTTP status codes. No custom error classes — errors include response body context when available.

## Data Models

Defined in [`src/types.ts`](src/types.ts):

```typescript
interface GradescopeCourse {
  id: string;
  name: string;
  shortName: string;
  term: string;
  role: "student" | "instructor" | "ta" | "unknown";
  url: string;
}

interface GradescopeAssignment {
  id: string;
  name: string;
  type: string;
  dueDate: string | null;
  lateDueDate: string | null;
  released: boolean;
  submissionStatus: string | null;
  pointsPossible: number | null;
  pointsAwarded: number | null;
  url: string;
}

interface GradescopeAssignmentDetail extends GradescopeAssignment {
  instructions: string | null;
  totalPoints: number | null;
  submissionType: string | null;
  groupSubmission: boolean;
  questions: GradescopeQuestionOutline[];
}

interface GradescopeQuestionOutline {
  name: string;
  maxScore: number | null;
}

interface GradescopeSubmission {
  id: string;
  studentName: string | null;
  studentEmail: string | null;
  score: number | null;
  maxScore: number | null;
  status: string;
  submittedAt: string | null;
  lateness: string | null;
  url: string;
}

interface GradescopeSubmissionDetail extends GradescopeSubmission {
  questions: GradescopeQuestionResult[];
}

interface GradescopeQuestionResult {
  name: string;
  score: number | null;
  maxScore: number | null;
  rubricItems: GradescopeRubricItem[];
  comments: string[];
}

interface GradescopeRubricItem {
  description: string;
  points: number;
  applied: boolean;
}

interface GradescopeRosterEntry {
  name: string;
  email: string;
  role: string;
  sections: string[];
  studentId: string | null;
}

interface GradescopeExtension {
  studentName: string;
  studentEmail: string;
  dueDate: string;
  lateDueDate: string | null;
}

interface GradescopeRegradeRequest {
  id: string;
  studentName: string;
  questionName: string;
  status: string;
  explanation: string;
  response: string | null;
  createdAt: string;
  url: string;
}

interface GradescopeGradeEntry {
  assignmentName: string;
  assignmentId: string;
  score: number | null;
  maxScore: number | null;
  status: string;
}
```

## Development

```bash
npm run dev    # Watch mode (tsc --watch)
npm run build  # Production build (tsc)
npm start      # Run built server (node dist/index.js)
```

## Security Considerations

- **Credential storage**: Email and password are passed as environment variables and held in process memory. They are never written to disk by the server.
- **Session tokens**: Session cookies and CSRF tokens are stored in memory only — they do not persist across restarts.
- **Data access**: The server can access any Gradescope data your account has permissions for, including student submissions, grades, and roster information (PII).
- **Rate limiting**: Requests are throttled to 1 per second to avoid triggering Gradescope rate limits.
- **No official API**: This uses reverse-engineered endpoints and HTML scraping. Gradescope could change their markup at any time, breaking functionality.

## License

MIT — see [LICENSE](LICENSE) for details.
