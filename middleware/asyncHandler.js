// Express 4 does not await route handlers — an async function that throws
// produces an unhandled promise rejection, NOT a call to next(err), so it
// never reaches the central error handler in server.js and the request
// just hangs. Every async route handler in this codebase must be wrapped
// in this (or Express 5's built-in handling, which we're not on yet).
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = asyncHandler
