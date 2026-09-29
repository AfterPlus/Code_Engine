# LeetCode Visualizer — Project Specification

## 1. Project Vision

Build a web application that turns a user's **LeetCode problem + solution code + test cases** into an interactive, step-by-step visual execution.

The core idea is:

> **Paste code → execute it safely → capture program state → convert state into visuals → step through the execution.**

The application should go beyond pattern-based visualizers. Instead of supporting only predefined algorithms such as DFS, BFS, sliding window, or DP, the system should be designed around a **generic execution-tracing engine** so that arbitrary supported code can produce a useful visualization.

The reference product is CodeIntuition, which emphasizes frame-by-frame dry runs, memory, pointers, and recursion. This project should take that idea further by making the visualizer primarily **code-driven rather than pattern-driven**.

Reference: https://www.codeintuition.io/

---

# 2. Main User Experience

The screen should have two major areas.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ LeetCode Visualizer                                      ▶ Run   ⚙ Settings │
├──────────────────────────────┬──────────────────────────────────────────────┤
│                              │                                              │
│ PROBLEM                      │              VISUALIZATION                    │
│                              │                                              │
│ [Problem statement]          │   Array / Tree / Graph / Stack / Memory     │
│                              │                                              │
│ SOLUTION                     │                                              │
│ [Code editor]                │                                              │
│                              │                                              │
│ TEST CASES                   │                                              │
│ [Input / expected output]    │                                              │
│                              │                                              │                                              │
│                              │   Variables | Call Stack | Heap | Console   │
│                              │                                              │
├──────────────────────────────┴──────────────────────────────────────────────┤
│ ◀ Previous     ▶ Play/Pause     Next ▶       Step 17 / 42       Speed 1x   │
└─────────────────────────────────────────────────────────────────────────────┘
```

The UI should remain simple. Avoid making the first version look like a large IDE.

---

# 3. Left Panel

The left side contains three primary sections.

## 3.1 Problem

A text editor/viewer where the user can paste:

- LeetCode problem statement
- Constraints
- Examples
- Notes

Example:

```text
Given an integer array nums and an integer target,
return indices of the two numbers such that they add up to target.
```

## 3.2 My Solution

A code editor.

Initial language support:

1. Java
2. JavaScript

Architecture should make it possible to add:

- C++
- Python
- TypeScript

later.

The editor should support:

- Syntax highlighting
- Line numbers
- Current execution-line highlighting
- Code editing
- Run
- Reset

Recommended frontend editor:

- Monaco Editor

## 3.3 Test Cases

Allow users to define test cases.

Example:

```json
{
  "nums": [2, 7, 11, 15],
  "target": 9
}
```

The user should be able to:

- Add test case
- Delete test case
- Select active test case
- Run selected test case
- See expected output
- See actual output

---

# 4. Right Panel — Visualization Engine

The right side is the heart of the application.

The visualizer should not depend entirely on algorithm detection.

Instead, it should consume a stream of execution events.

```text
User Code
   │
   ▼
Execution Engine
   │
   ▼
Execution Events
   │
   ▼
State Builder
   │
   ▼
Visualization Engine
   │
   ├── Arrays
   ├── Variables
   ├── Call Stack
   ├── Recursion
   ├── Objects
   ├── Linked Lists
   ├── Trees
   ├── Graphs
   ├── Hash Maps
   ├── Queues
   ├── Heaps
   ├── DP Tables
   └── Console
```

This is the most important architectural decision in the project.

---

# 5. Execution Timeline

Every meaningful program operation should become an execution frame.

Example:

```text
Frame 0
nums = [2,7,11,15]
target = 9

Frame 1
i = 0
nums[i] = 2

Frame 2
complement = 7

Frame 3
map = {2 -> 0}

Frame 4
i = 1
nums[i] = 7

Frame 5
complement = 2

Frame 6
map contains 2

Frame 7
return [0,1]
```

The user can navigate:

```text
◀ Previous     ▶ Play     Next ▶
```

Each frame should restore the visual state corresponding to that point in execution.

---

# 6. Visual Components

## 6.1 Array Visualizer

Example:

```text
nums

