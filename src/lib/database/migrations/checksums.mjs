/**
 * SHA-256 digests of the migration source files. Keep this manifest updated
 * whenever a migration changes; the test suite verifies every digest against
 * its source. Keeping the digests in a bundled manifest avoids reading a
 * source path at runtime, where Next's traced deployment assets are renamed.
 */
export const migrationChecksums = Object.freeze({
  "001-initial-schema": Object.freeze({
    file: "001-initial-schema.mjs",
    checksum:
      "7bd930a5bbf3bb2d9cd1de3afad9f771f02fe85c6071aefb12871c405d94c51f",
  }),
  "002-auth-transactions": Object.freeze({
    file: "002-auth-transactions.mjs",
    checksum:
      "ffa4140ef089565053ac3dcfdbf90f319d111f73f56f4b1fc5499a0860bd1291",
  }),
  "003-session-sso-credentials": Object.freeze({
    file: "003-session-sso-credentials.mjs",
    checksum:
      "1e32e92812d9c518bb9071ddfd8a7be5353a6a3b586a27617298275242ec0529",
  }),
  "004-checkin-result-session-revision": Object.freeze({
    file: "004-checkin-result-session-revision.mjs",
    checksum:
      "0b7185ecd1a9c7e3a7fca4f28a5b89062902189c4ddc6ca3cdf902b80a561842",
  }),
  "005-interpretation-reviews": Object.freeze({
    file: "005-interpretation-reviews.mjs",
    checksum:
      "22b46f6a9ffa39a78366ffb9b1f51c31d67fa3e909497f2a032d8333f850e78f",
  }),
  "006-coach-materials": Object.freeze({
    file: "006-coach-materials.mjs",
    checksum:
      "7784114b663bed3cefa5403e5c350ee4f4caea25485d9274dd9e790cda62959f",
  }),
  "007-publication-uniqueness": Object.freeze({
    file: "007-publication-uniqueness.mjs",
    checksum:
      "e4a771131ed052b0ecc74e34d6e0ad5b5462dbad59bdd240bfc9b38e668c1a92",
  }),
  "008-upload-chunks": Object.freeze({
    file: "008-upload-chunks.mjs",
    checksum:
      "bf7b267622d03facf2ffff4a39d4e4ae092590490ac6ae18926d3912893f4731",
  }),
  "009-worker-claim-idempotency": Object.freeze({
    file: "009-worker-claim-idempotency.mjs",
    checksum:
      "62644a0b20d9422f4c9e5383917a724f56c58420199643405f831e607ef998a0",
  }),
  "010-sso-browser-owner-sessions": Object.freeze({
    file: "010-sso-browser-owner-sessions.mjs",
    checksum:
      "4259964d909c2905ea3d5e6d34c9e6afc9fd0559efcbdc6ad1f3da1d8210887d",
  }),
  "011-role-invitations": Object.freeze({
    file: "011-role-invitations.mjs",
    checksum:
      "e39148e699037b56848601197284bf03d200ac6e112bc766752a5b4b527bad16",
  }),
  "012-player-display-names": Object.freeze({
    file: "012-player-display-names.mjs",
    checksum:
      "3b0058303c67607b3447db35aedad6fb202cbddaddeeff83d0d47f8fc43e4457",
  }),
  "013-role-requests": Object.freeze({
    file: "013-role-requests.mjs",
    checksum:
      "9a8b522cc47a2f2b28c7d3617da9f99fbe97bce93777a09a67d20441b566a73d",
  }),
  "014-experience-drafts": Object.freeze({
    file: "014-experience-drafts.mjs",
    checksum:
      "cc7175d04d2ee93beb2ee9800d84a13fe71bf8e35274079ab19bbfea980aa09d",
  }),
  "015-monthly-reflections": Object.freeze({
    file: "015-monthly-reflections.mjs",
    checksum:
      "8083d311e1051ee088ebd0b515b7653718577b7f9de699fdfe5f4b2441a139b6",
  }),
  "016-sso-owner-session-display-name": Object.freeze({
    file: "016-sso-owner-session-display-name.mjs",
    checksum:
      "f796d75ae986196a1b9fc1477d44f05836b85d6061bc09897743b3034760ca24",
  }),
});
