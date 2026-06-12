#!/bin/sh
# entrypoint.sh — WMS Production Startup Orchestrator
set -e

echo "=== WMS Startup: Database Migrations ==="
node packages/db/dist/migrate.js

echo "=== WMS Startup: API Server ==="
exec node apps/api/dist/index.js