┌───┬───┬────┬────┐
│ 2 │ 7 │ 11 │ 15 │
└───┴───┴────┴────┘
  ↑
  i

target = 9
```

Support:

- Current index
- Multiple pointers
- Range highlighting
- Read operation
- Write operation
- Swap
- Comparison
- Search
- Sorted/unsorted state

For example:

```text
left                  right
 ↓                      ↓
┌───┬───┬───┬───┬───┐
│ 1 │ 3 │ 5 │ 7 │ 9 │
└───┴───┴───┴───┴───┘
```

---

# 7. Variable Inspector

Show live local/global variables.

```text
VARIABLES

i          3
left       1
right      5
target     9
sum        10
result     false
```

When a value changes, animate/highlight the changed variable.

Example:

```text
sum
9 → 10
```

---

# 8. Function Call Visualization

Every function invocation should be represented.

```text
main()
 │
 └── twoSum(nums, target)
       │
       ├── getComplement()
       │
       └── containsKey()
```

The currently executing function should be visually highlighted.

---

# 9. Recursion Visualization

For recursive code, show the call tree.

Example:

```text
                 fib(4)
                /      \
           fib(3)      fib(2)
           /   \       /   \
       fib(2) fib(1) fib(1) fib(0)
```

Each node should contain:

```text
function
arguments
local variables
return value
status
```

Statuses:

- Active
- Waiting
- Returning
- Completed

The user should be able to see exactly which recursive call caused another call.

---

# 10. Call Stack

Show actual stack frames.

```text
CALL STACK

┌────────────────────────────┐
│ solve(l=0, r=4)            │
│ status: waiting             │
├────────────────────────────┤
│ solve(l=1, r=4)            │
│ status: waiting             │
├────────────────────────────┤
│ solve(l=2, r=4)             │
│ status: ACTIVE              │
└────────────────────────────┘
```

On return:

```text
solve(l=2,r=4)
       │
       ▼
return 7
       │
       ▼
solve(l=1,r=4)
```

---

# 11. Heap / Object Memory

For object-oriented code, display references and objects.

Example:

```text
STACK                         HEAP

node ──────────────────────►  ┌───────────────┐
                              │ Node          │
                              │ value = 10    │
                              │ next ───────┐ │
                              └─────────────│─┘
                                            │
                                            ▼
                              ┌───────────────┐
                              │ Node          │
                              │ value = 20    │
                              │ next = null   │
                              └───────────────┘
```

This is especially important for:

- Linked lists
- Trees
- Graph nodes
- Custom classes
- Objects

---

# 12. HashMap / HashSet Visualizer

Example:

```text
HASH MAP

┌─────────┬─────────┐
│ Key     │ Value   │
├─────────┼─────────┤
│ 2       │ 0       │
│ 7       │ 1       │
└─────────┴─────────┘
```

Visual operations:

```text
GET(2)
  ↓
FOUND
  ↓
value = 0
```

Also visualize:

- put
- get
- remove
- containsKey
- contains

---

# 13. Stack / Queue / Deque

Stack:

```text
┌─────┐
│  8  │ ← TOP
├─────┤
│  5  │
├─────┤
│  2  │
└─────┘
```

Queue:

```text
FRONT                    BACK
  ↓                        ↓
┌─────┬─────┬─────┬─────┐
│  2  │  5  │  8  │  9  │
└─────┴─────┴─────┴─────┘
```

Animate:

- push
- pop
- enqueue
- dequeue
- peek

---

# 14. Linked List Visualizer

```text
head
 ↓
┌──────┐      ┌──────┐      ┌──────┐
│  10  │ ───► │  20  │ ───► │  30  │ ───► null
└──────┘      └──────┘      └──────┘
```

Show pointer changes.

Example:

```text
prev ──► 10
cur  ──► 20
next ──► 30
```

---

# 15. Tree Visualizer

Automatically visualize tree-like structures.

Example:

```text
             8
           /   \
          4     12
         / \    / \
        2   6  10 14
