#!/usr/bin/env bash
# www.bom.mu serves its leaf certificate without the intermediate CA. Browsers fetch
# the missing intermediate themselves (via the certificate's "CA Issuers" URL); Node
# doesn't. This script fetches it the same way, verifies it chains to a trusted system
# root, and writes it to $1 for NODE_EXTRA_CA_CERTS.
set -euo pipefail
out="${1:-bom-intermediate.pem}"
host=www.bom.mu
roots=/etc/ssl/certs/ca-certificates.crt
tmp=$(mktemp -d)

echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null | openssl x509 > "$tmp/leaf.pem"
url=$(openssl x509 -in "$tmp/leaf.pem" -noout -ext authorityInfoAccess | sed -n 's/.*CA Issuers - URI:\(.*\)/\1/p' | head -1)
[ -n "$url" ] || { echo "No CA Issuers URL in $host certificate" >&2; exit 1; }
echo "Fetching intermediate from $url"
curl -fsSL --max-time 30 "$url" -o "$tmp/issuer.bin"
openssl x509 -inform DER -in "$tmp/issuer.bin" -out "$tmp/issuer.pem" 2>/dev/null || openssl x509 -in "$tmp/issuer.bin" -out "$tmp/issuer.pem"

# Only trust it if it is signed by a root we already trust, and it really issued the leaf.
openssl verify -CAfile "$roots" "$tmp/issuer.pem"
openssl verify -CAfile "$roots" -untrusted "$tmp/issuer.pem" "$tmp/leaf.pem"
cp "$tmp/issuer.pem" "$out"
openssl x509 -in "$out" -noout -subject
