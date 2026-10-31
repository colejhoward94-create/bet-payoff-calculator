// GET /api/ping  ->  tells the app whether a passcode is needed and whether the key is set
export default function handler(req, res) {
  const want = process.env.APP_PASSCODE;
  const code = String(req.query?.code || '');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    needsCode: !!want && code !== want,
    keySet: !!process.env.PROPLINE_API_KEY,
  });
}
