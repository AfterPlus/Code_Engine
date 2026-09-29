package com.leetcodevisualizer.service;

import com.leetcodevisualizer.model.ExecutionRequest;
import com.leetcodevisualizer.model.ExecutionResult;
import com.leetcodevisualizer.model.ExecutionStatus;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Bounded execution queue in front of the sandbox. Requests beyond {@code max-concurrent} wait in a queue of
 * {@code max-queued}; anything beyond that is rejected. Results are kept for ten minutes for polling.
 */
@Service
public class ExecutionService {

    private static final long RETENTION_MS = 10 * 60 * 1000;

    private static final class Job {
        final long createdAt = System.currentTimeMillis();
        final AtomicBoolean cancelled = new AtomicBoolean();
        volatile boolean started;
        volatile ExecutionResult result;
        volatile Future<?> future;
    }

    private final TraceService traceService;
    private final ThreadPoolExecutor pool;
    private final ScheduledExecutorService janitor = Executors.newSingleThreadScheduledExecutor();
    private final Map<String, Job> jobs = new ConcurrentHashMap<>();

    public ExecutionService(TraceService traceService,
                            @Value("${lcv.sandbox.max-concurrent:2}") int maxConcurrent,
                            @Value("${lcv.sandbox.max-queued:16}") int maxQueued) {
        this.traceService = traceService;
        this.pool = new ThreadPoolExecutor(maxConcurrent, maxConcurrent, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(maxQueued), Thread.ofPlatform().name("lcv-runner-", 0).factory());
        janitor.scheduleAtFixedRate(this::evict, 1, 1, TimeUnit.MINUTES);
    }

    /**
     * Queues an execution and waits up to {@code waitMs} for it; returns the finished result or a QUEUED/RUNNING
     * placeholder whose id can be polled.
     *
     * @throws RejectedExecutionException when the queue is full
     */
    public ExecutionResult submit(ExecutionRequest request, long waitMs) {
        String id = UUID.randomUUID().toString();
        Job job = new Job();
        jobs.put(id, job);
        try {
            job.future = pool.submit(() -> {
                job.started = true;
                if (job.cancelled.get()) {
                    job.result = cancelled(id);
                    return;
                }
                job.result = traceService.execute(id, request, job.cancelled::get);
            });
        } catch (RejectedExecutionException e) {
            jobs.remove(id);
            throw e;
        }
        try {
            job.future.get(waitMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException | CancellationException ignored) {
            // still running (or cancelled); the client polls
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (ExecutionException e) {
            ExecutionResult r = ExecutionResult.of(id, ExecutionStatus.INTERNAL_ERROR);
            r.error = new ExecutionResult.ExecutionError("Internal Error", String.valueOf(e.getCause()), null, null);
            job.result = r;
        }
        return snapshot(id, job);
    }

    public Optional<ExecutionResult> get(String id) {
        Job job = jobs.get(id);
        return job == null ? Optional.empty() : Optional.of(snapshot(id, job));
    }

    public Optional<ExecutionResult> cancel(String id) {
        Job job = jobs.get(id);
        if (job == null) return Optional.empty();
        job.cancelled.set(true);
        if (!job.started && job.future != null && job.future.cancel(false)) job.result = cancelled(id);
        return Optional.of(snapshot(id, job));
    }

    private static ExecutionResult snapshot(String id, Job job) {
        ExecutionResult r = job.result;
        if (r != null) return r;
        return ExecutionResult.of(id, job.started ? ExecutionStatus.RUNNING : ExecutionStatus.QUEUED);
    }

    private static ExecutionResult cancelled(String id) {
        ExecutionResult r = ExecutionResult.of(id, ExecutionStatus.CANCELLED);
        r.error = new ExecutionResult.ExecutionError("Cancelled", "Execution was cancelled.", null, null);
        return r;
    }

    private void evict() {
        long cutoff = System.currentTimeMillis() - RETENTION_MS;
        jobs.entrySet().removeIf(e -> e.getValue().createdAt < cutoff && e.getValue().result != null);
    }

    @PreDestroy
    void shutdown() {
        janitor.shutdownNow();
        pool.shutdownNow();
    }
}
