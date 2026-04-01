export interface GradescopeCourse {
  id: string;
  name: string;
  shortName: string;
  term: string;
  role: "student" | "instructor" | "ta" | "unknown";
  url: string;
}

export interface GradescopeAssignment {
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

export interface GradescopeAssignmentDetail extends GradescopeAssignment {
  instructions: string | null;
  totalPoints: number | null;
  submissionType: string | null;
  groupSubmission: boolean;
  questions: GradescopeQuestionOutline[];
}

export interface GradescopeQuestionOutline {
  name: string;
  maxScore: number | null;
}

export interface GradescopeSubmission {
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

export interface GradescopeSubmissionDetail extends GradescopeSubmission {
  questions: GradescopeQuestionResult[];
}

export interface GradescopeQuestionResult {
  name: string;
  score: number | null;
  maxScore: number | null;
  rubricItems: GradescopeRubricItem[];
  comments: string[];
}

export interface GradescopeRubricItem {
  description: string;
  points: number;
  applied: boolean;
}

export interface GradescopeRosterEntry {
  name: string;
  email: string;
  role: string;
  sections: string[];
  studentId: string | null;
}

export interface GradescopeExtension {
  studentName: string;
  studentEmail: string;
  dueDate: string;
  lateDueDate: string | null;
}

export interface GradescopeRegradeRequest {
  id: string;
  studentName: string;
  questionName: string;
  status: string;
  explanation: string;
  response: string | null;
  createdAt: string;
  url: string;
}

export interface GradescopeGradeEntry {
  assignmentName: string;
  assignmentId: string;
  score: number | null;
  maxScore: number | null;
  status: string;
}
