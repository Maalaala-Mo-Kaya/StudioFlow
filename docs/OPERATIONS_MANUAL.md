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
| **02 // Cashier Station** | `/#/cashier` | Cashier Role | Participant lookup, initial downpayment & full settlement, job order and receipt printing, **Deliverable Release Gate**. |
| **03 // Photographer Floor** | `/#/photographer` | Floor Role | Real-time FCFS queue, audio chime call, 1-click safe folder path copy, photo status tracking. |
| **04 // Administration** | `/#/admin` | Admin Role | School & course CRUD, package & add-on pricing, student info editor, master roster upload, framing schedule, audit export. |

---

## 4. Standard Operational Procedures

### A. Administration & Configuration
* **Client Types & Sessions**: Navigate to `#/admin` → **"Client Types & Sessions"**.
  * Switch **School / Graduation** and **Walk-in Clients** on or off. For a graduation event, keep walk-ins OFF. Switch them ON when a walk-in client (family portrait, wedding, birthday, company event) arrives. With both on, the kiosk asks the client which type they are.
  * Manage the walk-in **session types**. Mark "Outside the studio" for sessions that need an event date and venue.
  * Edit the **walk-in terms**, one clause per line.
* **Package audience**: In **"Packages"**, set each package's *Offered To* (School, Walk-in, or Both). Walk-in clients see only walk-in packages.
* **Schools & Degree Courses**: Navigate to `#/admin` → **"Schools & Courses"**. Select a school card and academic level, then search by course name or code. Pick a suggestion to assign the shared program, or enter both a name and code to create a new one. Editing the course changes it for every school that offers it. Removing it only removes it from the selected school.
* **Packages & Add-ons**: Navigate to `#/admin` → **"Packages"**. Define package codes, amounts, and multi-line inclusions. Create ala-carte add-ons (extra 8R frame, hair and makeup, additional wallets). Like packages, each add-on has **Offered To** (School / Walk-in / Both): the kiosk only shows a client the add-ons for their type. Add-ons can also be added or removed later in **Edit Client** (new ones are charged at today's price).
* **Master Roster Ingestion**: Navigate to `#/admin` → **"Master Roster"**. Select target organization and paste batch CSV lines. The real-time validator previews valid rows and flags format errors before commit.
* **Student Info Management**: Navigate to `#/admin` → **"Students"**. Search and correct any typos in student names, student IDs, section, or package assignments.

### B. Cashier Operations & Release Gate (AC022)
1. Search client by Job Order № or student name.
2. Record initial downpayment (minimum 50%) or full payment.
3. For cash, enter **Cash Received** (or press **Exact**); the change is shown and saved. Then print:
   * **First payment:** the **job order sheet** on letter paper. Cut it crosswise: the top half is the customer claim stub, the bottom half is the studio copy.
   * **Later payments:** the **payment receipt**, printed on the **top third** of a letter sheet (3 receipts fit on one sheet). Cut along the dashed line and keep the rest of the sheet. Then cut the receipt lengthwise: the left is the customer copy, the right is the studio copy.
   * **Reusing the rest of a sheet:** in the print window choose **Paper: Leftover piece**, load the piece, and pick Paper size "Statement" (5.5 × 8.5 in), landscape.
4. **Ready for Pickup & notifying the client**:
   * The **Ready for Pickup** tab lists every order that was photographed and marked ready by the admin, longest-waiting first, showing whether the client was already told.
   * Click **Notify** to see the text message (name, job order number, balance due, studio hours). The easiest way to send it: **scan the QR code with the studio phone's camera** and tap the link. Messages opens with the client's number and the text filled in; press Send. (Works offline; it uses the phone's own load.) You can also copy the text, or press **Open in Messages** on a phone or a PC linked to one. Then press **Mark as Notified** so everyone sees the client was told.
   * The message wording is set by the admin under Production & Pickup → *Pickup Text Message*.
5. **Deliverable Release Gate**:
   * An order can be released only after photography is finished and the admin marked its production **Framed** or **Ready for Pickup**. The **Release** button turns green when it is ready.
   * Packaged portraits, soft copies, and frames **CANNOT BE RELEASED** if balance is greater than ₱0.00. If a balance remains, click **"Collect Balance"** first.
   * The **Release** window records who claimed the order and confirms the items were inspected. This is the only way to release an order.

### B2. Production & Pickup (Admin)
Navigate to `#/admin` → **"Production & Pickup"**. Every paid order is listed, with or without frames.
* **One order:** change its **Production Status** in the list (Not Started → Pending → In Production → Framed / Ready for Pickup).
* **Many orders at once:** pick the school in the type-to-search box (for example *ACLC College of Mandaue*), and narrow it further with the funnel button (**Advanced Filters**: level, course, stage, frames, photoshoot, payment), choose a status in **Set Production Status**, and press **Apply**. With nothing ticked, every order in the list is changed; tick orders to change only those.
* Framed and Ready for Pickup only apply to orders that were already photographed; others are skipped and the count is shown.
* Ready orders appear in the cashier's **Ready for Pickup** tab. The **Ready, Not Notified** card shows clients who still need a text.
* Released orders can no longer be changed here; they show who claimed them and when.

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

### Handing Over a Clean System (Reset for Handover)
Use this once testing is finished and before the studio starts real work. It removes all test data so numbering starts at **Job Order 00001**, receipt **OR-000001**, and queue **#001**.
1. Close the server window (`run.bat`). The script refuses to run while the server is using the database.
2. Run:
   ```cmd
   .\scripts\reset-for-handover.bat
   ```
3. Choose a mode:
   * **[1] Keep setup (recommended):** removes job orders, payments, makeup logs, signatures, camera sessions and server logs. It can also remove the school rosters. It keeps schools, courses, packages, add-ons, makeup services, staff accounts and camera settings.
   * **[2] Factory fresh:** a brand-new database. It contains only the built-in sample school and packages and the default logins (`admin`, `cashier`, `photographer`, password `password123`). Afterwards, create the dashboard login with `pocketbase.exe superuser upsert <email> <password>`.
4. Answer whether to move the photo folders aside. They are renamed to `<photo folder>_before_reset_<date>`, never deleted, and an empty photo folder is created.
5. Type `RESET` to confirm. The full database is backed up to `backups\before_reset_<date>\` first.
6. Before handing over:
   * Remove any test schools or packages you added in Admin.
   * **Change every staff password.**
   * Start `run.bat` and check that the Cashier screen is empty.
   * When the studio is happy, delete the backup and the old photo folder, because they still hold the test data.

---

## 6. Financial Reconciliation & Audit Rules (T049 / AC023)

### Studio and MUA revenue

In **Admin → Packages & Add-ons**, choose **Studio revenue** or **Other Payment — MUA** for each catalog item. StudioFlow saves that choice with the sold price. Existing catalog entries display **Revenue review needed** until an admin classifies them. Use separate catalog items for charges owned by different parties.

**Analytics & Overview** shows net Studio revenue, Other Payment — MUA, unallocated cash, total collections, and outstanding balances. The Studio revenue groups by school and package exclude MUA and unallocated amounts. The three revenue buckets add up to payments less refunds. The audit workbook shows those amounts by receipt and refund. The Overall workbook and CSV show the allocation by Job Order.

The current brief does not specify who receives a mixed-order downpayment first. A payment for a single verified category goes to that category as collected. For an order with multiple categories or unreviewed charges, partial cash stays unallocated until the total is covered. Settlement allocates the saved category amounts and can move earlier cash out of unallocated. If a refund or void leaves a mixed order partially paid, the unsupported amount returns to unallocated. Cash above the current amount due also stays unallocated. A period report can therefore show a negative unallocated movement when a later settlement allocates cash from earlier dates.

Use **Clients Directory → Edit Client → Revenue review and discounts** to reconcile a historical order from original paperwork. Enter the verified MUA subtotal before discounts and record the evidence or reason. The rest of the verified subtotal is Studio. The review records who saved it and when. If the package, add-ons, or fees change, verify the revised order again. The revised order terms drive the revenue report, while actual receipt and refund amounts and their dates stay in the ledger.

To apply a discount, enter the whole-peso reduction against the Studio or MUA portion and record a reason. An order can include a free service at a zero catalog price. An entirely zero-value order cannot enter the paid queue under the current payment requirement. For an incorrect receipt, void it with a reason and record the replacement. The ledger shows the recalculated balance and the printed receipt retains its balance at issue.

### Parent and Child MUAs

In **Admin → Staff Accounts → Makeup Artist Team**, choose one enabled MUA as **Parent MUA**, set **Allow Parent MUA to Accept Clients**, and save. The other MUA accounts are Children while a Parent is configured. With no Parent, the station uses the shared self-claim queue.

Paid orders that require MUA work appear under **Unassigned Clients**. The Parent assigns them to an enabled Child, or to the Parent account when the toggle is on. Admin can also manage assignments under **Makeup & Photo Selection**. A Child can start and complete their own work. Reassigning active work returns it to pending for the new artist and logs the handoff. Changing the Parent or turning self-assignment off preserves existing work.

The current queue assigns the purchased MUA services on a Job Order together. Completion records each distinct service category for the performing artist and counts the client once in the artist's daily total. The report uses Asia/Manila dates. Financial allocation follows the sale and ledger. The Job Order links to assignment history and completion records for attribution, even if payment arrived first.


* **How the figures are counted** (cards, school / package lists and the Audit Export all use the same rules):
  * **Collections** = payments received in the period, not counting voided or refunded ones.
  * **Gross invoiced** = totals of the job orders made in the period. A cancelled order counts only for the money already received from it (e.g. a kept downpayment); the rest is no longer owed.
  * **Outstanding** = what is still unpaid on the active job orders made in the period.
* **Balance checks**:
  * Gross = Paid on these job orders + Outstanding.
  * Collections = Paid on these job orders + Payments received for job orders made before the period (balances paid now on older orders). For **All Time** that second part is ₱0, so Gross = Collections + Outstanding.
* **Audit Ledger Verification**:
  * Open `#/admin` → **"Analytics & Overview"** and pick **Today**, **This Month** or **All Time** (Philippine time).
  * The green banner confirms the checks above for that period; it turns red if anything does not add up.
  * Click **"Audit Export"** for a printable Excel report of that period:
    * **Summary** – the figures, the two checks (each must show ₱0.00 and "OK - balanced"), totals by school / walk-in and by package, and lines for *Prepared by* / *Checked by*.
    * **Job Orders** – every job order made in the period with its total, what counts in gross, paid and balance, and a total row.
    * **Payments** – every receipt in the period (OR №, date and time, cashier), voided ones listed but not counted, and the counted total.
    * Totals are Excel formulas over the rows, so the printed copy can be added up by hand. Prints on Letter, fitted to the page width, without solid fills.
  * For an end-of-day deposit, export **Today**: the Summary's Collections line is the cash and e-payments received today.
* **Overall workbooks (Export button, top right of the Admin page)**:
  * **Master Overall: all schools** – a Summary sheet (one line per school, Walk-ins, cancelled orders' kept money, grand total and a ₱0.00 check) plus one sheet per school in the studio's Overall layout, grouped by level (College, SHS, …) with subtotals and a school total.
  * **One school** – type the school name or code; the file has only that school's clients (safe to give to the school).
  * **Walk-in clients**, **All schools by level** (the earlier COLLEGE OVERALL / SHS OVERALL sheets), or a **CSV** list of every job order.
  * **Dates (optional)** – From / To, or *This month* / *Today*. Job orders are picked by pictorial date (or registration date when there is none); their payments are everything received for them. Leave empty for everything.
  * Cancelled job orders are not on the school sheets (they owe nothing); any money kept from them is a separate line on the Summary so the grand total still matches the Analytics page.
* **Voids, refunds and cancellations** (admin only; each one records who, when and why):
  * **Void** (Analytics → ledger → open a job order → **Void** on the payment): only for a payment recorded by mistake, where the money was never really received (wrong amount, wrong client, test). The receipt stays on record marked VOIDED and the balance goes back up. A void is permanent. A payment of a released order can't be voided.
  * **Refund** (same place → **Refund** button): money given back. It gets its own number (RF-000001…) and is dated the day the money is given back, so earlier days' reports never change; that day's collections go down by the refund. Allowed for a **cancelled** job order (up to what it still holds) or when a client **paid more than the total** (e.g. after changing to a cheaper package; the ledger filter **Refund Due** lists them). The original receipt is not changed.
    * After saving, the **refund slip** opens. Hand over the money and have the client **sign on screen** ("I received ₱… as a refund"), then press **Save client signature**. The signature is saved once and can't be changed. Print the slip: the signature shows on the studio copy (right half). Give the client the left half and file the right half with the job order.
    * With no signature pad or touch screen, just print and have the client sign the studio copy on paper.
    * To sign later or reprint, use **Sign / Print** (or **Print Slip** once signed) next to the refund in the ledger.
    * In the Clients Directory, the **PDF** button of a refunded job order downloads the job order (stamped CANCELLED · REFUNDED, CANCELLED or REFUNDED) followed by all its refund slips, in one file for filing.
  * **Cancel** (Clients Directory → cancel button): needs a reason. The job order leaves every queue, owes nothing, and keeps its receipts; money received stays on record until refunded. A released order can't be cancelled.
  * **Restore** (Clients Directory → **Restore**): returns the job order to the status it had before it was cancelled (e.g. Done Shooting), with its balance recalculated. An order that was fully refunded before its shoot comes back as **Pending Payment**.
  * Payments and refunds can't be edited or deleted, and paid / balance / payment status can't be typed in by hand; they always come from the receipts and refunds.
  * Downpayments are non-refundable once the pictorial starts, unless the owner decides otherwise; any refund is recorded with Refund.

---

## 7. Job Order Sheet, Payment Receipts & PDF (T041 / AC020)

* **Job order sheet** (one letter page, cut crosswise):
  * The top half is the customer claim stub, with the full terms.
  * The bottom half is the studio accounting copy, with a one-line terms note and a Claimed by / Date line.
  * Both halves show the client, package, a payment table (date, receipt no., type, method, amount, balance) and the totals.
* **Payment receipt** (top third of a letter sheet, or a leftover piece; cut lengthwise into a customer copy and a studio copy). The forms print with outlines only, no solid fills, to save ink.
  * Shows the receipt no., date and time, previous balance, amount paid, cash received, change, and the remaining balance.
* **Receipt numbers:** the server assigns official receipt numbers (`OR-000001`, …) in order. Saved payments can't be edited, only voided or refunded by an Admin. A voided payment prints with a VOIDED stamp.
* **Cashier Station:** **Print** opens the job order. Switch to **Payment Receipt** to reprint any payment. **PDF** downloads the same layout.
* **Admin Station:** in `#/admin` → **"Students"**, **PDF** downloads the job order sheet. In Analytics, **Reprint** on a payment row opens that payment's form.

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

