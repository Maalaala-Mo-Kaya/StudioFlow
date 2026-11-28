<div align="center">

# StudioFlow V2

### Offline-First Graduation Pictorial & Studio Workflow Automation

[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PocketBase](https://img.shields.io/badge/PocketBase-v0.41-B8860B?style=for-the-badge&logo=pocketbase&logoColor=white)](https://pocketbase.io/)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://microsoft.com/windows)
[![Offline LAN](https://img.shields.io/badge/Network-Offline_LAN_Ready-2ea44f?style=for-the-badge&logo=signal&logoColor=white)](#studio-lan-setup)

[Workflow](#the-studio-workflow) -
[Quick Start](#quick-start) -
[LAN Setup](#studio-lan-setup) -
[Batch Scripts](#convenience-scripts-bat) -
[Station Guide](#station-guide) -
[Photo Storage](#photo-storage) -
[Customization](#customization)

</div>

---

## Overview

**StudioFlow V2** is a fast, paperless studio operations system built for graduation pictorial events. It runs entirely on your local studio network without needing an internet connection.

It connects the studio stations across one workflow.

- **Students** register, choose packages, and sign on a tablet or computer.
- **Cashiers** collect payments and print claim stubs and studio receipts simultaneously.
- **Makeup artists** claim paid students who purchased makeup or grooming and send them to the photo floor once preparation is complete.
- **Photographers** get a live queue of paid clients with automatically generated photo folders.
- **Choosers** help students review and confirm photos after the shoot.
- **Administrators** track framing status, release deliverables, and export daily accounting reports.

---

## The Studio Workflow

```mermaid
flowchart LR
    A["1. Registration Kiosk\n(Student enters info & signs)"] --> B["2. Cashier Counter\n(Collects payment & prints job order / receipt)"]
    B --> C["Photo Floor"]
    B --> M["Makeup / Grooming\n(If purchased)"]
    M --> C
    C --> P["Photo Chooser"]
    P --> D["Framing & Release\n(Track production & balance clearance)"]

    style A fill:#F8F7F4,stroke:#0A0A0A,stroke-width:2px,color:#0A0A0A
    style B fill:#FFFBEB,stroke:#C9A227,stroke-width:2px,color:#0A0A0A
    style C fill:#0A0A0A,stroke:#C9A227,stroke-width:2px,color:#FFF
    style D fill:#ECFDF5,stroke:#059669,stroke-width:2px,color:#0A0A0A
```

---

## Quick Start

### Prerequisites

- **Operating System**: Windows 10 or 11
- **Runtime**: [Node.js](https://nodejs.org/) 22.13+ on the Node 22 release line, or Node 24+ (for building and development)
- **Database Engine**: `pocketbase.exe` (included in the repository root)

### 1-Click Launch (Recommended for Studio Staff)

Simply double-click:

```bash
run.bat
```

The script automatically:

1. Detects your physical studio Wi-Fi / LAN IP address.
2. Starts PocketBase on the **staff port** `0.0.0.0:8091` and the client gateway on the **client port** `0.0.0.0:8090` (see [Ports](#ports-client-8090-and-staff-8091)).
3. Displays the exact URLs for the kiosk and the staff stations on your screen.

> **Tip**: Run `run.bat --build` to compile the web app (staff build into `pb_public`, kiosk build into `pb_public_kiosk`) and start both ports. Node.js must be installed on the server PC: the client gateway runs on it.

### Developer Mode (Live Reloading)

If developing or modifying frontend components:

```bash
scripts\dev.bat        # opens the four windows below
```

| Window | Port | Talks to |
| :--- | :--- | :--- |
| PocketBase (`pocketbase.exe serve --http=0.0.0.0:8091`) | 8091 staff | — |
| Client gateway (`npm run gateway`) | 8090 client | 8091, kiosk calls only |
| Staff UI (`npm run dev`) | 5173 | 8091 |
| Kiosk UI (`npm run dev:kiosk`) | 5174 | 8090, like a guest device |

Open **`http://localhost:5173`** (staff) or **`http://localhost:5174`** (kiosk).

---

## Convenience Scripts (`.bat`)

StudioFlow includes pre-built batch scripts to simplify studio operations:

| Script | How to Run | What It Does |
| :--- | :--- | :--- |
| **`run.bat`** | Double-click or `.\run.bat` | **1-Click Server Launch**. Detects studio LAN IP, binds server, and shows connect URLs. |
| **`run.bat --build`** | `.\run.bat --build` | Builds the staff app (`pb_public`, `:8091`) and the kiosk (`pb_public_kiosk`, `:8090`), then starts both ports. |
| **`scripts\setup_port_firewall.ps1`** | Elevated PowerShell, `-GuestSubnet <subnet>` | Optional second layer: Windows Firewall blocks the staff port `8091` from the guest Wi-Fi subnet. |
| **`scripts\backup.bat`** | Double-click | Creates a timestamped snapshot of the database (`pb_data\`) into `backups\`. |
| **`scripts\restore.bat`** | Double-click | Restores the database from a previous backup snapshot. |
| **`scripts\clean_orphans.bat`** | Double-click | Previews or removes empty client folders that have no matching Job Order or saved binding. |
| **`scripts\migrate-photo-folders.bat`** | Command Prompt | Previews photo folder renames. Use `--apply` to migrate or `--resume` to continue an interrupted migration. |
| **`scripts\reset-for-handover.bat`** | Double-click (server closed) | Removes all test data before handover so numbering starts at Job Order 00001 / OR-000001. Backs up first. It can keep the setup (schools, packages, staff) or create a factory-fresh database. |

---

## Station Guide

| Station | Route | Default Users | Key Responsibilities |
| :--- | :--- | :--- | :--- |
| **Registration Kiosk** | `/#/register` | Public (Students) | Select school, course, and pictorial package; dynamic add-on selection; digital signature capture; instant Job Order assignment (`№ 00001`). |
| **Cashier Counter** | `/#/cashier` | `cashier`, `admin` | Search client by Job Order or name; collect downpayment or full payment with cash received and change; print the **job order sheet** (letter: customer claim stub + studio copy) after the first payment and a **small payment receipt**, a third of a letter sheet (customer + studio copy), after later payments. |
| **Makeup / Grooming** | `/#/mua` | `mua`, `admin` | MUAs claim, start, and complete preparation. Admins can release a stalled assignment to the waiting queue. |
| **Photo Floor** | `/#/photographer` | `photographer`, `admin` | Live queue for paid students after any required preparation. **Copy Path** retrieves the assigned folder path. |
| **Photo Chooser** | `/#/chooser` | `chooser`, `admin` | Search completed shoots, preview photos, confirm selections, and reopen a selection to revise it. |
| **Studio Admin** | `/#/admin` | `admin` | Manage staff and catalog settings. Monitor makeup assignments and photo selection under **Makeup & Photo Selection**. |

Create staff accounts in **Admin → Staff Accounts**. In **Packages & Add-ons**, classify a standalone makeup or grooming charge as **Other Payment — MUA**, then enable **This is an MUA Service**. Price makeup in a portrait bundle as its own add-on. Catalog edits apply to new purchases. To correct an existing order before photography, use **Clients Directory → Edit Client → Correct MUA requirement**. Release any active MUA assignment first. Set **Photo selection limit** to the allowed number of photographs. A value of `0` allows any number.

The public form groups optional add-ons using their existing Studio or MUA classification and shows automatic services separately. Draft answers stay in the registration tab for up to two hours after the last saved change. **Refresh & Continue** loads the latest catalog while retaining compatible answers. A refreshed form asks for a new signature. **Start Over** and successful submission clear the draft.

**Analytics & Overview → MUA Performance Analytics** shows completed service counts and earnings by catalog item for the selected Asia/Manila date. Select an artist to inspect their completions, recorded adjustments, and refunds or voids awaiting review. CSV exports match the daily totals. The Earnings Excel export includes an audit sheet. Historical completions with ambiguous catalog references retain their original column and earnings with a review flag.

In **Cashier → Pending**, use the pencil to correct an unpaid client’s details or package before a job order is issued. StudioFlow recalculates the balance when you save. Administrators can review the changes under **Clients Directory → Edit Client → Cashier Edit History**.

### QR Code Generator

Open **Admin → QR Code Generator** to create, download, or print direct website links, password-protected links, and Wi-Fi codes. Saving a direct link replaces the raw URL preview with a managed QR code. Download the managed version if the destination needs to stay editable after printing. Protected links are saved when they are generated. Use **Saved QR Codes** to edit, disable, enable, or permanently delete a managed link.

Managed QR codes use StudioFlow's backend address. Open StudioFlow at a stable address phones can reach before generating them, or configure that address using `VITE_PB_URL`. Use HTTPS where protected links are shared to protect passwords in transit. If the StudioFlow host or port changes, previously printed codes still point to the old address.

StudioFlow generates Wi-Fi codes in the browser. Phones can scan them without reaching the StudioFlow server. **Save Wi-Fi Connection** stores the network settings and encrypts its password on the server so admins can reopen and print the code. Use HTTPS for admin access when saving or reopening credentials. Keep downloaded and printed copies private because they encode the Wi-Fi password.

The Wi-Fi encryption key lives next to the PocketBase data directory as `pb_data.wifi-key` for the default setup. Back up the key separately and restore it alongside the data directory when moving studios or restoring a database. Older saved Wi-Fi entries need their passwords entered once through **Edit → Generate QR Code → Update Wi-Fi Connection**.

---

## Studio LAN Setup

Run StudioFlow across all studio tablets, laptops, and PCs using a single Wi-Fi router (no internet required):

```
                       [ Studio Wi-Fi Router ]
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
[ Server PC ]              [ Cashier Laptop ]        [ Student phone / kiosk ]
Host IP: 192.168.1.50      http://192.168.1.50:8091  http://192.168.1.50:8090
Runs run.bat               (staff network)           (guest Wi-Fi)
```

1. **Launch `run.bat`** on the main studio computer.
2. Note the IP displayed in the console (e.g. `192.168.1.50`).
3. Open any browser on devices connected to the studio Wi-Fi:
   - **Student Kiosks / phones** (guest Wi-Fi): `http://192.168.1.50:8090`
   - **Cashier Terminal**: `http://192.168.1.50:8091/#/cashier`
   - **Photographer PC**: `http://192.168.1.50:8091/#/photographer`
   - **Makeup station**: `http://192.168.1.50:8091/#/mua`
   - **Chooser station**: `http://192.168.1.50:8091/#/chooser`
   - **PocketBase dashboard**: `http://192.168.1.50:8091/_/`

Leave `VITE_PB_URL` / `VITE_CLIENT_URL` unset when the server serves the production builds. Each page sends API requests to its own address, including through an HTTPS tunnel. If you serve the frontend elsewhere, set them before building (see `.env.sample`).

### Ports: client 8090 and staff 8091

| Port | Process | Reachable from | Serves |
| :--- | :--- | :--- | :--- |
| **8090 client** | `scripts\client-gateway.cjs` (Node, no dependencies) | everyone, guest Wi-Fi included | the kiosk-only build (`pb_public_kiosk`) and only the kiosk's calls: registration catalog, submitting the form, package photos, the catalog's realtime topic, `/q/<slug>` QR links |
| **8091 staff** | PocketBase | staff network only | every station, the `/_/` dashboard, all APIs |

The gateway answers everything else with 404 (sign-in, `/_/`, staff endpoints, other collections, other realtime topics) and drops any `Authorization` / `Cookie` header, so nothing on 8090 acts as a staff member. It passes the guest's address to PocketBase in `X-Real-IP` (trusted through migration `1793805600`). QR links made in Admin point at 8090. `npm run test:gateway` checks the allowlist.

**Router:** put students on the guest network and allow it to reach only `<server IP>:8090` (TCP). Staff devices stay on the main network, which reaches both ports. Many home routers isolate the guest Wi-Fi from the LAN completely, with no per-port exception; you then need a router with VLAN / firewall rules (allow guest → server:8090, deny guest → LAN). Optionally run `scripts\setup_port_firewall.ps1 -GuestSubnet <guest subnet>` on the server, which blocks 8091 from that subnet even if the router allows it.

---

## Photo Storage

The PocketBase server creates photo directories under `C:\StudioFlow_Photos` by default. To use another location, set `STUDIOFLOW_PHOTOS_ROOT` to its absolute path in the server process environment before launching PocketBase. Use a volume that supports hard links, such as NTFS, and give PocketBase read and write access.

```
C:\StudioFlow_Photos\
  └── [School Code]\
        └── [Course Code]\
              └── 0018_Dela_Cruz_Juan_Santos\
                    ├── 0018_Dela_Cruz_Juan_Santos\
                    └── Unselected\
```

**Camera auto-import:** in **Admin → Camera Import** (or **Set Up** on the Photo Floor), add a camera and choose its output folder on the server PC with **Browse**. Set the same folder as the save folder in the camera's tethering or Wi-Fi transfer software. On the Photo Floor, pick the camera for that device. **Select** links the camera to the client, every finished shot moves into the client's job folder within a few seconds, and **Mark Done** sends the last shots and unlinks the camera. Photos taken with no client linked stay in the camera folder until someone sends them to a client.

Use **Copy Path** in the photographer queue to find the server folder for a job order. From a remote station, use your studio's file share for that folder. Put finished exports in the job folder or `Unselected`. Opening the gallery moves supported exports from the job folder into `Unselected`. Confirmed selections move into the subfolder named after the job folder. RAW files and unrecognized files stay where the photographer placed them.

Existing folders keep working under their saved names. To rename them, stop PocketBase and pause writes to the photo share, then back up the database and photo root together. From the StudioFlow directory run `node scripts/migrate-photo-folders.cjs "<path to data.db>" "<photo root>"` to preview. Review unmatched or skipped folders, then add `--apply` to rename verified bindings and update the database. For an interrupted migration, keep PocketBase stopped and use `--resume` with the same paths. If recovery requires restoring a backup, restore both the database and photo root together. An unbound legacy folder can be attached using **Copy Path** once its unique job order and folder have been verified.

If a transfer pauses, restore access to the original files and choose **Resume transfer** on the student card. Keep the photo root and the database backed up together. The database contains folder mappings and any unfinished transfers.

---

## Security & Staff Accounts

The database enforces a **Zero-Trust Rule Model**:
- The public kiosk can read the catalog, submit registrations, and read the active queue count.
- Financial ledgers and full registration details are restricted by staff role. Makeup and Chooser stations receive the student details needed for their workflow.
- Deletions, pricing edits, and school roster management are restricted to `admin`.

### Default Staff Usernames

| Role | Username | Station Access |
| :--- | :--- | :--- |
| **Cashier** | `cashier` | Cashier Counter |
| **Photographer** | `photographer` | Photo Floor Queue & Shoot History |
| **Administrator** | `admin` | Full System & Dashboard Access |

---

## Customization

To update studio branding, telephone numbers, address, or receipt terms, edit:

```
src/constants/studio.ts
```

All studio constants (studio name, tagline, hours, contact numbers, starting receipt number, and terms clauses) are maintained in this single source of truth.

---

## Available Scripts

### Build from the Windows CLI

From the StudioFlow project directory in PowerShell or Command Prompt, install the locked dependencies and run the build script:

```text
npm.cmd ci
.\scripts\build.bat
```

Run `npm.cmd ci` on a fresh checkout or after the dependency lockfile changes. The build script runs type checking, writes the production build to `dist\`, and publishes it to PocketBase’s `pb_public\` folder. It returns a nonzero exit code if building or publishing fails.

To build, deploy, and start both ports (client 8090, staff 8091), run:

```text
.\run.bat --build
```

| Command | Description |
| :--- | :--- |
| `run.bat` | 1-Click launcher with auto-detected studio LAN IP |
| `run.bat --build` | Builds both apps and serves the kiosk on 8090 and staff on 8091 |
| `scripts\dev.bat` | Development: PocketBase 8091, gateway 8090, Vite staff 5173 and kiosk 5174 |
| `npm run dev` / `npm run dev:kiosk` | Vite dev server for the staff UI / kiosk UI |
| `npm run gateway` | Client gateway on 8090 (forwards to 8091) |
| `npm run test:gateway` | Checks what the client port forwards and refuses |
| `scripts\build.bat` | Type-checks, builds, and publishes the frontend |
| `npm run build` | Builds `dist\` + `dist-kiosk\` and publishes them to `pb_public\` + `pb_public_kiosk\` |
| `npm run lint` | Runs ESLint type and code quality checks |
| `npm run test:workflow` | Runs the isolated PocketBase integration suite with Node.js 22.13+ |

---
