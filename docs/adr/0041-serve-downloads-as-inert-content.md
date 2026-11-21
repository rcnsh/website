# 0041. Serve downloads as inert content

R2 echoes back whatever content type an object was uploaded with, and the bucket is a ShareX drop target, so stored types are untrusted. `/api/files/download` (`src/pages/api/files/download.ts`) serves only an allowlist of inert types inline (`INLINE_SAFE`: PNG, JPEG, GIF, WebP, AVIF, any `audio/` or `video/` type, and PDF). Every other type is sent as `application/octet-stream` with an attachment disposition. SVG is not on the list, because it can carry `<script>`.

Every download response also carries `content-security-policy: sandbox` and `x-content-type-options: nosniff`. The sandbox gives a rendered document an opaque origin, so it cannot reach the site's cookies or storage; this is defence in depth beside the type allowlist.
