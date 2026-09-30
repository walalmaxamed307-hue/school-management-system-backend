const mongoose = require('mongoose')
require('dotenv').config()

// Minimal connection helper — intentionally not "complete production
// infrastructure" (retry policies, pooling tuning, etc.) per this task's
// scope. MONGODB_URI is expected from the environment; nothing here
// hard-codes a connection string.
async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is not set')
  }
  await mongoose.connect(uri)
  return mongoose.connection
}

// MongoDB builds a unique index in the background the first time a model
// is used on a connection. If the collection ALREADY contains documents
// that violate that uniqueness (leftover from testing, manual Compass
// edits, or an older version of the schema), the index build fails
// SILENTLY — Mongoose does not crash the app or throw where you'd notice.
// The result: the code says a field is unique, but MongoDB is not
// actually enforcing it, and duplicates keep slipping in with no error.
//
// This function forces every model's indexes to build NOW, at startup,
// and turns a silent failure into a loud, specific one — naming which
// model and which duplicate value blocked it — instead of letting the
// app run for weeks with a broken guarantee. Call it right after
// connectDB(), before the app does anything else.
async function verifyIndexes() {
  const models = require('../models')
  const failures = []
  for (const name of Object.keys(models)) {
    try {
      await models[name].syncIndexes()
    } catch (err) {
      failures.push(`- ${name}: ${err.message}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(
      'Index build failed — this almost always means duplicate data already exists ' +
        'that violates a unique rule (e.g. two Classes named the same in one school). ' +
        'Run `npm run find-duplicates` to see exactly which documents conflict, remove ' +
        "or fix them in Compass, then restart.\n\n" +
        failures.join('\n')
    )
  }
}

module.exports = { connectDB, verifyIndexes }
