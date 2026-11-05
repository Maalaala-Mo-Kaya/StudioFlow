# StudioFlow — Offline-First Graduation Pictorial System

> **Type:** On-Premise LAN Web Application + Automated File Management System  
> **Status:** Planned technology stack and operational workflow

Excel-backed staff authentication, mandatory first-login password changes, administrator account setup and route/API authorization are implemented. See [staff access setup](docs/staff-access.md) for provisioning, session behavior, environment configuration and checks. The remaining workflow sections below describe planned features.

StudioFlow is an on-premise, offline-first system designed for high-volume pictorial sessions organized by **schools, companies, government units, and other organizations**. The configurable registration form supports organizational categories and subcategories. StudioFlow manages registration, payment, photo shooting, selection, and file archiving without requiring an internet connection.

The system runs on a local studio PC/server connected to a dedicated Wi-Fi router. **Individual-client and walk-in modes are outside the planned scope.**

---

## 🛠 Planned Technology Stack

| Layer | Planned Technology | Purpose |
| :--- | :--- | :--- |
| Frontend | **React + TypeScript** | Registration, cashier, photographer, and admin interfaces |
| Styling | **Tailwind CSS** | Responsive design across smartphones, tablets, and desktop screens |
| Backend Runtime | **Node.js + TypeScript** | Server-side business logic, validation, and local file management |
| Backend Framework | **Fastify** | Local HTTP APIs for all modules |
| Local Data Storage | **Microsoft Excel (`.xlsx`)** | Initial operational record storage for the local setup |
| Excel Integration | **ExcelJS** | Read, write, import, and export workbook data |
| Real-Time Communication | **Socket.IO** | Push cashier-confirmed entries to the photographer queue |
| PDF Generation | **pdf-lib** | Generate copies of signed proofing forms |
| Photo / Document Storage | **Local server filesystem** | Organize photographs, proofing-form PDFs, and signed records |
| Deployment | **Local studio PC/server + dedicated Wi-Fi router** | Serve the web app to browsers over the offline LAN |

### Implementation Notes

- The frontend and backend use **TypeScript**, with common types and validation rules reusable across applications.
- **Excel is the planned database for the initial local setup**, not a relational database. All workbook access must go through the Fastify backend; browsers must never write directly to `.xlsx` files.
- Because registration and cashier clients may save at the same time, the backend must **serialize workbook writes**, validate transactions, use safe file replacement, and maintain regular backups.
- **SQLite is a possible future upgrade** if concurrent usage or data volume exceeds what Excel can reliably handle. It is **not** part of the currently selected database stack.
- Host the frontend assets, API, and Socket.IO endpoint on the local server so the application does not depend on internet-hosted services.
- A staff member may encode previously collected paper forms **after power and server availability are restored**; an offline local server cannot accept submissions while powered off.

### Planned Application Structure

```text
studioflow/
├── apps/
│   ├── web/                         # React + TypeScript + Tailwind CSS
│   │   └── src/
│   │       ├── features/
│   │       │   ├── registration/
│   │       │   ├── cashier/
│   │       │   ├── photographer/
│   │       │   └── admin/
│   │       └── shared/
│   └── server/                      # Node.js + Fastify + TypeScript
│       └── src/
│           ├── features/
│           │   ├── registration/
│           │   ├── payments/
│           │   ├── queue/
│           │   └── repository/
│           ├── storage/excel/       # ExcelJS access and write coordination
│           └── services/           # PDF, Socket.IO, and filesystem services
├── packages/
│   └── shared/                      # Shared TypeScript types and validation
└── data/
    ├── studioflow.xlsx
    ├── backups/
    └── Pictorial_Master_Repository/
```

---

## 🚀 Setup & Installation Guide

### 1. Prerequisites

**Hardware:**

- Studio PC / Laptop (Windows 10/11 recommended) - min 8GB RAM, SSD
- Dedicated Wi-Fi Router (TP-Link, Huawei, etc.) - no internet required
- 1x Counter Tablet / Touchscreen (fallback)
- Printer for Owner Copy / Yellow Form

**Software:**

- Node.js 20 LTS or newer - <https://nodejs.org>
- pnpm (recommended) or npm: `npm install -g pnpm`
- Git
- Microsoft Excel or compatible viewer (for verifying `.xlsx`)

Check versions:

```bash
node -v
pnpm -v
git --version
```

### 2. Network Setup (Offline LAN)

This is critical - StudioFlow is 100% offline.

