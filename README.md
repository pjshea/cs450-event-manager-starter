# Event Manager Starter

A full-stack event planning and RSVP application for organizing events, tracking attendance, and managing registrations.

## Product overview
This app helps organizers create events, invite attendees, manage RSVPs, and monitor capacity in one place. It is designed to model common event operations and real-world business rules.

## Core user experience
- create events with a title, date, time, location, and description
- view upcoming events in a searchable list
- RSVP to an event
- update attendee status
- monitor event capacity and attendance
- filter events by date or category

## MVP features to implement
- event list and detail pages
- event creation and editing
- attendee RSVP flow
- attendance and status tracking
- capacity and registration rules
- seeded demo events for testing

## Optional PM enhancements
- waitlist logic
- event categories and tags
- organizer check-in workflow
- cancellation and refund handling
- attendee messaging
- attendance trend analytics

## Tech stack
- Backend: Node.js, Express, TypeScript
- Frontend: React + TypeScript
- Database: PostgreSQL + Prisma
- Tooling: Docker Compose

## Getting started

### Prerequisites

Install the following before starting:

- Git
- Node.js 20 or later, which includes npm
- Docker Desktop or Docker Engine with Docker Compose

### Create your project copy

1. Click **Fork** and create the fork in your own account or team organization. Forking creates your GitHub copy; it does not download the files to your computer.
2. Clone your fork, replacing `YOUR-GITHUB-USERNAME` with the account or organization that owns your fork:

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/cs450-event-manager-starter.git
cd cs450-event-manager-starter
```

### Configure and start the application

Run these commands from the project root:

```bash
cp backend/.env.example backend/.env
npm --prefix backend install
npm --prefix frontend install
docker compose up -d --wait
npm --prefix backend run prisma:generate
npm --prefix backend run db:push
```

The database runs in Docker on port `5433`. The `db:push` command creates or
updates the database tables from the Prisma schema.

The demo uses an event and user-service slice of the microservice
architecture. The React client calls the API gateway, which routes account
requests to the user service and event, registration, and invitation requests
to the event service. Both services use PostgreSQL.

Open four terminal windows from the project root and start each service:

Terminal 1, the event service:

```bash
npm --prefix backend run dev:event
```

Terminal 2, the user service:

```bash
npm --prefix backend run dev:user
```

Terminal 3, the API gateway:

```bash
npm --prefix backend run dev
```

Terminal 4, the frontend:

```bash
npm --prefix frontend run dev
```

Open http://localhost:5174 in a browser. The API gateway is available at
http://localhost:4001 and the event service at http://localhost:4002. The
user service is available at http://localhost:4003. The
frontend proxies `/api` requests to the gateway, so it does not need a separate
API URL or CORS configuration.

## Demo walkthrough

1. Create a user account with an email and a password of at least 10 characters.
2. Create an event with a name, date, location, capacity, and optional price,
   directions link, description, and invitations to existing accounts.
3. Sign out and sign in as an invited account. Accept or decline the invitation,
   or find and reserve an open event in **Discover**.
4. Check **My events** to see events you host (including past events) or events
   you are attending. Remaining spots update when users reserve or cancel.
5. Use **Invite people** on an event you host to invite registered users later.

Event prices are informational only; this demo does not collect payments.
Passwords are stored as salted hashes and login sessions use HTTP-only cookies.
Account creation is local and does not send email verification messages.

To stop the database, run this from the project root:

```bash
docker compose down
```

## Expected project outcomes
- a working event management and RSVP workflow
- a structured backlog for feature enhancements
- a deployable app setup
- a polished final demo and product walkthrough

## Architecture and schema decisions

The website is split into a React/TypeScript client, an Express API gateway, and two backend services. Vite serves the frontend and proxies its `/api` calls to the gateway. The gateway forwards `/api/auth` requests to the user service and `/api/events` and `/api/invitations` requests to the event service, forwarding session cookies and returning service responses. Both services use PostgreSQL through Prisma.

The user service handles accounts and sessions. It stores a unique email and a salted password hash. Login sessions use an HTTP-only cookie; the database stores a hash of the session token and its expiration time. The event service requires an authenticated user for event, registration, and invitation routes.

The Prisma schema separates `User`, `Event`, `Registration`, and `Invitation` because hosting, attending, and being invited are distinct relationships. A unique `[eventId, userId]` constraint prevents duplicate registrations, and a unique `[eventId, recipientId]` constraint prevents duplicate invitations to the same event. The schema also contains a separate guest-name `RSVP` model; the current account-based reservation routes use `Registration`.

Each event stores its total `capacity` and its `remainingSpots`. Transactions update availability when users register or cancel, while a unique user/event registration prevents duplicate reservations. Request validation uses Zod: event dates must be valid `YYYY-MM-DD` dates, capacity must be a positive integer, and prices entered in dollars are converted to a integer. PostgreSQL runs through Docker Compose, and Prisma applies the schema with `db:push`.
