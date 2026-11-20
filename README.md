# Naceni's Business – Smart Construction Supply & Inventory Management System

Full-stack e-commerce, B2B bulk procurement, real-time inventory management, automated supplier reordering, delivery scheduling, and analytics platform built with **React + TypeScript + Vite + Tailwind CSS + Node.js + Express + Socket.IO + PostgreSQL (Drizzle ORM)**.

> **Database ORM Note**: This project uses **Drizzle ORM** (`drizzle-orm` / `drizzle-kit` / `pg`) with PostgreSQL, including SQL migration files in `./drizzle` and a relational schema across 25 tables (`src/db/schema.ts`).

---

## 1. Extract & Open in Visual Studio Code

1. Download the project archive (`Nacenis_Business_Full_Project.zip`) from Google AI Studio's code export feature.
2. Extract the ZIP archive to a folder on your computer (for example, `~/Projects/Nacenis_Business` or `C:\Projects\Nacenis_Business`).
3. Open **Visual Studio Code**, choose **File > Open Folder...**, and select the extracted project folder.
4. Open the integrated terminal in VS Code (`Ctrl + ~` or **Terminal > New Terminal**).

---

## 2. Install Dependencies

Ensure **Node.js 22+** and **PostgreSQL 15+** (or Docker Desktop) are installed.

```bash
npm install
```

---

## 3. Configure PostgreSQL & Environment Variables

Copy `.env.example` to `.env`:

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

### Option A: Local PostgreSQL via Docker Compose (Fastest)
Start a local PostgreSQL 16 instance on port `5432`:

```bash
docker compose up -d postgres
```

Then set these values in `.env`:

```env
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

SQL_HOST=localhost
SQL_DB_NAME=nacenis_db
SQL_USER=postgres
SQL_PASSWORD=change_me_local_dev
SQL_ADMIN_USER=postgres
SQL_ADMIN_PASSWORD=change_me_local_dev

JWT_SECRET=replace-with-64-char-random-secret
FIELD_ENCRYPTION_KEY=replace-with-32-byte-encryption-secret
INITIAL_ADMIN_EMAIL=kinyarwaranconnicostrate@gmail.com
INITIAL_ADMIN_PASSWORD=YourSecureAdminPassword123!
```

### Option B: Existing Local or Cloud PostgreSQL
Create an empty PostgreSQL database (e.g., `CREATE DATABASE nacenis_db;`) and set `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, and `SQL_ADMIN_PASSWORD` in `.env` (no hardcoded secrets are stored in code).

---

## 4. Run Database Migrations & Seed Data

Push/apply the PostgreSQL schema and populate initial categories, warehouses, suppliers, 10 sample construction products, historical orders, reorder rules, and the `SUPER_ADMIN` user:

```bash
# Apply SQL migrations from ./drizzle (or sync schema directly with npm run db:push)
npm run db:migrate
npm run db:seed
```

*(Note: The Express API also calls an idempotent seed check on startup/first request, and running `npm run db:seed` updates the `INITIAL_ADMIN_PASSWORD` hash if you set it in `.env`.)*

---

## 5. Start Frontend & Backend

The Express backend (`server.ts`) mounts Vite's frontend middleware in development and serves the built production bundle in production on a single unified port (`3000`).

### Development Mode (Hot Frontend + Backend + Socket.IO)
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

Open **`http://localhost:3000`** in your browser.
- **OpenAPI 3.0 Docs**: `http://localhost:3000/api/docs`
- **Health Check**: `http://localhost:3000/api/health`

---

## 6. Log In as Administrator

The initial administrator email is:

- **Email**: `kinyarwaranconnicostrate@gmail.com`

You can authenticate as the administrator in either of two ways:
1. **Email & Password Login**: Set `INITIAL_ADMIN_PASSWORD` in `.env`, run `npm run db:seed`, click **Sign In** in the top bar, and sign in with `kinyarwaranconnicostrate@gmail.com` and your configured password.
2. **Google OAuth Sign-In**: Click **Sign In > Continue with Google** with `kinyarwaranconnicostrate@gmail.com` (requires authorized domain configured in Firebase Authentication).

Once signed in, click **Dashboard** in the top navigation bar to access the full Administrator Workspace (Dashboard KPIs, Products, Inventory, Orders, Customers, Procurement, Deliveries, Reports, Notifications, and Settings/Audit Logs).

---

## 7. Verification & Tests

```bash
npm run lint    # TypeScript strict typecheck (tsc --noEmit)
npm run build   # Production Vite build
npm test        # Unit & API integration tests (node --test)
```

---

## 8. Database Backup & Restore

```bash
# Backup PostgreSQL database
pg_dump -h "$SQL_HOST" -U "$SQL_ADMIN_USER" -d "$SQL_DB_NAME" -Fc -f nacenis_backup.dump

# Restore PostgreSQL database
pg_restore -h "$SQL_HOST" -U "$SQL_ADMIN_USER" -d "$SQL_DB_NAME" --clean --if-exists nacenis_backup.dump
```