**A. Configure Static IP on Studio Server:**

1. Connect studio PC to router via LAN cable
2. Windows: Control Panel > Network > Adapter > Properties > IPv4
3. Set static IP: `192.168.10.10` (example), Subnet: `255.255.255.0`
4. Gateway: `192.168.10.1` (your router IP)

**B. Find Your Local IP:**

```bash
# Windows
ipconfig
# Look for IPv4: 192.168.10.10

# macOS / Linux
ifconfig
```

**C. Configure Wi-Fi Router:**

- SSID: `Hi-Light-STUDIO` (or your studio name)
- Password: Set a simple one for pictorial day
- Security: WPA2
- No internet WAN needed - LAN only
- Enable AP Isolation OFF (so clients can reach server)

**D. Firewall Rule (Windows):**
Allow Node.js through firewall:

```
Windows Firewall > Allow app > Node.js > Private + Public
```

Or open port manually:

```bash
netsh advfirewall firewall add rule name="StudioFlow" dir=in action=allow protocol=TCP localport=3000,3001
```

### 3. Clone & Install

```bash
# Clone repo
git clone https://github.com/your-org/studioflow.git
cd studioflow

# Install dependencies (monorepo)
pnpm install

# If using npm
npm install
```

Project should have this structure after install:

```
studioflow/
├── apps/web
├── apps/server
├── packages/shared
└── data/  (will be created)
```

### 4. Environment Configuration

Create env files from examples:

**`apps/server/.env`:**

```env
# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# Paths - all local
DATA_DIR=../../data
EXCEL_PATH=../../data/studioflow.xlsx
REPOSITORY_PATH=../../data/Pictorial_Master_Repository
BACKUP_PATH=../../data/backups

# Socket.IO
CORS_ORIGIN=*

# Security
APP_ORIGIN=https://studio.example
# Optional absolute path; defaults to apps/server/src/storage/excel/storage.xlsx.
# STORAGE_FILE=C:/StudioFlow/private/storage.xlsx

# File Limits
MAX_UPLOAD_SIZE=20mb
```

**`apps/web/.env`:**

```env
# Must be your studio PC's static IP - change this
VITE_API_URL=http://192.168.10.10:3001
VITE_SOCKET_URL=http://192.168.10.10:3001
VITE_APP_NAME=Hi-Light Studio
```

> **Important:** Replace `192.168.10.10` with your actual `ipconfig` IPv4.

### 5. Initialize Data Directory & Excel

The backend will auto-create these on first run, but you can manually create:

```bash
# From project root
mkdir -p data/backups
mkdir -p data/Pictorial_Master_Repository

# Or on Windows
mkdir data
mkdir data\backups
mkdir data\Pictorial_Master_Repository
```

**Excel workbook `studioflow.xlsx` sheets created automatically:**

- `Organizations`
- `Levels_Categories`
- `Courses`
- `Strands`
- `Packages`
- `AddOns`
- `Registrations`
- `Payments`
- `MasterLists`

On first `pnpm dev`, server will generate `studioflow.xlsx` with headers if it doesn't exist.

**To restore from backup:**
Copy latest from `data/backups/studioflow_YYYY-MM-DD_HH-mm.xlsx` to `data/studioflow.xlsx`

### 6. Development Mode

Run backend and frontend separately in two terminals:

**Terminal 1 - Server:**

```bash
cd apps/server
pnpm dev
# Server runs at http://0.0.0.0:3001
# Excel at ../../data/studioflow.xlsx
```

**Terminal 2 - Web:**

```bash
cd apps/web
pnpm dev
# Web runs at http://192.168.10.10:3000
# Access via LAN: http://192.168.10.10:3000/register
```

**Test offline:**

1. Connect phone to `Hi-Light-STUDIO` Wi-Fi
2. Open `http://192.168.10.10:3000/register`
3. Submit test registration
4. Check `http://192.168.10.10:3000/cashier`
5. Check `http://192.168.10.10:3000/photographer` live update

### 7. Production Build & Run (Pictorial Day)

Build optimized assets:

```bash
# From root
pnpm build

# This builds:
# apps/web/dist -> static frontend
# apps/server/dist -> compiled backend
```

**Option A - Serve frontend from Fastify (recommended for offline):**
Server in `apps/server/src/app.ts` should serve `../web/dist` as static:

```ts
fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../../web/dist'),
  prefix: '/',
})
```

Then just run server:

```bash
cd apps/server
pnpm start
# Now everything is at http://192.168.10.10:3001
# /register, /cashier, /photographer, /admin
```

