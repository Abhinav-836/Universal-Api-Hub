// backend/src/services/google.service.js
//
// Checks the ID token that "Sign in with Google" hands the browser.
// The token is a JWT signed by Google. We trust it only after checking:
//   - the RS256 signature, against Google's published certificates;
//   - `aud` is OUR client ID (a token minted for another site is refused);
//   - `iss` is Google, and the token hasn't expired;
//   - Google has verified the email address.
// Google rotates its keys, so they're fetched and cached for as long as
// Google's Cache-Control header allows. No extra library: jsonwebtoken
// (already used for our own tokens) does the RS256 check.

const axios = require('axios');
const jwt = require('jsonwebtoken');

const CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs'; // { kid: PEM certificate }
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

const cache = { certs: {}, expires: 0 };

const fail = (message, statusCode = 401) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const INVALID = "Google sign-in didn't work. Please try again.";

async function fetchCerts() {
  const res = await axios.get(CERTS_URL, { timeout: 10000 });
  const match = /max-age=(\d+)/.exec(res.headers?.['cache-control'] || '');
  cache.certs = res.data || {};
  cache.expires = Date.now() + (match ? Number(match[1]) : 3600) * 1000;
  return cache.certs;
}

async function certFor(kid) {
  let certs = Date.now() < cache.expires ? cache.certs : await fetchCerts();
  if (!certs[kid]) certs = await fetchCerts(); // Google may have just rotated keys
  return certs[kid] || null;
}

/** Returns the token's claims if every check passes; throws a 401 otherwise. */
async function verifyIdToken(idToken, clientId) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || decoded.header?.alg !== 'RS256') throw fail(INVALID);

  let cert;
  try {
    cert = await certFor(decoded.header.kid);
  } catch (e) {
    throw fail("Couldn't reach Google to check the sign-in. Try again in a moment.", 503);
  }
  if (!cert) throw fail(INVALID);

  let claims;
  try {
    claims = jwt.verify(idToken, cert, { algorithms: ['RS256'], audience: clientId, issuer: ISSUERS });
  } catch (e) {
    throw fail(INVALID);
  }
  if (!claims.sub || !claims.email) throw fail(INVALID);
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw fail("Your Google account's email isn't verified, so it can't be used to sign in.");
  }
  return claims;
}

module.exports = { verifyIdToken, _cache: cache };
