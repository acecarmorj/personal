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

  function sum(records, getter) {
    return (records || []).reduce((total, record) => total + number(getter ? getter(record) : record.amount), 0);
  }

  global.ProFitnessFinance = {
    effectivePaymentStatus,
    netAmount,
    number,
    outstandingAmount,
    paidAmount,
    sum
  };
})(window);
