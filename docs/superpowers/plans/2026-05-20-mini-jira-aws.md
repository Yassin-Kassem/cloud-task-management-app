# Mini-Jira on AWS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight team task-management web app ("Mini-Jira") deployed on AWS with full CRUD, Cognito auth, team isolation, event-driven architecture (SNS/SQS/EventBridge), S3 image pipeline with Lambda resize, CloudWatch monitoring, and high-availability deployment (2 AZs, ALB, ASG, CloudFront).

**Architecture:** React SPA (Vite + Tailwind + shadcn/ui) served via CloudFront from an S3 origin, with API calls routed through CloudFront to an ALB origin. Express.js backend runs on EC2 instances across 2 AZs in private subnets behind the ALB. DynamoDB for all persistence, Cognito for auth, S3 + Lambda for image processing, SNS/SQS for event fan-out, EventBridge for scheduled tasks, CloudWatch for monitoring.

**Tech Stack:**
- Frontend: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, @hello-pangea/dnd, amazon-cognito-identity-js
- Backend: Express.js, TypeScript, AWS SDK v3, aws-jwt-verify, multer
- Lambdas: Node.js 20, sharp (image resize)
- Database: DynamoDB (6 tables)
- Auth: Cognito User Pool (custom attributes: role, teamId)
- Region: eu-central-1 (Frankfurt)

---

## 1. Architecture Overview

### 1.1 AWS Services & Connections

```
                          ┌──────────────┐
                          │  CloudFront  │
                          │ Distribution │
                          └──────┬───────┘
                                 │
                    ┌────────────┴────────────┐
                    │ (default: /*)            │ (/api/*)
                    ▼                          ▼
             ┌─────────────┐          ┌──────────────┐
             │  S3 Bucket  │          │     ALB      │
             │ (Frontend)  │          │ (public sub) │
             └─────────────┘          └──────┬───────┘
                                             │
                              ┌──────────────┴──────────────┐
                              ▼                              ▼
                    ┌──────────────────┐          ┌──────────────────┐
                    │  EC2 (AZ-a)      │          │  EC2 (AZ-b)      │
                    │  Private Subnet  │          │  Private Subnet  │
                    │  Node.js API     │          │  Node.js API     │
                    └────────┬─────────┘          └────────┬─────────┘
                             │                              │
                             └──────────────┬───────────────┘
                                            │
                    ┌───────────┬────────────┼────────────┬──────────────┐
                    ▼           ▼            ▼            ▼              ▼
              ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐
              │ DynamoDB │ │Cognito │ │ S3 Orig  │ │   SNS    │ │CloudWatch │
              │ (6 tbls) │ │  Pool  │ │  Bucket  │ │  Topic   │ │  Metrics  │
              └──────────┘ └────────┘ └────┬─────┘ └────┬─────┘ └───────────┘
                                           │            │
                                    S3 PUT event   ┌────┴────┐
                                           │       │         │
                                           ▼       ▼         ▼
                                    ┌──────────┐ ┌─────┐ ┌───────┐
                                    │ Lambda   │ │Email│ │  SQS  │
                                    │ Img Resz │ │Sub  │ │ Queue │
                                    └────┬─────┘ └─────┘ └───┬───┘
                                         ▼                    ▼
                                    ┌──────────┐      ┌──────────────┐
                                    │S3 Resized│      │Lambda Worker │
                                    │  Bucket  │      │(activity log │
                                    └──────────┘      │ + CW metric) │
                                                      └──────────────┘

              ┌───────────────┐         ┌──────────────────┐
              │  EventBridge  │ 9AM ──▶ │  Lambda Daily    │
              │  Sched. Rule  │         │  Digest → SNS    │
              └───────────────┘         └──────────────────┘
```

### 1.2 VPC Layout (2 AZs)

```
VPC: 10.0.0.0/16 (eu-central-1)
│
├── eu-central-1a
│   ├── Public Subnet  10.0.1.0/24  →  ALB, NAT Instance (t2.micro)
│   └── Private Subnet 10.0.3.0/24  →  EC2 Instance (t2.micro)
│
├── eu-central-1b
│   ├── Public Subnet  10.0.2.0/24  →  ALB
│   └── Private Subnet 10.0.4.0/24  →  EC2 Instance (t2.micro)
│
├── Internet Gateway → attached to VPC
├── NAT Instance → in public subnet AZ-a, routes private subnet traffic
├── Route Tables:
│   ├── Public RT: 0.0.0.0/0 → IGW
│   └── Private RT: 0.0.0.0/0 → NAT Instance ENI
```

### 1.3 CloudFront Routing

| Behavior | Origin | Purpose |
|----------|--------|---------|
| Default (`*`) | S3 bucket (`frontend-build`) | Serves React SPA (index.html, JS, CSS) |
| `/api/*` | ALB | Proxies API requests to backend |

- Single CloudFront domain — no CORS issues
- SPA uses relative URLs (`fetch('/api/tasks')`)
- Local dev: Vite proxy mimics this (`/api` → `localhost:3001`)

### 1.4 Data Flow: Task Assignment

```
1. Manager creates task via UI → POST /api/tasks
2. Backend writes task to DynamoDB
3. Backend publishes to SNS topic "task-assigned"
4. SNS fans out to:
   a. Email subscription → assignee gets notification email
   b. SQS queue → buffered for worker
5. SQS triggers Lambda (Assignment Worker):
   a. Writes entry to ActivityLog table
   b. Publishes custom CloudWatch metric (TasksAssignedPerTeam)
```

