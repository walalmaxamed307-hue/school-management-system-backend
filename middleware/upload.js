const multer = require('multer')
function singleFile(field, maxBytes) {
  const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 12, fieldSize: 16 * 1024, parts: 16 } }).single(field)
  return (req, res, next) => parser(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Faylku aad buu u weyn yahay (ugu badnaan ${maxBytes / 1024 / 1024}MB)` })
    if (err.name === 'MulterError') return res.status(400).json({ error: 'Upload-ku wuu fashilmay.' })
    next(err)
  })
}
module.exports = { singleFile }
