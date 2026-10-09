const crypto = require('crypto')
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
let client
const configured = () => Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET)
function requireConfigured() { if (!configured()) { const e = new Error('Kaydinta files (Cloudflare R2) weli lama dejin.'); e.status = 503; throw e } }
function s3() { requireConfigured(); if (!client) client = new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' }); return client }
const key = (schoolId, assignmentId, ext) => `schools/${schoolId}/assignments/${assignmentId}/${crypto.randomUUID()}${ext}`
const logoKey = (schoolId, ext) => `schools/${schoolId}/logo/${crypto.randomUUID()}${ext}`
async function putObject({ key: Key, body, contentType }) { await s3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key, Body: body, ContentType: contentType, ContentLength: body.length, CacheControl: 'private, max-age=0' })) }
async function signedUrl(Key, opts = {}) { return getSignedUrl(s3(), new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key, ...(opts.filename ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(opts.filename)}` } : {}) }), { expiresIn: opts.expiresIn || 300 }) }
async function deleteObject(Key) { if (!Key || !configured()) return; try { await s3().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key })) } catch (e) { console.error('R2 delete failed:', e.message) } }
module.exports = { isConfigured: configured, requireConfigured, assignmentKey: key, logoKey, putObject, signedUrl, deleteObject }
