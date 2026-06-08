#!/usr/bin/env python3
"""Golden vectors for AP2 payment-constraint evaluation (P5).

Calls AP2's own `check_payment_constraints` (commit e1ea56d) on hand-built
open/closed mandate pairs and records the exact violation list. Pure data (no
crypto) → fully deterministic; re-running does not churn.

Run: /tmp/ap2venv/bin/python test/fixtures/gen_ap2_constraint_vectors.py
"""
from __future__ import annotations

import json
import pathlib

from ap2.sdk.constraints import MandateContext, check_payment_constraints
from ap2.sdk.generated.open_payment_mandate import (
    AgentRecurrence, AllowedPayees, AllowedPaymentInstruments, AllowedPisps,
    AmountRange, Budget, ExecutionDate, Frequency, OpenPaymentMandate, PaymentReference)
from ap2.sdk.generated.payment_mandate import PaymentMandate
from ap2.sdk.generated.types.amount import Amount
from ap2.sdk.generated.types.merchant import Merchant
from ap2.sdk.generated.types.payment_instrument import PaymentInstrument
from ap2.sdk.generated.types.pisp import PISP

OUT = pathlib.Path(__file__).parent / "ap2-constraint-vectors.json"
CNF = {"jwk": {"kty": "EC", "crv": "P-256", "x": "x", "y": "y"}}
PISP_A = PISP(legal_name="Acme PISP Ltd", brand_name="Acme", domain_name="acme-pisp.example")

vectors: list[dict] = []


def open_pm(constraints, **preset):
    return OpenPaymentMandate(constraints=constraints, cnf=CNF, **preset)


def closed_pm(**ov):
    d = dict(transaction_id="tx_1", payee=Merchant(id="s-1", name="Shop"),
             payment_amount=Amount(amount=1000, currency="USD"),
             payment_instrument=PaymentInstrument(id="pi-1", type="credit"))
    d.update(ov)
    return PaymentMandate(**d)


def add(name, om, cm, *, hash=None, ctx=None):
    violations = check_payment_constraints(om, cm, open_checkout_hash=hash, mandate_context=ctx)
    vectors.append({
        "name": name,
        "open": om.model_dump(mode="json", by_alias=True, exclude_none=True),
        "closed": cm.model_dump(mode="json", by_alias=True, exclude_none=True),
        "openCheckoutHash": hash,
        "context": {"total_amount": ctx.total_amount, "total_uses": ctx.total_uses} if ctx else None,
        "ap2Violations": violations,
        "valid": len(violations) == 0,
    })


def main() -> None:
    AR = lambda **k: AmountRange(currency="USD", **k)

    # amount_range
    add("amount_range_pass", open_pm([AR(max=5000, min=100)]), closed_pm())
    add("amount_range_over", open_pm([AR(max=500)]), closed_pm(payment_amount=Amount(amount=1000, currency="USD")))
    add("amount_range_under", open_pm([AR(max=5000, min=2000)]), closed_pm())
    add("amount_range_currency", open_pm([AR(max=5000)]), closed_pm(payment_amount=Amount(amount=1000, currency="EUR")))

    # allowed_payees
    add("allowed_payees_pass", open_pm([AllowedPayees(allowed=[Merchant(id="s-1", name="Shop")])]), closed_pm())
    add("allowed_payees_fail", open_pm([AllowedPayees(allowed=[Merchant(id="other", name="Other")])]), closed_pm())

    # allowed_payment_instruments
    add("allowed_instruments_pass", open_pm([AllowedPaymentInstruments(allowed=[PaymentInstrument(id="pi-1", type="credit")])]), closed_pm())
    add("allowed_instruments_fail", open_pm([AllowedPaymentInstruments(allowed=[PaymentInstrument(id="pi-X", type="credit")])]), closed_pm())

    # allowed_pisps
    add("allowed_pisps_pass", open_pm([AllowedPisps(allowed=[PISP_A])]), closed_pm(pisp=PISP_A))
    add("allowed_pisps_fail", open_pm([AllowedPisps(allowed=[PISP_A])]),
        closed_pm(pisp=PISP(legal_name="Other", brand_name="Other", domain_name="other.example")))

    # budget (max is MAJOR-unit float → *100 cents)
    add("budget_pass", open_pm([Budget(max=50.0, currency="USD")]), closed_pm(), ctx=MandateContext(total_amount=0))
    add("budget_over", open_pm([Budget(max=50.0, currency="USD")]), closed_pm(), ctx=MandateContext(total_amount=4500))
    add("budget_currency", open_pm([Budget(max=50.0, currency="EUR")]), closed_pm(), ctx=MandateContext(total_amount=0))

    # execution_date (ISO strings, lexical compare)
    ed = ExecutionDate(not_before="2026-01-01", not_after="2026-12-31")
    add("execution_date_pass", open_pm([ed]), closed_pm(execution_date="2026-06-01"))
    add("execution_date_before", open_pm([ed]), closed_pm(execution_date="2025-01-01"))
    add("execution_date_after", open_pm([ed]), closed_pm(execution_date="2027-01-01"))

    # payment.reference (binds to an open checkout hash)
    add("reference_pass", open_pm([PaymentReference(conditional_transaction_id="HASH123")]), closed_pm(), hash="HASH123")
    add("reference_mismatch", open_pm([PaymentReference(conditional_transaction_id="HASH123")]), closed_pm(), hash="OTHER")
    add("reference_missing_hash", open_pm([PaymentReference(conditional_transaction_id="HASH123")]), closed_pm())

    # agent_recurrence (requires amount_range + budget present)
    rec = AgentRecurrence(frequency=Frequency.MONTHLY, max_occurrences=3)
    full = [rec, AR(max=5000), Budget(max=50.0, currency="USD")]
    add("recurrence_pass", open_pm(full), closed_pm(), ctx=MandateContext(total_uses=1, total_amount=0))
    add("recurrence_exceeded", open_pm(full), closed_pm(), ctx=MandateContext(total_uses=3, total_amount=0))
    add("recurrence_requires_amount_budget", open_pm([rec]), closed_pm(), ctx=MandateContext(total_uses=0))

    # pre-set claims (open mandate pins a field the closed mandate must keep)
    add("preset_payee_mismatch", open_pm([], payee=Merchant(id="other", name="Other")), closed_pm())
    add("preset_amount_mismatch", open_pm([], payment_amount=Amount(amount=999, currency="USD")), closed_pm())

    OUT.write_text(json.dumps(vectors, indent=2) + "\n")
    print(f"wrote {len(vectors)} constraint vectors -> {OUT}")
    for v in vectors:
        print(f"  - {v['name']}: violations={len(v['ap2Violations'])} valid={v['valid']}")


if __name__ == "__main__":
    main()
