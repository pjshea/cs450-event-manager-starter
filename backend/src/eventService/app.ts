import express from 'express';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { eventSchema, eventUpdateSchema, invitationSchema } from '../schemas/eventSchema.js';
import { validateBody } from '../middleware/validateBody.js';

dotenv.config();

const app = express();
const port = Number(process.env.EVENT_SERVICE_PORT || 4002);
const prisma = new PrismaClient();
const today = () => new Date(new Date().toISOString().slice(0, 10));

app.use(express.json());

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function sendApiError(response: express.Response, error: unknown, operation: string) {
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    response.status(409).json({ error: 'You are already registered for this event' });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    response.status(409).json({ error: 'Event availability changed. Refresh and try again.' });
    return;
  }

  console.error(`${operation}:`, error);
  response.status(503).json({ error: 'The event service could not complete this request' });
}

function routeParam(request: express.Request, name: string) {
  const value = request.params[name];
  if (typeof value !== 'string') {
    throw new ApiError(400, `Invalid ${name}`);
  }
  return value;
}

function eventResponse(
  event: {
    date: Date;
    priceCents: number;
    registrations: { userId: string }[];
    _count: { registrations: number };
    creator: { id: string; name: string } | null;
    [key: string]: unknown;
  },
  userId: string
) {
  const { date, priceCents, registrations, _count, creator, ...fields } = event;
  return {
    ...fields,
    date: date.toISOString().slice(0, 10),
    priceCents,
    registeredCount: _count.registrations,
    remainingSpots: Number(fields.remainingSpots),
    viewerRegistered: registrations.some((registration) => registration.userId === userId),
    creator: creator || { id: '', name: 'Community host' }
  };
}

const eventView = {
  creator: { select: { id: true, name: true } },
  _count: { select: { registrations: true } },
  registrations: { select: { userId: true } }
} as const;

async function registerForEvent(eventId: string, userId: string) {
  return prisma.$transaction(async (transaction) => {
    const event = await transaction.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new ApiError(404, 'Event not found');
    }
    if (event.date < today()) {
      throw new ApiError(409, 'Registration for this event is closed');
    }
    const updated = await transaction.event.updateMany({
      where: { id: eventId, remainingSpots: { gt: 0 } },
      data: { remainingSpots: { decrement: 1 } }
    });
    if (updated.count === 0) {
      throw new ApiError(409, 'This event is full');
    }

    return transaction.registration.create({
      data: { eventId, userId }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function restoreLegacyEventAvailability() {
  const legacyEvents = await prisma.event.findMany({
    where: { remainingSpots: 0 },
    select: {
      id: true,
      capacity: true,
      _count: { select: { registrations: true } }
    }
  });

  for (const event of legacyEvents) {
    const remainingSpots = Math.max(0, event.capacity - event._count.registrations);
    if (remainingSpots > 0) {
      await prisma.event.updateMany({
        where: { id: event.id, remainingSpots: 0 },
        data: { remainingSpots }
      });
    }
  }
}

app.get('/health', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await restoreLegacyEventAvailability();
    response.json({ status: 'ok', service: 'event-service', database: 'connected' });
  } catch (error) {
    console.error('Event database health check failed:', error);
    response.status(503).json({ status: 'unavailable', service: 'event-service', database: 'disconnected' });
  }
});

app.use(requireAuth);

app.get('/events', async (request, response) => {
  try {
    await restoreLegacyEventAvailability();
    const scope = request.query.scope;
    const search = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const where: Prisma.EventWhereInput = scope === 'mine'
      ? { createdById: request.userId }
      : scope === 'registered'
        ? { registrations: { some: { userId: request.userId } } }
        : { date: { gte: today() } };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } }
      ];
    }

    const events = await prisma.event.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
      include: {
        ...eventView,
        registrations: {
          where: { userId: request.userId },
          select: { userId: true }
        }
      }
    });

    response.json(events.map((event) => eventResponse(event, request.userId!)));
  } catch (error) {
    sendApiError(response, error, 'Could not load events from the event database');
  }
});

