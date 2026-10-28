import { expect, test } from 'vitest';
import { eventSchema, eventUpdateSchema, invitationSchema } from './eventSchema.js';
import { loginSchema, registerSchema } from './authSchemas.js';

test('event schema validates event data and converts dollar prices to cents', () => {
  const result = eventSchema.parse({
    title: '  Open studio  ',
    date: '2026-12-01',
    location: 'Main hall',
    guidanceUrl: 'https://maps.example.test/event',
    capacity: 24,
    price: 8.5,
    description: 'An evening together',
    inviteEmails: ['FRIEND@example.test']
  });

  expect(result.title).toBe('Open studio');
  expect(result.price).toBe(850);
  expect(result.inviteEmails).toEqual(['friend@example.test']);
});

test('event schema rejects invalid dates, prices, and non-web directions links', () => {
  for (const invalid of [
    { date: '2026-02-30' },
    { price: -1 },
    { guidanceUrl: 'javascript:alert(1)' }
  ]) {
    expect(eventSchema.safeParse({
      title: 'Community dinner',
      date: '2026-12-01',
      location: 'Main hall',
      capacity: 24,
      price: 0,
      ...invalid
    }).success).toBe(false);
  }
});

test('event update schema accepts partial changes but rejects empty updates', () => {
  expect(eventUpdateSchema.parse({ capacity: 30 }).capacity).toBe(30);
  expect(eventUpdateSchema.safeParse({}).success).toBe(false);
});

test('invitation addresses are normalized and limited to valid emails', () => {
  expect(invitationSchema.parse({ emails: ['  USER@example.test '] })).toEqual({
    emails: ['user@example.test']
  });
  expect(invitationSchema.safeParse({ emails: ['not-an-email'] }).success).toBe(false);
});

test('account schemas normalize email and require a strong-enough password', () => {
  expect(registerSchema.parse({
    name: 'Guest',
    email: 'GUEST@example.test',
    password: 'long-enough-password'
  }).email).toBe('guest@example.test');
  expect(registerSchema.safeParse({
    name: 'Guest',
    email: 'guest@example.test',
    password: 'short'
  }).success).toBe(false);
  expect(loginSchema.safeParse({ email: 'invalid', password: 'secret' }).success).toBe(false);
});