# Vendored: cwv-agent

This directory contains a snapshot of [ramboz/cwv-agent](https://github.com/ramboz/cwv-agent), used by the `cwv` analyzer.

## Current snapshot

- **Upstream:** https://github.com/ramboz/cwv-agent
- **Branch:** `main`
- **Commit:** `6d65068bf1015856b8725454775165d395b7d86f`
- **Imported:** 2026-05-04

## Updating

Re-vendor when upstream has fixes you want:

```bash
rm -rf src/analyzers/cwv/vendor
git clone --depth=1 https://github.com/ramboz/cwv-agent.git /tmp/cwv-agent-fresh
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.cache' \
  --exclude='.DS_Store' --exclude='.env*' \
  /tmp/cwv-agent-fresh/ src/analyzers/cwv/vendor/
# Update this file with the new SHA + date
# Re-run `npm install` if vendor/package.json deps changed
```

## Local modifications

None. This is a clean copy. Any divergence should be made upstream and re-vendored.