### 1.5 Data Flow: Image Upload

```
1. User uploads image via task form → POST /api/tasks/:id/image
2. Backend uploads to S3 originals bucket (key: tasks/<taskId>/<filename>)
3. S3 versioning retains old versions automatically
4. S3 PUT event triggers Lambda (Image Resize)
5. Lambda reads original, resizes with sharp, writes to S3 resized bucket
6. Backend stores S3 key + versionId in DynamoDB task record
```

---

## 2. DynamoDB Schema

### 2.1 Tables

**Users**
| Attribute | Type | Key |
|-----------|------|-----|
| userId | String | Partition Key |
| email | String | |
| displayName | String | |
| role | String (MANAGER \| EMPLOYEE) | |
| teamId | String | |
| teamName | String | |
| createdAt | String (ISO 8601) | |

**Teams**
| Attribute | Type | Key |
|-----------|------|-----|
| teamId | String | Partition Key |
| name | String | |
| createdAt | String (ISO 8601) | |

**Projects**
| Attribute | Type | Key |
|-----------|------|-----|
| projectId | String | Partition Key |
| name | String | |
| description | String | |
| createdBy | String | |
| createdAt | String (ISO 8601) | |
| updatedAt | String (ISO 8601) | |

**Tasks**
| Attribute | Type | Key |
|-----------|------|-----|
| taskId | String | Partition Key |
| projectId | String | |
| title | String | |
| description | String | |
| status | String (TODO \| IN_PROGRESS \| IN_REVIEW \| DONE) | |
| priority | String (LOW \| MEDIUM \| HIGH \| CRITICAL) | |
| deadline | String (ISO 8601) | |
| assigneeId | String | |
| assigneeName | String | |
| teamId | String | |
| teamName | String | |
| createdBy | String | |
| imageKey | String (S3 key, nullable) | |
| imageVersions | List of { versionId, key, uploadedAt } | |
| createdAt | String (ISO 8601) | |
| updatedAt | String (ISO 8601) | |
| closedAt | String (ISO 8601, nullable) | |

GSIs:
- **teamId-index**: PK = `teamId`, SK = `createdAt` — team-scoped queries
- **assigneeId-index**: PK = `assigneeId`, SK = `createdAt` — assignee queries
- **projectId-index**: PK = `projectId`, SK = `createdAt` — project queries
- **status-index**: PK = `status`, SK = `updatedAt` — for CloudWatch metrics queries

**Comments**
| Attribute | Type | Key |
|-----------|------|-----|
| taskId | String | Partition Key |
| commentId | String | Sort Key |
| userId | String | |
| userName | String | |
| content | String | |
| createdAt | String (ISO 8601) | |

**ActivityLog**
| Attribute | Type | Key |
|-----------|------|-----|
| taskId | String | Partition Key |
| timestamp | String (ISO 8601 + UUID suffix) | Sort Key |
| userId | String | |
| userName | String | |
| action | String (CREATED \| STATUS_CHANGE \| ASSIGNED \| COMMENTED \| IMAGE_UPLOADED) | |
| details | Map { oldStatus, newStatus, comment, etc. } | |

---

## 3. File Structure

