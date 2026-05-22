# Mini-Jira — AWS Deployment Guide (Milestone 7)

High-availability deployment: React SPA on CloudFront + S3, Express API on EC2
across **2 Availability Zones** behind an ALB + Auto Scaling Group, all inside a
custom VPC with public/private subnets and a NAT instance.

> **Account:** `170732362530`  **Region:** `eu-central-1` (Frankfurt) — do
> everything in this region.

## Do it in this order

Each step depends on the ones before it. Skipping ahead breaks things (e.g. the
EC2 user-data needs a working NAT to `git clone`).

```
A. VPC & networking   → B. DynamoDB tables → C. IAM role
D. Backend (ALB/ASG)  → E. Frontend to S3  → F. CloudFront
G. Seed prod data     → H. Test            → I. Cost control
```

---

## Part A — VPC & Networking

### A1. Create the VPC

VPC console → **Your VPCs** → **Create VPC**.

- Resources to create: **VPC only**
- Name tag: `mini-jira-vpc`
- IPv4 CIDR: `10.0.0.0/16`
- Tenancy: Default
- Create.

Then select the VPC → **Actions → Edit DNS settings** → tick **Enable DNS
hostnames** (needed so instances resolve AWS endpoints / GitHub). Save.

### A2. Create 4 subnets

VPC console → **Subnets** → **Create subnet** → select `mini-jira-vpc`, then add
all four (use "Add new subnet" for each):

| Name | Availability Zone | IPv4 CIDR | Role |
|------|-------------------|-----------|------|
| `mini-jira-public-a`  | `eu-central-1a` | `10.0.1.0/24` | Public — ALB + NAT |
| `mini-jira-public-b`  | `eu-central-1b` | `10.0.2.0/24` | Public — ALB |
| `mini-jira-private-a` | `eu-central-1a` | `10.0.3.0/24` | Private — EC2 |
| `mini-jira-private-b` | `eu-central-1b` | `10.0.4.0/24` | Private — EC2 |

Create. Then for **each public subnet**: select it → **Actions → Edit subnet
settings** → tick **Enable auto-assign public IPv4 address** → Save. (The NAT
instance and ALB need public IPs; private subnets stay private.)

### A3. Internet Gateway

VPC console → **Internet gateways** → **Create internet gateway** → name
`mini-jira-igw` → Create → then **Actions → Attach to VPC** → `mini-jira-vpc`.

### A4. Security groups (create all three first, add rules after)

VPC console → **Security groups** → **Create security group** ×3. For each, pick
VPC = `mini-jira-vpc`. Leave rules empty for now.

| Name | Description |
|------|-------------|
| `mini-jira-alb-sg` | ALB — public web traffic |
| `mini-jira-ec2-sg` | EC2 app instances |
| `mini-jira-nat-sg` | NAT instance |

Now add **inbound** rules (Edit inbound rules on each):

**`mini-jira-alb-sg`**
- Type `HTTP`, port `80`, source `0.0.0.0/0`
- Type `HTTPS`, port `443`, source `0.0.0.0/0` *(optional; CloudFront→ALB uses HTTP)*

**`mini-jira-ec2-sg`**
- Type `Custom TCP`, port `3001`, source = security group `mini-jira-alb-sg`

**`mini-jira-nat-sg`**
- Type `All traffic`, source `10.0.0.0/16` (lets the private subnets route out)

Leave **outbound** rules at the default (all traffic allowed) on all three —
the EC2 instances must reach GitHub, NodeSource, and AWS APIs through the NAT.

### A5. NAT instance

> A NAT **instance** (not a NAT Gateway) keeps us in the Free Tier.

EC2 console → **Launch instance**:

- Name: `mini-jira-nat`
- AMI: **Amazon Linux 2023** (64-bit x86)
- Instance type: **t2.micro**
- Key pair: pick one (or create `mini-jira-key`) — useful for debugging
- Network settings → **Edit**:
  - VPC: `mini-jira-vpc`
  - Subnet: `mini-jira-public-a`
  - Auto-assign public IP: **Enable**
  - Firewall → **Select existing security group** → `mini-jira-nat-sg`
- **Advanced details → User data**: paste the entire contents of
  [`scripts/deploy/nat-instance-user-data.sh`](../scripts/deploy/nat-instance-user-data.sh)
- Launch.

After it boots, **this is mandatory**: select the instance →
**Actions → Networking → Change source/destination check → Stop**
(check the "Stop" box / disable it). A NAT forwards packets not addressed to
itself; with the check on, those packets are dropped.

Note the instance's **Instance ID** (e.g. `i-0abc…`) — the private route table
points at it next.

### A6. Route tables

VPC console → **Route tables** → **Create route table** ×2 (VPC = `mini-jira-vpc`):

