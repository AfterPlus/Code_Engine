package com.leetcodevisualizer.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;

/** Resource limits for one sandboxed execution, plus the JVM flags that enforce them. */
@Component
public class ResourceLimiter {

    private final long timeoutMs;
    private final int memoryMb;
    private final int maxSteps;
    private final int maxOutputBytes;
    private final int maxCodeChars;

    public ResourceLimiter(@Value("${lcv.sandbox.timeout-ms:20000}") long timeoutMs,
                           @Value("${lcv.sandbox.memory-mb:128}") int memoryMb,
                           @Value("${lcv.sandbox.max-steps:5000}") int maxSteps,
                           @Value("${lcv.sandbox.max-output-bytes:65536}") int maxOutputBytes,
                           @Value("${lcv.sandbox.max-code-chars:50000}") int maxCodeChars) {
        this.timeoutMs = timeoutMs;
        this.memoryMb = memoryMb;
        this.maxSteps = maxSteps;
        this.maxOutputBytes = maxOutputBytes;
        this.maxCodeChars = maxCodeChars;
    }

    public static ResourceLimiter defaults() {
        return new ResourceLimiter(20000, 128, 5000, 65536, 50000);
    }

    public long timeoutMs() {
        return timeoutMs;
    }

    public int maxSteps() {
        return maxSteps;
    }

    public int maxOutputBytes() {
        return maxOutputBytes;
    }

    public int maxCodeChars() {
        return maxCodeChars;
    }

    /** Heap objects captured per step and elements captured per collection; keeps traces bounded. */
    public int maxHeapObjectsPerStep() {
        return 400;
    }

    public int maxElementsPerCollection() {
        return 256;
    }

    public List<String> jvmFlags() {
        return List.of(
                "-Xmx" + memoryMb + "m",
                "-Xss8m",
                "-XX:MaxMetaspaceSize=96m",
                "-XX:+UseSerialGC",
                "-XX:TieredStopAtLevel=1",
                "-XX:ActiveProcessorCount=1",
                "-XX:-UsePerfData",
                "-Dfile.encoding=UTF-8",
                "-Dlcv.maxOutput=" + maxOutputBytes);
    }
}