```
cloud-project/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn/ui components (auto-generated)
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.tsx    # Sidebar + header shell
│   │   │   │   ├── Sidebar.tsx      # Navigation sidebar
│   │   │   │   └── Header.tsx       # Top bar with user info
│   │   │   ├── kanban/
│   │   │   │   ├── KanbanBoard.tsx  # DnD board container
│   │   │   │   ├── KanbanColumn.tsx # Single status column
│   │   │   │   └── TaskCard.tsx     # Draggable task card
│   │   │   ├── tasks/
│   │   │   │   ├── TaskModal.tsx    # Task detail modal (comments, images, audit log)
│   │   │   │   ├── TaskForm.tsx     # Create/edit task form
│   │   │   │   └── ImageUpload.tsx  # Image upload component
│   │   │   ├── projects/
│   │   │   │   ├── ProjectList.tsx  # Project cards/list
│   │   │   │   └── ProjectForm.tsx  # Create/edit project
│   │   │   ├── teams/
│   │   │   │   ├── TeamList.tsx     # Team management (manager only)
│   │   │   │   └── TeamForm.tsx     # Create/edit team
│   │   │   └── auth/
│   │   │       ├── LoginForm.tsx    # Sign-in form
│   │   │       └── SignupForm.tsx   # Sign-up form
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx    # Overview dashboard
│   │   │   ├── KanbanPage.tsx       # Kanban board view
│   │   │   ├── ProjectsPage.tsx     # Projects management
│   │   │   ├── TeamsPage.tsx        # Teams management (manager only)
│   │   │   ├── LoginPage.tsx        # Auth page
│   │   │   └── NotFoundPage.tsx     # 404
│   │   ├── hooks/
│   │   │   ├── useAuth.ts          # Cognito auth hook
│   │   │   ├── useTasks.ts         # Task CRUD hook
│   │   │   └── useApi.ts           # API client hook with token injection
│   │   ├── lib/
│   │   │   ├── api.ts              # Axios/fetch wrapper with auth headers
│   │   │   ├── auth.ts             # Cognito auth functions
│   │   │   └── constants.ts        # Status, priority enums
│   │   ├── types/
│   │   │   └── index.ts            # Shared TypeScript types
│   │   ├── context/
│   │   │   └── AuthContext.tsx      # Auth state provider
│   │   ├── App.tsx                  # Router + layout
│   │   └── main.tsx                 # Entry point
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.ts
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── tasks.ts            # Task CRUD + image endpoints
│   │   │   ├── projects.ts         # Project CRUD
│   │   │   ├── comments.ts         # Comment CR
│   │   │   ├── teams.ts            # Team CRUD (manager only)
│   │   │   ├── users.ts            # User listing/management
│   │   │   └── health.ts           # ALB health check endpoint
│   │   ├── middleware/
│   │   │   ├── auth.ts             # Cognito JWT validation
│   │   │   ├── teamGuard.ts        # Team isolation enforcement
│   │   │   └── errorHandler.ts     # Global error handler
│   │   ├── services/
│   │   │   ├── dynamodb.ts         # DynamoDB client + table helpers
│   │   │   ├── s3.ts               # S3 upload/download/delete
│   │   │   ├── sns.ts              # SNS publish helpers
│   │   │   └── cloudwatch.ts       # CloudWatch metric publishing
│   │   ├── models/
│   │   │   ├── task.ts             # Task data access (DynamoDB operations)
│   │   │   ├── project.ts          # Project data access
│   │   │   ├── comment.ts          # Comment data access
│   │   │   ├── team.ts             # Team data access
│   │   │   ├── user.ts             # User data access
│   │   │   └── activityLog.ts      # Activity log data access
│   │   ├── types/
│   │   │   └── index.ts            # Backend types + request extensions
│   │   ├── config/
│   │   │   └── aws.ts              # AWS client configuration
│   │   └── app.ts                  # Express app setup + route registration
│   ├── package.json
│   └── tsconfig.json
│
├── lambdas/
│   ├── image-resize/
│   │   ├── index.ts                # S3 trigger → sharp resize → S3 resized bucket
│   │   └── package.json
│   ├── assignment-worker/
│   │   ├── index.ts                # SQS trigger → activity log → CloudWatch metric
│   │   └── package.json
│   └── daily-digest/
│       ├── index.ts                # EventBridge trigger → scan due tasks → SNS email
│       └── package.json
│
├── scripts/
│   ├── seed.ts                     # Creates Ali/Sara/Omar + sample tasks for demo
│   ├── create-tables.ts            # DynamoDB table creation (local + AWS)
│   └── setup-cognito-users.ts      # Creates demo users in Cognito
│
├── docs/
│   ├── architecture-diagram.png    # AWS standard icons diagram
│   ├── aws-setup-guide.md          # Step-by-step AWS console/CLI instructions
│   └── superpowers/plans/
│       └── 2026-05-20-mini-jira-aws.md  # This plan
│
├── SPEC-CHECKLIST.md               # Running spec coverage tracker
├── README.md                       # Deliverable: diagram, URL, overview
├── cloud-project-description.md    # Original spec
├── .gitignore
├── .env.example                    # Template for environment variables
└── package.json                    # Root: workspace scripts
```

---

## 4. Milestones

Each milestone produces a working, testable increment. The user approves each one before the next begins. Milestones are ordered by dependency — each builds on the previous.

---

### Milestone 1: Project Skeleton + DynamoDB Models (Local)

**Goal:** Working Express API with DynamoDB Local, basic Task CRUD (no auth), React app shell.

**Files to create:**
- All `backend/` files: app.ts, config/aws.ts, routes/tasks.ts, routes/health.ts, models/task.ts, services/dynamodb.ts, types/index.ts, middleware/errorHandler.ts
- All `frontend/` scaffolding: Vite project, App.tsx, main.tsx, types/index.ts, lib/api.ts, lib/constants.ts
- `scripts/create-tables.ts`
- Root `package.json`, `.gitignore`, `.env.example`

**Steps:**

- [ ] **1.1** Initialize root package.json with workspace scripts
- [ ] **1.2** Scaffold backend: `npm init`, install express, typescript, aws-sdk v3, cors, dotenv, uuid, multer
- [ ] **1.3** Create backend TypeScript config, types (Task, Project, Comment, Team, User, ActivityLog interfaces)
- [ ] **1.4** Create AWS config module (DynamoDB client pointing to local endpoint in dev)
- [ ] **1.5** Create DynamoDB service (table helpers: put, get, query, update, delete, scan)
- [ ] **1.6** Create Task model (all DynamoDB operations: create, getById, getByTeam, getByAssignee, update, delete)
- [ ] **1.7** Create Task routes (CRUD endpoints, no auth yet)
- [ ] **1.8** Create health check route (`GET /api/health` → 200)
- [ ] **1.9** Create Express app (cors, json parsing, route registration, error handler)
- [ ] **1.10** Create `scripts/create-tables.ts` — creates all 6 DynamoDB tables with GSIs
- [ ] **1.11** Start DynamoDB Local (Docker), run table creation script, test with curl
- [ ] **1.12** Scaffold frontend: `npm create vite@latest`, install tailwind, shadcn/ui, react-router-dom, axios
- [ ] **1.13** Configure Vite proxy (`/api` → `localhost:3001`)
- [ ] **1.14** Create shared types, API client, constants
- [ ] **1.15** Create minimal App shell with router (placeholder pages)
- [ ] **1.16** Verify: backend serves tasks CRUD on localhost:3001, frontend loads on localhost:5173
- [ ] **1.17** Commit: "feat: project skeleton with Express API, DynamoDB local, React shell"