**`mini-jira-public-rt`**
- Create → select it → **Routes → Edit routes → Add route**:
  - Destination `0.0.0.0/0` → Target **Internet Gateway** → `mini-jira-igw`
- **Subnet associations → Edit** → associate `mini-jira-public-a` and
  `mini-jira-public-b`.

**`mini-jira-private-rt`**
- Create → select it → **Routes → Edit routes → Add route**:
  - Destination `0.0.0.0/0` → Target **Instance** → select `mini-jira-nat`
- **Subnet associations → Edit** → associate `mini-jira-private-a` and
  `mini-jira-private-b`.

✅ Networking done. The private subnets now reach the internet via the NAT.

---

## Part B — DynamoDB tables

Create the 6 tables on real AWS with the exact same schema as local. A script
does this so the schema is guaranteed identical.

From the **project root**, with valid AWS credentials in `.env`
(`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` already set):

```powershell
npm run create-tables-aws
```

This creates `Users`, `Teams`, `Projects`, `Tasks`, `Comments`, `ActivityLog`
— with the `teamId-index` GSI on Users and the `teamId-index` /
`assigneeId-index` / `projectId-index` GSIs on Tasks — using **on-demand**
billing (Free-Tier friendly). It waits until each table is `ACTIVE`.

Verify in the DynamoDB console → **Tables**: 6 tables, all `Active`.

---

## Part C — IAM role for EC2

The EC2 instances use this role for **all** AWS access — no access keys on the
box. Least-privilege: scoped to exactly this project's resources.

IAM console → **Roles → Create role**:
- Trusted entity type: **AWS service** → Use case: **EC2** → Next
- Skip attaching managed policies for now → Next
- Role name: `mini-jira-ec2-role` → Create role.

Open the role → **Add permissions → Create inline policy** → **JSON** tab →
paste this, name it `mini-jira-ec2-policy`, Create:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDB",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:eu-central-1:170732362530:table/Users",
        "arn:aws:dynamodb:eu-central-1:170732362530:table/Users/index/*",
        "arn:aws:dynamodb:eu-central-1:170732362530:table/Teams",
        "arn:aws:dynamodb:eu-central-1:170732362530:table/Projects",
        "arn:aws:dynamodb:eu-central-1:170732362530:table/Tasks",
        "arn:aws:dynamodb:eu-central-1:170732362530:table/Tasks/index/*",
        "arn:aws:dynamodb:eu-central-1:170732362530:table/Comments",
        "arn:aws:dynamodb:eu-central-1:170732362530:table/ActivityLog"
      ]
    },
    {
      "Sid": "S3Images",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:ListBucketVersions"
      ],
      "Resource": [
        "arn:aws:s3:::ini-jira-originals-yassin2026",
        "arn:aws:s3:::ini-jira-originals-yassin2026/*",
        "arn:aws:s3:::mini-jira-resized-yassin2026",
        "arn:aws:s3:::mini-jira-resized-yassin2026/*"
      ]
    },
    {
      "Sid": "SNSPublish",
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:eu-central-1:170732362530:mini-jira-task-assigned"
    },
    {
      "Sid": "CloudWatchMetrics",
      "Effect": "Allow",
      "Action": "cloudwatch:PutMetricData",
      "Resource": "*",
      "Condition": { "StringEquals": { "cloudwatch:namespace": "MiniJira" } }
    },
    {
      "Sid": "CognitoTeamSync",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:ListUsers",
        "cognito-idp:AdminUpdateUserAttributes"
      ],
      "Resource": "arn:aws:cognito-idp:eu-central-1:170732362530:userpool/eu-central-1_hzNncGJkv"
    }
  ]
}
```

**Optional but recommended** (debug instances with no public IP via Session
Manager — no SSH/bastion needed): on the same role → **Add permissions →
Attach policies** → attach the AWS-managed `AmazonSSMManagedInstanceCore`.

---

## Part D — Backend deployment

Build order: **Target Group → ALB → Launch Template → Auto Scaling Group.**

### D1. Target Group

EC2 console → **Target Groups → Create target group**:
- Target type: **Instances**
- Name: `mini-jira-tg`
- Protocol/port: **HTTP** : **3001**
- VPC: `mini-jira-vpc`
- Protocol version: HTTP1
- **Health checks**: Protocol HTTP, Path **`/api/health`**
- **Advanced health check settings**: Healthy threshold `2`, Interval `30`,
  Timeout `5`, Success codes `200`
- Next → **do not register any targets** (the ASG does that) → Create.

### D2. Application Load Balancer

EC2 console → **Load Balancers → Create load balancer → Application Load Balancer**:
- Name: `mini-jira-alb`
- Scheme: **Internet-facing**
- IP address type: IPv4
- VPC: `mini-jira-vpc`
- Mappings: tick **eu-central-1a → `mini-jira-public-a`** and
  **eu-central-1b → `mini-jira-public-b`**
- Security groups: `mini-jira-alb-sg` (remove the default SG)
- Listener: **HTTP : 80** → Default action **Forward to** `mini-jira-tg`
- Create.

After it provisions, copy the ALB **DNS name**
(`mini-jira-alb-…eu-central-1.elb.amazonaws.com`) — CloudFront needs it.

### D3. Launch Template

EC2 console → **Launch Templates → Create launch template**:
- Name: `mini-jira-lt`
- AMI: **Amazon Linux 2023** (64-bit x86)
- Instance type: **t2.micro**
- Key pair: optional (instances are private; use SSM instead)
- **Network settings**: do **not** select a subnet (the ASG picks them).
  Firewall / security groups → select `mini-jira-ec2-sg`.
- **Advanced details**:
  - IAM instance profile: `mini-jira-ec2-role`
  - **User data**: paste the entire contents of
    [`scripts/deploy/user-data.sh`](../scripts/deploy/user-data.sh)
- Create launch template.

> The user-data clones `https://github.com/Yassin-Kassem/cloud-task-management-app`.
> **Push the latest code to `master` before launching** (the repo must contain
> M4–M6 work), otherwise instances build stale code.

