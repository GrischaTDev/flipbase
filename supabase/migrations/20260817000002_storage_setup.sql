-- ==============================================================================
-- STORAGE BUCKET & RLS POLICIES FOR ITEM MEDIA & ATTACHMENTS
-- ==============================================================================

-- 1. Create the storage bucket 'item-media'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'item-media',
    'item-media',
    true,
    10485760, -- 10MB limit per file
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Storage Policies
DROP POLICY IF EXISTS "Public item-media access" ON storage.objects;
CREATE POLICY "Public item-media access"
ON storage.objects FOR SELECT
USING (bucket_id = 'item-media');

DROP POLICY IF EXISTS "Authenticated users can upload item-media" ON storage.objects;
CREATE POLICY "Authenticated users can upload item-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'item-media');

DROP POLICY IF EXISTS "Authenticated users can update item-media" ON storage.objects;
CREATE POLICY "Authenticated users can update item-media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'item-media');

DROP POLICY IF EXISTS "Authenticated users can delete item-media" ON storage.objects;
CREATE POLICY "Authenticated users can delete item-media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'item-media');

DROP POLICY IF EXISTS "Anon users can upload item-media in dev" ON storage.objects;
CREATE POLICY "Anon users can upload item-media in dev"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'item-media');

DROP POLICY IF EXISTS "Anon users can delete item-media in dev" ON storage.objects;
CREATE POLICY "Anon users can delete item-media in dev"
ON storage.objects FOR DELETE
TO anon
USING (bucket_id = 'item-media');
