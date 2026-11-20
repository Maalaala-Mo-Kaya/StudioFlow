# Changelog

## 2026-11-20

- Photo Chooser: the list now opens on **Not yet selected** (photographed clients who haven't chosen), with **Already selected** and **All clients** buttons showing how many are in each. New **School / client type** filter (every active school, and Walk-in clients) and **Course / Session** filter (all of that school's courses, or the walk-in session types), each with its number of photographed clients; a **Job order created** filter (All dates / Today / Yesterday / Pick a date, studio time); and **Clear filters**. The search (name, student ID, job order, school, course, walk-in company or session) combines with the filters. The chooser lists only photographed clients, with or without a search: a client appears once the photographer marks the shoot done. Each card is tagged **Selected** or **Not yet**. Admins keep the exact-status filter.
- New **Preferred Look** at the kiosk: when the package or an add-on includes makeup / grooming, the client chooses **Full makeup**, **Light / natural makeup** or **Grooming only**, with an optional note for the makeup artist (e.g. "no lipstick"). The MUA station shows it in gold on each client's card, so the artist knows what the client wants without guessing. No gender question is asked.
  - Switch it on or off in Admin → Client Types (separately for school and walk-in clients; both on after the update), per school (Schools & Courses → Edit School → "Ask preferred makeup look") and per walk-in session type (its **Look / No look** button).
  - Admins can set, change or clear it in Edit Client. Older job orders have no look.
- Client photo folders are now named **`<job order no>_<Last>_<First>`** (e.g. `00015_Dela Cruz_Juan Carlos`), without the record ID, and are created at the **first payment** instead of at registration: unpaid kiosk registrations leave no empty folders, and a name corrected before payment is used. Existing folders keep their names.
- Job order numbers are now guaranteed unique: they are assigned one at a time even when several kiosks register at once, and the database refuses a duplicate. (Before, two kiosks registering at the same moment could get the same number.)
- The client's folder gets a **RECEIPTS** subfolder with PDF copies of the paperwork: `JO-<no>.pdf` (the job order), one `OR-….pdf` per payment and one `RF-….pdf` per refund. They are written after each payment and refreshed after a void, refund, refund signature, cancel, restore or client edit, so stamps (VOIDED, CANCELLED, REFUNDED) show on the copies. The database stays the official record; the photo gallery ignores this folder.
- Admin → Staff: **show/hide password** on New Staff Account, and a **Reset Password** button for each staff member (except your own account). A reset signs that person out everywhere.
- New gold camera browser-tab icon.
- Restoring a cancelled job order that was fully refunded before its shoot now puts it back to **Pending Payment** (it showed "Paid" with nothing paid).
- The Overall export has a new **CANCELLED** sheet: one line per cancelled job order with who cancelled it, when, why, the status before cancelling, and paid / refunded / money kept. The Summary's CANCELLED line links to its total. The by-level export now includes it too.
- New **refund slip** (same small strip as the payment receipt): customer copy signed by whoever gave the money back, studio copy with the client's "I received ₱… as a refund" statement and signature line. It opens right after a refund is recorded, and each refund in the Analytics ledger has a **Print Slip** button for reprints. It shows the receipts paid, money held before, the refund, and what the studio still holds. Print or PDF; letter sheet or leftover piece.
- The client can **sign the refund slip on screen** when they receive the money. The signature is saved once with the refund (it can't be replaced), along with the time and the staff member who witnessed it, and prints on the studio copy and the PDF. The ledger marks signed refunds ✓ Signed. Paper signing still works when there's no signature pad.
- Clients Directory: new **Refunded (money given back)** option under Financial Statuses, and the Balance column shows "Refunded ₱…" on job orders with a refund.
- Job orders now carry a stamp across the sheet (printed and PDF): **CANCELLED**, **CANCELLED · REFUNDED** (everything paid was given back) or **REFUNDED**. A partial refund (an overpayment given back) has no stamp; the totals box lists the RF numbers under "Less refunds". The Clients Directory **PDF** button now downloads the job order followed by its refund slips (3 per page, with on-screen signatures) in one file.
- Cancelled job orders: the totals box now reads "Balance (cancelled, not owed) ₱0.00" and adds **Held by studio** (money received less refunds, i.e. what can still be refunded), so a ₱0 balance next to a payment table ending at ₱500 is no longer confusing.
- Excel reconciliation: the Overall export's Summary has a **Refund due** line (clients who paid more than their total and are owed money back), and its check row now includes it, so it reads ₱0.00 whenever the books balance. It used to show −₱… whenever someone was owed a refund, while the saved value always said ₱0.00. The Audit Export's Job Orders sheet has a **Refund due (overpaid)** column, and the Summary's Refund due figure is now a formula on its total instead of a typed-in number.
- Add-ons and package prices:
  - Fixed: an admin edit could save made-up add-ons or any add-on price without changing the total. Add-ons changed after registration must now be active catalog items, are priced from the catalog (ones already on the order keep the price they were sold at), and the total and balance are recalculated. Only admins can change them.
  - Fixed: the printed job order (and PDF) showed the package at today's catalog price, so after a price change it no longer added up to the total. It now shows the price the package was sold at. The Clients Directory payment report does the same, and its Additional Poses column shows what was actually charged instead of a fixed ₱350 per pose.
  - Packages and add-ons can no longer be saved with a negative price.
  - The job order (claim stub and studio copy, printed and PDF) lists every add-on on its own numbered line with its price, under the package, instead of one cut-off line, so the client can show the stations what they bought.
  - Add-ons have an **Offered To** setting (School / Walk-in / Both) like packages, in Admin → Packages. The kiosk shows only the add-ons for the client's type, Edit Client offers only those, and the server refuses the others. Existing add-ons were set to Both, so nothing changes until you edit them.
  - Edit Client: add-ons can be added and removed after registration (for example an extra frame bought on the day). Add-ons already on the order keep the price they were sold at; new ones use today's catalog price and are marked NEW, and add-ons that bring makeup / grooming say so. Total Billed, Remaining Balance and any amount owed back update before saving. Not available on cancelled or released orders.
- Cashier: the Paid / Balance column (and the mobile card) shows "Refunded ₱…" on job orders with a refund, so ₱0 paid after a full refund isn't mistaken for a client who never paid.
- Overall export: new **OTHER FEES** column (shown only when an order in the export has other fees), so package + add-ons + other fees add up to TOTAL DUE on every row.
- Fixed (money): the public kiosk could send its own "other fees" (even a negative amount) and change the job order price. The kiosk can no longer set them; only an admin can change other fees, they can't be negative, and the total and balance are recalculated when they change (before, changing them didn't update the total).
- New `npm run check:excel`: builds every Excel export from a throwaway server (port 8099) with all the money cases and checks that every formula, row and total adds up and reconciles.
- Fixed: the PDF job order printed the refund as a garbled "NET PAID ("PHP … refund)" label; it now shows Less Refunds and Net Paid on separate lines.
- Repair: job orders restored before the Restore fix that showed "In Photo Queue" with nothing paid (fully refunded) are moved back to Pending Payment when the server starts.