```

Show:

- current node
- visited nodes
- traversal order
- queue/stack
- left/right pointers
- return values

---

# 16. Graph Visualizer

Support adjacency lists and adjacency matrices.

Example:

```text
      0
     / \
    1   2
    |   |
    3---4
```

During DFS:

```text
0 → 1 → 3 → 4 → 2
```

Show:

- current node
- visited set
- traversal order
- queue
- recursion stack
- edge currently being explored

---

# 17. DP Table Visualizer

For dynamic programming, visualize the actual DP structure.

Example:

```text
        ""  A  B  C
    ""   0  0  0  0
    A    0  1  1  1
    B    0  1  2  2
    C    0  1  2  3
```

The current cell should be highlighted.

Show:

```text
dp[i][j]

current:
dp[2][3] = 2

depends on:
dp[1][3]
dp[2][2]
```

The system should support both:

- 1D DP
- 2D DP

without requiring a separate visualization implementation for every problem.

---

# 18. Console / Output

Always provide a small console.

```text
CONSOLE

Running test case 1...

Output:
[0, 1]

Expected:
[0, 1]

✓ PASS
```

Errors should be displayed clearly.

```text
Runtime Error

NullPointerException
Line 27
```

---

# 19. Source Code Highlighting

The currently executing source line should always be highlighted.

Example:

```java
for (int i = 0; i < nums.length; i++) {
    if (map.containsKey(target - nums[i])) {
        return new int[]{map.get(target - nums[i]), i};
    }
}
```

During execution:

```text
▶ if (map.containsKey(target - nums[i]))
```

The visual state and source code must stay synchronized.

---

# 20. Generic Execution Event Model

Do NOT make the visualizer depend on hard-coded LeetCode patterns.

Instead, define a generic event model.

Example:

```json
{
  "step": 17,
  "line": 24,
  "event": "VARIABLE_UPDATE",
  "function": "solve",
  "variables": {
    "i": 3,
    "target": 9
  },
  "memory": {
    "stack": [],
    "heap": []
  }
}
```

Other event types:

```text
PROGRAM_START
PROGRAM_END

FUNCTION_ENTER
FUNCTION_EXIT

VARIABLE_DECLARE
VARIABLE_UPDATE

ARRAY_READ
ARRAY_WRITE
ARRAY_SWAP

OBJECT_CREATE
OBJECT_UPDATE
OBJECT_REFERENCE

MAP_GET
MAP_PUT
MAP_REMOVE

SET_ADD
SET_REMOVE

STACK_PUSH
STACK_POP

QUEUE_PUSH
QUEUE_POP

POINTER_UPDATE

COMPARISON
CONDITION_TRUE
CONDITION_FALSE

LOOP_ENTER
LOOP_ITERATION
LOOP_EXIT

RETURN

EXCEPTION
PRINT
```

The visualizer should consume these events without needing to know the original algorithm.

---

# 21. Execution Engine Architecture

The hardest part of the project is arbitrary-code visualization.

A naive approach would be:

```text
Java code
   ↓
Run Java
   ↓
Try to guess what happened
```

Do not build the system this way.

Instead:

```text
                 ┌──────────────────┐
                 │   Source Code    │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Instrumentation  │
                 │ / Trace Agent    │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Instrumented     │
                 │ Program          │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Execution Trace  │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ State Builder    │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Visual Renderer  │
                 └──────────────────┘
