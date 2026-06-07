#!/usr/bin/env python3
"""Generate cross-implementation golden vectors for AP2 dSD-JWT verification.

Mints REAL AP2 mandate chains using AP2's own SDK, so the TypeScript verifier is
tested against the reference implementation's actual output — not our reading of
the spec. Emits test/fixtures/ap2-vectors.json.

Setup (one-time):
    python3.13 -m venv /tmp/ap2venv
    /tmp/ap2venv/bin/pip install "git+https://github.com/google-agentic-commerce/AP2.git"
Run:
    /tmp/ap2venv/bin/python test/fixtures/gen_ap2_vectors.py

Each vector: {name, description, chain, rootKey(pub JWK), expectedAud,
expectedNonce, expect: "valid"|"reject", reason?, expectedPayloads?}.
Tampered/crafted variants exercise the attack classes from PLAN-AP2.md §7.
"""
from __future__ import annotations

import json
import pathlib

from cryptography.hazmat.primitives.asymmetric import ec
from jwcrypto.jwk import JWK

from ap2.sdk.mandate import MandateClient, _canonical_chain_segment
from ap2.sdk.sdjwt import common
from ap2.sdk.generated.open_payment_mandate import OpenPaymentMandate, AmountRange
from ap2.sdk.generated.payment_mandate import PaymentMandate
from ap2.sdk.generated.types.amount import Amount
from ap2.sdk.generated.types.merchant import Merchant
from ap2.sdk.generated.types.payment_instrument import PaymentInstrument

OUT = pathlib.Path(__file__).parent / "ap2-vectors.json"
PAIRS_OUT = pathlib.Path(__file__).parent / "ap2-hash-pairs.json"


def emit_hash_pairs(chain: str) -> dict:
    """Per-segment byte-exact ground truth from AP2's common.py — drives P1
    (parse/hash) tests: canonical serialization + sd_hash/issuer_jwt_hash/
    disclosure digests must match AP2 exactly."""
    segs = chain.split("~~")
    total = len(segs)
    out = []
    for i, s in enumerate(segs):
        cs = _canonical_chain_segment(s, i, total)
        t = common.parse_token(cs)
        out.append({
            "compact": cs,
            "issuerJwt": t.issuer_jwt,
            "disclosures": t.disclosures,
            "kbJwt": t.kb_jwt,
            "sdAlg": t.sd_alg,
            "sdJwt": t.sd_jwt,
            "canonical": t.canonical,
            "sdHash": common.compute_sd_hash(t),
            "issuerJwtHash": common.compute_issuer_jwt_hash(t),
            "disclosureDigests": {d: common.compute_disclosure_digest(d, t.sd_alg) for d in t.disclosures},
        })
    return {"rawSplitOnDoubleTilde": segs, "segments": out}


def gen_key(kid: str) -> JWK:
    k = ec.generate_private_key(ec.SECP256R1())
    jwk = JWK.from_pyca(k)
    d = json.loads(jwk.export())
    d["kid"] = kid
    return JWK.from_json(json.dumps(d))


def pub(jwk: JWK) -> dict:
    return json.loads(jwk.export_public())


def make_cnf(jwk: JWK) -> dict:
    return {"jwk": json.loads(jwk.export_public())}


def payment(**ov) -> PaymentMandate:
    d = dict(
        transaction_id="tx_1",
        payee=Merchant(name="Shop", id="s-1"),
        payment_amount=Amount(amount=1000, currency="USD"),
        payment_instrument=PaymentInstrument(id="pi-1", type="credit"),
    )
    d.update(ov)
    return PaymentMandate(**d)


def tamper_root_payload(chain: str) -> str:
    """Flip one char in the root issuer-JWT payload segment → breaks root sig."""
    seg0 = chain.split("~~")[0]
    ij = seg0.split("~")[0]  # header.payload.sig
    h, p, s = ij.split(".")
    p2 = p[:-1] + ("A" if p[-1] != "A" else "B")
    new_ij = ".".join([h, p2, s])
    return chain.replace(ij, new_ij, 1)


