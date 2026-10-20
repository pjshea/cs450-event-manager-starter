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
docker compose up -d
npx --prefix backend prisma generate
npx --prefix backend prisma migrate dev --name init
```

The database runs in Docker on port `5433`. The migration command creates the
database tables from the Prisma schema.

Open two terminal windows from the project root and start the application:

Terminal 1, the backend:

```bash
npm --prefix backend run dev
```

Terminal 2, the frontend:

```bash
npm --prefix frontend run dev
```

Open http://localhost:5174 in a browser. The backend API is available at
http://localhost:4001.

To stop the database, run this from the project root:

```bash
docker compose down
```

## Expected project outcomes
- a working event management and RSVP workflow
- a structured backlog for feature enhancements
- a deployable app setup
- a polished final demo and product walkthrough

## Assignment 1 Setup

Selected Application: Event Manager

Required Software:
Git 2.55.0
Node.js 24.21.0
npm 11.9.0
Docker 29.8.1
Docker Compose v5.5.1
Visual Studio Code

Evironment Setup:
I cloned the shared event manager repository and created my personal branch assignment-1/Georgehh03.

I created the backend environment file using this command:
Copy-Item backend/.env.example backend/.env

The backend uses PostgreSQL, which runs through DockerCompose.

Install Dependencies:

Ran this in the project root:
npm --prefix backend install
npm --prefix frontend install

Docker and Prisma Setup:

started PostgreSQL with:
docker compose up -d
docker compose ps

Generate Prisma Client and apply the database migration:
cd backend
npx prisma generate
npx prisma migrate dev --name init
cd ..

Starting the Application

Started the backend in the first terminal with:
npm --prefix backend run dev

Opened a second terminal and started the frontend with:
npm --prefix frontend run dev


Local URLs and Ports:

Frontend: http://localhost:5174
Backend: http://localhost:4001
Health-check endpoint: http://localhost:4001/api/health

PostgreSQL: localhost:5433


TypeScript Verification Change

I added a HealthResponse interface to the backend to define the structure of the health Check API response.

The interface contains three properties such as status, app, and message, which uses the TypeScript string type.

I updated the /api/health endpoint to use this interface and returned a message to confirm that the backend is running alright.
I tested the HealthCheck endpoint in my browser at http://localhost:4001/api/health

Trouble Shooting:

I encountered an issues where VS Code blocked my npm commands because script execution was disabled

The terminal displayed: npm.ps1 cannot be loaded because running scripts is disabled on this system PSSecurityException

I fixed the issue using this command that was generated from ChatGPT:
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

After changing the policy, I ran the command again and confirmed that npm was working now
