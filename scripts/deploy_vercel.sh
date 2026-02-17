#!/bin/bash
# Deploy Secretary frontend to Vercel
# Run: bash /home/john/projects/secretary/scripts/deploy_vercel.sh

set -euo pipefail

cd /home/john/projects/secretary

echo "=== Secretary Vercel Deployment ==="
echo ""

# 1. Check Vercel login
if ! npx vercel whoami 2>/dev/null; then
    echo "Not logged in to Vercel. Logging in..."
    npx vercel login
fi

echo ""
echo "=== Setting environment variables ==="
# Read env vars from .env.local
source <(grep -v '^#' .env.local | sed 's/^/export /')

echo "Setting NEXT_PUBLIC_SUPABASE_URL..."
echo "$NEXT_PUBLIC_SUPABASE_URL" | npx vercel env add NEXT_PUBLIC_SUPABASE_URL production --force 2>/dev/null || true

echo "Setting NEXT_PUBLIC_SUPABASE_ANON_KEY..."
echo "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --force 2>/dev/null || true

echo "Setting SUPABASE_SERVICE_KEY..."
echo "$SUPABASE_SERVICE_KEY" | npx vercel env add SUPABASE_SERVICE_KEY production --force 2>/dev/null || true

echo "Setting GEMINI_API_KEY..."
echo "$GEMINI_API_KEY" | npx vercel env add GEMINI_API_KEY production --force 2>/dev/null || true

echo ""
echo "=== Deploying to production ==="
npx vercel --prod

echo ""
echo "=== Deployment complete! ==="
echo "Check your Vercel dashboard for the URL."
