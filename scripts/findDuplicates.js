// Ordi tan MARKA HORE haddii server-ku diido inuu bilaabmo isaga oo
// sheegaya "Index build failed". Wuxuu si otomaatig ah u eegayaa DHAMMAAN
// model-yada unique-index leh (Class, Subject, Room, Section, User, iyo
// mid kasta oo mustaqbalka lagu daro) — ma aha liis gacan lagu qoray oo
// laga yaabo in la illaawo cusboonaysiin.
//
// Usage: npm run find-duplicates

require('dotenv').config()
const mongoose = require('mongoose')
const { connectDB } = require('../config/db')
const models = require('../models')

async function findDuplicatesFor(Model, spec, options) {
  const groupId = {}
  for (const key of Object.keys(spec)) groupId[key] = `$${key}`

  const pipeline = []
  if (options.partialFilterExpression) {
    pipeline.push({ $match: options.partialFilterExpression })
  }
  pipeline.push(
    { $group: { _id: groupId, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  )
  return Model.aggregate(pipeline)
}

async function main() {
  await connectDB()
  let issueCount = 0

  for (const name of Object.keys(models)) {
    const Model = models[name]
    const indexes = Model.schema.indexes() // [[spec, options], ...]
    for (const [spec, options] of indexes) {
      if (!options.unique) continue
      const dups = await findDuplicatesFor(Model, spec, options)
      if (dups.length > 0) {
        issueCount += dups.length
        console.log(`\n⚠️  ${name} — duplicates violating unique index ${JSON.stringify(spec)}:`)
        for (const d of dups) {
          console.log(`   value ${JSON.stringify(d._id)} → ${d.count} documents: ${d.ids.join(', ')}`)
        }
      }
    }
  }

  if (issueCount === 0) {
    console.log('✅ No duplicate data found — safe to start the server / run the seed.')
  } else {
    console.log(
      `\n❌ ${issueCount} duplicate group(s) found. Open MongoDB Compass, decide which document ` +
        'to keep for each group above, and delete the others (by _id) before restarting the server.'
    )
  }

  await mongoose.disconnect()
  process.exit(issueCount === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