**How to test:**
```bash
# Terminal 1: DynamoDB Local
docker run -p 8000:8000 amazon/dynamodb-local

# Terminal 2: Create tables
npx ts-node scripts/create-tables.ts

# Terminal 3: Backend
cd backend && npm run dev

# Terminal 4: Frontend
cd frontend && npm run dev

# Test CRUD:
curl -X POST http://localhost:3001/api/tasks -H "Content-Type: application/json" \
  -d '{"title":"Test Task","description":"A test","status":"TODO","priority":"HIGH","teamId":"frontend","assigneeId":"user1"}'
curl http://localhost:3001/api/tasks
```

---

### Milestone 2: Authentication + Team Isolation

**Goal:** Cognito-based auth working end-to-end. Team isolation enforced server-side. Login/signup UI.

**Requires:** User creates a Cognito User Pool in AWS console (I provide step-by-step instructions).

**Files to create:**
- `backend/src/middleware/auth.ts` — JWT validation
- `backend/src/middleware/teamGuard.ts` — team isolation
- `backend/src/routes/users.ts` — user sync/listing
- `frontend/src/lib/auth.ts` — Cognito integration
- `frontend/src/context/AuthContext.tsx` — auth state
- `frontend/src/hooks/useAuth.ts`
- `frontend/src/components/auth/LoginForm.tsx`
- `frontend/src/components/auth/SignupForm.tsx`
- `frontend/src/pages/LoginPage.tsx`

**Key implementation — Team Isolation Middleware:**

```typescript
// backend/src/middleware/teamGuard.ts
export function teamGuard(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  // Managers bypass team filter — they see everything
  if (req.user.role === 'MANAGER') {
    req.teamFilter = null; // null = no filter
    return next();
  }

  // Employees: enforce their teamId on all queries
  if (!req.user.teamId) {
    return res.status(403).json({ error: 'No team assigned' });
  }

  req.teamFilter = req.user.teamId;
  next();
}
```

**Key implementation — Per-handler enforcement:**

```typescript
// In every task route handler:
async function getTask(req: AuthRequest, res: Response) {
  const task = await TaskModel.getById(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Not found' });

  // CRITICAL: server-side team check, not just UI filtering
  if (req.teamFilter && task.teamId !== req.teamFilter) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(task);
}

async function listTasks(req: AuthRequest, res: Response) {
  if (req.teamFilter) {
    // Employee: query the teamId GSI — can only get own team's tasks
    const tasks = await TaskModel.getByTeam(req.teamFilter);
    return res.json(tasks);
  }
  // Manager: query all, optionally filter by team query param
  const teamId = req.query.teamId as string | undefined;
  const tasks = teamId
    ? await TaskModel.getByTeam(teamId)
    : await TaskModel.getAll();
  res.json(tasks);
}
```

**Steps:**

- [ ] **2.1** (User) Create Cognito User Pool in AWS console with custom attributes (custom:role, custom:teamId)
- [ ] **2.2** Install `aws-jwt-verify` and `amazon-cognito-identity-js`
- [ ] **2.3** Create auth middleware — validates JWT, extracts userId, role, teamId from token claims
- [ ] **2.4** Create teamGuard middleware — sets req.teamFilter based on role
- [ ] **2.5** Apply auth + teamGuard to all API routes (except /api/health)
- [ ] **2.6** Update all task route handlers to use req.teamFilter for enforcement
- [ ] **2.7** Create users route — sync Cognito user to DynamoDB Users table on first login
- [ ] **2.8** Create frontend auth module — sign in, sign up, sign out, get current session
- [ ] **2.9** Create AuthContext provider — wraps app, provides user state + loading
- [ ] **2.10** Create LoginForm and SignupForm components
- [ ] **2.11** Add route protection — redirect to /login if not authenticated
- [ ] **2.12** Test: create two users (different teams) in Cognito, verify one cannot fetch the other's tasks
- [ ] **2.13** Commit: "feat: Cognito auth + server-side team isolation"

**How to test (the critical team isolation check):**
```bash
# 1. Sign in as Sara (Frontend team) — get her token
# 2. Create a task assigned to Frontend team
# 3. Sign in as Omar (Backend team) — get his token
# 4. Try to fetch the Frontend task using Omar's token:
curl -H "Authorization: Bearer <omar_token>" http://localhost:3001/api/tasks/<frontend_task_id>
# Expected: 403 Access denied

# 5. Sign in as Ali (Manager) — get his token
# 6. Fetch the same task:
curl -H "Authorization: Bearer <ali_token>" http://localhost:3001/api/tasks/<frontend_task_id>
# Expected: 200 OK — managers see everything
```

---

### Milestone 3: Full CRUD + Kanban UI

**Goal:** Complete CRUD for Tasks, Projects, Comments. Kanban board with drag-and-drop. Task detail modal. Professional-looking UI.

**Files to create:**
- Remaining backend routes: `projects.ts`, `comments.ts`, `teams.ts`
- Remaining backend models: `project.ts`, `comment.ts`, `team.ts`, `user.ts`, `activityLog.ts`
- All frontend components: layout, kanban, tasks, projects, teams
- All frontend pages

**Steps:**

