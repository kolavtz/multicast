-- RPC: checkout_due_jobs
-- Fetches queued jobs that are due, marks them processing, and returns them.
-- Uses row locking to prevent concurrency issues.

CREATE OR REPLACE FUNCTION checkout_due_jobs(batch_size INT)
RETURNS SETOF public.publish_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r public.publish_jobs;
BEGIN
    RETURN QUERY
    UPDATE public.publish_jobs
    SET 
        status = 'processing',
        started_at = now()
    WHERE id IN (
        SELECT id
        FROM public.publish_jobs
        WHERE status = 'queued'
        AND scheduled_at <= now()
        ORDER BY scheduled_at ASC
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
END;
$$;