**Option B - PM2 (keeps server alive after power flicker):**

```bash
npm install -g pm2
pm2 start apps/server/dist/index.js --name studioflow -- -p 3001
pm2 save
pm2 startup
# On Windows, use pm2-windows-startup

# Logs
pm2 logs studioflow
pm2 restart studioflow
```

**Auto-start on boot (Windows):**

1. Create `start-studioflow.bat`:

```bat
@echo off
cd C:\studioflow\apps\server
node dist\index.js
```

2. Put shortcut in `shell:startup`

### 8. Generate Dual-QR Standee

Generate two QR codes to print:

**Install QR generator (one-time):**

```bash
npm install -g qrcode
# or use pnpm dlx
```

**Generate:**

QR #1 - Wi-Fi Auto-Connect (Android/iOS):

```
WIFI:S:Hi-Light-STUDIO;T:WPA;P:yourPassword;H:false;;
```

Generate image: <https://api.qrserver.com/v1/create-qr-code/?data=WIFI:S:Hi-Light-STUDIO;T:WPA;P:yourPassword;;&size=300x300>

QR #2 - Registration Form:

```
http://192.168.10.10:3001/register
```

Generate: <https://api.qrserver.com/v1/create-qr-code/?data=http://192.168.10.10:3001/register&size=300x300>

**Or via Node script `scripts/generate-qr.js`:**

```js
import QRCode from 'qrcode'
await QRCode.toFile('qr-wifi.png', 'WIFI:S:Hi-Light-STUDIO;T:WPA;P:password;;')
await QRCode.toFile('qr-register.png', 'http://192.168.10.10:3001/register')
```

Print on A3 standee:

```
[QR WiFi]  Scan to join Wi-Fi
[QR Form]  Scan to Register
Server: http://192.168.10.10:3001
```

### 9. Daily Operations Checklist

**Before pictorial day:**

- [ ] Studio PC fully charged / UPS ready
- [ ] Router tested, SSID visible
- [ ] `pnpm start` / PM2 running
- [ ] Excel backup from yesterday copied to USB
- [ ] Test registration from phone
- [ ] Printer has paper + ink for Yellow Forms
- [ ] Counter tablet connected as fallback

**During pictorial:**

- Monitor `data/backups/` - auto-backup every 30 mins
- If power outage: server will auto-restart, clients reconnect to Wi-Fi

**After pictorial:**

- [ ] Backup `data/` to external drive
- [ ] Export Excel to Google Drive (when internet available)
- [ ] Verify `Pictorial_Master_Repository/YYYY-MM-DD/` folders

### 10. Backup & Recovery

**Auto-backup logic (already in server):**

- Every successful Excel write -> serialized queue + atomic replace
- Every 30 mins -> copy to `data/backups/studioflow_YYYY-MM-DD_HH-mm.xlsx`
- Keep last 50 backups

**Manual backup:**

```bash
# Windows
xcopy data data_backup_%date:~-4,4%-%date:~-10,2%-%date:~-7,2% /E /I

# Linux/macOS
cp -r data data_backup_$(date +%F)
```

**Recovery after crash:**

1. Check latest backup in `data/backups/`
2. Copy to `data/studioflow.xlsx`
3. Restart server: `pm2 restart studioflow`

### 11. Troubleshooting

| Issue | Cause | Fix |
| :--- | :--- | :--- |
| Phone can't open form | Wrong IP / firewall | Check `ipconfig`, allow port 3001 in firewall, ensure same Wi-Fi |
| Excel write failed / EBUSY | Concurrent writes | Backend serializes writes - retry, check `storage/excel/queue.ts` |
| Socket.IO queue not updating | Different network | Ensure `/photographer` uses same `VITE_SOCKET_URL`, disable AP isolation |
| PDF not generated | Missing folder | Ensure `Pictorial_Master_Repository` exists and writable |
| Port 3001 in use | Previous process | `netstat -ano | findstr :3001` then `taskkill /PID <pid> /F` |
| Photos not saving | Path traversal block | Paths must be generated by backend, never from client input |
| Power outage | Server off | Staff uses paper forms, encode later via `/admin` manual encoding when server back |

**Logs location:**

- Server logs: `apps/server/logs/` or PM2 logs
- Browser console: F12 on cashier/photographer

---

## 📋 System Environment

### 100% Offline Operation