```

For Java, investigate bytecode instrumentation/debugger/JVM tooling rather than trying to parse runtime behavior from stdout.

For JavaScript, use a controlled execution environment and instrumentation around statements/functions/objects.

---

# 22. Java Backend

Recommended backend:

```text
Java
Spring Boot
```

Responsibilities:

- Receive source code
- Receive test case
- Validate request
- Create isolated execution
- Instrument/trace execution
- Enforce timeout
- Enforce memory limits
- Return execution trace
- Return stdout/stderr
- Return result/error

API example:

```http
POST /api/execute
```

Request:

```json
{
  "language": "java",
  "code": "...",
  "testCase": {
    "nums": [2,7,11,15],
    "target": 9
  }
}
```

Response:

```json
{
  "status": "SUCCESS",
  "steps": [],
  "output": [0,1],
  "executionTimeMs": 12
}
```

---

# 23. Frontend

Use:

```text
HTML
CSS
JavaScript
```

Recommended structure:

```text
frontend/
├── index.html
├── css/
│   ├── main.css
│   ├── editor.css
│   └── visualizer.css
│
├── js/
│   ├── app.js
│   ├── api.js
│   ├── player.js
│   │
│   ├── state/
│   │   ├── executionState.js
│   │   └── timeline.js
│   │
│   ├── visualizers/
│   │   ├── ArrayVisualizer.js
│   │   ├── VariableVisualizer.js
│   │   ├── StackVisualizer.js
│   │   ├── HeapVisualizer.js
│   │   ├── RecursionVisualizer.js
│   │   ├── TreeVisualizer.js
│   │   ├── GraphVisualizer.js
│   │   ├── MapVisualizer.js
│   │   ├── QueueVisualizer.js
│   │   └── DPVisualizer.js
│   │
│   └── components/
│       ├── CodeEditor.js
│       ├── ProblemPanel.js
│       ├── TestCasePanel.js
│       ├── TimelineControls.js
│       └── ConsolePanel.js
```

---

# 24. Backend Structure

```text
backend/
├── src/main/java/
│   └── com/leetcodevisualizer/
│       ├── controller/
│       │   └── ExecutionController.java
│       │
│       ├── service/
│       │   ├── ExecutionService.java
│       │   ├── TraceService.java
│       │   └── SandboxService.java
│       │
│       ├── instrumentation/
│       │   ├── JavaInstrumenter.java
│       │   ├── TraceCollector.java
│       │   └── BytecodeTransformer.java
│       │
│       ├── model/
│       │   ├── ExecutionRequest.java
│       │   ├── ExecutionResult.java
│       │   ├── ExecutionStep.java
│       │   ├── VariableState.java
│       │   ├── StackFrame.java
│       │   └── HeapObject.java
│       │
│       └── security/
│           ├── SandboxPolicy.java
│           └── ResourceLimiter.java
│
└── pom.xml
```

---

# 25. Data Model

Core execution step:

```java
class ExecutionStep {
    long step;
    int sourceLine;
    String eventType;
    String functionName;

    Map<String, Object> variables;

    List<StackFrame> callStack;

    Map<String, HeapObject> heap;

    List<MemoryOperation> memoryOperations;

    VisualizationHints visualizationHints;
}
```

The frontend should not need to understand Java-specific internals.

It receives a normalized execution model.

---

# 26. Visualization Hints

The execution engine can provide hints when it knows the semantic type.

Example:

```json
{
  "visualizationHints": {
    "array": "nums",
    "activeIndices": ["i"],
    "highlightRange": [0, 3]
  }
}
```

But hints must be optional.

The generic visualizer should still work when no special hints are provided.

---

# 27. Automatic Data Structure Detection

The system should gradually become capable of recognizing structures from runtime values.

Examples:

```text
int[]        → ArrayVisualizer
ArrayList    → ArrayVisualizer
HashMap      → MapVisualizer
HashSet      → SetVisualizer
Stack        → StackVisualizer
Queue        → QueueVisualizer
Node         → Object/LinkedList/Tree visualizer
Graph        → Graph visualizer
2D int[][]   → Matrix/DP visualizer
```

Important:

Detection should be based on runtime structure and references, not merely variable names.

---

# 28. Step Player

The player should support:

```text
First
Previous
Play
Pause
Next
Last
```

Keyboard shortcuts:

```text
← Previous
→ Next
Space Play/Pause
Home First
End Last
```

Speed:

```text
0.25x
0.5x
1x
2x
4x
```

---

# 29. Execution Step Counter

Display:

```text
Step 27 / 104
```

Also show:

```text
Source line: 18
Function: solve()
Event: ARRAY_READ
```

---

# 30. Timeline

Add a timeline below the visualization.

```text
START ──●──●──●────●──●────●──── END
        1  2  3    4  5    6
