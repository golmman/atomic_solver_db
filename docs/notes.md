I want a redesign of this project. The look and feel (frontend side) can be kept as is but the database has changed.

Read `docs/plans/redesign/handoff/BROWSER_BRIEF.md`, then `docs/plans/redesign/handoff/global_proof_store.md` (the normative contract) and `docs/plans/redesign/handoff/HANDOFF.md` in full. Find the proofdb.db at `data/proofdb/proofdb.db`. Decide the rules-engine option (§6: TS port vs Rust/WASM of atomic-movegen 2.3) and record the decision + rationale in a short DECISIONS.md before writing UI code. Then scaffold the static site: DB load + version-stamp gate + structural invariant checks (§8) first, board navigation second, node facts panel third. Clean up and remove the old database implementation and make sure we finish with no dead files. Update the AGENTS.md as needed, so each new sessions knows its way around.

Don't implement yet, only draft consecutive implementation plans `planN.md` which are intended to be single sessions and write them to `docs/plans/redesign/`.
Each plan should finish with an implementation report `reportN.md` so the next session knows where we left off.

---

the provider of the proofdb (`data/proofdb/proofdb.db`) has updated the handoff docs (docs/plans/redesign/handoff/).
Please look at the changes of the last commit and see what needs to be changed.
Draft a plan `docs/plans/redesign/plan5.md` if changes are necessary.

---

Last time we finished with `docs/plans/redesign/plan5.md`
i don't want to have explicit handoffs which update the `fe/delivery.json` etc. . Instead i simply want to copy the updated `proofdb.db` file over.
Are there any changes on this side necessary for this to work?

