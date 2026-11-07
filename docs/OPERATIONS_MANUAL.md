# StudioFlow V2 — Standard Operations Manual (T054 / AC027)

**High-Volume Offline LAN Graduation Pictorial Workflow Automation System**  
**Version:** 2.0.0 (Production Release)  
**Security Baseline:** Zero Cloud Dependency • Local SQLite Journaling • Role-Gated Station Routing

---

## 1. System Topology & Architecture

StudioFlow V2 operates exclusively over an isolated Local Area Network (LAN). No active internet connection is required during live event operations.

```
                  ┌───────────────────────────────────────────────┐
                  │       HI-LIGHT LAN WI-FI ROUTER (5GHz)        │
                  └───────┬───────────────┬───────────────┬───────┘
                          │               │               │
            ┌─────────────┴─────┐  ┌──────┴──────┐  ┌─────┴───────────────┐
            │ SERVER HOST PC    │  │ CASHIER PC  │  │ PHOTOGRAPHER IPAD   │
            │ IP: 192.168.1.100 │  │ Web Browser │  │ Safari / Chrome     │
            │ PocketBase :8090  │  │ Station 02  │  │ Station 01 Floor    │
            └───────┬───────────┘  └─────────────┘  └─────────────────────┘
                    │
            ┌───────┴───────────┐
            │ REGISTRATION KIOSK│
            │ Android / Tablet  │
            │ Station 04 Self   │
            └───────────────────┘
```

---

## 2. Server Startup & LAN IP Detection

1. Power on the Host PC running Windows.
2. Connect the Host PC to the studio gigabit router via Ethernet (recommended) or dedicated 5GHz Wi-Fi.
3. Launch the server by double-clicking:
   ```cmd
   .\run.bat
   ```
4. The launcher automatically detects your active physical LAN IPv4 address (ignoring VMware/WSL virtual adapters) and outputs:
   * **Local Server URL**: `http://localhost:8090`
   * **Client Devices URL**: `http://<SERVER_IP>:8090`
   * **PocketBase Admin Backend**: `http://<SERVER_IP>:8090/_/`

---

## 3. Station URL & Role Matrix

| Station | Route | Default Access | Primary Functions |
| :--- | :--- | :---: | :--- |
| **01 // Student Kiosk** | `/#/register` | Open LAN | Self-service registration, package selection, master-list name lookup, touch signature capture. |
| **02 // Cashier Station** | `/#/cashier` | Cashier Role | Participant lookup, initial downpayment & full settlement, yellow form printing, **Deliverable Release Gate**. |
| **03 // Photographer Floor** | `/#/photographer` | Floor Role | Real-time FCFS queue, audio chime call, 1-click safe folder path copy, photo status tracking. |
| **04 // Administration** | `/#/admin` | Admin Role | School & course CRUD, package & add-on pricing, student info editor, master roster upload, framing schedule, audit export. |

---

## 4. Standard Operational Procedures

### A. Administration & Configuration
* **Schools & Degree Courses**: Navigate to `#/admin` → **"Schools & Courses"**. Select a school card to see its programs by academic level. Enter an existing course code to assign the shared program, or enter a name to create a new one. Editing the course changes it for every school that offers it. Removing it only removes it from the selected school.
* **Packages & Add-ons**: Navigate to `#/admin` → **"Packages"**. Define package codes, amounts, and multi-line inclusions. Create ala-carte add-ons (extra 8R frame, hair and makeup, additional wallets).
* **Master Roster Ingestion**: Navigate to `#/admin` → **"Master Roster"**. Select target organization and paste batch CSV lines. The real-time validator previews valid rows and flags format errors before commit.
* **Student Info Management**: Navigate to `#/admin` → **"Students"**. Search and correct any typos in student names, student IDs, section, or package assignments.

### B. Cashier Operations & Release Gate (AC022)
1. Search client by Job Order № or student name.
2. Record initial downpayment (minimum 50%) or full payment.
3. Print physical **Customer Copy** and **Yellow Form**.
4. **Deliverable Release Gate**:
   * Packaged portraits, soft copies, and frames **CANNOT BE RELEASED** if balance is greater than ₱0.00.
   * If balance remains, click **"Collect Balance"**. Once settled, the **"Release"** modal unlocks, capturing representative name and quality inspection confirmation.