- [ ] **3.1** Create Project model + routes (CRUD, manager-only create/update/delete)
- [ ] **3.2** Create Comment model + routes (CR on a task, any team member with access)
- [ ] **3.3** Create Team model + routes (CRUD, manager-only)
- [ ] **3.4** Create User model + routes (list users, list by team)
- [ ] **3.5** Create ActivityLog model (write on every status change, task creation, assignment)
- [ ] **3.6** Add audit logging to task handlers — log every status transition with userId + timestamp
- [ ] **3.7** Create AppLayout (sidebar nav + header with user info/logout)
- [ ] **3.8** Create KanbanBoard + KanbanColumn + TaskCard with @hello-pangea/dnd
- [ ] **3.9** Wire drag-and-drop to PATCH /api/tasks/:id/status — updates status in DynamoDB
- [ ] **3.10** Create TaskModal — shows task details, comments thread, audit log, image
- [ ] **3.11** Create TaskForm — create/edit task with all fields (title, desc, priority, deadline, assignee dropdown, team dropdown)
- [ ] **3.12** Create ProjectList + ProjectForm pages
- [ ] **3.13** Create TeamList + TeamForm pages (manager only, hidden for employees)
- [ ] **3.14** Create DashboardPage — overview stats, recent tasks, per-team breakdown (manager sees all teams)
- [ ] **3.15** Add loading states (skeleton loaders), empty states, error toasts (sonner)
- [ ] **3.16** Test: full flow — create project, create task, drag across columns, add comment, verify audit log
- [ ] **3.17** Commit: "feat: full CRUD, Kanban board, task modal, project/team management"

**Acceptance criteria:**
- Kanban board shows 4 columns (To Do, In Progress, In Review, Done)
- Drag-and-drop moves tasks between columns and persists to DynamoDB
- Task modal shows comments + audit log
- Manager sees team filter dropdown, employees see only their team
- Loading spinners, empty states ("No tasks yet"), error toasts all present

---

### Milestone 4: S3 Image Pipeline + Lambda Resize

**Goal:** Image upload/display/delete on tasks. S3 versioning retains old images. Lambda resizes on upload.

**Requires:** User creates 2 S3 buckets in AWS console (originals + resized). User creates Lambda function.

**Files to create:**
- `backend/src/services/s3.ts`
- `backend/src/routes/tasks.ts` — add image endpoints
- `lambdas/image-resize/index.ts`
- `frontend/src/components/tasks/ImageUpload.tsx`

**Key implementation — S3 versioning for image retention:**

```typescript
// backend/src/services/s3.ts
// S3 bucket has versioning enabled — every PUT to the same key auto-retains old versions
// When user updates image: PUT to same key → new version created, old version retained
// Task record stores current imageKey; old versions retrievable via S3 ListObjectVersions
```

**Key implementation — Lambda Image Resize:**

```typescript
// lambdas/image-resize/index.ts
import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const s3 = new S3Client({ region: 'eu-central-1' });
const RESIZED_BUCKET = process.env.RESIZED_BUCKET!;

export const handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    const original = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buffer = Buffer.from(await original.Body!.transformToByteArray());

    const resized = await sharp(buffer)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    await s3.send(new PutObjectCommand({
      Bucket: RESIZED_BUCKET,
      Key: key, // same key in resized bucket
      Body: resized,
      ContentType: 'image/jpeg',
    }));
  }
};
```

**Steps:**

- [ ] **4.1** (User) Create S3 originals bucket with versioning enabled
- [ ] **4.2** (User) Create S3 resized bucket
- [ ] **4.3** Create S3 service module (upload, download, delete, list versions, generate presigned URL)
- [ ] **4.4** Add image upload endpoint: `POST /api/tasks/:id/image` (multer → S3)
- [ ] **4.5** Add image delete endpoint: `DELETE /api/tasks/:id/image`
- [ ] **4.6** Update task GET endpoints to include presigned URLs for current + thumbnail images
- [ ] **4.7** Store imageKey + imageVersions in task DynamoDB record on upload
- [ ] **4.8** Create Lambda image-resize function (sharp, triggered by S3 PUT)
- [ ] **4.9** (User) Deploy Lambda, configure S3 trigger on originals bucket
- [ ] **4.10** Create ImageUpload frontend component (drag-drop zone, preview, replace button)
- [ ] **4.11** Wire image display into TaskModal (show thumbnail, click for full-size)
- [ ] **4.12** Test: upload image → verify resize Lambda fires → thumbnail appears → replace image → verify old version retained
- [ ] **4.13** Commit: "feat: S3 image upload with versioning + Lambda resize"

---

### Milestone 5: Event-Driven Notifications (SNS + SQS + EventBridge)

**Goal:** Task assignment triggers SNS → email + SQS → Lambda worker. EventBridge runs daily digest.

**Requires:** User creates SNS topic, SQS queue, EventBridge rule, and 2 Lambda functions in AWS console.

**Files to create:**
- `backend/src/services/sns.ts`
- `backend/src/services/cloudwatch.ts`
- `lambdas/assignment-worker/index.ts`
- `lambdas/daily-digest/index.ts`

**Key implementation — Assignment Worker Lambda:**

