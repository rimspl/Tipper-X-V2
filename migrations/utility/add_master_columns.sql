ALTER TABLE public.customer_master 
ADD COLUMN IF NOT EXISTS truck_manufacturer text,
ADD COLUMN IF NOT EXISTS truck_model text, -- Already added, but ensuring it exists
ADD COLUMN IF NOT EXISTS tipper_model_id uuid,
ADD COLUMN IF NOT EXISTS tyre_size text,
ADD COLUMN IF NOT EXISTS tipper_count numeric;
