import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, clearSessionCookie, getSessionToken, hashSessionToken, setSessionCookie } from '../middleware/auth.js';
import { validateBody } from '../middleware/validateBody.js';
import { loginSchema, registerSchema } from '../schemas/authSchemas.js';

dotenv.config();

const app = express();
const port = Number(process.env.USER_SERVICE_PORT || 4003);
const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);
const sessionDurationSeconds = 60 * 60 * 24 * 7;

app.use(express.json());

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) {
    return false;
  }

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function startSession(userId: string, response: express.Response) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);

  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt
    }
  });
  setSessionCookie(response, token, sessionDurationSeconds);
}

app.get('/health', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ status: 'ok', service: 'user-service', database: 'connected' });
  } catch (error) {
    console.error('User service health check failed:', error);
    response.status(503).json({ status: 'unavailable', service: 'user-service', database: 'disconnected' });
  }
});

app.post('/auth/register', validateBody(registerSchema), async (request, response) => {
  const input = registerSchema.parse(request.body);
  try {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash
        },
        select: { id: true, name: true, email: true, createdAt: true }
      });
      await transaction.session.create({
        data: {
          tokenHash: hashSessionToken(token),
          userId: createdUser.id,
          expiresAt
        }
      });
      return createdUser;
    });

    setSessionCookie(response, token, sessionDurationSeconds);
    response.status(201).json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      response.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    console.error('Could not create user account:', error);
    response.status(503).json({ error: 'Could not create your account right now' });
  }
});

app.post('/auth/login', validateBody(loginSchema), async (request, response) => {
  const input = loginSchema.parse(request.body);
  try {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      response.status(401).json({ error: 'Email or password is incorrect' });
      return;
    }

    await startSession(user.id, response);
    response.json({
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }
    });
  } catch (error) {
    console.error('Could not sign in user:', error);
    response.status(503).json({ error: 'Could not sign in right now' });
  }
});

app.get('/auth/me', requireAuth, async (request, response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { id: true, name: true, email: true, createdAt: true }
    });
    if (!user) {
      response.status(401).json({ error: 'Your account is no longer available' });
      return;
    }
    response.json({ user });
  } catch (error) {
    console.error('Could not load current user:', error);
    response.status(503).json({ error: 'Could not load your account right now' });
  }
});

app.post('/auth/logout', async (request, response) => {
  try {
    const token = getSessionToken(request);
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    }
    clearSessionCookie(response);
    response.status(204).end();
  } catch (error) {
    console.error('Could not sign out user:', error);
    response.status(503).json({ error: 'Could not sign out right now' });
  }
});

  export { app, port };

