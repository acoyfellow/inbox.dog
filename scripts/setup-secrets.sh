#!/bin/bash
# Setup Cloudflare Worker secrets for inbox.dog OAuth

set -e

cd "$(dirname "$0")/../worker"

echo "Setting up Cloudflare Worker secrets..."
echo "You'll be prompted to enter each secret value."
echo ""

read -p "Enter GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
echo "$GOOGLE_CLIENT_ID" | wrangler secret put GOOGLE_CLIENT_ID --env production

read -sp "Enter GOOGLE_CLIENT_SECRET: " GOOGLE_CLIENT_SECRET
echo ""
echo "$GOOGLE_CLIENT_SECRET" | wrangler secret put GOOGLE_CLIENT_SECRET --env production

read -p "Do you want to set up Stripe? (y/n): " SETUP_STRIPE
if [ "$SETUP_STRIPE" = "y" ]; then
  read -sp "Enter STRIPE_SECRET_KEY: " STRIPE_SECRET_KEY
  echo ""
  echo "$STRIPE_SECRET_KEY" | wrangler secret put STRIPE_SECRET_KEY --env production
  
  read -sp "Enter STRIPE_WEBHOOK_SECRET: " STRIPE_WEBHOOK_SECRET
  echo ""
  echo "$STRIPE_WEBHOOK_SECRET" | wrangler secret put STRIPE_WEBHOOK_SECRET --env production
fi

# Generate JWT secret
JWT_SECRET=$(openssl rand -hex 32)
echo "$JWT_SECRET" | wrangler secret put JWT_SECRET --env production
echo "Generated and set JWT_SECRET."

echo ""
echo "Done! Secrets configured for production environment."
echo "Run 'cd worker && wrangler deploy --env production' to deploy with secrets."
