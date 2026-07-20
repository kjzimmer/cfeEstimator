// Express 4 doesn't forward rejected promises from async handlers to error
// middleware on its own -- wrap every route handler with this so failures
// reach the error handler instead of hanging the request.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
