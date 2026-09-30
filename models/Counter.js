const mongoose = require('mongoose')

// Global, NOT school-scoped — this is what makes studentCode collision-proof
// across the whole system (every school shares the same sequence), not just
// within one school. $inc via findOneAndUpdate is atomic in MongoDB even
// under concurrent requests, so two simultaneous "create student" calls can
// never receive the same number.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // counter name, e.g. 'studentCode'
  seq: { type: Number, default: 0 },
})

async function getNextSequence(name) {
  const Counter = mongoose.model('Counter')
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  )
  return counter.seq
}

module.exports = mongoose.model('Counter', counterSchema)
module.exports.getNextSequence = getNextSequence
