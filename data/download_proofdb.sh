#!/usr/bin/env bash
set -euo pipefail

PROFILE="proofdb"
LOCAL="data/proofdb/proofdb.db"
BUCKET="proofdb-393497562335-eu-central-1-an"
KEY="proofdb.db"
S3_URI="s3://${BUCKET}/${KEY}"

tmp=$(mktemp "${LOCAL}.tmp.XXXXXX")
trap 'rm -f "$tmp"' EXIT

aws s3 cp "$S3_URI" "$tmp" --profile "$PROFILE"
mv "$tmp" "$LOCAL"

trap - EXIT
echo "Downloaded and overwrote $LOCAL"
