const path = require('path')
const MB = 1024 * 1024
const ASSIGNMENT_MAX_BYTES = 10 * MB
const LOGO_MAX_BYTES = 2 * MB
const begins = (b, a, o = 0) => a.every((n, i) => b[o + i] === n)
const zip = (b) => begins(b, [0x50, 0x4b, 0x03, 0x04])
const ole = (b) => begins(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const png = (b) => begins(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const jpg = (b) => begins(b, [0xff, 0xd8, 0xff])
const pdf = (b) => b.subarray(0, 1024).includes('%PDF-')
const text = (b) => !b.subarray(0, 8192).includes(0)
const OOXML = 'application/vnd.openxmlformats-officedocument'
const ASSIGNMENT_TYPES = { '.pdf': ['application/pdf', pdf], '.doc': ['application/msword', ole], '.docx': [`${OOXML}.wordprocessingml.document`, zip], '.ppt': ['application/vnd.ms-powerpoint', ole], '.pptx': [`${OOXML}.presentationml.presentation`, zip], '.xls': ['application/vnd.ms-excel', ole], '.xlsx': [`${OOXML}.spreadsheetml.sheet`, zip], '.txt': ['text/plain; charset=utf-8', text], '.png': ['image/png', png], '.jpg': ['image/jpeg', jpg], '.jpeg': ['image/jpeg', jpg] }
const LOGO_TYPES = { '.png': ASSIGNMENT_TYPES['.png'], '.jpg': ASSIGNMENT_TYPES['.jpg'], '.jpeg': ASSIGNMENT_TYPES['.jpeg'] }
function inspectFile(file, types) { const ext = path.extname(String(file?.originalname || '')).toLowerCase(); const rule = types[ext]; if (!rule) { const e = new Error(`Nooca faylkan lama ogola. La ogol yahay: ${Object.keys(types).join(', ')}`); e.status = 400; throw e }; if (!file.buffer?.length || !rule[1](file.buffer)) { const e = new Error('Nuxurka faylka ma waafaqsana noociisa.'); e.status = 400; throw e }; return { ext: ext === '.jpeg' ? '.jpg' : ext, mime: rule[0] } }
function displayName(name) { return String(name || 'file').replace(/[\x00-\x1f\x7f\\/]/g, '_').trim().slice(0, 150) || 'file' }
module.exports = { ASSIGNMENT_MAX_BYTES, LOGO_MAX_BYTES, ASSIGNMENT_TYPES, LOGO_TYPES, inspectFile, displayName }
