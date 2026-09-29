package com.leetcodevisualizer.controller;

import com.leetcodevisualizer.model.ExecutionRequest;
import com.leetcodevisualizer.model.ExecutionResult;
import com.leetcodevisualizer.service.ExecutionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.RejectedExecutionException;

@RestController
@RequestMapping("/api/v1")
public class ExecutionController {

    private final ExecutionService executions;

    public ExecutionController(ExecutionService executions) {
        this.executions = executions;
    }

    /**
     * Runs a trace. Waits up to {@code waitMs} (default 20s) and returns the full result when it finishes in time;
     * otherwise returns QUEUED/RUNNING with an {@code executionId} to poll.
     */
    @PostMapping("/execution/run")
    public ResponseEntity<ExecutionResult> run(@RequestBody ExecutionRequest request,
                                               @RequestParam(defaultValue = "20000") long waitMs) {
        try {
            return ResponseEntity.ok(executions.submit(request, Math.max(0, Math.min(waitMs, 30000))));
        } catch (RejectedExecutionException e) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }
    }

    @GetMapping("/execution/{id}")
    public ResponseEntity<ExecutionResult> get(@PathVariable String id) {
        return ResponseEntity.of(executions.get(id));
    }

    @PostMapping("/execution/{id}/cancel")
    public ResponseEntity<ExecutionResult> cancel(@PathVariable String id) {
        return ResponseEntity.of(executions.cancel(id));
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("status", "UP");
        h.put("languages", new String[]{"java"});
        h.put("javaVersion", Runtime.version().toString());
        return h;
    }
}
