// lib/auth.ts

export function isAdminAuthenticated(req: Request): boolean {
  const authHeader = req.headers.get('authorization');
  const expected = `Bearer ${process.env.ADMIN_SECRET}`;
  return authHeader === expected;
}