### C. Photographer Floor Operations
1. Client enters the queue automatically as soon as payment is confirmed.
2. Click **"Call Client"** to broadcast studio chime and display "ON SET".
3. Click **"Copy Path"** to paste the deterministic folder path directly into your camera tethering utility (e.g. Capture One / Lightroom):
   `D:\Pictorial_Master_Repository\<ORG>\<COURSE>\<JO_NO>_<NAME>`
4. Advance the photo status selector: `Raw Stored` → `Client Selected` → `Ready to Print`.
5. Click **"Mark Done"** once all poses are captured.

---

## 5. Automated Backup & Disaster Recovery (T053 / AC026)

### Running Daily Snapshot Backup
Run at the end of each shooting batch or at lunch break:
```cmd
.\scripts\backup.bat
```
* Creates a timestamped directory under `backups\backup_YYYYMMDD_HHMMSS\`.
* Copies the entire `pb_data` directory including SQLite database (`data.db`) and digital signatures.

### Performing Emergency System Restore
In the event of hardware crash, power outage, or corrupted transaction:
1. Ensure `pocketbase.exe` is closed.
2. Execute the restore utility:
   ```cmd
   .\scripts\restore.bat
   ```
3. Enter the number corresponding to your desired backup snapshot.
4. Type `RESTORE` to confirm. The script safely archives existing state and restores the clean snapshot.
5. Restart the server using `run.bat`.

---

## 6. Financial Reconciliation & Audit Rules (T049 / AC023)

* **Mathematical Balance Law**:
  $$\text{Total Gross Billed} = \text{Verified Collections} + \text{Outstanding Receivables}$$
* **Audit Ledger Verification**:
  * Open `#/admin` → **"Analytics & Overview"**.
  * The green verification banner confirms system equilibrium across all registered participants.
  * Click **"Download Audit CSV"** for physical ledger reconciliation and end-of-day bank deposits.
* **Cancellation & Void Policy**:
  * Downpayments are strictly non-refundable once pictorial shooting commences.
  * Payment voids must be authorized by an Admin account and require surrender of the physical Yellow Copy.

---

## 7. Signed PDF Export & Digital Yellow Form (T041 / AC020)

StudioFlow V2 features client-side vector PDF generation that compiles official signed Yellow Forms with embedded digital signatures:
* **Cashier Station**: When viewing the receipt dialog (`PrintReceiptModal`), click **"Download PDF"** to save `YellowForm_<JOB_ORDER>_customer.pdf` directly to disk.
* **Admin Station**: In `#/admin` → **"Students"**, click the **"PDF"** button on any student row to immediately produce an official traceable Yellow Form.
* **Document Integrity**:
  * Embedded digital signature image captured from student kiosk.
  * Unique Job Order №, queue number, and student metadata.
  * Package inclusions, add-on itemization, and balance due.
  * Cashier validation stamp and transaction verification token.

---

## 8. Storage Maintenance & Orphan Folder Cleanup (T044 / R04)

Photographer directories follow deterministic paths:
`photos/[School]/[Year]/[Degree]/[Section]/[StudentID_LastName]`

If a registration is cancelled or aborted prior to photo capture, empty directories may remain. Use the automated cleaner:
```cmd
.\scripts\clean_orphans.bat
```
* **Mode 1 (Dry Run)**: Inspects the photo directory tree and lists all empty or orphaned folders without modifying disk contents.
* **Mode 2 (Prune)**: Safely removes verified empty folders and preserves all folders containing photo assets.

---

## 9. Simulation & Security Verification Drills (T050, T052 / AC024, AC026)

Prior to live school events, run automated verification drills:

### A. 50-Student Operational Simulation (T050 / AC024)
Simulates a live pictorial day end-to-end with 50 students across registration, cashier downpayments, queueing, shooting, and release gate policies:
```cmd
node scripts/simulate_50_students.mjs
```
To run and automatically clean up test data:
```cmd
node scripts/simulate_50_students.mjs --cleanup
```

### B. Security & Role Privilege Audit (T052 / AC026)
Verifies PocketBase API rules prevent unauthorized elevation or deletion:
```cmd
node scripts/verify_security_rules.mjs
```

---

## 10. Windows File Share Permissions Baseline (T045)

When hosting the photo repository over Windows network sharing (`\\SERVER\StudioFlow\Photos`):
* **Photographer Station**: Needs `Read & Execute`, `Write`, and `Modify` permissions to create folders and import tethered RAWs.
* **Cashier Station**: Restricted to `Read & Execute` only (cannot delete or alter photograph files).
* **Setup Utility**: Execute `powershell -File scripts\setup_share_permissions.ps1` to inspect and configure NTFS ACLs.

