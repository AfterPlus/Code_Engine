# LeetCode Visualizer

Paste a LeetCode problem, your solution, and a test case. The app **executes the code, records the real program
state at every step, and turns it into a visual dry run**: arrays with pointers, hash maps, stacks, queues,
linked lists, trees, graphs, DP tables, the call stack, a recursion tree, and memory. You step through it
frame by frame.

Nothing is pattern-matched per problem. Both languages produce one generic execution trace, and every
visualizer is chosen from the runtime shape of the data plus how the source code uses it.

```
Source ─► instrument / debug ─► execution trace (snapshots) ─► state builder (diffs → events) ─► visualizers
```

## Running it

Requirements: a **JDK 21+** (the server compiles and debugs Java, so a JRE is not enough). Maven is not
required; the wrapper downloads it.

```bash
cd backend
./mvnw spring-boot:run
```

Then open <http://localhost:8080>. On Windows use `mvnw.cmd spring-boot:run`. The server serves the frontend
straight from `../frontend`, so frontend edits only need a browser refresh.

To build a single runnable jar (frontend bundled inside):

```bash
cd backend
./mvnw package
java -jar target/leetcode-visualizer-0.1.0.jar
```

**JavaScript only:** JavaScript is traced entirely in the browser, so the frontend works without the backend.
Serve the folder over HTTP (Web Workers don't load from `file://`), for example `npx serve frontend` or
`python -m http.server -d frontend`. If the Java backend runs elsewhere, set its URL under ⚙ Settings.

### Tests

```bash
cd backend && ./mvnw test           # Java tracer end to end: real javac, real sandboxed JVM, real JDI
node --test frontend/tests/jsTracer.test.cjs   # JavaScript instrumenter + tracer
```

## Using it

- **Examples ▾** loads ten problems in the spec's milestone order (Two Sum, Fibonacci, Binary Search, Reverse
  Linked List, Level Order, Number of Islands, Path in Graph, LCS, Valid Parentheses, Kth Largest), each in
  Java and JavaScript.
- **Test cases** accept JSON (`{"nums": [2,7], "target": 9}`) or LeetCode's own format
  (`nums = [2,7], target = 9`). Values are matched to parameters by name. `ListNode`/`TreeNode` parameters are
  built from arrays (level order for trees): in Java from the parameter type, in JavaScript from the JSDoc
  `@param {ListNode}` annotation LeetCode templates include.
- **Run** (`Ctrl+Enter`) traces the selected case; **Run all** checks every case against its expected output.
- Step with `←` / `→`, play/pause with `Space`, jump with `Home` / `End`, or click/drag the timeline. Tick
  colour is the event type and tick height is the call depth, so loops and recursion are visible at a glance.
- The editor marks the line **about to run** (▶) and the line that **just ran** (●). The step bar says what
  that line did: `map.containsKey(7) → false`, `nums[2] = 5`, `stack.pop() → 3`, `dp[2][3] = 2 ← dp[1][2], dp[2][2]`.
- Views with more than one sensible drawing have a toggle (a list of lists as table or graph, a priority
  queue as array or heap tree).

## Architecture

```
frontend/                      backend/  (Spring Boot 4, Java 21+)
  js/app.js        wiring        controller/ExecutionController   REST API
  js/api.js        Java→REST,    service/ExecutionService         bounded queue, polling, cancel
                   JS→Worker     service/TraceService             prepare → compile → vet → trace → result
  js/runners/      JS engine     service/SandboxService           temp dirs, javac, child JVM, cleanup
  js/state/        state builder instrumentation/JavaInstrumenter LeetCode-style wrapping, helper types
  js/visualizers/  renderers     instrumentation/TraceCollector   JDI event loop (the tracer)
  js/components/   UI panels     instrumentation/HeapReader       values + collections → heap snapshot
                                 security/SandboxPolicy           bytecode API deny-list
                                 resources/sandbox/lcvharness     harness running inside the child JVM
```

### Java engine (JVM debugger)

1. `JavaInstrumenter` adds LeetCode's default imports, wraps a bare method in `class Solution`, and adds
   `ListNode`/`TreeNode` if used but not declared. Everything is inserted on line 1 or in separate files, so
   line numbers match the editor exactly.
2. The code is compiled in-process (`-g -parameters -proc:none`), then every class file is **vetted**
   (see Security).
3. A fresh JVM starts suspended under JDWP and connects back to the server. The harness converts the JSON test
   case into typed arguments (by reflection on the parameter types), then calls the solution between two
   breakpoint anchors, `begin()` and `end()`.
4. `TraceCollector` line-steps through user code only (JDK and harness classes are stepped over; lambdas and
   comparators you pass to library code are still traced). Method entry/exit events keep a shadow call stack,
   so every call gets a stable id: that's what the recursion tree is built from. Because line stepping never
   stops inside a one-line loop, each method's bytecode is scanned for same-line back-edges and those loop
   heads get breakpoints, so `for (int x : a) s += x;` still yields a frame per iteration.
5. At every pause, `HeapReader` snapshots all user frames' locals and everything reachable from them.
   Collections are read **through their internal fields** (never by invoking methods in the target VM), which
   covers `ArrayList`, `LinkedList`, `ArrayDeque`, `Stack`, `PriorityQueue`, `HashMap`/`LinkedHashMap`/`TreeMap`,
   sets, immutable collections, and `StringBuilder`. A variable's declared type refines the kind (a `LinkedList`
   declared as `Queue` is drawn as a queue).
6. `System.out` goes to a size-capped buffer the debugger reads at each step, so printed output is attributed to
   the exact frame that printed it.

