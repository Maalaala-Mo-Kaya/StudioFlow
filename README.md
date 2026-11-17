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
    A["1. Registration Kiosk\n(Student enters info & signs)"] --> B["2. Cashier Counter\n(Collects payment & prints 2-copy receipt)"]
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
- **Runtime**: [Node.js](https://nodejs.org/) v18+ (for initial build or dev server)
- **Database Engine**: `pocketbase.exe` (included in the repository root)

### 1-Click Launch (Recommended for Studio Staff)

Simply double-click:

```bash
run.bat
```

The script automatically:

1. Detects your physical studio Wi-Fi / LAN IP address.
2. Starts the backend server on `0.0.0.0:8090`.
3. Displays the exact URLs for tablets, cashier laptops, and phone kiosks on your screen.

> **Tip (Single-Port Mode)**: Run `run.bat --build` to compile and bundle the web app directly into PocketBase. This serves both the database and the web application from a single port (`8090`), so other devices don't need a separate Node.js terminal running.

### Developer Mode (Live Reloading)

If developing or modifying frontend components:

```bash

# Terminal 1: Start Backend
.\pocketbase.exe serve --http="127.0.0.1:8090"

# Terminal 2: Start Frontend with HMR
npm i
npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

## Convenience Scripts (`.bat`)

StudioFlow includes pre-built batch scripts to simplify studio operations:

| Script | How to Run | What It Does |
| :--- | :--- | :--- |
| **`run.bat`** | Double-click or `.\run.bat` | **1-Click Server Launch**. Detects studio LAN IP, binds server, and shows connect URLs. |
| **`run.bat --build`** | `.\run.bat --build` | Builds the frontend and deploys it to `pb_public` for single-port serving (`:8090`). |
| **`scripts\backup.bat`** | Double-click | Creates a timestamped snapshot of the database (`pb_data\`) into `backups\`. |
| **`scripts\restore.bat`** | Double-click | Restores the database from a previous backup snapshot. |
| **`scripts\clean_orphans.bat`** | Double-click | Scans and safely prunes empty or cancelled student photo folders on disk. |

---

## Station Guide

| Station | Route | Default Users | Key Responsibilities |
| :--- | :--- | :--- | :--- |
| **Registration Kiosk** | `/#/register` | Public (Students) | Select school, course, and pictorial package; dynamic add-on selection; digital signature capture; instant Job Order assignment (`№ 00001`). |
| **Cashier Counter** | `/#/cashier` | `cashier`, `admin` | Search client by Job Order or name; collect downpayment or full payment; 1-click simultaneous print for **Page 1 (Yellow Customer Copy)** and **Page 2 (White Studio Accounting Copy)**. |
| **Makeup / Grooming** | `/#/mua` | `mua`, `admin` | MUAs claim, start, and complete preparation. Admins can release a stalled assignment to the waiting queue. |
| **Photo Floor** | `/#/photographer` | `photographer`, `admin` | Live queue for paid students after any required preparation. **Copy Path** retrieves the assigned folder path. |
| **Photo Chooser** | `/#/chooser` | `chooser`, `admin` | Search completed shoots, preview photos, confirm selections, and reopen a selection to revise it. |
| **Studio Admin** | `/#/admin` | `admin` | Manage staff and catalog settings. Monitor makeup assignments and photo selection under **Makeup & Photo Selection**. |

Create the two new staff accounts in **Admin → Staff Accounts**. Makeup eligibility comes from purchased add-on names and package inclusions that describe makeup, make-up, or grooming. StudioFlow records the service for the registration when the package or add-ons are selected. In **Packages & Add-ons**, set **Photo selection limit** to the allowed number of photographs. A value of `0` allows any number.

---

## Studio LAN Setup

Run StudioFlow across all studio tablets, laptops, and PCs using a single Wi-Fi router (no internet required):

```
                       [ Studio Wi-Fi Router ]
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
[ Server PC ]              [ Cashier Laptop ]        [ Registration Tablet ]
Host IP: 192.168.1.50      http://192.168.1.50:8090  http://192.168.1.50:8090
Runs run.bat               (Cashier Counter)         (Public Student Kiosk)
```

1. **Launch `run.bat`** on the main studio computer.
2. Note the IP displayed in the console (e.g. `192.168.1.50`).
3. Open any browser on devices connected to the studio Wi-Fi:
   - **Student Kiosks / Tablets**: `http://192.168.1.50:8090/#/register`
   - **Cashier Terminal**: `http://192.168.1.50:8090/#/cashier`
   - **Photographer PC**: `http://192.168.1.50:8090/#/photographer`
   - **Makeup station**: `http://192.168.1.50:8090/#/mua`
   - **Chooser station**: `http://192.168.1.50:8090/#/chooser`

Leave `VITE_PB_URL` unset for the normal LAN setup so each browser uses the studio server's address. If you need to set it, use an address reachable by all stations.

---

## Photo Storage

The PocketBase server creates photo directories under `C:\StudioFlow_Photos` by default. To use another location, set `STUDIOFLOW_PHOTOS_ROOT` to its absolute path in the server process environment before launching PocketBase. Use a volume that supports hard links, such as NTFS, and give PocketBase read and write access.

```
C:\StudioFlow_Photos\
  └── [School Code]\
        └── [Course Code]\
              └── [JobOrder]_[FamilyName]_[GivenName]_[RegistrationID]\
                    ├── selected\
                    └── unselected\
```

Use **Copy Path** in the photographer queue to find the server folder for a job order. From a remote station, use your studio's file share for that folder; a local drive path refers to the server's disk. Put finished image exports in the job folder or its `unselected` subfolder. Opening the gallery moves supported exports from the job folder into `unselected`. After confirmation, the server keeps both folders and the saved selection in sync. JPEG, PNG, WebP, GIF, and AVIF exports are supported. RAW files and unrecognized files stay where the photographer placed them. Avoid editing the `selected` and `unselected` folders by hand once selection has started.

Legacy folders retain their original paths when they can be matched to a unique job order. If two legacy folders both contain photos for one job, a studio administrator should verify which folder belongs to the registration and reconcile the files before opening the gallery.

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

| Command | Description |
| :--- | :--- |
| `run.bat` | 1-Click launcher with auto-detected studio LAN IP |
| `run.bat --build` | Builds frontend and serves unified app on port 8090 |
| `npm run dev` | Starts local development server with hot-reload |
| `npm run build` | Bundles production-optimized static assets to `/dist` |
| `npm run lint` | Runs ESLint type and code quality checks |
| `npm run test:workflow` | Runs the isolated PocketBase integration suite with Node.js 22.13+ |

---
