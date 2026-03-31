-- Schema for AI News Agent Exam Platform

-- Create table for storing generated creatives history
CREATE TABLE public.agent_news_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    article_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    region TEXT NOT NULL,
    link TEXT,
    creatives JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on Row Level Security (RLS)
ALTER TABLE public.agent_news_history ENABLE ROW LEVEL SECURITY;

-- Since this is an agent exam platform, we might want to allow anonymous inserts and selects.
-- In a real production environment, you should restrict this with proper Auth.

CREATE POLICY "Allow public select on agent_news_history"
    ON public.agent_news_history
    FOR SELECT
    USING (true);

CREATE POLICY "Allow public insert on agent_news_history"
    ON public.agent_news_history
    FOR INSERT
    WITH CHECK (true);