### JavaScript engine (instrumentation in a Web Worker)

`jsInstrumenter.js` parses with acorn and rewrites the AST so every statement, loop test, call, and return
reports to a tracer, then regenerates code with astring. Each pause point carries a closure over the variables
in scope at that point, so caller frames are re-read live while callees run. `jsTracer.js` builds snapshots in
exactly the same format the Java backend returns. Each run gets its own worker, which the page kills on
timeout or cancel.

### The trace format

Both engines return the same `ExecutionResult` (see `backend/.../model`). Each step is a full snapshot: event
(`FUNCTION_ENTER`, `LINE`, `FUNCTION_EXIT`, `EXCEPTION`), line, call stack with locals, the reachable heap, and
new output. Values use a small neutral encoding: numbers/booleans/null, `{"c":"x"}` chars, `{"str":"…"}`
strings, `{"ref":"id"}` heap references.

The **state builder** (`js/state/executionState.js`) diffs consecutive snapshots to derive the semantic
events from the spec (`ARRAY_WRITE`, `ARRAY_SWAP`, `MAP_PUT`, `MAP_REMOVE`, `SET_ADD`, `STACK_PUSH`/`POP`,
`QUEUE_PUSH`/`POP`, `POINTER_UPDATE`, `OBJECT_CREATE`, `VARIABLE_DECLARE`/`UPDATE`, `PRINT`,
`CONDITION_TRUE`/`FALSE`, `LOOP_ENTER`/`ITERATION`/`EXIT`, …). Doing this in one language-neutral place is
what keeps Java and JavaScript behaving identically. `sourceAnalysis.js` adds the code-driven part: which
variables index which arrays (pointers), what the previous line read (`nums[i]`, `dp[i-1][j]`, `map.get(k)`),
and where blocks end.

### Structure detection

`StructureDetector.js` picks a view from runtime shape and references, not names:

| Runtime shape | View |
|---|---|
| array / list of scalars | array with pointers, range shading, reads/writes/swaps |
| array/list of arrays of scalars | table (DP/grid); ragged lists of in-range ints default to graph |
| map / set / plain JS object of scalars | key–value table / chips, with lookups and misses |
| stack; deque used via push/pop | vertical stack |
| queue / deque | horizontal queue with front/back |
| priority queue | backing array or heap tree |
| objects with one self-typed link | linked list (one row per chain) |
| objects with two self-typed links | binary tree (visited = in a set, queued = in a queue) |
| objects with a list of self-typed nodes | graph |
| map of key → list of keys | adjacency graph |

Variable names are only used as labels, and as a tie-breaker for fields that are `null` in every instance
(a runtime value can't reveal the type of a field that's always null).

## Security model

Running untrusted code is the risky part, so the Java backend layers several defences:

- **Bytecode vetting** before anything runs (`SandboxPolicy`). Every class, field, and method a class file can
  touch appears in its constant pool, so filesystem (`java.io.File*`, `java.nio.file`), network (`java.net`),
  processes, reflection, `MethodHandles`, class loading, threads/executors, FFM/native access, `System.exit`,
  `getenv`, and similar are rejected with the offending line.
- **Process isolation**: one short-lived JVM per run with an empty environment, its own temp working
  directory, `-Xmx128m`, capped metaspace and stack, and one CPU.
- **Limits**: wall-clock timeout (20 s), step limit (5000), output cap (64 KB), heap-snapshot caps, a bounded
  execution queue (2 concurrent, 16 queued, then HTTP 429).
- Forced kill and recursive cleanup after every run; the child connects out to the debugger, so it never
  opens a listening port.

What this does **not** give you: OS-level isolation. Modern JDKs no longer ship a SecurityManager, so
filesystem and network restrictions come from the bytecode policy rather than the kernel. That's fine for
running it on your own machine, but **before exposing it to other users**, run the backend (or just its child
JVMs) in a container with no network, a read-only root filesystem, and cgroup CPU/memory/pid limits (for
example `docker run --network none --read-only --pids-limit 64 --memory 512m …`).

JavaScript runs in the visitor's own browser, in a Web Worker with network APIs removed, so it can't reach
the server at all.

## Status against the spec

- **Phase 1** (Java + JavaScript, arrays, variables, calls, call stack, recursion, console, line highlight,
  playback): done.
- **Phase 2** (HashMap/HashSet, Stack, Queue, Linked List, objects, heap view): done.
- **Phase 3** (trees, graphs, DP tables, pointers/references, automatic structure detection): done.
- **Phase 4**: multiple test cases are done. C++, Python, saved sessions, and shareable visualizations are not.

API (§36): `POST /api/v1/execution/run` (waits up to 20 s, else returns `QUEUED`/`RUNNING` to poll),
`GET /api/v1/execution/{id}`, `POST /api/v1/execution/{id}/cancel`, `GET /api/v1/health`.

## Known limitations

- JavaScript is traced in the browser rather than through the backend API. The spec routes all languages
  through the server; doing JS client-side keeps it sandboxed in the user's browser and working offline, and
  the result format is identical.
- Java traces the solution's thread only. Field initializers of `Solution` run before tracing starts (their
  values still show under `this`).
- Read detection comes from the source text: simple index expressions (`a[i-1]`, `dp[i][j-1]`,
  `list.get(k)`, `map.get(x)`) are recognized; reads hidden inside method calls are not highlighted (writes
  always are, since they come from the snapshot diff).
- Snapshots cap at 400 objects and 256 elements per collection, which is plenty for dry-run-sized inputs but
  truncates huge ones.
- The editor loads Monaco from a CDN; offline, it falls back to a plain textarea editor.
