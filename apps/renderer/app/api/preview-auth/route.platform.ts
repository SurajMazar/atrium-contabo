import { previewCookie } from '@/lib/platform';

/** Password form target for protected previews: stores the password in an httpOnly cookie scoped to the preview. */
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get('token') ?? '').replace(/[^\w-]/g, '');
  const password = String(form.get('password') ?? '');
  const path = String(form.get('path') ?? '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  if (!token) return new Response('Bad request', { status: 400 });
  const location = `/_preview/${token}${path ? `/${path}` : ''}`;
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Set-Cookie': `${previewCookie(token)}=${encodeURIComponent(password)}; Path=/_preview/${token}; HttpOnly; SameSite=Lax; Max-Age=86400${secure}` },
  });
}
