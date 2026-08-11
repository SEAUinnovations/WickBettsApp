These files were moved from repo root during deployment hardening.

Reason:
- They are not referenced by workspace package scripts or runtime entrypoints.
- Keeping them out of root reduces deployment noise while preserving history.

If needed later, move individual files back to root or convert them into package scripts.