- Runs on a local studio PC/server; no internet connection is required for normal operation.
- Designed to accommodate peak pictorial days (100+ students/day), subject to actual load testing and server capacity.
- Excel-based local storage with scheduled backups.
- Clients and staff connect through the studio's dedicated LAN / Wi-Fi.

### Dual-QR Standee Architecture (Zero IoT Hardware)

Two printed QR codes are displayed on a standee:

1. **QR Code #1 — Wi-Fi Auto-Connect:** Helps students or parents join the offline studio Wi-Fi network, subject to device support.
2. **QR Code #2 — Local Web Form:** Opens `http://[Studio-Server-IP]/register` in the mobile browser.

### Fallback Redundancy

- **Counter Tablet / Touchscreen Monitor:** For students without phones.
- **Manual Encoding Interface:** Staff encode paper forms when the server is available again after an outage.

---

## 🔄 End-to-End Operational Workflow

### Phase 1: Pre-Pictorial Admin Setup

**1. Admin Creates Organization-Based Form Data**

Admin creates and manages the dropdown options used by the registration form:

- **Create Client / Organization:** For example, ACLC College of Mandaue, Company XYZ, or a Local Government Unit.
- **Create Level / Category per Organization:** For schools: Pre-School, Kinder, Elementary, High School, SHS, College. For other organizations: Employee, Member, Department, and other configured categories.
- **Create Courses (College):** For example, BSCS, BSIT, BSA — linked to a specific organization and College level.
- **Create Strands (SHS):** For example, STEM, ABM, HUMSS, TVL — linked to a specific organization and SHS level.
- **Manage Packages and Add-ons:** Add, edit, or remove available choices.

**2. Master List Import (Optional)**

Organization coordinators may provide an Excel/CSV master list for scheduled batches (for example, 1–100 students per day), categorized by organization, level, and course/strand. The admin imports this list for name matching during registration.

**3. Initial Data Setup**

The backend prepares or updates Excel workbook records for organizations, levels/categories, courses, strands, packages, and add-ons.

### Phase 2: Organization Member Arrival & Mobile Registration

**1. Connect & Open**

Students, employees, or other organization members (or parents/guardians for younger students) scan QR #1 to join the local Wi-Fi, then QR #2 to open the Proofing Form.

**2. Organization & Personal Details**

- **Client / Organization Name:** Admin-configured organization dropdown.
- **Level / Category:** Options change based on the selected organization.
  - Schools: Pre-School, Kinder, Elementary, High School, SHS, College.
  - Other organizations: Employee, Member, Department, or other admin-created categories.
- **Dynamic Subcategory:** Appears only when configured for the selected organization and level.
  - College → Course / Degree (for example, BSCS, BSIT, BSA).
  - SHS → Strand (for example, STEM, ABM, HUMSS, TVL).
- **Full Name:** Enter or select a name; match against an imported organization master list when one is available.

**3. Package, Add-ons & Payment Selection**

- The registrant selects an available package and add-ons.
- Package and add-on choices are maintained by Admin.
- **Payment Option:** Full Payment or Downpayment.

**4. Digital Signature & Submission**

The student, employee, or parent/guardian signs on a phone or touchscreen and submits the form.

**5. Automated Triggers Upon Submission**

- Generates a unique **Pictorial ID Number** (for example, `14008`).
- Assigns a default **First-Come, First-Served (FCFS) Queue Number**.
- Creates the corresponding local photo repository folder.
- Saves registration data through the TypeScript backend to Excel storage.

### Phase 3: Cashier Verification, Payment & Queue Control

**1. Record Lookup**

Cashier selects a registered participant (for example, `14008 - Claire Varlo`) in the POS interface.

**2. Automated Logging**

The backend retrieves Date/Time, Pictorial ID, Name, Organization, Level/Course/Strand, Package/Add-ons, Payment Type, and Status from saved registration data.

**3. Queue Number Control**

Shows the auto-assigned FCFS Queue Number and permits authorized manual adjustments.

**4. Payment Collection**

- **Full Payment:** Total is auto-filled. Cashier collects payment and clicks `Confirm & Pay`.
- **Downpayment:** Cashier enters the collected amount. The backend calculates the Remaining Balance.

**5. After Payment — Receipt Handover & Live Queue Push**

- **Owner/Studio Copy** is printed and kept by the cashier for daily accounting.
- **Yellow Form (Student Receipt / Claiming Stub)** is printed and handed directly to the participant.
- Once payment is confirmed and successfully saved, **Socket.IO** pushes the new queue entry to `/photographer`; staff do not need to pass the Yellow Form to the photographer.

