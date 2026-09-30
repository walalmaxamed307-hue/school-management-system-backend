// Confirms the approved compound/unique/partial indexes are DECLARED on
// each schema. This does NOT prove enforcement at the database level (that
// requires a live mongod actually rejecting a duplicate insert) — see the
// test-limitations note in the final report. What this DOES prove: the
// index specs in the code match what Revision 2/3 approved, so if a real
// MongoDB is pointed at these models, the right constraints will be built.

const {
  User,
  Teacher,
  AcademicYear,
  Class,
  Section,
  Subject,
  Student,
  Enrollment,
  TeacherAssignment,
  TeacherAttendanceScope,
  Exam,
  StudentExamResult,
  Room,
  RoomAssignment,
  PromotionRecommendation,
  Announcement,
  Attendance,
  TeacherAttendance,
  Fee,
  SchoolSettings,
  PlatformAdmin,
} = require('../models')

// Finds a declared index whose key exactly matches `key` (order-sensitive,
// matching how MongoDB compound indexes actually work).
function findIndex(Model, key) {
  return Model.schema.indexes().find(([k]) => JSON.stringify(k) === JSON.stringify(key))
}

describe('school-scoped uniqueness (never global)', () => {
  test('PlatformAdmin.email is unique (global — the one collection with no schoolId)', () => {
    const idx = findIndex(PlatformAdmin, { email: 1 })
    expect(idx[1].unique).toBe(true)
  })
  test('User.email is globally unique (login is by email alone, so it must identify one school)', () => {
    const idx = findIndex(User, { email: 1 })
    expect(idx[1].unique).toBe(true)
  })
  test('Teacher is unique per (schoolId, userId)', () => {
    expect(findIndex(Teacher, { schoolId: 1, userId: 1 })[1].unique).toBe(true)
  })
  test('AcademicYear is unique per (schoolId, startYear)', () => {
    expect(findIndex(AcademicYear, { schoolId: 1, startYear: 1 })[1].unique).toBe(true)
  })
  test('Class name is unique per school, not globally', () => {
    expect(findIndex(Class, { schoolId: 1, name: 1 })[1].unique).toBe(true)
  })
  test('Section name is unique per (schoolId, classId), not per school alone', () => {
    expect(findIndex(Section, { schoolId: 1, classId: 1, name: 1 })[1].unique).toBe(true)
  })
  test('Subject name is unique per school', () => {
    expect(findIndex(Subject, { schoolId: 1, name: 1 })[1].unique).toBe(true)
  })
  test('Room name is unique per school (school-local uniqueness, not global)', () => {
    expect(findIndex(Room, { schoolId: 1, name: 1 })[1].unique).toBe(true)
  })
  test('studentCode is GLOBALLY unique — ID cards are scanned system-wide, so two students must never share a code even across two different schools', () => {
    expect(findIndex(Student, { studentCode: 1 })[1].unique).toBe(true)
  })
})