### D4. Auto Scaling Group

EC2 console → **Auto Scaling Groups → Create Auto Scaling group**:
- Name: `mini-jira-asg`
- Launch template: `mini-jira-lt` → Next
- VPC: `mini-jira-vpc`
- Availability Zones and subnets: **`mini-jira-private-a` and
  `mini-jira-private-b`** → Next
- **Load balancing**: **Attach to an existing load balancer** → **Choose from
  your load balancer target groups** → `mini-jira-tg`
- **Health checks**: turn **on** "Turn on Elastic Load Balancing health checks"
- **Health check grace period**: `600` seconds (the first boot installs Node
  and builds TypeScript — give it time before health checks count) → Next
- Group size: **Desired 2, Minimum 2, Maximum 4** → Next → skip scaling policies
  → Create.

The ASG launches 2 instances (one per AZ). After ~3–5 min they finish the
user-data build and the target group shows them **healthy**.

**Verify:** `http://<ALB-DNS-name>/api/health` returns
`{"status":"ok","timestamp":"…"}`.

If a target is unhealthy, connect via Session Manager and check:
```bash
sudo systemctl status mini-jira
sudo journalctl -u mini-jira -n 50
sudo cat /var/log/user-data.log
```

---

## Part E — Frontend to S3 (static website hosting)

### E1. Build the frontend

From the project root:
```powershell
npm --prefix frontend run build
```
Output is in `frontend/dist/` (`index.html` + `assets/`). The app calls the API
with relative URLs (`/api/...`), so no rebuild is needed for production —
CloudFront routes `/api/*` to the ALB.

### E2. Create the S3 bucket

S3 console → **Create bucket**:
- Name: `mini-jira-frontend-yassin2026` (must be globally unique)
- Region: `eu-central-1`
- **Uncheck "Block all public access"** → acknowledge (static site assets are
  public; they contain no secrets)
- Create.

### E3. Enable static website hosting

