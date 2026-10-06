# School Management Backend — API Reference

Written at the end of Step 7 (backend complete). This is the single source
of truth for Step 8 (frontend integration) — every endpoint that exists,
what it needs, and the business rules baked into it.

Base URL: `http://localhost:3000` (or wherever deployed). All routes
except `/auth/login`, `/platform/auth/login`, and `/health` require
`Authorization: Bearer <token>`.

## Auth model
- **School-level** (`/auth/*`): `role` is `admin` or `teacher`, scoped to
  one `schoolId`. Token payload: `{userId, schoolId, role, teacherId?}`.
- **Platform-level** (`/platform/*`): completely separate token
  (`scope: 'platform'`), not tied to any school. Used only to onboard new
  schools.
- Most write routes are `admin`-only (`requireRole('admin')`). Where a
  teacher can act, it's always scoped to their own homeroom
  (`TeacherAttendanceScope`) or subject assignment (`TeacherAssignment`)
  — never anyone else's.

## Multi-tenancy
Every query is scoped to `req.user.schoolId`. Two schools never see each
other's data through this API, ever. `/platform/schools` is the only way
to create a new school + its first admin.

---

## `/auth`
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/login` | — | `{email, password}` → `{token, user}`. `user.class`/`user.section` populated for a teacher's homeroom, if any. |
| GET | `/me` | any | Returns the raw JWT payload (ids only, not full profile). |
| POST | `/change-password` | admin, teacher | `{currentPassword, newPassword}` (cusub ≥ 8 xaraf, ≠ hadda jira) → `{message, token}`. Password-ka hadda jira qaldan = 400 (ma aha 401). 5 isku-day oo fashilmay / 15 daqiiqo / user. |

## `/platform`
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/login` | — | Platform admin login. Account-ka waxaa `npm run seed` ka abuura `.env` (`PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`). |
| GET | `/schools` | platform | List all schools. |
| POST | `/schools` | platform | `{schoolName, adminName, adminEmail, adminPassword}` → creates School + SchoolSettings + first admin User, all at once. |

## `/school-settings`
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | any | One doc per school. |
| PATCH | `/` | admin | Patchable: `name, phone, address, logoUrl, defaultExamMaxMark, defaultPassMark, defaultStandardFeeAmount`. `currentAcademicYearId` is NOT patchable here — it only moves via `/academic-years` (create) or `/promotions/run`. |

## `/academic-years`
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | any | Sorted by `startYear`. |
| POST | `/` | admin | `{startYear, endYear, label}`. First one ever for a school auto-activates; every later one starts `upcoming` — it only becomes `active` via `/promotions/run`. |
| PATCH | `/:id/close` | admin | Only valid on a `status: 'active'` year. (Rarely needed directly — promotion does this as part of its flow.) |

## `/subjects`, `/rooms` — identical shape
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | any | |
| POST | `/` | admin | `{name}` (+ `code` for subjects) |
| PATCH | `/:id` | admin | |
| DELETE | `/:id` | admin | 409 if referenced (Subject: by `TeacherAssignment`; Room: by `RoomAssignment`). |

## `/classes`
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | any | Each class includes its `sections: [...]` array. |
| POST | `/` | admin | `{name, level}` |
| PATCH | `/:id` | admin | `{name, level, isActive}` |
| DELETE | `/:id` | admin | 409 if any Enrollment references it. |
| PATCH | `/:id/enable-sections` | admin | Idempotent — flips `hasSections: true`. Do this BEFORE adding sections. |
| POST | `/:id/sections` | admin | `{name}` — 400 if `hasSections` is still false. |
| DELETE | `/:id/sections/:sectionId` | admin | 409 if enrolled students or a homeroom teacher reference it. |
| POST | `/:id/bulk-assign-section` | admin | `{sectionId, enrollmentIds: [...]}` — the "split an existing roster into sections" tool. Per-item results (partial success possible). |

**hasSections is the gate everywhere**: any endpoint that takes a
`classId` and a class has `hasSections: true` will **reject with 400** if
`sectionId` is missing (Enrollment, TeacherAttendanceScope, Attendance,
Fees, Exam results all enforce this — either via a model pre-validate
hook on write, or a `requireSectionIfNeeded` guard on read).

## `/teachers`
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | any | Each teacher includes `class`/`section` (homeroom, singular) and `assignments: [{class, section, subject}, ...]` (subject-teaching, a LIST, fully independent of homeroom). |
| POST | `/` | admin | `{email, password, name, homeroom?: {classId, sectionId?}, assignments?: [{classId, sectionId?, subjectId}, ...]}`. `homeroom` and `assignments` are both optional and independent — a teacher can have neither, either, or both, in any combination. Two different teachers CAN teach the same subject to different classes; only one teacher can hold the exact same `{class, section}` homeroom scope (409 on conflict). |
| PATCH | `/:id` | admin | `{name, phone, isActive}` |
| GET | `/:id/absences?month=YYYY-MM` | admin | Staff absence count for a calendar month (default: current month). |