describe('duplicate-prevention indexes for historical records', () => {
  test('one Enrollment per student per academic year', () => {
    expect(findIndex(Enrollment, { schoolId: 1, academicYearId: 1, studentId: 1 })[1].unique).toBe(true)
  })
  test('one Attendance record per enrollment/date/session', () => {
    const idx = findIndex(Attendance, { schoolId: 1, enrollmentId: 1, date: 1, session: 1 })
    expect(idx[1].unique).toBe(true)
  })
  test('one TeacherAttendance record per teacher/date', () => {
    const idx = findIndex(TeacherAttendance, { schoolId: 1, teacherId: 1, date: 1 })
    expect(idx[1].unique).toBe(true)
  })
  test('one Fee record per enrollment/month', () => {
    expect(findIndex(Fee, { schoolId: 1, enrollmentId: 1, month: 1 })[1].unique).toBe(true)
  })
  test('one StudentExamResult per enrollment/exam', () => {
    const idx = findIndex(StudentExamResult, {
      schoolId: 1,
      academicYearId: 1,
      enrollmentId: 1,
      examId: 1,
    })
    expect(idx[1].unique).toBe(true)
  })
  test('one RoomAssignment per enrollment/exam', () => {
    expect(findIndex(RoomAssignment, { schoolId: 1, examId: 1, enrollmentId: 1 })[1].unique).toBe(true)
  })
  test('one PromotionRecommendation per enrollment/closing year', () => {
    const idx = findIndex(PromotionRecommendation, {
      schoolId: 1,
      academicYearId: 1,
      enrollmentId: 1,
    })
    expect(idx[1].unique).toBe(true)
  })
  test('TeacherAssignment uniqueness includes sectionId (section-specific assignments are distinct)', () => {
    const idx = findIndex(TeacherAssignment, {
      schoolId: 1,
      academicYearId: 1,
      teacherId: 1,
      classId: 1,
      sectionId: 1,
      subjectId: 1,
    })
    expect(idx[1].unique).toBe(true)
  })
  test('one TeacherAttendanceScope per teacher per year', () => {
    expect(
      findIndex(TeacherAttendanceScope, { schoolId: 1, academicYearId: 1, teacherId: 1 })[1].unique
    ).toBe(true)
  })
})

describe('Exam.isFinal partial unique index', () => {
  test('at most one final exam per academic year is enforced via a partial index', () => {
    const idx = findIndex(Exam, { schoolId: 1, academicYearId: 1 })
    expect(idx).toBeDefined()
    expect(idx[1].unique).toBe(true)
    expect(idx[1].partialFilterExpression).toEqual({ isFinal: true })
  })
})

describe('non-unique supporting indexes exist for expected query patterns', () => {
  test('Enrollment roster-by-class(-and-section) index', () => {
    expect(findIndex(Enrollment, { schoolId: 1, academicYearId: 1, classId: 1 })).toBeDefined()
    expect(
      findIndex(Enrollment, { schoolId: 1, academicYearId: 1, classId: 1, sectionId: 1 })
    ).toBeDefined()
  })
  test('Attendance roster-by-section-and-date index', () => {
    expect(
      findIndex(Attendance, { schoolId: 1, academicYearId: 1, classId: 1, sectionId: 1, date: 1 })
    ).toBeDefined()
  })
  test('Attendance per-student absence-history index', () => {
    expect(findIndex(Attendance, { schoolId: 1, enrollmentId: 1 })).toBeDefined()
  })
  test('Fee dashboard-by-status index', () => {
    expect(findIndex(Fee, { schoolId: 1, academicYearId: 1, status: 1 })).toBeDefined()
  })
  test('Announcement feed-order index, no academicYearId dimension', () => {
    expect(findIndex(Announcement, { schoolId: 1, createdAt: -1 })).toBeDefined()
    expect(Announcement.schema.path('academicYearId')).toBeUndefined()
  })
})

describe('section-scoped homeroom teacher (added for the sections feature)', () => {
  test('exactly one homeroom teacher per class/section per year — partial, single_class only', () => {
    const idx = findIndex(TeacherAttendanceScope, {
      schoolId: 1,
      academicYearId: 1,
      classId: 1,
      sectionId: 1,
    })
    expect(idx).toBeDefined()
    expect(idx[1].unique).toBe(true)
    expect(idx[1].partialFilterExpression).toEqual({ scopeType: 'single_class' })
  })
  test('Fee has a section-scoped query index alongside its status index', () => {
    expect(
      findIndex(Fee, { schoolId: 1, academicYearId: 1, classId: 1, sectionId: 1, month: 1 })
    ).toBeDefined()
  })
})

describe('SchoolSettings', () => {
  test('schoolId is unique — one settings document per school', () => {
    const idx = findIndex(SchoolSettings, { schoolId: 1 })
    expect(idx[1].unique).toBe(true)
  })
})