```typescript
// lambdas/assignment-worker/index.ts
import { SQSEvent } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const dynamo = new DynamoDBClient({ region: 'eu-central-1' });
const cw = new CloudWatchClient({ region: 'eu-central-1' });

export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const message = JSON.parse(body.Message); // SNS wraps in Message field

    // 1. Write activity log entry
    await dynamo.send(new PutItemCommand({
      TableName: 'ActivityLog',
      Item: {
        taskId: { S: message.taskId },
        timestamp: { S: new Date().toISOString() + '#' + crypto.randomUUID() },
        userId: { S: message.assignedBy },
        userName: { S: message.assignedByName },
        action: { S: 'ASSIGNED' },
        details: { M: {
          assigneeId: { S: message.assigneeId },
          assigneeName: { S: message.assigneeName },
          teamId: { S: message.teamId },
        }},
      },
    }));

    // 2. Publish custom CloudWatch metric
    await cw.send(new PutMetricDataCommand({
      Namespace: 'MiniJira',
      MetricData: [{
        MetricName: 'TasksAssignedPerTeam',
        Dimensions: [{ Name: 'TeamId', Value: message.teamId }],
        Value: 1,
        Unit: 'Count',
      }],
    }));
  }
};
```

**Steps:**

- [ ] **5.1** Create SNS service module (publish task-assignment events)
- [ ] **5.2** Update task creation handler — publish to SNS on task assignment
- [ ] **5.3** Update task update handler — publish to SNS on reassignment
- [ ] **5.4** (User) Create SNS topic `task-assigned`
- [ ] **5.5** (User) Add email subscription to SNS topic
- [ ] **5.6** (User) Create SQS queue `task-assignment-queue`, subscribe to SNS topic
- [ ] **5.7** Create Assignment Worker Lambda
- [ ] **5.8** (User) Deploy worker Lambda, configure SQS trigger
- [ ] **5.9** Create Daily Digest Lambda (scan tasks due today, send SNS per assignee)
- [ ] **5.10** (User) Deploy digest Lambda
- [ ] **5.11** (User) Create EventBridge rule: cron(0 9 * * ? *) → triggers digest Lambda
- [ ] **5.12** Test: assign task → verify email received + activity log written + CloudWatch metric published
- [ ] **5.13** Test: manually invoke daily digest Lambda → verify digest emails sent
- [ ] **5.14** Commit: "feat: SNS/SQS task assignment events + EventBridge daily digest"

---

### Milestone 6: CloudWatch Monitoring

**Goal:** CloudWatch dashboard with 4 widgets + alarm for overdue tasks.

**Requires:** User creates dashboard and alarm in AWS console (with provided JSON configs).

**Files to modify:**
- `backend/src/services/cloudwatch.ts` — add metric publishing helpers
- `backend/src/routes/tasks.ts` — publish metrics on create/close

**Dashboard Widgets (4 required):**

1. **Tasks Created Per Day** — custom metric `TasksCreated` with daily period
2. **Tasks Closed Per Day Per Team** — custom metric `TasksClosed` with TeamId dimension
3. **Average Time-to-Close** — custom metric `TimeToClose` (milliseconds between createdAt and closedAt)
4. **EC2 CPU Utilization** — built-in AWS/EC2 CPUUtilization metric for the ASG instances

**Alarm:**
- **Overdue Tasks Alarm** — Lambda runs periodically (or metric published by backend), counts tasks past deadline that aren't DONE. Alarm triggers when count > threshold → publishes to SNS topic.

**Steps:**

- [ ] **6.1** Add metric publishing to task create handler (TasksCreated metric)
- [ ] **6.2** Add metric publishing to task close handler (TasksClosed + TimeToClose metrics)
- [ ] **6.3** Add metric publishing for overdue task count (checked on each task query or via Lambda)
- [ ] **6.4** (User) Create CloudWatch dashboard with 4 widgets (I provide the JSON definition)
- [ ] **6.5** (User) Create CloudWatch alarm: OverdueTaskCount > 5 → SNS notification
- [ ] **6.6** Test: create and close tasks, verify metrics appear in dashboard
- [ ] **6.7** Commit: "feat: CloudWatch custom metrics, dashboard, and overdue alarm"

---

### Milestone 7: AWS Deployment (High Availability)

**Goal:** Full deployment across 2 AZs. CloudFront URL works.

**This milestone is primarily AWS console/CLI work done by the user, guided by step-by-step instructions.**

**Steps:**

