# StudioFlow — System Requirements & Business Analysis

**Project Planning & Requirements · Jira Epic: Project Planning & Requirements**

Based on the StudioFlow README, the following covers the four selected planning tasks. This is a requirements baseline for review, not yet a formally approved specification.

---

## 1. Review and finalize system requirements

### Functional requirements

| ID | Module | Requirement | Priority |
| ------ | ---------------- | --------------------------------------------------------------------- | -------- |
| FR-001 | Administration | Create and manage client organizations | High |
| FR-002 | Administration | Manage organization-specific levels, categories, courses, and strands | High |
| FR-003 | Administration | Manage pictorial packages, add-ons, and pricing | High |
| FR-004 | Administration | Import organization master lists from Excel/CSV | High |
| FR-005 | Registration | Provide mobile registration over local Wi-Fi | High |
| FR-006 | Registration | Display cascading organization/category dropdowns | High |
| FR-007 | Registration | Match participants against imported master lists when available | High |
| FR-008 | Registration | Capture digital signatures | High |
| FR-009 | Registration | Generate unique Pictorial IDs and FCFS queue numbers | High |
| FR-010 | Cashier | Retrieve registration records and calculate payment totals | High |
| FR-011 | Cashier | Support full payments and downpayments | High |
| FR-012 | Cashier | Generate Owner Copy and Yellow Form | High |
| FR-013 | Queue | Push payment-confirmed participants to the photographer queue | High |
| FR-014 | Photographer | Display live queue and mark participants as Done Shooting | High |
| FR-015 | File Management | Generate signed PDF forms and pictorial directories | High |
| FR-016 | Photo Management | Track unselected and selected pictures | High |
| FR-017 | Payment | Restrict release of deliverables until fully paid | High |
| FR-018 | Reporting | Display sales, balances, and framing schedules | Medium |

### Non-functional requirements

| ID | Requirement | Acceptance target |
| ------- | -------------------- | ---------------------------------------------------------------------- |
| NFR-001 | Offline availability | Core operations function without internet while LAN/server are running |
| NFR-002 | Device compatibility | Support modern phone, tablet, and desktop browsers |
| NFR-003 | Performance | Handle 100+ daily registrations, subject to load testing |
| NFR-004 | Data integrity | Prevent lost writes and duplicate transactions |
| NFR-005 | Security | Restrict staff functions according to role |
| NFR-006 | Reliability | Implement workbook backups and tested recovery |
| NFR-007 | Maintainability | Use feature-based TypeScript modules |
| NFR-008 | File security | Prevent unauthorized access and directory traversal |

**Scope exclusion:** Individual and walk-in customer registration is not included.

---

## 2. Identify user roles and access permissions

The README identifies four operational user groups. The following permission matrix is a proposed access-control design.

| Capability | Admin | Cashier | Photographer | Participant |
| --------------------------- | ----- | ------------------ | ------------------- | ---------------- |
| Manage organizations | Full | — | — | — |
| Manage packages and pricing | Full | View | — | View |
| Import master lists | Full | — | — | — |
| Submit registration | Full | Assist | — | Yes |
| View registration records | Full | Yes | Assigned queue only | Own confirmation |
| Process payments | Full | Yes | — | — |
| Override queue numbers | Full | Yes | — | — |
| View photographer queue | Full | View | Yes | — |
| Mark shooting complete | Full | — | Yes | — |
| Manage photo folders | Full | — | Yes | — |
| View financial reports | Full | Authorized reports | — | — |
| Manage staff accounts | Full | — | — | — |

**Authentication decisions to finalize:** whether Cashier and Photographer use passwords or PINs, password/PIN recovery, session expiration, and which administrative financial actions require additional authorization.

---

## 3. Identify business rules and validation requirements

| ID | Business rule | Validation / Expected behavior |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------- |
| BR-001 | Registration requires an organization | Reject missing or inactive organization |
| BR-002 | Categories belong to their organization | Prevent mismatched category selections |
| BR-003 | Course/strand fields depend on configuration | Require them only when applicable and configured |
| BR-004 | Pictorial ID is unique | Reject duplicates and allocate IDs safely |
| BR-005 | FCFS queue is the default | Assign a queue number automatically; authorized staff may override |
| BR-006 | Packages and add-ons determine total | Calculate prices on the server |
| BR-007 | Downpayments affect balances | Remaining balance = Total − cumulative payments |
| BR-008 | Payments cannot exceed outstanding balance | Reject overpayments unless an explicit adjustment policy is approved |
| BR-009 | Only confirmed payments enter the shooting queue | Publish after payment has been saved successfully |
| BR-010 | Shooting completion changes status | Only authorized staff can mark Done Shooting |
| BR-011 | Selected pictures are tracked separately | Update selection status after successful file operations |
| BR-012 | Deliverables require full settlement | Block release while an outstanding balance remains |
| BR-013 | Excel operations must preserve record integrity | Serialize writes and use atomic replacement and backups |
| BR-014 | File paths are generated by the server | Reject unsafe filenames and path traversal |
| BR-015 | Repeated requests must not duplicate transactions | Make payment confirmation and registration submissions retry-safe |

### Business decisions still requiring approval

The README does not fully define:

- Whether a participant can register more than once for different packages or sessions.
- Whether imported master-list membership is mandatory or merely used for matching.
- Minimum downpayment amount and refund/void policies.
- Whether queue numbering resets daily or per organization.
- Whether photo selection is performed directly in StudioFlow or through an external file workflow.
- How payment corrections, receipt reprints, and cancellations are authorized.

These should remain open requirements rather than assumed rules.

---

## 4. Define end-to-end operational workflows

### 1. Admin Setup

Organizations → Categories → Packages → Master Lists

### 2. Participant Registration

QR Access → Proofing Form → Signature → Submit

### 3. Registration Processing

Generate Pictorial ID → Queue Number → Save Excel Record → Create Folder

### 4. Cashier Payment

Verify Record → Collect Payment → Print Receipts

### 5. Photographer Queue

Live Queue Update → Call Participant → Shoot → DONE

### 6. Photo Selection

Transfer Shots → Select Photos → Update Status

### 7. Final Settlement & Release

Verify Full Payment → Schedule Framing → Release Deliverables

### Key exception workflows

Normal operations should also account for unsuccessful registration submissions, duplicate requests, workbook write failures, rejected payments, network disconnects, lost photographer connectivity, and server power outages. An interrupted operation must not be reported as completed unless its persistent records are verified.
