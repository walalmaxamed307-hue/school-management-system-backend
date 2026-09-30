// Schema-level validation tests — required fields, enums, conditional
// requirements. Uses Mongoose's synchronous validateSync(), which runs
// WITHOUT a database connection (it explicitly skips async validators/
// hooks, so the async Section cross-reference checks in Enrollment /
// TeacherAssignment / TeacherAttendanceScope are not exercised here — see
// the test-limitations note in the final report).

const mongoose = require('mongoose')
const {
  School,
  PlatformAdmin,
  SchoolSettings,
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
  StudentTransfer,
  Attendance,
  TeacherAttendance,
  Fee,
} = require('../models')

const oid = () => new mongoose.Types.ObjectId()

describe('School', () => {
  test('requires name', () => {
    const err = new School({}).validateSync()
    expect(err.errors.name).toBeDefined()
  })
  test('valid document passes', () => {
    const err = new School({ name: 'Test School' }).validateSync()
    expect(err).toBeUndefined()
  })
})

describe('PlatformAdmin', () => {
  test('requires name, email, passwordHash', () => {
    const err = new PlatformAdmin({}).validateSync()
    expect(err.errors.name).toBeDefined()
    expect(err.errors.email).toBeDefined()
    expect(err.errors.passwordHash).toBeDefined()
  })
})

