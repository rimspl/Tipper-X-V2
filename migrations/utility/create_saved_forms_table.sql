-- 1. Create the saved_forms table to store JSON dumps of form data
CREATE TABLE public.saved_forms (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    form_id text NOT NULL,        -- e.g., 'pressure-check', 'tyre-card'
    data jsonb NOT NULL,          -- The full form data payload
    user_info jsonb,              -- Snapshot of user session info
    created_at timestamp with time zone DEFAULT now(),
    synced_at timestamp with time zone, 
    CONSTRAINT saved_forms_pkey PRIMARY KEY (id)
);

-- 2. Enable Row Level Security (RLS) - Optional but recommended
ALTER TABLE public.saved_forms ENABLE ROW LEVEL SECURITY;

-- 3. Create a Policy to allow anyone to Insert/Select (since we are in 'setup' mode)
-- WARNING: In production, you should restrict this to authenticated users only.
CREATE POLICY "Allow public access" ON public.saved_forms
FOR ALL USING (true) WITH CHECK (true);