def main() -> None:
    h = MandateClient()
    AUD, NONCE = "merchant", "nonce-1"
    vectors: list[dict] = []

    def add(name, description, chain, root, expect, *, aud=AUD, nonce=NONCE, reason=None, payloads=None):
        v = {
            "name": name, "description": description, "chain": chain,
            "rootKey": root, "expectedAud": aud, "expectedNonce": nonce, "expect": expect,
        }
        if reason:
            v["reason"] = reason
        if payloads is not None:
            v["expectedPayloads"] = payloads
        vectors.append(v)

    # ── Valid 2-hop payment chain (root SD-JWT signed by user, terminal hop by agent) ──
    user, agent = gen_key("user-1"), gen_key("agent-1")
    open_tok = h.create(
        payloads=[OpenPaymentMandate(constraints=[AmountRange(currency="USD", max=5000)], cnf=make_cnf(agent))],
        issuer_key=user,
    )
    chain2 = h.present(
        holder_key=agent, mandate_token=open_tok,
        payloads=[payment(payment_amount=Amount(amount=1000, currency="USD"))],
        aud=AUD, nonce=NONCE,
    )
    payloads2 = h.verify(token=chain2, key_or_provider=lambda _t: JWK.from_json(user.export_public()),
                         expected_aud=AUD, expected_nonce=NONCE)
    add("valid_payment_2hop", "Root SD-JWT (user) + terminal KB-SD-JWT (agent), in budget.",
        chain2, pub(user), "valid", payloads=payloads2)

    # ── Valid 3-hop payment chain (user → agent[intermediate] → cp[terminal]) ──
    cp = gen_key("cp-1")
    try:
        mid = h.present(
            holder_key=agent, mandate_token=open_tok,
            payloads=[OpenPaymentMandate(constraints=[AmountRange(currency="USD", max=5000)], cnf=make_cnf(cp))],
            aud="cp", nonce="nonce-cp",
        )
        chain3 = h.present(
            holder_key=cp, mandate_token=mid,
            payloads=[payment(payment_amount=Amount(amount=1000, currency="USD"))],
            aud=AUD, nonce=NONCE,
        )
        payloads3 = h.verify(token=chain3, key_or_provider=lambda _t: JWK.from_json(user.export_public()),
                             expected_aud=AUD, expected_nonce=NONCE)
        add("valid_payment_3hop", "user root → agent intermediate (cnf=cp) → cp terminal.",
            chain3, pub(user), "valid", payloads=payloads3)
    except Exception as e:  # noqa: BLE001
        print(f"[warn] 3-hop mint failed ({e}); skipping that vector")

    # ── Tampered: flipped root payload byte → signature must fail ──
    add("tampered_root_payload", "One byte flipped in the root issuer-JWT payload.",
        tamper_root_payload(chain2), pub(user), "reject", reason="root signature invalid")

    # ── Crafted: terminal hop signed by the WRONG key (cnf names agent, signed by `other`) ──
    other = gen_key("other-1")
    wrong = h.present(
        holder_key=other, mandate_token=open_tok,
        payloads=[payment(payment_amount=Amount(amount=1000, currency="USD"))],
        aud=AUD, nonce=NONCE,
    )
    add("wrong_cnf_key", "Terminal hop signed by a key not named in the prior cnf.jwk.",
        wrong, pub(user), "reject", reason="hop signature does not verify under prev cnf.jwk")

    # ── aud / nonce mismatch (valid chain, wrong expected values) ──
    add("aud_mismatch", "Valid chain, verifier expects a different audience.",
        chain2, pub(user), "reject", aud="WRONG-aud", reason="terminal aud mismatch")
    add("nonce_mismatch", "Valid chain, verifier expects a different nonce.",
        chain2, pub(user), "reject", nonce="WRONG-nonce", reason="terminal nonce mismatch")

    # ── Wrong root key (valid chain verified against an unrelated key) ──
    add("wrong_root_key", "Valid chain verified against an unrelated root key.",
        chain2, pub(other), "reject", reason="root signature does not verify under given key")

    PAIRS_OUT.write_text(json.dumps(emit_hash_pairs(chain2), indent=2) + "\n")
    OUT.write_text(json.dumps(vectors, indent=2) + "\n")
    print(f"wrote {len(vectors)} vectors -> {OUT}")
    print(f"wrote hash pairs -> {PAIRS_OUT}")
    for v in vectors:
        print(f"  - {v['name']}: expect={v['expect']}")


if __name__ == "__main__":
    main()
