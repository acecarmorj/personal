(function bootstrapProFitnessFinance(global) {
  "use strict";

  function number(value) {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function netAmount(payment) {
    const calculated = Math.max(0, number(payment?.amount) - number(payment?.discount) + number(payment?.fine));
    return payment?.netAmount === undefined || payment?.netAmount === null || payment?.netAmount === ""
      ? calculated
      : Math.max(0, number(payment.netAmount));
  }

  function paidAmount(payment) {
    if (!payment) return 0;
    if (payment.paidAmount !== undefined && payment.paidAmount !== null && payment.paidAmount !== "") {
      return Math.max(0, number(payment.paidAmount));
    }
    return payment.status === "pago" ? netAmount(payment) : 0;
  }

  function outstandingAmount(payment) {
    if (!payment || payment.status === "cancelado") return 0;
    return Math.max(0, netAmount(payment) - paidAmount(payment));
  }

  function effectivePaymentStatus(payment, today) {
    if (!payment) return "sem-cobranca";
    if (payment.status === "cancelado") return "cancelado";
    const net = netAmount(payment);
    const paid = paidAmount(payment);
    if (net === 0 || paid >= net || payment.status === "pago") return "pago";
    if (paid > 0 || payment.status === "parcial") return "parcial";
    if (payment.status === "vencido" || (payment.dueDate && payment.dueDate < today)) return "vencido";
    return "pendente";
  }

  function isDelinquent(payment, today) {
    const status = effectivePaymentStatus(payment, today);
    return outstandingAmount(payment) > 0
      && (status === "vencido" || (status === "parcial" && payment?.dueDate && payment.dueDate < today));
  }

  function sum(records, getter) {
    return (records || []).reduce((total, record) => total + number(getter ? getter(record) : record.amount), 0);
  }

  function summarizeMovements(records) {
    const confirmed = (records || []).filter((movement) => movement?.status !== "estornado");
    const incomeRecords = confirmed.filter((movement) => movement?.type === "entrada");
    const expenseRecords = confirmed.filter((movement) => movement?.type === "saida");
    const income = sum(incomeRecords);
    const expense = sum(expenseRecords);
    return {
      income,
      expense,
      result: income - expense,
      incomeCount: incomeRecords.length,
      expenseCount: expenseRecords.length,
      movementCount: confirmed.length
    };
  }

  function delinquencySummary(payments, today) {
    const valid = (payments || []).filter((payment) => effectivePaymentStatus(payment, today) !== "cancelado");
    const overduePayments = valid.filter((payment) => isDelinquent(payment, today));
    const expected = sum(valid, netAmount);
    const overdue = sum(overduePayments, outstandingAmount);
    return {
      expected,
      overdue,
      rate: expected ? overdue / expected * 100 : 0,
      paymentCount: overduePayments.length,
      studentCount: new Set(overduePayments.map((payment) => payment?.studentId).filter(Boolean)).size
    };
  }

  function recoverySummary(payments, reference, today) {
    const periodStart = `${reference}-01`;
    const recoveredPayments = (payments || []).filter((payment) => {
      const paidDate = String(payment?.paidAt || "").slice(0, 10);
      return paidDate.startsWith(reference)
        && payment?.dueDate
        && payment.dueDate < paidDate
        && paidAmount(payment) > 0
        && effectivePaymentStatus(payment, today) !== "cancelado";
    });
    const recovered = sum(recoveredPayments, paidAmount);
    const previousDebtOpen = sum((payments || []).filter((payment) => payment?.dueDate
      && payment.dueDate < periodStart
      && isDelinquent(payment, today)), outstandingAmount);
    const base = recovered + previousDebtOpen;
    return {
      recovered,
      previousDebtOpen,
      rate: base ? recovered / base * 100 : 0,
      paymentCount: recoveredPayments.length
    };
  }

  function allocateAmount(amount, components) {
    const normalized = (components || []).map((component) => ({
      ...component,
      weight: Math.max(0, number(component?.weight))
    }));
    if (!normalized.length) return [];
    const totalWeight = normalized.reduce((total, component) => total + component.weight, 0);
    const divisor = totalWeight || normalized.length;
    return normalized.map((component) => ({
      ...component,
      value: number(amount) * (totalWeight ? component.weight : 1) / divisor
    }));
  }

  global.ProFitnessFinance = {
    allocateAmount,
    delinquencySummary,
    effectivePaymentStatus,
    isDelinquent,
    netAmount,
    number,
    outstandingAmount,
    paidAmount,
    recoverySummary,
    summarizeMovements,
    sum
  };
})(window);
