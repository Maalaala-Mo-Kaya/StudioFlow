/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/studioflow/registrations/{id}/confirm-payment", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const ledger = require(__hooks + "/studio_ledger.js");
  const numbering = require(__hooks + "/studio_numbering.js");
  const storage = require(__hooks + "/studio_photo_storage.js");
  const body = e.requestInfo().body || {};
  const id = e.request.pathValue("id");
  const key = typeof body.clientKey === "string" ? body.clientKey : "";
  if (!/^[a-z0-9_-]{1,64}$/i.test(key) || typeof body.updated !== "string" || !body.updated ||
    !Number.isSafeInteger(body.balanceDue) || body.balanceDue < 0) {
    throw new BadRequestError("Reload the payment details before confirming.");
  }
  workflow.staff(e.app, e.auth, ["cashier", "admin"]);
  const discountInput = body.discount;
  const paymentInput = body.payment;
  // PocketBase decodes objects into Go maps, which don't have a stable field order.
  const fingerprint = $security.sha256(JSON.stringify([
    body.updated, body.balanceDue,
    discountInput == null ? null : [discountInput.percentage, discountInput.reason, discountInput.amount],
    paymentInput == null ? null : [
      paymentInput.amount, paymentInput.type, paymentInput.method, paymentInput.cash, paymentInput.cashierName, paymentInput.remarks,
    ],
  ]));

  const result = workflow.withRegistration(e.app, id, (tx, reg) => {
    const actor = workflow.staff(tx, e.auth, ["cashier", "admin"]);
    const [saved] = tx.findRecordsByFilter("cashier_confirmations", "client_key = {:key}", "", 1, 0, { key });
    if (saved) {
      if (saved.getString("registration") !== id || saved.getString("actor_id") !== actor.id ||
        saved.getString("request_hash") !== fingerprint) {
        throw new ApiError(409, "This confirmation key was already used for a different request.");
      }
      const paymentId = saved.getString("payment_id");
      return { reg, paymentId, changeAmount: paymentId ? tx.findRecordById("payments", paymentId).getFloat("change_amount") : 0 };
    }
    const status = reg.getString("status");
    if (status === "cancelled" || (status === "released" && body.discount != null)) {
      throw new ApiError(409, "This order is closed.");
    }
    if (reg.getString("updated") !== body.updated) {
      throw new ApiError(409, "This order changed. Reopen payment to review the latest balance and discount.");
    }

    const before = workflow.json(reg, "revenue_discount");
    const discountRequested = discountInput != null;
    const firstCollection = ledger.canEditDiscount(reg);
    if (discountRequested) {
      ledger.assertDiscountEditable(reg);
      const { percentage, reason, amount } = discountInput;
      // A fixed peso discount (whole pesos, off the Studio charges) instead of a percentage.
      const fixedAmount = amount !== undefined && amount !== null;
      if (fixedAmount && (!Number.isInteger(amount) || amount < 1)) {
        throw new BadRequestError("Enter a whole peso discount amount of at least ₱1.");
      }
      const reasonOnly = !fixedAmount && percentage === undefined && before;
      if (!fixedAmount && !reasonOnly && (!Number.isInteger(percentage) || percentage < 0 || percentage > 100)) {
        throw new BadRequestError("Enter a whole discount percentage from 0 to 100.");
      }
      const reasonText = !fixedAmount && percentage === 0 ? "" : ledger.readReason(typeof reason === "string" ? reason : "");
      const subtotal = ledger.cents(reg.getFloat("total_amount")) + (before?.studio || 0) + (before?.mua || 0);
      // Keep the original grant date and allocations. This correction has its own audit event.
      if (reasonOnly) {
        if (before.reason !== reasonText) {
          reg.set("revenue_discount", { ...before, reason: reasonText });
        }
      } else if (fixedAmount) {
        // Off the Studio charges; an MUA credit an admin gave earlier is kept.
        const total = require(__hooks + "/studio_revenue.js").changes(e, reg, subtotal, false, reg,
          { order_discount: { studio: amount, mua: (before?.mua || 0) / 100, reason: reasonText } });
        reg.set("total_amount", total / 100);
      } else {
        const total = require(__hooks + "/studio_revenue.js").changes(e, reg, subtotal, false, reg,
          { order_discount: { percentage, reason: reasonText } });
        if (percentage > 0 && !workflow.json(reg, "revenue_discount")?.studio) {
          throw new BadRequestError("This percentage does not produce a credit on eligible Studio charges.");
        }
        reg.set("total_amount", total / 100);
      }
    }

    const after = workflow.json(reg, "revenue_discount");
    const totals = ledger.ledger(tx, reg);
    if (discountRequested && totals.overpaid > 0) {
      throw new BadRequestError("The proposed discount would leave the order overpaid.");
    }
    if (totals.balance !== body.balanceDue) {
      throw new ApiError(409, "The amount due changed. Reopen payment to review the latest balance and discount.");
    }

    let payment;
    if (paymentInput != null) {
      const { amount, type, method, cash, cashierName, remarks } = paymentInput;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6 ||
        !["full", "initial", "additional"].includes(type) || !["cash", "gcash", "maya", "card"].includes(method) ||
        (method === "cash" && (typeof cash !== "number" || !Number.isFinite(cash) || cash < amount ||
          Math.abs(cash * 100 - Math.round(cash * 100)) > 1e-6))) {
        throw new BadRequestError("Enter a valid payment amount, collection mode, method and cash received.");
      }
      if (discountRequested) {
        // The standard payment hook and SQL guards read this pending price in the same transaction.
        ledger.applyTotals(reg, totals);
        tx.save(reg);
      }
      payment = new Record(tx.findCollectionByNameOrId("payments"), {
        registration: id, client_key: key, amount, payment_type: type, payment_method: method,
        cashier_id: actor.id, cashier_name: typeof cashierName === "string" && cashierName.trim() || ledger.actorName(actor),
        cash_tendered: method === "cash" ? cash : 0, remarks: typeof remarks === "string" ? remarks.trim() : "",
        discount_snapshot: firstCollection && after ? {
          studio: after.studio, mua: after.mua, reason: after.reason, ...(after.fixed ? { fixed: true } : {}),
          percentage: after.percentage ?? (after.studio + after.mua) * 100 / (totals.total + after.studio + after.mua),
        } : null,
      });
      try {
        tx.save(payment);
      } catch (error) {
        // The payments table's own checks (whole pesos, not over the balance …): say what they refused.
        const refused = String(error && error.message || error).match(/constraint failed: ([^(]+)/);
        if (refused) throw new BadRequestError(refused[1].trim().replace(/\.?$/, "."));
        throw error;
      }
      reg = tx.findRecordById("registrations", id);
    } else {
      if (totals.balance || !after || JSON.stringify(before) === JSON.stringify(after)) {
        throw new BadRequestError("Enter the payment due or confirm a discount change that leaves the order fully settled.");
      }
      ledger.applyTotals(reg, totals);
      if (status === "pending_payment" && workflow.paymentEligible(reg)) reg.set("status", "paid");
      const numbered = numbering.issueJobOrder(tx, reg);
      if (!reg.getString("prepared_by")) reg.set("prepared_by", ledger.actorName(actor));
      numbering.handoffToPhotography(tx, reg);
      if (numbered) storage.assignFolder(tx, reg, true);
      tx.save(reg);
    }

    tx.save(new Record(tx.findCollectionByNameOrId("cashier_confirmations"), {
      client_key: key, registration: id, actor_id: actor.id, actor_name: ledger.actorName(actor),
      payment_id: payment?.id || "", request_hash: fingerprint, discount_before: before, discount_after: after,
    }));
    return { reg, paymentId: payment?.id || "", changeAmount: payment?.getFloat("change_amount") || 0 };
  });

  try {
    if (result.reg.getString("photo_folder")) storage.provision(result.reg.getString("photo_folder"));
  } catch (error) { console.log("Pictorial directory creation notice:", error); }
  numbering.exposeNumbers(result.reg);
  return e.json(200, { registration: result.reg, paymentId: result.paymentId, changeAmount: result.changeAmount });
}, $apis.requireAuth("users"));
