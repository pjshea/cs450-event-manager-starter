import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
interface HealthResponse {
  status: string;
  app: string;
  message: string;
}

const app = express();
const port = Number(process.env.PORT || 4001);

app.use(cors());
app.use(express.json());

const sampleEvents = [
  { id: 'evt-1', title: 'Design Meetup', date: '2026-09-10', location: 'Studio 2', capacity: 40 },
  { id: 'evt-2', title: 'Startup Pitch Night', date: '2026-09-14', location: 'Hudson Hall', capacity: 60 }
];

const sampleRSVPs = [
  { id: 'rsvp-1', eventId: 'evt-1', guestName: 'Ada', status: 'attending' },
  { id: 'rsvp-2', eventId: 'evt-1', guestName: 'Grace', status: 'waitlist' },
  { id: 'rsvp-3', eventId: 'evt-2', guestName: 'Linus', status: 'attending' }
];

app.get('/api/health', (_req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    app: 'event-manager-starter',
    message: 'Event Manager backend is running'
  };

  res.json(response);
});

app.get('/api/events', (_req, res) => {
  res.json(sampleEvents);
});

app.get('/api/rsvps', (_req, res) => {
  res.json(sampleRSVPs);
});

app.post('/api/rsvps', (req, res) => {
  const { eventId, guestName, status = 'attending' } = req.body ?? {};
  const newRSVP = {
    id: `rsvp-${Date.now()}`,
    eventId,
    guestName: guestName || 'Guest',
    status
  };

  sampleRSVPs.push(newRSVP);
  res.status(201).json(newRSVP);
});

app.listen(port, () => {
  console.log(`Event Manager backend running on http://localhost:${port}`);
});
