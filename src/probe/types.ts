export const ICON_COUNT = 18;

export const ICON_NAMES: string[] = [
  'rabbit', 'duck', 'fish', 'turtle', 'cat', 'lizard',
  'car', 'truck', 'rocket', 'train', 'plane', 'boat',
  'strawberry', 'apple', 'carrot', 'banana', 'watermelon', 'spoon'
];

export const VALID_CLASSES = [
  'msummer11', 'msummer12', 'msummer13', 'msummer14',
  'msummer15', 'msummer17', 'msummer18', 'msummer19'
];

export const BASE_URL = 'https://www.kidsa-z.com';

export interface Student {
  studentId: number;
  screenName: string;
  firstName: string;
  lastName: string;
  userIcon: number;
  classroomId: number;
  homeroomMemberId: number;
}

export interface ClassStudents {
  className: string;
  classroomId: number;
  memberId: number;
  fetchedAt: string;
  students: Student[];
}

export interface ProbeResult {
  className: string;
  studentId: number;
  screenName: string;
  passwordCombination: number[];
  passwordNames: string[];
  loginStatus: 'success' | 'failed' | 'error';
  earnedStars?: number;
  availableStars?: number;
  readingStats?: {
    readThisWeekCount: number;
    readLastWeekCount: number;
    listenCount: number;
    readCount: number;
    quizCount: number;
    worksheetCount: number;
  };
  assignmentStatus?: {
    currentLevel: string;
    completedTasks: number;
    remainingTasks: number;
    nextLevel: string;
  };
  probeTimestamp: string;
  probeAttempts: number;
  failureReason?: string;
}

export interface StudentProbeState {
  className: string;
  studentId: number;
  screenName: string;
  status: 'pending' | 'probing' | 'success' | 'failed_1digit' | 'failed_all';
  passwordFound?: number[];
  passwordNames?: string[];
  probeAttempts: number;
  lastProbeAt?: string;
}

export interface ProbeProgress {
  startedAt: string;
  updatedAt: string;
  currentRound: 1 | 2;
  totalStudents: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  studentStates: StudentProbeState[];
}

export interface ProbeConfig {
  maxConcurrency: number;
  minDelay: number;
  maxDelay: number;
  headless: boolean;
  rounds: number[];
  resumeFromFile: boolean;
}