## `/students`
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | any | Currently-enrolled students (active academic year) only. Includes `feeCategory`/`discountAmount`. |
| GET | `/graduates` | any | Separate endpoint — graduated students have NO active-year enrollment, so they never appear in the list above. Shows their last known class/section. |
| POST | `/` | admin | `{fullName, dob?, parentName?, parentPhone?, classId, sectionId?, feeCategory?, discountAmount?}`. `studentCode` is SERVER-GENERATED (globally unique via `Counter` — never send one). |
| PATCH | `/:id` | admin | `{fullName, dob, parentName, parentPhone, lifecycleStatus, feeCategory, discountAmount}`. Changing `feeCategory` takes effect on the NEXT month's fee (see `/fees` below). |
| GET | `/:id/absences` | any | `{absentDays, lateDays, academicYear}` for the active academic year (distinct dates, not raw records). |
| POST | `/:id/transfer` | admin | `{toSchoolId}` (omit for "Other" — just marks locally transferred, no data movement). Creates a brand-new Student+Enrollment at the destination school (same `fullName/dob/parentName/parentPhone/feeCategory/discountAmount`), matched to the destination's class by `level` (not name — names can differ between schools), first section alphabetically if that class has sections. The original Student/Enrollment become `lifecycleStatus/status: 'transferred'` — never deleted. Requires the destination school to have an active academic year and a class at that level. |

`lifecycleStatus` enum: `active, graduated, withdrawn, transferred` — note
this does **not** include `inactive`, which the old mock frontend used.
Reconcile this naming in Step 8.

## `/attendance` (student)
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/?classId=&sectionId=&date=&session=` | any | Teacher restricted to their own homeroom scope (403 otherwise). `session` is `before_break` or `after_break`. Each row includes `previousDayStatus` (same session, the day before) so the frontend can sort yesterday's absentees to the top. |
| POST | `/` | any (scoped) | `{enrollmentId, date, session, status}`. `status`: `present, absent, late, excused`. Upsert (safe to call twice). |

## `/teacher-attendance` (staff)
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/?date=` | admin | One record per teacher per day (no session split). |
| POST | `/` | admin | `{teacherId, date, status}`. Upsert. |

