/**
 * Shared assignment-related types used by both frontend and backend.
 * @module assignment.types
 */

/** A single rubric criterion for grading an assignment */
export interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
}

/** An assignment posted for a course */
export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string;
  maxPoints: number;
  rubric: RubricCriterion[];
}

/** A score given by a peer reviewer for one rubric criterion */
export interface ReviewScore {
  criterionId: string;
  score: number;
  feedback: string;
}

/** A peer review submitted for a submission */
export interface PeerReview {
  id: string;
  submissionId: string;
  reviewerId: string;
  scores: ReviewScore[];
  overallFeedback: string;
  isSubmitted: boolean;
}

/** A student's submission for an assignment */
export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  userId: string;
  fileUrl: string;
  submittedAt: string;
  peerReviews: PeerReview[];
  finalGrade: number | null;
  instructorGrade: number | null;
  instructorFeedback: string | null;
  assignment?: Assignment;
}

/** DTO for submitting a peer review */
export interface SubmitReviewDto {
  scores: ReviewScore[];
  overallFeedback: string;
}

/** A peer review assignment awaiting action from the current user */
export interface PendingPeerReview extends PeerReview {
  submission: AssignmentSubmission & {
    assignment: Assignment;
  };
}