### Phase 4: Photo Shoot — Photographer Mobile Live Queue

**Photographer Route:** `http://[Studio-Server-IP]/photographer`

- Available on a phone or tablet connected to the local Wi-Fi.
- Browser-based, with no mobile app installation required.
- Mobile-friendly interface.
- Photographer signs in with a provisioned username and password.

**1. Live List of Paid Participants**

Paid participants appear in queue-number order. The list updates automatically when the cashier confirms payment.

```text
#007 - 14008 - Claire Varlo
ACLC - College - BSCS
[DONE]

#008 - 14009 - John Dela Cruz
ACLC - SHS - STEM
[DONE]
```

**2. Manual Calling & Mark as Done**

Photographer calls the participant by name or queue number, completes the shoot, and taps `DONE`. The participant is removed from the active list and marked as **Done Shooting**.

**3. Photo Transfer & Selection**

- Photographer transfers raw images into the participant's `unselected pictures` folder.
- Participant reviews and selects shots for frames, yearbook, LED wall, or other products.
- Selected images move to the `selected pictures` folder.
- Selection status changes from **None Selected** to **Selected**.

### Phase 5: Photo Selection, Balance Settlement & Final Claiming

**1. Photo Selection**

After the shoot, the participant reviews and selects final shots; the system records the selection status.

**2. Claiming Stub (Already Handed)**

The participant retains the Yellow Form received at the cashier as the receipt and claiming stub. No second receipt printing is needed after the shoot.

**3. Balance Settlement & Framing Release**

- Soft copies and printed frames are locked until payment status is **Fully Paid**.
- When a participant returns to settle the balance, the cashier looks up the Pictorial ID, records the remaining payment, and updates the status to **Fully Paid**.
- Framing batches may be scheduled for **February–March**, according to studio operations.

---

## 📁 Automated Local Directory & Repository Architecture

The Node.js filesystem service creates a folder for each registered organization member:

```text
Pictorial_Master_Repository/
└── [YYYY-MM-DD]/                            # e.g., 2026-11-23
    └── [Client Name - Organization]/       # e.g., ACLC College of Mandaue
        └── [Level - Course/Strand]/        # e.g., College - BSCS / SHS - STEM
            └── [Pictorial ID] - [Name]/     # e.g., 14008 - Claire Varlo
                ├── Form - 14008 - Claire Varlo.pdf
                ├── unselected pictures - 14008 - Claire Varlo/
                └── selected pictures - 14008 - Claire Varlo/
```

- **Form PDF:** Generated by `pdf-lib` from the completed, signed proofing form and related payment details.
- **unselected pictures:** Working folder for raw shots.
- **selected pictures:** Curated images for framing, yearbook, and other deliverables.
- Folder paths must be sanitized and generated by the backend, rather than accepted directly from browser input.

---

## 🧩 Core System Modules

| Module | User Role | Key Features & Responsibilities |
| :--- | :--- | :--- |
| **1. Admin & Roster Manager** | Studio Admin / Owner | Manage organizations, their levels/categories, courses and strands, packages and add-ons. Import Excel/CSV organization rosters. Review sales, outstanding balances, and framing schedules. |
| **2. Mobile Registration Portal** | Organization Member / Student / Parent | Offline-LAN registration with dynamic Organization → Level → Course/Strand fields, optional master-list matching, touchscreen signature, and Pictorial ID generation. |
| **3. Cashier POS & Queue Controller** | Cashier Staff | Retrieve saved registration information, adjust FCFS queue numbers, collect full/downpayments, calculate balances, print Owner Copy and Yellow Form, then trigger live queue updates. |
| **4. Photographer Mobile Live Queue** | Photographer | `/photographer` browser route; displays paid participants in queue order, receives Socket.IO updates, and allows `DONE` marking after the shoot. |
| **5. Automated File Engine** | Backend Service | Generate organization-based directory structures, save signed PDFs, and maintain photo folders. |

---

## 📱 Route Specifications

| Route | Access | Purpose |
| :--- | :--- | :--- |
| `/register` | Organization Member / Student / Parent (via QR #2) | Mobile proofing and registration form |
| `/cashier` | Cashier Staff | Payment verification and queue control |
| `/photographer` | Photographer | Live paid-participant queue and shooting completion |
| `/admin` | Studio Admin / Owner | Organization setup, roster imports, reports, and user management |

---

*This README is for internal planning and development. The technology choices describe the planned initial implementation, not completed features.*
