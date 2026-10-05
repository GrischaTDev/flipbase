-- Eindeutiger gemessener IP-Ausgang im neuen privaten Cloud-IP-Bestand.
ALTER TABLE public.marketplace_cloud_ips ADD COLUMN exit_ip_fingerprint text NOT NULL;
ALTER TABLE public.marketplace_cloud_ips ADD CONSTRAINT marketplace_cloud_ips_exit_ip_fingerprint_check CHECK (exit_ip_fingerprint ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE public.marketplace_cloud_ips ADD CONSTRAINT marketplace_cloud_ips_exit_ip_fingerprint_key UNIQUE (exit_ip_fingerprint);