- [ ] **7.1** (User) Create VPC with CIDR 10.0.0.0/16
- [ ] **7.2** (User) Create 4 subnets (2 public, 2 private across 2 AZs)
- [ ] **7.3** (User) Create and attach Internet Gateway
- [ ] **7.4** (User) Launch NAT Instance (t2.micro, Amazon Linux 2) in public subnet AZ-a, disable source/dest check
- [ ] **7.5** (User) Configure route tables (public → IGW, private → NAT Instance)
- [ ] **7.6** (User) Create security groups (ALB: 80/443 from 0.0.0.0, EC2: 3001 from ALB SG, NAT: all from private SG)
- [ ] **7.7** (User) Create IAM role for EC2 (permissions: DynamoDB, S3, SNS, SQS, CloudWatch, Cognito)
- [ ] **7.8** Build backend for production (compile TypeScript, bundle)
- [ ] **7.9** Build frontend for production (`npm run build`)
- [ ] **7.10** (User) Upload frontend build to S3 bucket (static website hosting)
- [ ] **7.11** Create EC2 user-data script (installs Node.js, pulls code, starts backend)
- [ ] **7.12** (User) Create Launch Template with user-data, IAM role, security group
- [ ] **7.13** (User) Create Auto Scaling Group (min 2, max 4, across both private subnets)
- [ ] **7.14** (User) Create Application Load Balancer (public subnets, health check on /api/health)
- [ ] **7.15** (User) Create Target Group, register ASG
- [ ] **7.16** (User) Create CloudFront distribution (S3 origin default + ALB origin for /api/*)
- [ ] **7.17** (User) Update frontend API base URL to use CloudFront domain
- [ ] **7.18** Test: hit CloudFront URL → app loads, login works, CRUD works, team isolation works
- [ ] **7.19** Commit: "feat: AWS deployment config, user-data scripts, build scripts"

---

### Milestone 8: Deliverables + Demo Prep

**Goal:** All deliverables ready. Demo scenario works end-to-end.

**Files to create/update:**
- `scripts/seed.ts` — demo seed script
- `scripts/setup-cognito-users.ts` — creates Ali/Sara/Omar in Cognito
- `docs/architecture-diagram.png` — AWS standard icons
- `README.md` — required deliverable
- `SPEC-CHECKLIST.md` — final spec coverage verification

**Steps:**

- [ ] **8.1** Create seed script: creates Teams (Frontend, Backend), Project, sample Tasks
- [ ] **8.2** Create Cognito user setup script: creates Ali (Manager), Sara (Frontend), Omar (Backend)
- [ ] **8.3** Run seed script against production DynamoDB
- [ ] **8.4** Generate architecture diagram with AWS standard icons
- [ ] **8.5** Write README.md with: overview, architecture diagram, CloudFront URL, setup instructions, demo guide
- [ ] **8.6** Walk through full demo scenario:
  - Ali (Manager) logs in → sees all tasks → creates Task A (Frontend, Sara) + Task B (Backend, Omar)
  - Sara logs in → sees ONLY Task A → moves to In Progress → adds comment
  - Omar logs in → sees ONLY Task B → cannot see Task A even by ID
  - Ali logs back in → sees both tasks, filters by team
- [ ] **8.7** Verify all event flows: assignment email sent, activity log written, CloudWatch metrics updating
- [ ] **8.8** Final spec coverage walkthrough (update SPEC-CHECKLIST.md)
- [ ] **8.9** Commit: "feat: seed scripts, architecture diagram, README, demo-ready"

---

## 5. Spec Coverage Checklist

Every requirement mapped to its milestone. This becomes the `SPEC-CHECKLIST.md` file in the repo.

### Functional Requirements

| # | Requirement | Milestone | Status |
|---|-------------|-----------|--------|
| 1 | Manager role — creates projects/tasks, assigns, sees all | M2, M3 | |
| 2 | Employee role — sees own team only, updates status, comments, attaches | M2, M3 | |
| 3 | Admin merged with Manager — creates teams, adds users | M3 | |
| 4 | Arbitrary number of teams | M3 | |
| 5 | Employee belongs to exactly one team | M2 (Cognito custom:teamId) | |
| 6 | Task lifecycle: To Do → In Progress → In Review → Done | M3 (Kanban) | |
| 7 | Comments thread on each task | M3 | |
| 8 | File/image attachments in S3, resized by Lambda | M4 | |
| 9 | Audit log of status changes | M3 (ActivityLog table) | |
| 10 | Team isolation — server-side GSI filtering, every handler | M2 | |
| 11 | Manager bypasses team filter | M2 | |
| 12 | CRUD on Tasks | M1, M3 | |
| 13 | CRUD on Projects | M3 | |
| 14 | CR on Comments | M3 | |
| 15 | Image upload, replacement (keeping old versions), deletion | M4 | |
| 16 | Demo scenario: Ali/Sara/Omar | M8 | |

### Technology Requirements

| # | Requirement | Milestone | Status |
|---|-------------|-----------|--------|
| 17 | JavaScript stack | M1 (React + Express + TS) | |
| 18 | AWS Cognito auth (sign-in, sign-up, token validation) | M2 | |
| 19 | HA: EC2 across 2 AZs, ALB, ASG | M7 | |
| 20 | CloudFront CDN | M7 | |
| 21 | AWS SDK for JavaScript | M1+ (all backend AWS calls) | |
| 22 | DynamoDB: 6 tables, GSIs on teamId + assigneeId | M1, M2 | |
| 23 | S3 image upload + display + delete with task | M4 | |
| 24 | Link images to tasks in DynamoDB | M4 | |
| 25 | Lambda — image resize on task creation | M4 | |
| 26 | SNS + SQS: assignment → email + worker Lambda → log + metric | M5 | |
| 27 | EventBridge: 9AM daily → digest Lambda → SNS emails | M5 | |
| 28 | CloudWatch: dashboard (4 widgets) + alarm → SNS | M6 | |
| 29 | Polished UI: Tailwind + shadcn, Kanban DnD, modal, loading/empty/error states | M3 | |

### AWS Architecture Services

| # | Service | Role | Milestone | Status |
|---|---------|------|-----------|--------|
| 30 | EC2 (ASG) | Node.js backend, 2 AZs | M7 | |
| 31 | ALB | Traffic distribution + health checks | M7 | |
| 32 | CloudFront | CDN for frontend + API proxy | M7 | |
| 33 | DynamoDB | All data storage (6 tables) | M1 | |
| 34 | S3 (originals) | Task image attachments (versioned) | M4 | |
| 35 | S3 (resized) | Thumbnails from Lambda | M4 | |
| 36 | Lambda — Image Resize | S3 PUT trigger → sharp resize | M4 | |
| 37 | Lambda — Assignment Worker | SQS drain → activity log + metric | M5 | |
| 38 | Lambda — Daily Digest | EventBridge 9AM → scan → SNS | M5 | |
| 39 | SNS | Fan-out: email + SQS | M5 | |
| 40 | SQS | Buffer assignment events | M5 | |
| 41 | EventBridge | Scheduled rule (daily digest) | M5 | |
| 42 | Cognito | User pool, sign-in/up, custom attrs | M2 | |
| 43 | CloudWatch | Metrics, dashboard (4 widgets), alarm | M6 | |
| 44 | IAM | Least-privilege roles (EC2, Lambdas) | M7 | |
| 45 | VPC + Subnets | Public (ALB) + Private (EC2) + NAT | M7 | |

### Deliverables

| # | Deliverable | Milestone | Status |
|---|-------------|-----------|--------|
| 46 | GitHub repo | All | |
| 47 | README with architecture diagram (AWS standard icons) | M8 | |
| 48 | Live CloudFront URL | M7 | |
| 49 | Demo video | User records after M8 | |

---

## 6. Free Tier Risk Analysis

| Service | Free Tier Limit | Our Usage | Risk | Mitigation |
|---------|----------------|-----------|------|------------|
| **EC2** | 750 hrs/mo t2.micro | 2 app instances + 1 NAT instance = 2190 hrs if 24/7 | **HIGH** | Stop all instances when not in use. Budget ~50 hrs total for testing + demo. Well within 750. |
| **ALB** | 750 hrs/mo + 15 LCU | 1 ALB, only running during testing/demo | LOW | Stop when not testing. |
| **NAT Gateway** | NOT free ($0.045/hr) | **Not used** — using NAT Instance (t2.micro) instead | NONE | NAT Instance shares EC2 Free Tier pool. |
| **DynamoDB** | 25 GB storage, 25 WCU/25 RCU (on-demand: 25 WRU/25 RRU) | Demo data ~1 MB, low throughput | NONE | Use on-demand capacity mode. |
| **S3** | 5 GB, 20K GET, 2K PUT/mo | A few test images, <100 MB | NONE | |
| **Lambda** | 1M requests, 400K GB-sec/mo | ~100 invocations total during testing | NONE | |
| **CloudFront** | 1 TB transfer, 10M requests (year 1) | Minimal demo traffic | NONE | Within year 1. |
| **Cognito** | 50K MAU | ~5 demo users | NONE | |
| **SNS** | 1M publishes, 1K email/mo | ~50 test emails | NONE | Don't spam — 1K email limit. |
| **SQS** | 1M requests/mo | ~100 messages | NONE | |
| **CloudWatch** | 10 custom metrics, 3 dashboards, 10 alarms | 4 metrics, 1 dashboard, 1 alarm | NONE | Stay within free limits. |
| **EBS** | 30 GB total | 3 instances × 8 GB = 24 GB | LOW | Use 8 GB volumes, total 24 GB < 30 GB limit. |

**Golden Rule:** Stop EC2 instances + ALB when not actively testing or demoing. Start them up when needed. Everything else is well within Free Tier.

**Cost estimate if careful:** $0 (all within Free Tier assuming instances stopped when idle).

**Cost estimate if left running 24/7:** ~$25-35/month (EC2 overage + ALB hours).

---

## 7. Key Technical Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend | React + Vite (SPA) | Clean separation from backend; served via CloudFront/S3; no SSR complexity |
| Backend | Express.js + TypeScript | Lightweight, fast to build, direct AWS SDK integration |
| DynamoDB design | Multi-table (6 tables) | Spec explicitly requires separate tables; easier to explain in demo |
| Image versioning | S3 bucket versioning | AWS-native; automatic retention; correct approach for the use case |
| NAT solution | NAT Instance (t2.micro) | Satisfies private-subnet architecture; Free Tier eligible |
| Admin role | Merged with Manager | Spec allows it; reduces scope without losing functionality |
| Auth flow | Cognito → JWT → aws-jwt-verify | Standard, lightweight, no Amplify dependency |
| Team isolation | Middleware + per-handler checks | Defense in depth — middleware sets filter, handlers enforce it |
| Local dev | DynamoDB Local (Docker) | Develop/test without AWS charges; real Cognito for auth |
| CloudFront routing | Dual origin (S3 + ALB) | Standard CDN pattern; frontend cached at edge, API proxied |

---

## 8. Demo Day Checklist

Before demo:
1. Start all EC2 instances (ASG min=2)
2. Verify ALB health checks pass
3. Run seed script if fresh environment
4. Verify CloudFront URL loads the app
5. Test login as Ali, Sara, Omar
6. Verify team isolation works

Demo flow:
1. Ali (Manager) logs in → Dashboard shows all teams
2. Ali creates Task A → assigns to Sara (Frontend team)
3. Ali creates Task B → assigns to Omar (Backend team)
4. Show: assignment email received (SNS)
5. Sara logs in → sees ONLY Task A → drags to "In Progress" → adds comment
6. Show: Sara CANNOT access Task B (403 if tried via URL/API)
7. Omar logs in → sees ONLY Task B → uploads an image → show thumbnail (Lambda resize)
8. Ali logs back in → sees both tasks → filters by team
9. Show: CloudWatch dashboard (4 widgets with metrics)
10. Show: Architecture diagram, explain each service
