import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4001);
const eventServiceUrl = process.env.EVENT_SERVICE_URL || 'http://localhost:4002';
const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:4003';

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5174',
  credentials: true
}));
app.use(express.json());

function proxyTo(serviceUrl: string): express.RequestHandler {
  return async (request, response) => {
    try {
      const url = new URL(request.originalUrl.replace(/^\/api/, ''), serviceUrl);
      const headers: Record<string, string> = {};
      if (request.headers.cookie) {
        headers.Cookie = request.headers.cookie;
      }
      if (request.is('application/json')) {
        headers['Content-Type'] = 'application/json';
      }

      const hasBody = !['GET', 'HEAD'].includes(request.method);
      const upstream = await fetch(url, {
        method: request.method,
        headers,
        body: hasBody ? JSON.stringify(request.body ?? {}) : undefined
      });

      const setCookies = upstream.headers.getSetCookie();
      if (setCookies.length) {
        response.setHeader('Set-Cookie', setCookies);
      }

      if (upstream.status === 204) {
        response.status(204).end();
        return;
      }

      const contentType = upstream.headers.get('content-type');
      if (contentType) {
        response.setHeader('Content-Type', contentType);
      }
      response.status(upstream.status).send(await upstream.text());
    } catch (error) {
      console.error(`Could not reach microservice for ${request.originalUrl}:`, error);
      response.status(503).json({ error: 'A required service is unavailable' });
    }
  };
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', app: 'event-manager-api-gateway' });
});

app.use('/api/auth', proxyTo(userServiceUrl));
app.use('/api/events', proxyTo(eventServiceUrl));
app.use('/api/invitations', proxyTo(eventServiceUrl));

export { app, port };