Open the bucket → **Properties → Static website hosting → Edit**:
- Enable
- Index document: `index.html`
- **Error document: `index.html`** (so client-side routes don't 404)
- Save. Copy the **Bucket website endpoint** URL.

### E4. Public-read bucket policy

Bucket → **Permissions → Bucket policy → Edit** → paste → Save:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadFrontend",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::mini-jira-frontend-yassin2026/*"
    }
  ]
}
```

### E5. Upload the build

Bucket → **Objects → Upload** → **Add files** (select everything inside
`frontend/dist/`, including the `assets/` folder) → Upload. Drag the *contents*
of `dist/`, not the `dist` folder itself — `index.html` must be at the bucket
root.

Or via CLI:
```powershell
aws s3 sync frontend/dist/ s3://mini-jira-frontend-yassin2026/ --delete
```

---

## Part F — CloudFront distribution

CloudFront console → **Create distribution**.

### F1. First origin — S3 frontend (default)

- **Origin domain**: paste the **S3 website endpoint** from E3
  (`mini-jira-frontend-yassin2026.s3-website.eu-central-1.amazonaws.com`).
  ⚠️ Use the *website endpoint*, not the bucket from the dropdown — CloudFront
  treats it as a **custom origin**.
- Protocol: **HTTP only** (S3 website endpoints don't support HTTPS)
- Name: `s3-frontend`

### F2. Default cache behavior

- Viewer protocol policy: **Redirect HTTP to HTTPS**
- Allowed methods: **GET, HEAD**
- Cache policy: **CachingOptimized**

### F3. Distribution settings

- Default root object: `index.html`
- Price class: **Use North America and Europe** (cheapest)
- Create the distribution.

### F4. Add the ALB origin

Open the distribution → **Origins → Create origin**:
- Origin domain: the **ALB DNS name** from D2
- Protocol: **HTTP only**, HTTP port `80`
- Name: `alb-api`
- Save.

### F5. Add the `/api/*` behavior

Distribution → **Behaviors → Create behavior**:
- Path pattern: **`/api/*`**
- Origin: `alb-api`
- Viewer protocol policy: **Redirect HTTP to HTTPS**
- Allowed methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
- Cache policy: **CachingDisabled**
- Origin request policy: **AllViewer** (forwards the `Authorization` header,
  body, and query strings to the backend)
- Save.

### F6. SPA deep-link fix

Distribution → **Error pages → Create custom error response** (do this twice):

| HTTP error code | Customize response | Response page path | HTTP response code |
|-----------------|--------------------|--------------------|--------------------|
| `403` | Yes | `/index.html` | `200` |
| `404` | Yes | `/index.html` | `200` |

This makes a refresh on `/kanban` (or any route) serve the SPA instead of an
S3 error.

Wait for the distribution **Status: Enabled / Last modified** (~5 min). Copy the
**Distribution domain name** (`dxxxxxxxx.cloudfront.net`) — that is the live URL.

---

## Part G — Seed production DynamoDB

Seed the Teams (Frontend / Backend / QA) and the sample Project into the AWS
tables. `NODE_ENV=production` makes the seed script target real AWS instead of
local DynamoDB.

From the project root (PowerShell):
```powershell
$env:NODE_ENV = "production"
npm run seed
$env:NODE_ENV = "development"   # reset so local dev still uses DynamoDB Local
```

Users (Ali / Sara / Omar) are created automatically on first login. The Cognito
users already exist from M2 (`scripts/setup-cognito-users.ts`).

---

## Part H — Test the deployment

1. Open `https://<distribution>.cloudfront.net` — the app loads.
2. Log in as **Ali** (Manager) — dashboard shows all teams.
3. Ali creates Task A → assign to **Sara** (Frontend); Task B → **Omar** (Backend).
4. Log in as **Sara** — sees **only** Task A; cannot open Task B's ID (403).
5. Log in as **Omar** — sees **only** Task B; upload an image → thumbnail appears
   (Lambda resize).
6. Refresh the page on `/kanban` — still loads (SPA deep-link fix works).
7. ALB health: target group `mini-jira-tg` shows **2 healthy targets** across
   both AZs.

---

## Part I — Cost control (Free Tier)

**Golden rule: stop the EC2 instances + ALB when you are not testing or demoing.**

| Resource | When idle |
|----------|-----------|
| ASG app instances | Set ASG **Desired = 0, Min = 0** → instances terminate. Set back to **2 / 2** ~10 min before the demo. |
| NAT instance | Stop it (EC2 → Instance state → Stop). Start before scaling the ASG back up. |
| ALB | ~$0.025/hr. Delete it after the demo, or leave it — small. Stopping the ASG is what matters most. |
| DynamoDB / S3 / Lambda / SNS / CloudFront / Cognito | On-demand / pay-per-use — leave them; demo usage is within Free Tier. |

3 t2.micro instances (2 app + 1 NAT) share the 750 hrs/month Free Tier pool —
fine for a few hours of testing, but **not** if left running 24/7. Re-deploy
new code by pushing to `master` and doing **ASG → Instance refresh** (or just
terminate the instances; the ASG relaunches them with fresh user-data).

---

## Quick reference — created resources

| Resource | Name / value |
|----------|--------------|
| VPC | `mini-jira-vpc` — `10.0.0.0/16` |
| Subnets | `public-a` 10.0.1.0/24, `public-b` 10.0.2.0/24, `private-a` 10.0.3.0/24, `private-b` 10.0.4.0/24 |
| IGW | `mini-jira-igw` |
| NAT | `mini-jira-nat` (t2.micro, public-a, src/dest check OFF) |
| Route tables | `mini-jira-public-rt` → IGW, `mini-jira-private-rt` → NAT |
| Security groups | `mini-jira-alb-sg`, `mini-jira-ec2-sg`, `mini-jira-nat-sg` |
| DynamoDB | `Users`, `Teams`, `Projects`, `Tasks`, `Comments`, `ActivityLog` |
| IAM role | `mini-jira-ec2-role` (+ `mini-jira-ec2-policy`) |
| Target group | `mini-jira-tg` — HTTP:3001, health `/api/health` |
| ALB | `mini-jira-alb` (internet-facing, public subnets) |
| Launch template | `mini-jira-lt` |
| ASG | `mini-jira-asg` — min 2 / max 4, private subnets |
| S3 frontend | `mini-jira-frontend-yassin2026` (static website hosting) |
| CloudFront | dual origin: S3 (default) + ALB (`/api/*`) |
