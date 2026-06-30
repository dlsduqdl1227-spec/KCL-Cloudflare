# KCL Assessment 1.0ver - Security Stage 8 Auth Link Fix

- Fixes /admin/ -> 통합 운영관리 (/assessment/?admin=1) authority loss.
- Keeps valid judgeToken attached after server-side auth hydration.
- Always returns a usable token from refreshAdminActor.
- Sends phone/name fallback in admin console requests.
- Keeps Stage 5 security headers and rate limits.

Deploy by uploading the extracted files to GitHub. Do not put SOLAPI API keys in source code.
