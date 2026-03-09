-- Run this in your Supabase SQL Editor

ALTER TABLE public.surveys 
ADD COLUMN IF NOT EXISTS ai_dataset_cache jsonb null default '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_dataset_updated_at timestamp with time zone null;
