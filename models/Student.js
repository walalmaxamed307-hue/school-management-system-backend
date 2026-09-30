const mongoose = require('mongoose')

// Long-term identity, independent of class or year. Deliberately does NOT
// carry an authoritative "current class" or mutable status-as-truth field —
// that historical truth lives in Enrollment. lifecycleStatus here is a
// coarse, school-wide flag only (not per-year detail).
const studentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentCode: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    dob: { type: Date },
    parentName: { type: String, trim: true },
    parentPhone: { type: String, trim: true },
    lifecycleStatus: {
      type: String,
      required: true,
      enum: ['active', 'graduated', 'withdrawn', 'transferred'],
      default: 'active',
    },
    graduatedAt: { type: Date },

    // Billing category, set once at student creation, editable later by
    // admin. Drives how each month's Fee gets computed (see
    // controllers/feeController.js): 'free' -> amountDue always 0, 'paid'
    // -> the school's current standard amount, 'discount' -> standard
    // amount minus discountAmount (computed at the moment each month's
    // Fee is generated, using whatever the standard amount is THEN — not
    // frozen at student-creation time, so a school-wide fee change still
    // applies correctly to discounted students).
    feeCategory: {
      type: String,
      required: true,
      enum: ['paid', 'free', 'discount'],
      default: 'paid',
    },
    discountAmount: {
      type: Number,
      min: 0,
      required: function requiredForDiscount() {
        return this.feeCategory === 'discount'
      },
      validate: {
        validator: function forbidDiscountAmountOutsideDiscountCategory(v) {
          return !(this.feeCategory !== 'discount' && v !== undefined && v !== null)
        },
        message: 'discountAmount must not be set unless feeCategory is "discount"',
      },
    },

    // Transfer lineage (StudentTransfer is the controlled cross-school
    // bridge; these fields are the traceable link on each side of it).
    transferredFromSchoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    transferredFromStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    transferredToSchoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    transferredToStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  },
  { timestamps: true }
)

// studentCode is an IDENTIFIER only — never an authentication credential.
// GLOBALLY unique, not per-school: ID cards are scanned by the same
// system regardless of which school issued them, so two students sharing
// a code — even across two different schools — would be indistinguishable
// at a scanner. studentCode is auto-generated server-side (see
// controllers/studentController.js + models/Counter.js) precisely so this
// guarantee can never depend on an admin typing a unique value correctly.
studentSchema.index({ studentCode: 1 }, { unique: true })
studentSchema.index({ schoolId: 1, lifecycleStatus: 1 })

module.exports = mongoose.model('Student', studentSchema)