```

Users should be able to click any point.

---

# 31. MVP Scope

Do NOT attempt every data structure immediately.

### Phase 1

Support:

- Java
- JavaScript
- Arrays
- Variables
- Function calls
- Call stack
- Recursion
- Console
- Source-line highlighting
- Step-by-step playback

This creates the generic execution framework.

### Phase 2

Add:

- HashMap
- HashSet
- Stack
- Queue
- Linked List
- Objects
- Heap visualization

### Phase 3

Add:

- Trees
- Graphs
- DP tables
- Pointer/reference visualization
- Automatic structure detection

### Phase 4

Add:

- C++
- Python
- Multiple test cases
- Saved sessions
- Shareable visualizations

---

# 32. Security Requirements

This is critical.

The backend will execute user-provided code.

Never execute arbitrary code directly on the main application server.

Use an isolated execution environment.

Requirements:

- Process isolation
- CPU timeout
- Memory limit
- Maximum output size
- Maximum execution steps
- No unrestricted filesystem access
- No unrestricted network access
- Temporary working directory
- Kill runaway processes
- Cleanup after execution

Architecture:

```text
                 API Server
                     │
                     ▼
              Execution Queue
                     │
                     ▼
             Isolated Runner
                     │
          ┌──────────┴──────────┐
          │                     │
       Java Code           JavaScript
          │                     │
          ▼                     ▼
      Sandbox A             Sandbox B
          │                     │
          └──────────┬──────────┘
                     ▼
                Trace JSON
                     │
                     ▼
                  Client
```

---

# 33. Error Handling

The visualizer should distinguish:

```text
Compile Error
Runtime Error
Timeout
Memory Limit
Step Limit
Security Violation
Invalid Input
```

Example:

```text
┌────────────────────────────────────┐
│ Runtime Error                      │
├────────────────────────────────────┤
│ NullPointerException               │
│                                    │
│ Line 32                            │
│ solve()                            │
└────────────────────────────────────┘
```

If an error occurs after several successful steps, the user should still be able to inspect the previous frames.

---

# 34. Design Principles

## Principle 1 — Code is the source of truth

Do not create a different hand-written visualizer for every LeetCode problem.

## Principle 2 — Runtime state drives visuals

The visualization should represent what the program is actually doing.

## Principle 3 — Every frame is inspectable

Users should be able to stop at any step and inspect:

- variables
- stack
- heap
- data structures
- current source line

## Principle 4 — Visualizations should explain, not decorate

Animations must communicate state changes.

## Principle 5 — Keep the UI simple

The user should understand the screen immediately.

---

# 35. Suggested Technology Stack

### Frontend

```text
HTML
CSS
JavaScript
Monaco Editor
SVG / Canvas
```

SVG is preferable for:

- Trees
- Graphs
- Pointer arrows
- Linked lists

Canvas can be useful for:

- Large graphs
- High-volume animations

### Backend

```text
Java
Spring Boot
```

### Execution

```text
Java instrumentation / JVM debugging APIs
JavaScript instrumentation / controlled runtime
```

### Storage — Optional Later

For MVP:

```text
No database required
```

Later:

```text
PostgreSQL
```

for:

- users
- saved problems
- execution sessions
- history

---

# 36. API Design

## Execute

```http
POST /api/v1/execution/run
```

## Get execution

```http
GET /api/v1/execution/{executionId}
```

## Cancel execution

```http
POST /api/v1/execution/{executionId}/cancel
```

## Health

```http
GET /api/v1/health
```

---

# 37. Example End-to-End Flow

User pastes:

```java
int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> map = new HashMap<>();

    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];

        if (map.containsKey(complement)) {
            return new int[]{map.get(complement), i};
        }

        map.put(nums[i], i);
    }

    return new int[]{};
}
```

Test:

```text
nums = [2,7,11,15]
target = 9
```

System produces:

```text
STEP 1

i = 0
nums[i] = 2
target = 9
map = {}

STEP 2

complement = 7

STEP 3

map.containsKey(7)
false

STEP 4

map.put(2,0)

