import { parse as parseHTML, type HTMLElement } from "node-html-parser";
import type {
  GradescopeCourse,
  GradescopeAssignment,
  GradescopeAssignmentDetail,
  GradescopeSubmission,
  GradescopeSubmissionDetail,
  GradescopeQuestionResult,
  GradescopeRubricItem,
  GradescopeRosterEntry,
  GradescopeExtension,
  GradescopeRegradeRequest,
  GradescopeGradeEntry,
  GradescopeQuestionOutline,
} from "./types.js";

function textContent(el: HTMLElement | null): string {
  return el?.textContent?.trim() ?? "";
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function extractCSRFToken(html: string): string | null {
  const root = parseHTML(html);
  const meta = root.querySelector('meta[name="csrf-token"]');
  if (meta) return meta.getAttribute("content") ?? null;
  const input = root.querySelector('input[name="authenticity_token"]');
  if (input) return input.getAttribute("value") ?? null;
  return null;
}

export function parseDashboard(html: string): GradescopeCourse[] {
  const root = parseHTML(html);
  const courses: GradescopeCourse[] = [];

  // Gradescope dashboard structure:
  //   <h2 class="pageHeading">Instructor Courses</h2>
  //   <div class="courseList">
  //     <div class="courseList--term">Summer 2025</div>
  //     <div class="courseList--coursesForTerm">
  //       <a class="courseBox" href="/courses/123">  <-- the card IS the <a> tag
  //         <h3 class="courseBox--shortname">CSE101</h3>
  //         <div class="courseBox--name">Full Name</div>
  //       </a>
  //     </div>
  //   </div>
  //   <h2 class="pageHeading">Student Courses</h2>
  //   ...

  // First, build a map of courseList divs to their role based on preceding h2
  const accountShow = root.querySelector("#account-show") ?? root;
  const headings = accountShow.querySelectorAll("h2.pageHeading");
  const roleMap = new Map<HTMLElement, "student" | "instructor" | "ta" | "unknown">();

  for (const h2 of headings) {
    const headingText = textContent(h2).toLowerCase();
    let role: "student" | "instructor" | "ta" | "unknown" = "unknown";
    if (headingText.includes("instructor")) role = "instructor";
    else if (headingText.includes("student")) role = "student";
    else if (headingText.includes("ta") || headingText.includes("teaching assistant")) role = "ta";

    // The courseList div follows this heading as a sibling
    let sibling = h2.nextElementSibling;
    while (sibling) {
      if (sibling.classList?.contains("courseList")) {
        roleMap.set(sibling as HTMLElement, role);
        break;
      }
      // Stop if we hit another heading
      if (sibling.tagName === "H2") break;
      sibling = sibling.nextElementSibling;
    }
  }

  // Now iterate each courseList and extract courses
  const courseLists = accountShow.querySelectorAll(".courseList");
  for (const courseList of courseLists) {
    const role = roleMap.get(courseList as HTMLElement) ?? "unknown";

    // Track current term as we iterate children
    let currentTerm = "";
    const children = courseList.childNodes;
    for (const child of children) {
      if (!(child instanceof Object && "classList" in child)) continue;
      const el = child as HTMLElement;

      if (el.classList?.contains("courseList--term")) {
        currentTerm = textContent(el);
      } else if (el.classList?.contains("courseList--coursesForTerm")) {
        // Each <a class="courseBox"> inside is a course
        const cards = el.querySelectorAll("a.courseBox");
        for (const card of cards) {
          const href = card.getAttribute("href") ?? "";
          const idMatch = href.match(/\/courses\/(\d+)/);
          if (!idMatch) continue;

          const shortName = textContent(card.querySelector(".courseBox--shortname"));
          const fullName = textContent(card.querySelector(".courseBox--name"));
          const assignmentsText = textContent(card.querySelector(".courseBox--assignments"));

          courses.push({
            id: idMatch[1],
            name: fullName || shortName,
            shortName: shortName || fullName,
            term: currentTerm,
            role,
            url: href,
          });
        }
      } else if (el.classList?.contains("courseList--inactiveCourses")) {
        // Inactive/older courses are nested inside this div with the same term + coursesForTerm pattern
        let inactiveTerm = "";
        for (const inChild of el.childNodes) {
          if (!(inChild instanceof Object && "classList" in inChild)) continue;
          const inEl = inChild as HTMLElement;

          if (inEl.classList?.contains("courseList--term")) {
            inactiveTerm = textContent(inEl);
          } else if (inEl.classList?.contains("courseList--coursesForTerm")) {
            const cards = inEl.querySelectorAll("a.courseBox");
            for (const card of cards) {
              const href = card.getAttribute("href") ?? "";
              const idMatch = href.match(/\/courses\/(\d+)/);
              if (!idMatch) continue;

              const shortName = textContent(card.querySelector(".courseBox--shortname"));
              const fullName = textContent(card.querySelector(".courseBox--name"));

              courses.push({
                id: idMatch[1],
                name: fullName || shortName,
                shortName: shortName || fullName,
                term: inactiveTerm,
                role,
                url: href,
              });
            }
          }
        }
      }
    }
  }

  return courses;
}

export function parseAssignmentList(html: string): GradescopeAssignment[] {
  const root = parseHTML(html);
  const assignments: GradescopeAssignment[] = [];

  // Gradescope assignments page has a table with assignment rows
  const rows = root.querySelectorAll(
    "tr[class*='assignment'], .assignment-row, tbody tr"
  );

  for (const row of rows) {
    const link = row.querySelector('a[href*="/assignments/"]');
    if (!link) continue;

    const href = link.getAttribute("href") ?? "";
    const idMatch = href.match(/\/assignments\/(\d+)/);
    if (!idMatch) continue;

    const name = textContent(link);
    const cells = row.querySelectorAll("td, th");

    // Extract data from table cells
    let dueDate: string | null = null;
    let submissionStatus: string | null = null;
    let pointsAwarded: number | null = null;
    let pointsPossible: number | null = null;

    for (const cell of cells) {
      const text = textContent(cell);
      const cls = cell.getAttribute("class") ?? "";

      // Due date detection
      if (
        cls.includes("due") ||
        cls.includes("date") ||
        text.match(/\d{4}-\d{2}-\d{2}/) ||
        text.match(/\w{3}\s+\d{1,2},?\s+\d{4}/)
      ) {
        if (!dueDate && text.match(/\d/)) {
          dueDate = text;
        }
      }

      // Status detection
      if (
        cls.includes("status") ||
        cls.includes("submission") ||
        text.match(/submitted|graded|not submitted|missing/i)
      ) {
        submissionStatus = text;
      }

      // Score detection (e.g., "85 / 100" or "85/100")
      const scoreMatch = text.match(/([\d.]+)\s*\/\s*([\d.]+)/);
      if (scoreMatch) {
        pointsAwarded = parseNumber(scoreMatch[1]);
        pointsPossible = parseNumber(scoreMatch[2]);
      }
    }

    // Check for released/unreleased indicators
    const released = !row.querySelector(".unreleased, .draft") &&
      !textContent(row).toLowerCase().includes("unreleased");

    // Try to detect assignment type from icons or badges
    let type = "unknown";
    const typeEl =
      row.querySelector(".assignment-type, [class*='type']") ??
      row.querySelector(".badge");
    if (typeEl) {
      type = textContent(typeEl).toLowerCase() || "unknown";
    }
    if (href.includes("programming")) type = "programming";
    else if (href.includes("online")) type = "online";

    assignments.push({
      id: idMatch[1],
      name,
      type,
      dueDate,
      lateDueDate: null,
      released,
      submissionStatus,
      pointsPossible,
      pointsAwarded,
      url: href,
    });
  }

  return assignments;
}

export function parseAssignmentDetail(html: string): Partial<GradescopeAssignmentDetail> {
  const root = parseHTML(html);

  const instructions =
    textContent(
      root.querySelector(".assignment-instructions, .instructions, [class*='description']")
    ) || null;

  const totalPointsEl = root.querySelector(
    "[class*='total-points'], [class*='points'], .points"
  );
  const totalPointsText = textContent(totalPointsEl);
  const totalPoints = parseNumber(totalPointsText);

  // Parse question outline
  const questions: GradescopeQuestionOutline[] = [];
  const questionEls = root.querySelectorAll(
    ".question-outline-row, [class*='question'], .rubric-question"
  );
  for (const qEl of questionEls) {
    const qName =
      textContent(qEl.querySelector(".question-title, .name, th")) || textContent(qEl);
    const qMaxText = textContent(qEl.querySelector("[class*='point'], .max-score"));
    const qMax = parseNumber(qMaxText);
    if (qName) {
      questions.push({ name: qName, maxScore: qMax });
    }
  }

  // Detect submission type
  let submissionType: string | null = null;
  const formEl = root.querySelector(
    "form[class*='submission'], [class*='upload'], [class*='submit']"
  );
  if (formEl) {
    const formText = textContent(formEl).toLowerCase();
    if (formText.includes("pdf")) submissionType = "pdf";
    else if (formText.includes("image")) submissionType = "image";
    else if (formText.includes("code") || formText.includes("programming"))
      submissionType = "code";
    else submissionType = "file";
  }

  const groupSubmission =
    !!root.querySelector("[class*='group'], [class*='team']") ||
    html.toLowerCase().includes("group submission");

  return {
    instructions,
    totalPoints,
    submissionType,
    groupSubmission,
    questions,
  };
}

export function parseSubmissionList(html: string): GradescopeSubmission[] {
  const root = parseHTML(html);
  const submissions: GradescopeSubmission[] = [];

  const rows = root.querySelectorAll("tbody tr, .submission-row");

  for (const row of rows) {
    const link = row.querySelector('a[href*="/submissions/"]');
    const href = link?.getAttribute("href") ?? "";
    const idMatch = href.match(/\/submissions\/(\d+)/);
    if (!idMatch) continue;

    const cells = row.querySelectorAll("td");
    const name = cells.length > 0 ? textContent(cells[0]) : textContent(link);
    let email: string | null = null;
    let score: number | null = null;
    let maxScore: number | null = null;
    let status = "";
    let submittedAt: string | null = null;
    let lateness: string | null = null;

    for (const cell of cells) {
      const text = textContent(cell);
      const cls = cell.getAttribute("class") ?? "";

      // Email
      if (text.includes("@")) {
        email = text;
      }

      // Score
      const scoreMatch = text.match(/([\d.]+)\s*\/\s*([\d.]+)/);
      if (scoreMatch) {
        score = parseNumber(scoreMatch[1]);
        maxScore = parseNumber(scoreMatch[2]);
      }

      // Status
      if (cls.includes("status") || text.match(/graded|submitted|missing/i)) {
        status = text;
      }

      // Submitted at (time)
      if (cls.includes("time") || cls.includes("date") || cls.includes("submitted")) {
        if (text.match(/\d/) && !text.includes("/")) {
          submittedAt = text;
        }
      }

      // Late
      if (cls.includes("late") || text.toLowerCase().includes("late")) {
        lateness = text;
      }
    }

    submissions.push({
      id: idMatch[1],
      studentName: name || null,
      studentEmail: email,
      score,
      maxScore,
      status,
      submittedAt,
      lateness,
      url: href,
    });
  }

  return submissions;
}

export function parseSubmissionDetail(html: string): Partial<GradescopeSubmissionDetail> {
  const root = parseHTML(html);

  // Parse overall score
  const scoreEl = root.querySelector(
    ".submissionOutline--score, [class*='total-score'], .score"
  );
  const scoreText = textContent(scoreEl);
  const overallMatch = scoreText.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  const score = overallMatch ? parseNumber(overallMatch[1]) : null;
  const maxScore = overallMatch ? parseNumber(overallMatch[2]) : null;

  // Parse questions with rubric feedback
  const questions: GradescopeQuestionResult[] = [];
  const questionSections = root.querySelectorAll(
    ".question, [class*='question-'], .rubricItem--container"
  );

  for (const section of questionSections) {
    const qName = textContent(
      section.querySelector(".question-title, .name, h3, h4")
    );

    const qScoreEl = section.querySelector("[class*='score'], .points");
    const qScoreText = textContent(qScoreEl);
    const qScoreMatch = qScoreText.match(/([\d.]+)\s*\/\s*([\d.]+)/);

    const rubricItems: GradescopeRubricItem[] = [];
    const rubricEls = section.querySelectorAll(
      ".rubricItem, [class*='rubric-item'], .rubric-row"
    );
    for (const ri of rubricEls) {
      const desc = textContent(
        ri.querySelector(".rubricItem--description, .description, td:first-child")
      );
      const ptText = textContent(
        ri.querySelector(".rubricItem--points, .points, td:last-child")
      );
      const pts = parseNumber(ptText) ?? 0;
      const applied =
        !!ri.querySelector(".rubricItem--selected, .selected, .applied, .checked") ||
        ri.classNames?.includes("selected") ||
        ri.getAttribute("class")?.includes("selected") ||
        false;

      if (desc) {
        rubricItems.push({ description: desc, points: pts, applied });
      }
    }

    // Comments
    const comments: string[] = [];
    const commentEls = section.querySelectorAll(
      ".comment, [class*='comment'], .annotation"
    );
    for (const c of commentEls) {
      const ct = textContent(c);
      if (ct) comments.push(ct);
    }

    if (qName) {
      questions.push({
        name: qName,
        score: qScoreMatch ? parseNumber(qScoreMatch[1]) : null,
        maxScore: qScoreMatch ? parseNumber(qScoreMatch[2]) : null,
        rubricItems,
        comments,
      });
    }
  }

  return { score, maxScore, questions };
}

export function parseRoster(html: string): GradescopeRosterEntry[] {
  const root = parseHTML(html);
  const roster: GradescopeRosterEntry[] = [];

  const rows = root.querySelectorAll("tbody tr");

  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 2) continue;

    let name = "";
    let email = "";
    let role = "";
    let studentId: string | null = null;
    const sections: string[] = [];

    for (const cell of cells) {
      const text = textContent(cell);
      const cls = cell.getAttribute("class") ?? "";

      if (cls.includes("name") || (!name && !text.includes("@") && text.length > 1)) {
        if (!name) name = text;
      }
      if (text.includes("@")) {
        email = text;
      }
      if (cls.includes("role") || text.match(/^(student|instructor|ta|grader)$/i)) {
        role = text;
      }
      if (cls.includes("sid") || cls.includes("student-id")) {
        studentId = text || null;
      }
      if (cls.includes("section")) {
        if (text) sections.push(text);
      }
    }

    if (name || email) {
      roster.push({ name, email, role, sections, studentId });
    }
  }

  return roster;
}