## 2026-11-19

- New luxury black-and-gold Night theme and ivory-and-gold Day theme, with a Night/Day switch and the new gold logo.
- Cancelling a registration keeps its payments; job orders with payments can no longer be deleted.
- Orders can be released only after photography is finished and production is marked ready.
- Admin overview cards: the Total Collections icon is now ₱; "Shoots Completed" counts every photographed order (it dropped to 0 once orders moved on to Ready for Pickup or Released); "waiting or on set" counts only clients waiting for or in their photo session; cancelled orders no longer add to Gross Invoiced or Outstanding Balances (money already received from them still counts). A Today / This Month / All Time switch above the cards shows payments received and job orders made in that period (Philippine time); the Collections by School (now with a Walk-in clients row) and Revenue by Package lists, the balance check and the Audit Export follow the same switch, and each list has a total that equals the cards.
- Voids, refunds and cancellations, with who / when / why recorded:
  - **Void** a payment recorded by mistake from the Analytics ledger (reason required, permanent, receipt stays marked VOIDED).
  - **Refund** money given back as its own record (RF-000001…) dated the day it is given back; partial refunds allowed. Collected Today, the cards, the Audit Export (new Refunds sheet), the Overall export (new REFUNDED column), the CSV and the payment reports all show payments − refunds. Past days no longer change when money is given back.
  - **Cancel** needs a reason; **Restore** returns the job order to its status before cancelling. Released orders can't be cancelled. Cancelled orders owe nothing and are left out of the cashier's Balances tab.
  - Payments can no longer be deleted, un-voided, edited (including remarks), or created already voided; paid / balance / payment status can't be edited by hand.
  - Changing to a cheaper package after payment warns that money is owed back; the ledger shows "Refund due" and has a Refund Due filter.
  - Fixed: the Clients Directory payment reports counted voided payments as paid.
