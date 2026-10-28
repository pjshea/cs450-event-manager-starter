import { z } from 'zod';

const eventFields = {
  title: z.string().trim().min(1, 'Title is required').max(120),
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
    .refine((value) => {
      const parsedDate = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
    }, 'Date must be a valid calendar date'),
  location: z.string().trim().min(1, 'Location is required').max(200),
  guidanceUrl: z.union([
    z.string().trim().url('Enter a valid map or directions link')
      .refine((value) => /^https?:\/\//i.test(value), 'Directions links must use HTTP or HTTPS'),
    z.literal('')
  ]).optional(),
  capacity: z.number().int().positive('Capacity must be a positive integer').max(100000),
  price: z.number().finite().min(0).max(10000).transform((value) => Math.round(value * 100)),
  description: z.string().trim().max(1000).optional()
};

export const eventSchema = z.object({
  ...eventFields,
  inviteEmails: z.array(z.string().trim().email().transform((email) => email.toLowerCase())).max(100).default([])
}).strict();

export const eventUpdateSchema = z.object({
  title: eventFields.title.optional(),
  date: eventFields.date.optional(),
  location: eventFields.location.optional(),
  guidanceUrl: eventFields.guidanceUrl.optional(),
  capacity: eventFields.capacity.optional(),
  price: eventFields.price.optional(),
  description: eventFields.description.optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const invitationSchema = z.object({
  emails: z.array(z.string().trim().email().transform((email) => email.toLowerCase())).min(1).max(100)
}).strict();