export function parseExtensions(html: string): GradescopeExtension[] {
  const root = parseHTML(html);
  const extensions: GradescopeExtension[] = [];

  const rows = root.querySelectorAll("tbody tr, .extension-row");

  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 2) continue;

    let studentName = "";
    let studentEmail = "";
    let dueDate = "";
    let lateDueDate: string | null = null;

    for (const cell of cells) {
      const text = textContent(cell);
      const cls = cell.getAttribute("class") ?? "";

      if (cls.includes("name") || (!studentName && !text.includes("@"))) {
        if (!studentName && text.length > 1) studentName = text;
      }
      if (text.includes("@")) studentEmail = text;
      if (cls.includes("due") || cls.includes("date")) {
        if (!dueDate) dueDate = text;
        else lateDueDate = text;
      }
    }

    if (studentName || studentEmail) {
      extensions.push({ studentName, studentEmail, dueDate, lateDueDate });
    }
  }

  return extensions;
}

export function parseRegradeRequests(html: string): GradescopeRegradeRequest[] {
  const root = parseHTML(html);
  const requests: GradescopeRegradeRequest[] = [];

  const rows = root.querySelectorAll(
    ".regradeRequest, [class*='regrade'], tbody tr"
  );

  for (const row of rows) {
    const link = row.querySelector('a[href*="regrade"]');
    const href = link?.getAttribute("href") ?? "";
    const idMatch = href.match(/regrade_requests\/(\d+)/) ?? href.match(/\/(\d+)$/);
    const id = idMatch ? idMatch[1] : "";

    const cells = row.querySelectorAll("td");
    let studentName = "";
    let questionName = "";
    let status = "";
    let explanation = "";
    let response: string | null = null;
    let createdAt = "";

    for (const cell of cells) {
      const text = textContent(cell);
      const cls = cell.getAttribute("class") ?? "";

      if (cls.includes("student") || cls.includes("name")) {
        if (!studentName) studentName = text;
      }
      if (cls.includes("question")) questionName = text;
      if (
        cls.includes("status") ||
        text.match(/^(pending|approved|denied|resolved)$/i)
      ) {
        status = text;
      }
      if (cls.includes("explanation") || cls.includes("reason")) {
        explanation = text;
      }
      if (cls.includes("response") || cls.includes("reply")) {
        response = text || null;
      }
      if (cls.includes("date") || cls.includes("time") || cls.includes("created")) {
        createdAt = text;
      }
    }

    if (id) {
      requests.push({
        id,
        studentName,
        questionName,
        status,
        explanation,
        response,
        createdAt,
        url: href,
      });
    }
  }

  return requests;
}