STEP 5

i = 1
nums[i] = 7

STEP 6

complement = 2

STEP 7

map.containsKey(2)
true

STEP 8

return [0,1]
```

And the UI shows the corresponding visual state for every frame.

---

# 38. Important Product Goal

The killer feature should be:

> **"I don't need to manually draw the dry run. The application understands my execution and builds the dry run for me."**

For example, when a user submits a recursive DP solution, the application should automatically expose:

```text
Source code
      │
      ▼
Function calls
      │
      ▼
Recursion tree
      │
      ▼
Call stack
      │
      ▼
Variables
      │
      ▼
DP table
      │
      ▼
Return values
```

The user should be able to switch between these views without rerunning the program.

---

# 39. Recommended First Milestone

Build one complete vertical slice before adding many visualizers.

Use:

**Two Sum in Java**

and support:

```text
Java source
    ↓
Instrumentation
    ↓
Execution trace
    ↓
Variables
    ↓
Array
    ↓
HashMap
    ↓
Call stack
    ↓
Source highlighting
    ↓
Step player
```

Once this works reliably, add recursion using:

**Fibonacci**

Then:

**Binary Search**

Then:

**Linked List**

Then:

**DFS**

Then:

**DP**

This order validates the generic execution architecture before the project becomes large.

---

# 40. Definition of Done for MVP

The MVP is successful if a user can:

1. Open the website.
2. Paste a LeetCode problem.
3. Paste Java solution code.
4. Enter a test case.
5. Click Run.
6. See the code execute.
7. See the current line highlighted.
8. Click Next.
9. See variable values change.
10. See arrays update.
11. See function calls appear.
12. See the call stack change.
13. See recursion visually for recursive code.
14. Play the execution automatically.
15. Pause at any frame.
16. Inspect the complete state.
17. See the final output.
18. Run another test case.

The system should feel like:

```text
Debugger
      +
LeetCode
      +
Algorithm Visualizer
      +
Interactive Dry Run
```

rather than a collection of pre-built algorithm animations.

---

# 41. Long-Term Vision

Eventually the application should support a "Universal Code Visualization" model:

```text
                   ANY SUPPORTED CODE
                           │
                           ▼
                  ┌─────────────────┐
                  │ Execution Trace │
                  └────────┬────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
          Runtime       Memory        Semantic
           State         State          State
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                 Visualization Graph
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
       Arrays           Objects          Control Flow
          │                │                │
          ▼                ▼                ▼
       Pointers          Heap           Recursion
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                    Interactive UI
```

This architecture allows the product to grow from a LeetCode visualizer into a general-purpose **code execution visualization and learning platform**.

---

# 42. Non-Goals for MVP

Do not initially build:

- Social features
- Leaderboards
- User profiles
- Payments
- Large problem database
- AI-generated solutions
- Full IDE
- Cloud deployment orchestration
- Every programming language
- Perfect semantic understanding of arbitrary code

The first priority is:

**Reliable execution tracing + excellent visualization.**

---

# 43. Final Architecture

```text
                         Browser
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
 Problem / Code Editor                    Visualization UI
        │                                       ▲
        │                                       │
        └──────────────► REST API ◄─────────────┘
                              │
                              ▼
                       Spring Boot API
                              │
                              ▼
                     Execution Manager
                              │
                              ▼
                       Isolated Runner
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
              Java Runner            JS Runner
                  │                       │
                  └───────────┬───────────┘
                              ▼
                        Trace Collector
                              │
                              ▼
                        Trace Normalizer
                              │
                              ▼
                         Trace JSON
                              │
                              ▼
                    Frontend State Engine
                              │
             ┌────────────────┼─────────────────┐
             ▼                ▼                 ▼
         Variables        Call Stack          Memory
             │                │                 │
             └────────────────┼─────────────────┘
                              ▼
                    Visualization Renderer
```

## Core idea to protect throughout development

**Do not build 100 separate algorithm visualizers. Build one execution-tracing system that can power 100+ visualizations.**

That is what makes this project substantially more interesting than a normal pattern visualizer.