## `/fees`
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/?classId=&sectionId=&month=` | any | Returns one row per enrolled student. If no Fee doc is saved yet for that month, returns a **computed preview** (`id: null`) based on the student's `feeCategory`: `free` → 0, `discount` → `standardAmount - discountAmount`, `paid` → `standardAmount` (current `SchoolSettings.defaultStandardFeeAmount` at read time). |
| POST | `/` | admin | `{enrollmentId, month, amountPaid}`. First write for that student/month FREEZES `amountDue` (like an invoice) — later school-wide fee changes don't retroactively change an already-issued month. `free` students always land on `amountPaid: 0, status: 'paid'` regardless of what's sent. |

## `/exams` (terms)
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/?academicYearId=` | any | Defaults to active year. `name` IS the term name (e.g. "Term 1", "Final Exam"). |
| POST | `/` | admin | `{name, order?, isFinal?}`. `examMaxMarkSnapshot` taken from current `SchoolSettings.defaultExamMaxMark`. |
| GET | `/:id/results?classId=&sectionId=` | any | Per-student `marks`, `total`, `average` (over only the subjects that student actually has marks for — NOT all school subjects), `rank` (within this class/section only). Also returns `allPublished`, `canPublish` (computed for the requesting user), `isCurrentYear`. |
| PUT | `/:id/results` | any (scoped) | `{enrollmentId, subjectId, mark}`. 403 unless the teacher has a matching `TeacherAssignment` for that exact class+subject (admin always allowed). 403 if already `published` unless you're the homeroom teacher/admin. 400 if the exam is from a past year, or `mark` is out of `[0, examMaxMarkSnapshot]`. |
| POST | `/:id/publish` | any (scoped) | `{classId, sectionId}`. Only the homeroom teacher of that exact class/section, or admin. Marks EVERY currently-enrolled student in that class/section as published (creates an empty result if one doesn't exist yet). Safe to call again ("republish"). |
| POST | `/:id/room-split` | admin | `{classIds: [...], roomIds: [...]}`. Pools every enrolled student from the SELECTED classes (any section) and round-robins them across the SELECTED rooms. Classes not listed are completely untouched. Re-running for the same classIds is safe (deletes and recreates just those assignments). |
| GET | `/:id/room-split` | any | Current assignments, grouped by room name. |

## `/promotions`
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/run` | admin | `{toAcademicYearId}` (must be an existing `upcoming` year — create it first via `POST /academic-years`). Single-step, all-or-nothing per student: pass (by `Final Exam` total ≥ `passMarkSnapshot`) → promoted to next `Class` by `level` order (section carried over only if the next class has a same-named section); no next class → graduated; fail → repeats the same class/section in the new year. Closes the old year, activates the new one, updates `SchoolSettings.currentAcademicYearId`. |

## `/dashboard`
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/stats` | any | `{totalStudents, totalTeachers, attendanceToday: {present,absent,late,excused}, totalCollectedThisMonth, month, academicYear}`. **`attendanceToday` counts session-RECORDS, not unique students** — a student with two sessions today can appear in two different buckets. Fine for a dashboard snapshot; don't use it where an exact per-student count matters (use `/students/:id/absences` for that). |

## `/schools-directory`
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | any | `[{id, name}, ...]` — every OTHER school in the system (not your own). Powers the "transfer student" dropdown. "Other" (a school not on this system) is handled purely client-side — don't send `toSchoolId` for it. |

## `/announcements`
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | any | Newest first. Includes resolved `author` name. |
| POST | `/` | any | `{title, body, eventDate?}`. Author is whoever's logged in (admin or teacher). |
| DELETE | `/:id` | admin | |

---

## Known gaps / deliberate simplifications (read before Step 8)
- **`lifecycleStatus` naming mismatch**: backend has no `'inactive'` value; old frontend mock data did. Pick one during integration.
- **Login has no school selector**: fine for now (one deployment can serve many schools, but a person logs into exactly one via their own email), but if the same email string is ever reused across schools, this breaks — see the comment in `authController.js`.
- **Subject deletion doesn't check `StudentExamResult.marks`** (a Map keyed by subjectId) — only checks `TeacherAssignment`. Deleting a subject that already has recorded marks leaves orphaned keys in old results. Not fixed — flagged.
- **`PromotionRecommendation` model exists in the schema but has NO routes/controllers** — it was part of the original schema design for a full review-and-approve promotion workflow the actual frontend never asked for, so it was deliberately left unbuilt (promotion is single-step — see `/promotions/run`). `StudentTransfer` DOES now have a full workflow (see `/students/:id/transfer` above).
- **No file uploads** anywhere (e.g. a school `logoUrl` is just a plain string field — no image upload endpoint exists).
- **Fee's discount recompute uses the CURRENT standard amount**, not the one at student-creation time — deliberate (see `feeController.js`), but worth knowing.

## Seed (`npm run seed`)
Seed-ku wuxuu abuuraa KALIYA platform admin-ka (email/password `.env`-ka ka yimaada: `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`). Wax iskuul, admin, macalin ama arday ah ma abuuro, mana tirtiro xog jirta. Iskuullada waxaa abuura platform admin-ka (`platform-admin.html`).

## `/homework` (assignments / shaqo-guri)
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | teacher | Assignments-ka macalinku laftiisu qoray (sanadka active), kuwa ugu cusub marka hore. |
| POST | `/` | teacher | `{classId, sectionId?, subjectId, question}` (`question` ≤ 4000 xaraf). Macalinku waa inuu leeyahay `TeacherAssignment` fasalkaas + maadadaas (403 haddii kale). `sectionId` null = fasalka oo dhan (kaliya haddii xilsaarkiisu yahay fasalka oo dhan). |
| PUT | `/:id` | teacher | Isla body-ga POST. Kan qoray kaliya, sanadka active kaliya. |
| DELETE | `/:id` | teacher | Kan qoray kaliya. 204. |
| GET | `/mine` | student token | Assignments-ka fasalka (+ section-ka) ardaygu ku jiro sanadka active. Fasalka waxaa laga qaadaa Enrollment-ka, ma aha wax ardaygu soo dirayo. Assignment leh `sectionId: null` waxaa arka section kasta oo fasalka ah. |

## Fee manager (macalin maamula Fees)
- `Teacher.isFeeManager` (boolean, default `false`). Role-ka macalinku weli waa `teacher`.
- `POST /teachers` iyo `PATCH /teachers/:id` (admin kaliya) waxay aqbalaan `isFeeManager: true|false` (boolean kaliya, haddii kale 400).
- `GET /teachers` wuxuu soo celiyaa `isFeeManager`. `GET /auth/me` iyo login-ka macalinku wuxuu soo celiyaa `user.isFeeManager`.
- `GET /fees` iyo `POST /fees`: admin **ama** macalin `isFeeManager` ah (middleware `requireFeeAccess`). Macalinka waxaa DB-ga laga hubiyaa codsi kasta, sidaas darteed marka admin-ku ka qaado, waxay shaqayn joojisaa isla markiiba (token-ku isma beddelo).
- Macalin la xidho (`isActive: false`) wuxuu luminayaa `isFeeManager`.