export function parseCourseGrades(html: string): GradescopeGradeEntry[] {
  const root = parseHTML(html);
  const grades: GradescopeGradeEntry[] = [];

  // Assignment rows on the course assignments page typically show scores
  const rows = root.querySelectorAll("tbody tr, .assignment-row");

  for (const row of rows) {
    const link = row.querySelector('a[href*="/assignments/"]');
    if (!link) continue;

    const href = link.getAttribute("href") ?? "";
    const idMatch = href.match(/\/assignments\/(\d+)/);
    if (!idMatch) continue;

    const name = textContent(link);
    const cells = row.querySelectorAll("td");

    let score: number | null = null;
    let maxScore: number | null = null;
    let status = "";

    for (const cell of cells) {
      const text = textContent(cell);
      const cls = cell.getAttribute("class") ?? "";

      const scoreMatch = text.match(/([\d.]+)\s*\/\s*([\d.]+)/);
      if (scoreMatch) {
        score = parseNumber(scoreMatch[1]);
        maxScore = parseNumber(scoreMatch[2]);
      }

      if (
        cls.includes("status") ||
        text.match(/graded|submitted|not submitted|missing/i)
      ) {
        if (!status) status = text;
      }
    }

    grades.push({
      assignmentName: name,
      assignmentId: idMatch[1],
      score,
      maxScore,
      status,
    });
  }

  return grades;
}