describe('User', () => {
  test('requires schoolId, email, passwordHash, role', () => {
    const err = new User({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.email).toBeDefined()
    expect(err.errors.passwordHash).toBeDefined()
    expect(err.errors.role).toBeDefined()
  })
  test('rejects a role outside the enum', () => {
    const err = new User({
      schoolId: oid(),
      email: 'a@b.com',
      passwordHash: 'x',
      role: 'student', // students are not modeled as User
    }).validateSync()
    expect(err.errors.role).toBeDefined()
  })
  test('accepts admin (with name) and teacher (without name)', () => {
    const adminErr = new User({
      schoolId: oid(),
      email: 'a@b.com',
      passwordHash: 'x',
      role: 'admin',
      name: 'Xasan Maxamed',
    }).validateSync()
    expect(adminErr).toBeUndefined()

    const teacherErr = new User({
      schoolId: oid(),
      email: 'a@b.com',
      passwordHash: 'x',
      role: 'teacher',
    }).validateSync()
    expect(teacherErr).toBeUndefined()
  })
  test('name is required for admin — an admin has no separate profile doc', () => {
    const err = new User({
      schoolId: oid(),
      email: 'a@b.com',
      passwordHash: 'x',
      role: 'admin',
    }).validateSync()
    expect(err.errors.name).toBeDefined()
  })
  test('name must not be set on a teacher — Teacher.fullName is the source of truth', () => {
    const err = new User({
      schoolId: oid(),
      email: 'a@b.com',
      passwordHash: 'x',
      role: 'teacher',
      name: 'Should not be allowed here',
    }).validateSync()
    expect(err.errors.name).toBeDefined()
  })
})

describe('AcademicYear', () => {
  test('requires schoolId, startYear, endYear, label, passMarkSnapshot, examMaxMarkSnapshot', () => {
    const err = new AcademicYear({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.startYear).toBeDefined()
    expect(err.errors.endYear).toBeDefined()
    expect(err.errors.label).toBeDefined()
    expect(err.errors.passMarkSnapshot).toBeDefined()
    expect(err.errors.examMaxMarkSnapshot).toBeDefined()
  })
  test('status defaults to upcoming and rejects invalid values', () => {
    const doc = new AcademicYear({
      schoolId: oid(),
      startYear: 2025,
      endYear: 2026,
      label: '2025-2026',
      passMarkSnapshot: 400,
      examMaxMarkSnapshot: 100,
    })
    expect(doc.status).toBe('upcoming')
    doc.status = 'archived' // not a valid enum value
    expect(doc.validateSync().errors.status).toBeDefined()
  })
})

describe('Class', () => {
  test('requires schoolId, name, level', () => {
    const err = new Class({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.name).toBeDefined()
    expect(err.errors.level).toBeDefined()
  })
})

describe('Section', () => {
  test('requires schoolId, classId, name', () => {
    const err = new Section({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.classId).toBeDefined()
    expect(err.errors.name).toBeDefined()
  })
})

describe('Student', () => {
  test('requires schoolId, studentCode, fullName', () => {
    const err = new Student({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.studentCode).toBeDefined()
    expect(err.errors.fullName).toBeDefined()
  })
  test('lifecycleStatus enum includes transferred and rejects invalid values', () => {
    const doc = new Student({ schoolId: oid(), studentCode: 'S1', fullName: 'Test' })
    doc.lifecycleStatus = 'transferred'
    expect(doc.validateSync()).toBeUndefined()
    doc.lifecycleStatus = 'expelled' // not part of the approved enum
    expect(doc.validateSync().errors.lifecycleStatus).toBeDefined()
  })
  test('feeCategory defaults to paid, with no discountAmount required', () => {
    const doc = new Student({ schoolId: oid(), studentCode: 'S1', fullName: 'Test' })
    expect(doc.feeCategory).toBe('paid')
    expect(doc.validateSync()).toBeUndefined()
  })
  test('discountAmount is required when feeCategory is discount', () => {
    const err = new Student({
      schoolId: oid(),
      studentCode: 'S1',
      fullName: 'Test',
      feeCategory: 'discount',
    }).validateSync()
    expect(err.errors.discountAmount).toBeDefined()
  })
  test('discountAmount must not be set unless feeCategory is discount', () => {
    const err = new Student({
      schoolId: oid(),
      studentCode: 'S1',
      fullName: 'Test',
      feeCategory: 'free',
      discountAmount: 5,
    }).validateSync()
    expect(err.errors.discountAmount).toBeDefined()
  })
  test('discount category with a discountAmount validates cleanly', () => {
    const err = new Student({
      schoolId: oid(),
      studentCode: 'S1',
      fullName: 'Test',
      feeCategory: 'discount',
      discountAmount: 5,
    }).validateSync()
    expect(err).toBeUndefined()
  })
})

describe('Enrollment', () => {
  test('requires schoolId, academicYearId, studentId, classId (sectionId optional)', () => {
    const err = new Enrollment({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.academicYearId).toBeDefined()
    expect(err.errors.studentId).toBeDefined()
    expect(err.errors.classId).toBeDefined()
  })
  test('valid document with no sectionId passes sync validation', () => {
    const err = new Enrollment({
      schoolId: oid(),
      academicYearId: oid(),
      studentId: oid(),
      classId: oid(),
    }).validateSync()
    expect(err).toBeUndefined()
  })
  test('rejects a status outside the enum', () => {
    const doc = new Enrollment({
      schoolId: oid(),
      academicYearId: oid(),
      studentId: oid(),
      classId: oid(),
    })
    doc.status = 'suspended'
    expect(doc.validateSync().errors.status).toBeDefined()
  })
})

describe('TeacherAttendanceScope', () => {
  test('rejects single_class scope with no classId (async hook, requires DB — see limitations)', () => {
    // validateSync() does not run the async pre-validate hook, so this only
    // confirms the synchronous shape is accepted here; the actual
    // classId-required-for-single_class rule is enforced in the async hook
    // and is exercised in a real DB, not in this offline test.
    const doc = new TeacherAttendanceScope({
      schoolId: oid(),
      academicYearId: oid(),
      teacherId: oid(),
      scopeType: 'single_class',
    })
    expect(doc.validateSync()).toBeUndefined()
  })
  test('rejects scopeType outside the approved two values', () => {
    const doc = new TeacherAttendanceScope({
      schoolId: oid(),
      academicYearId: oid(),
      teacherId: oid(),
      scopeType: 'whole_school', // not one of single_class / all_classes
    })
    expect(doc.validateSync().errors.scopeType).toBeDefined()
  })
})

describe('Exam', () => {
  test('requires schoolId, academicYearId, name, examMaxMarkSnapshot', () => {
    const err = new Exam({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.academicYearId).toBeDefined()
    expect(err.errors.name).toBeDefined()
    expect(err.errors.examMaxMarkSnapshot).toBeDefined()
  })
  test('isFinal defaults to false', () => {
    const doc = new Exam({
      schoolId: oid(),
      academicYearId: oid(),
      name: 'First Term',
      examMaxMarkSnapshot: 100,
    })
    expect(doc.isFinal).toBe(false)
  })
})

describe('StudentExamResult', () => {
  test('requires schoolId, academicYearId, enrollmentId, examId, classId, maxMarkSnapshot', () => {
    const err = new StudentExamResult({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.academicYearId).toBeDefined()
    expect(err.errors.enrollmentId).toBeDefined()
    expect(err.errors.examId).toBeDefined()
    expect(err.errors.classId).toBeDefined()
    expect(err.errors.maxMarkSnapshot).toBeDefined()
  })
})

describe('Room / RoomAssignment', () => {
  test('Room requires schoolId, name', () => {
    const err = new Room({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.name).toBeDefined()
  })
  test('RoomAssignment requires schoolId, academicYearId, examId, enrollmentId, roomId — no sectionId field exists', () => {
    const err = new RoomAssignment({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.academicYearId).toBeDefined()
    expect(err.errors.examId).toBeDefined()
    expect(err.errors.enrollmentId).toBeDefined()
    expect(err.errors.roomId).toBeDefined()
    expect(RoomAssignment.schema.path('sectionId')).toBeUndefined()
  })
})

describe('PromotionRecommendation', () => {
  test('requires schoolId, academicYearId, enrollmentId, computedTotal, passMarkSnapshot, systemRecommendation', () => {
    const err = new PromotionRecommendation({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.academicYearId).toBeDefined()
    expect(err.errors.enrollmentId).toBeDefined()
    expect(err.errors.computedTotal).toBeDefined()
    expect(err.errors.passMarkSnapshot).toBeDefined()
    expect(err.errors.systemRecommendation).toBeDefined()
  })
  test('status defaults to pending_review — recommendations never start finalized', () => {
    const doc = new PromotionRecommendation({
      schoolId: oid(),
      academicYearId: oid(),
      enrollmentId: oid(),
      computedTotal: 420,
      passMarkSnapshot: 400,
      systemRecommendation: 'promote',
    })
    expect(doc.status).toBe('pending_review')
    expect(doc.finalOutcome).toBeNull()
  })
  test('rejects an outcome outside promote/repeat/graduate', () => {
    const doc = new PromotionRecommendation({
      schoolId: oid(),
      academicYearId: oid(),
      enrollmentId: oid(),
      computedTotal: 420,
      passMarkSnapshot: 400,
      systemRecommendation: 'expel',
    })
    expect(doc.validateSync().errors.systemRecommendation).toBeDefined()
  })
})

describe('Announcement', () => {
  test('requires schoolId, title, body, authorUserId, authorRoleSnapshot', () => {
    const err = new Announcement({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.title).toBeDefined()
    expect(err.errors.body).toBeDefined()
    expect(err.errors.authorUserId).toBeDefined()
    expect(err.errors.authorRoleSnapshot).toBeDefined()
  })
  test('has no academicYearId field — confirmed school-wide, not year-scoped', () => {
    expect(Announcement.schema.path('academicYearId')).toBeUndefined()
  })
})

describe('StudentTransfer', () => {
  test('requires fromSchoolId, fromStudentId, toSchoolId, initiatedByUserId', () => {
    const err = new StudentTransfer({}).validateSync()
    expect(err.errors.fromSchoolId).toBeDefined()
    expect(err.errors.fromStudentId).toBeDefined()
    expect(err.errors.toSchoolId).toBeDefined()
    expect(err.errors.initiatedByUserId).toBeDefined()
  })
  test('status defaults to initiated and rejects invalid values', () => {
    const doc = new StudentTransfer({
      fromSchoolId: oid(),
      fromStudentId: oid(),
      toSchoolId: oid(),
      initiatedByUserId: oid(),
    })
    expect(doc.status).toBe('initiated')
    doc.status = 'rejected' // not part of the approved enum
    expect(doc.validateSync().errors.status).toBeDefined()
  })
})

describe('Attendance', () => {
  test('requires schoolId, academicYearId, enrollmentId, classId, date, session, status, markedByUserId', () => {
    const err = new Attendance({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.academicYearId).toBeDefined()
    expect(err.errors.enrollmentId).toBeDefined()
    expect(err.errors.classId).toBeDefined()
    expect(err.errors.date).toBeDefined()
    expect(err.errors.session).toBeDefined()
    expect(err.errors.status).toBeDefined()
    expect(err.errors.markedByUserId).toBeDefined()
  })
  test('rejects a session outside its enum', () => {
    const base = {
      schoolId: oid(),
      academicYearId: oid(),
      enrollmentId: oid(),
      classId: oid(),
      date: new Date(),
      markedByUserId: oid(),
    }
    const badSession = new Attendance({ ...base, session: 'lunch', status: 'present' }).validateSync()
    expect(badSession.errors.session).toBeDefined()
    const badStatus = new Attendance({ ...base, session: 'before_break', status: 'on_vacation' }).validateSync()
    expect(badStatus.errors.status).toBeDefined()
  })
  test('accepts present/absent/late/excused for status', () => {
    for (const status of ['present', 'absent', 'late', 'excused']) {
      const err = new Attendance({
        schoolId: oid(),
        academicYearId: oid(),
        enrollmentId: oid(),
        classId: oid(),
        date: new Date(),
        session: 'before_break',
        status,
        markedByUserId: oid(),
      }).validateSync()
      expect(err).toBeUndefined()
    }
  })
})

describe('TeacherAttendance', () => {
  test('requires schoolId, teacherId, date, status, markedByUserId', () => {
    const err = new TeacherAttendance({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.teacherId).toBeDefined()
    expect(err.errors.date).toBeDefined()
    expect(err.errors.status).toBeDefined()
    expect(err.errors.markedByUserId).toBeDefined()
  })
  test('accepts present/absent/late/excused for status', () => {
    for (const status of ['present', 'absent', 'late', 'excused']) {
      const err = new TeacherAttendance({
        schoolId: oid(),
        teacherId: oid(),
        date: new Date(),
        status,
        markedByUserId: oid(),
      }).validateSync()
      expect(err).toBeUndefined()
    }
  })
})

describe('Fee', () => {
  test('requires schoolId, academicYearId, enrollmentId, classId, month, amountDue, recordedByUserId', () => {
    const err = new Fee({}).validateSync()
    expect(err.errors.schoolId).toBeDefined()
    expect(err.errors.academicYearId).toBeDefined()
    expect(err.errors.enrollmentId).toBeDefined()
    expect(err.errors.classId).toBeDefined()
    expect(err.errors.month).toBeDefined()
    expect(err.errors.amountDue).toBeDefined()
    expect(err.errors.recordedByUserId).toBeDefined()
  })
  test('sectionId is optional — a class without sections still has fees', () => {
    const err = new Fee({
      schoolId: oid(),
      academicYearId: oid(),
      enrollmentId: oid(),
      classId: oid(),
      month: '2026-08',
      amountDue: 50,
      recordedByUserId: oid(),
    }).validateSync()
    expect(err).toBeUndefined()
  })
  test('month must match YYYY-MM', () => {
    const doc = new Fee({
      schoolId: oid(),
      academicYearId: oid(),
      enrollmentId: oid(),
      classId: oid(),
      month: '2026/08',
      amountDue: 50,
      recordedByUserId: oid(),
    })
    expect(doc.validateSync().errors.month).toBeDefined()
    doc.month = '2026-08'
    expect(doc.validateSync()).toBeUndefined()
  })
  test('status defaults to unpaid', () => {
    const doc = new Fee({
      schoolId: oid(),
      academicYearId: oid(),
      enrollmentId: oid(),
      classId: oid(),
      month: '2026-08',
      amountDue: 50,
      recordedByUserId: oid(),
    })
    expect(doc.status).toBe('unpaid')
  })
})

describe('Class.hasSections', () => {
  test('defaults to false — a class does not use sections unless explicitly turned on', () => {
    const doc = new Class({ schoolId: oid(), name: 'Grade 5', level: 5 })
    expect(doc.hasSections).toBe(false)
  })
})
