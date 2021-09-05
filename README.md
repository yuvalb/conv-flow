# conv-flow

A node library for managing procedural, asynchronous and strongly-typed flows.

# Requirements

- Understanding of the [**Either pattern**](https://gcanti.github.io/fp-ts/modules/Either.ts.html).
- (Optional) **typescript**

# Quick Start

## Install

```sh
npm i conv-flow
```

## Lift and execute a flow

```ts
import { Flow } from "conv-flow";

const print = (message: string) => console.log(message + " world!");

const printFlow = Flow.lift(print);

await printFlow.exec("Hello");
```

```ts
// console: "Hello world!"
```

# Examples

### Lifting functions and executing flows

```ts
// Lift functions to flows
let f: (s: S) => T; // S -> T
const flow1: Flow<S, T> = Flow.lift(f); // S -> T

// Execute flows
let s: S;
const result: Layer<T, E> = await flow1.exec(s);
```

### Layers are flat

```ts
let f: (s: S) => T;
let fArr: (s: S) => T[];

const flow: Flow<S, T> = Flow.lift(f);
const flowArr: Flow<S, T> = Flow.lift(fArr); // Same layer type!
```

### Concatenation

```ts
// Define function `g` from T to U
let g: (t: T) => U;
const flow2: Flow<T, U> = Flow.lift(g);

// Concat flows together
const flow3: Flow<S, U> = flow1.then(flow2);
const flow4: Flow<S, U> = flow1.then(flow2, flow2, flow2); // Layer type is unchanged

// Concat flows with functions
const flow5: Flow<S, U> = flow1.then(g);
const flow6: Flow<S, U> = flow1.then(g, g, g); // Layer type is unchanged
```

# More Examples

## Combine flows together

```ts
await emit.then(print).exec();

// "a"
// "b"
// "c"
```

## Flows are type safe

```ts

```

# Advanced Examples

### Coalescence

```ts
// Converge flows
```

### Either results

```ts

```

### Array units

```ts
const emit1 = Flow.lift<void, string>(() => "a"); // Emits 1 string

const emit3 = Flow.lift<void, string>(() => ["a", "b", "c"]); // Emits 3 strings

const emitArr = Flow.lift<void, string[]>(() => [["a", "b", "c"]]); // Emits 1 array
```

- Concating varying flows / then
- Converging flows
- Terminations
  - mapError

# Contributors

- [yuvalb](https://github.com/yuvalb) 🦜

( Contributions are welcome 😃🎉 )
