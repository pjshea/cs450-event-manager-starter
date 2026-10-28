import { createHash } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const sessionCookieName = 'event_session';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function getSessionToken(request: Request) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return undefined;
  }

  const cookie = cookieHeader.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));
  return cookie ? decodeURIComponent(cookie.slice(sessionCookieName.length + 1)) : undefined;
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function setSessionCookie(
  response: Response,
  token: string,
  maxAgeSeconds: number
) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  );
}

export function clearSessionCookie(response: Response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`
  );
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  try {
    const token = getSessionToken(request);
    if (!token) {
      response.status(401).json({ error: 'Sign in to continue' });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: { userId: true, expiresAt: true }
    });

    if (!session || session.expiresAt <= new Date()) {
      response.status(401).json({ error: 'Your session has expired. Sign in again.' });
      return;
    }

    request.userId = session.userId;
    next();
  } catch (error) {
    console.error('Could not verify the user session:', error);
    response.status(503).json({ error: 'Authentication service is unavailable' });
  }
};
