-- #1430 (docs/specs/19-db-security.md F4): the bucket «files» takes a file of at most 25 MB.
-- What goes there: only photos (apps/mobile/src/cloud/ops.ts uploadPhoto — the camera and the gallery at quality 0.6–0.7,
-- usually 3–12 MB). The logo is not a file of the bucket (a data URI in the company profile); a PDF is only shared, never
-- uploaded; a signature is SVG text in its table. 25 MB is about twice the largest photo.
-- No allowed_mime_types: on Android and the web a photo's blob.type can be empty, octet-stream or heic/webp — a real photo
-- refused for its type would be marked failed by the builds already on phones and lost. The object's name (its extension)
-- is limited by the storage policies already.
-- Rule 16: one setting of the bucket changes, nothing is renamed or dropped. The limit is kept by the Storage service.
update storage.buckets set file_size_limit = 26214400 where id = 'files';