- The admin Export button opens an export panel: **Master Overall** (Summary + one sheet per school in the Overall layout, grouped by level with subtotals, + Walk-ins), **One school** (type to find it), **Walk-in clients**, **All schools by level** (as before) or the CSV list, with an optional From / To date range (pictorial date, or registration date when none). The Overall sheets now have a TOTAL DUE column, balances are formulas on it, students with no level are no longer left out, and cancelled orders are listed on the Summary as money kept instead of as balances owed.
- The Audit Export is now a printable Excel report (Summary with balance checks and totals by school and package, every job order, every receipt including voided ones) for the chosen period. Paid and balance are worked out from the receipts, cancelled orders no longer show money owed, and totals are Excel formulas that can be checked by hand. The CSV export in the Export menu uses the same figures and has a totals row.
- Cashier "Collected Today" now counts only today's payments. Under the amount it shows how many payments were made today and when the last one was (e.g. "No payments yet today · last payment Nov 19, 10:55 PM"), and it starts again at ₱0 at midnight even if the screen was left open.
- Daily queue numbers restart at midnight Philippine time instead of 8:00 AM.
- Fixed "Pay Now" failing on network stations (crypto.randomUUID needs HTTPS); Copy Path now works there too.
- New camera auto-import: photos from the camera's output folder go straight into the client's folder (Admin → Camera Import).
- New printed forms:
  - The job order prints on one letter sheet: customer claim stub on top, studio copy below.
  - Later payments print a small receipt on a third of a letter sheet (customer copy and studio copy), so one sheet holds 3 receipts.
  - Official receipt numbers (OR-000001…), a payment history table, and cash received with change.
  - The kiosk no longer prints an unpaid stub.
- Walk-in clients next to school registrations:
  - Family portraits and events outside the studio, with event date and venue.
  - Admin switches for school and walk-in registrations; walk-ins start switched off.
  - Admin-editable session types and walk-in terms.
  - Packages can be offered to school clients, walk-ins, or both.
  - Printed job orders show the course acronym (e.g. BSCS).
- The kiosk school and course fields are now searchable: type part of the name or its code (e.g. "san carlos", "BSA") to filter the list.
- Admin → Schools & Courses has a built-in list of about 100 common college programs and the 10 SHS strands. Search it and add a course to a school with one click.
- Schools are not limited to College and SHS. The level picker also offers Kindergarten, Elementary, Junior High School, Graduate School, Law School, Medical School and Vocational / TESDA, or any level name typed in. A new level is added to the school with its first course. Each level has its own suggestions (grades, master's and doctorate degrees, TESDA courses).
- "Add a Course Manually" (full course name + acronym) is always shown below the list, for courses the list does not have.
- Students at other levels get their own sheet in the Student Excel export and their own payment report in Clients Directory (shown once clients are registered at that level).
- Clients Directory: the "Students Directory" label is now "Clients Directory", the "Overall" views are named "Payment Report" (College, SHS, …), and a quick filter next to the search box shows all clients, school clients, walk-ins, or one school. You type into it to find a school, so long school lists stay manageable.
- The cashier screen has the same filter row as Clients Directory: an Advanced Filters button (school / walk-in, academic level, package, order status, payment status, and which columns to show), the type-to-search school picker, and the search box. The tab counts follow the filters. The school list no longer hides behind the table.
- Production & Pickup uses the same filter row too: Advanced Filters (academic level, course / session, production stage, frames, photoshoot, payment, and columns to show), the type-to-search school picker, and the search box. Bulk status changes apply to whatever the filters show.
- The same type-to-search school / walk-in filter is on the cashier screen and in Production & Pickup, where the level and course filters are typable too.
- Admin "Framing Schedule" is now **Production & Pickup** and lists every paid order, not only framed ones. Set the production status of one order, or of a whole school / level / course at once.
- New cashier tab **Ready for Pickup**: orders waiting to be claimed, with a ready-made text message for the client (scan its QR code with the studio phone to open Messages with the number and text filled in, or copy it) and a "Notified" mark showing when and by whom the client was told. Admins can edit the message.
- Orders can only be released from the cashier's Release button, which records who claimed them. The admin "Released" shortcut was removed.
- Fixed: the cashier's Release button never turned green, because the screens could not see that photography was finished.
- New `scripts\reset-for-handover.bat`: removes test data before handing the system to the studio, so numbering starts at Job Order 00001 and OR-000001. It keeps the setup or creates a factory-fresh database, and always backs up first.

Full details: [2026-11-19-update.md](2026-11-19-update.md)