app.post('/events', validateBody(eventSchema), async (request, response) => {
  const input = eventSchema.parse(request.body);
  try {
    const event = await prisma.$transaction(async (transaction) => {
      const invitedUsers = input.inviteEmails.length
        ? await transaction.user.findMany({
          where: { email: { in: input.inviteEmails } },
          select: { id: true, email: true }
        })
        : [];
      const foundEmails = new Set(invitedUsers.map((user) => user.email));
      const unknownEmails = input.inviteEmails.filter((email) => !foundEmails.has(email));
      if (unknownEmails.length) {
        throw new ApiError(400, `No registered account found for: ${unknownEmails.join(', ')}`);
      }

      const created = await transaction.event.create({
        data: {
          title: input.title,
          date: new Date(`${input.date}T00:00:00.000Z`),
          location: input.location,
          guidanceUrl: input.guidanceUrl || null,
          capacity: input.capacity,
          remainingSpots: input.capacity,
          priceCents: input.price,
          description: input.description || null,
          createdById: request.userId!,
          invitations: {
            createMany: {
              data: invitedUsers
                .filter((user) => user.id !== request.userId)
                .map((user) => ({ senderId: request.userId!, recipientId: user.id })),
              skipDuplicates: true
            }
          }
        }
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const result = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { ...eventView, registrations: { where: { userId: request.userId }, select: { userId: true } } }
    });
    response.status(201).json(eventResponse(result, request.userId!));
  } catch (error) {
    sendApiError(response, error, 'Could not create event');
  }
});

app.patch('/events/:eventId', async (request, response) => {
  const parsed = eventUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid event update', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const input = parsed.data;

  try {
    const event = await prisma.$transaction(async (transaction) => {
      const eventId = routeParam(request, 'eventId');
      const existing = await transaction.event.findUnique({ where: { id: eventId } });
      if (!existing) {
        throw new ApiError(404, 'Event not found');
      }
      if (existing.createdById !== request.userId) {
        throw new ApiError(403, 'Only the event creator can edit this event');
      }

      const registrationCount = await transaction.registration.count({ where: { eventId: existing.id } });
      if (input.capacity !== undefined && input.capacity < registrationCount) {
        throw new ApiError(409, 'Capacity cannot be lower than the number of people already registered');
      }

      return transaction.event.update({
        where: { id: existing.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.date !== undefined ? { date: new Date(`${input.date}T00:00:00.000Z`) } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.guidanceUrl !== undefined ? { guidanceUrl: input.guidanceUrl || null } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
          ...(input.price !== undefined ? { priceCents: input.price } : {}),
          ...(input.capacity !== undefined
            ? { capacity: input.capacity, remainingSpots: input.capacity - registrationCount }
            : {})
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const result = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { ...eventView, registrations: { where: { userId: request.userId }, select: { userId: true } } }
    });
    response.json(eventResponse(result, request.userId!));
  } catch (error) {
    sendApiError(response, error, 'Could not update event');
  }
});

app.post('/events/:eventId/registrations', async (request, response) => {
  try {
    await restoreLegacyEventAvailability();
    const registration = await registerForEvent(routeParam(request, 'eventId'), request.userId!);
    response.status(201).json(registration);
  } catch (error) {
    sendApiError(response, error, 'Could not register for event');
  }
});

app.delete('/events/:eventId/registrations', async (request, response) => {
  try {
    await prisma.$transaction(async (transaction) => {
      const deleted = await transaction.registration.deleteMany({
        where: { eventId: routeParam(request, 'eventId'), userId: request.userId }
      });
      if (deleted.count) {
        const event = await transaction.event.findUnique({ where: { id: routeParam(request, 'eventId') } });
        if (event && event.remainingSpots < event.capacity) {
          await transaction.event.update({
            where: { id: event.id },
            data: { remainingSpots: { increment: 1 } }
          });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    response.status(204).end();
  } catch (error) {
    sendApiError(response, error, 'Could not cancel event registration');
  }
});

app.post('/events/:eventId/invitations', validateBody(invitationSchema), async (request, response) => {
  const input = invitationSchema.parse(request.body);
  try {
    const event = await prisma.event.findUnique({ where: { id: routeParam(request, 'eventId') } });
    if (!event) {
      throw new ApiError(404, 'Event not found');
    }
    if (event.createdById !== request.userId) {
      throw new ApiError(403, 'Only the event creator can invite guests');
    }

    const users = await prisma.user.findMany({
      where: { email: { in: input.emails } },
      select: { id: true, email: true }
    });
    const foundEmails = new Set(users.map((user) => user.email));
    const unknownEmails = input.emails.filter((email) => !foundEmails.has(email));
    if (unknownEmails.length) {
      throw new ApiError(400, `No registered account found for: ${unknownEmails.join(', ')}`);
    }

    const result = await prisma.invitation.createMany({
      data: users
        .filter((user) => user.id !== request.userId)
        .map((user) => ({ eventId: event.id, senderId: request.userId!, recipientId: user.id })),
      skipDuplicates: true
    });
    response.status(201).json({ sent: result.count });
  } catch (error) {
    sendApiError(response, error, 'Could not send event invitations');
  }
});

app.get('/invitations', async (request, response) => {
  try {
    const invitations = await prisma.invitation.findMany({
      where: { recipientId: request.userId, status: 'pending' },
      include: {
        sender: { select: { name: true } },
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            location: true,
            guidanceUrl: true,
            capacity: true,
            remainingSpots: true,
            priceCents: true,
            description: true,
            createdById: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    response.json(invitations.map((invitation) => ({
      ...invitation,
      event: {
        ...invitation.event,
        date: invitation.event.date.toISOString().slice(0, 10)
      }
    })));
  } catch (error) {
    sendApiError(response, error, 'Could not load invitations');
  }
});

app.post('/invitations/:invitationId/accept', async (request, response) => {
  try {
    await restoreLegacyEventAvailability();
    const invitation = await prisma.invitation.findFirst({
      where: { id: routeParam(request, 'invitationId'), recipientId: request.userId }
    });
    if (!invitation) {
      throw new ApiError(404, 'Invitation not found');
    }
    if (invitation.status !== 'pending') {
      throw new ApiError(409, 'This invitation has already been answered');
    }

    await prisma.$transaction(async (transaction) => {
      const alreadyRegistered = await transaction.registration.findUnique({
        where: { eventId_userId: { eventId: invitation.eventId, userId: request.userId! } }
      });
      if (!alreadyRegistered) {
        const event = await transaction.event.findUnique({ where: { id: invitation.eventId } });
        if (!event || event.date < today()) {
          throw new ApiError(409, 'Registration for this event is closed');
        }
        const updated = await transaction.event.updateMany({
          where: { id: event.id, remainingSpots: { gt: 0 } },
          data: { remainingSpots: { decrement: 1 } }
        });
        if (!updated.count) {
          throw new ApiError(409, 'This event is full');
        }
        await transaction.registration.create({
          data: { eventId: event.id, userId: request.userId! }
        });
      }
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted' }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    response.status(204).end();
  } catch (error) {
    sendApiError(response, error, 'Could not accept invitation');
  }
});

app.post('/invitations/:invitationId/decline', async (request, response) => {
  try {
    const result = await prisma.invitation.updateMany({
      where: { id: routeParam(request, 'invitationId'), recipientId: request.userId, status: 'pending' },
      data: { status: 'declined' }
    });
    if (!result.count) {
      throw new ApiError(404, 'Pending invitation not found');
    }
    response.status(204).end();
  } catch (error) {
    sendApiError(response, error, 'Could not decline invitation');
  }
});

export { app, port };
