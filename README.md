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

# Core Concepts (extended)

## Layer

A `layer` of _type_ `S` with _termination_ `E` is an array of either `Right<S>` or `Left<E>`:

```
Layer<S, E>
:= Either<E, S>[]
:= (Left<E> | Right<E>)[];
```

## Flow

A `flow` represents a computation that when applied on an input, results in an output `layer`.

A `flow` with _input_ type `S`, _output_ type `T` and _termination_ `E` can be applied to input of type `S` to return a promise of `Layer<T, E>`:

```ts
Flow<S, T, E>.exec := (S) -> Promise<Layer<T, E>>
```

A `flow` can be **_concatenated_** with another `flow` whose input type matches the first `layer`'s underlying type. The result is also a `flow`.

A `flow`'s `layer` can be **_converged_** into a new `layer` with a flow whose input type is an array of the first's `layer`'s underlying type.

\
Below is a diagram to try to simplify this concept:
\
\
![Flow](./assets/diagram_v1.png)

## Termination

A termination is a `Left` result in a layer, which signifies the computation on this branch has come to an end.

The default termination type is `Error`.

To change the termination type, you must pass the `Flow.lift` function a 2nd argument that maps errors to their new type.

## Concatenation ( + )

## Convergence ( x )

## Layerable

A `layerable` is any type that can be transformed into a `layer`.

`Layerable<T, E>` is either of type `T`, `Either<E, T>` or an array of either:

```
Layerable<T, E>
:= (Either<E, T> | T)[] | Either<E, T> | T;
```

## Step

A `step` is a function that can be lifted into a `flow`.

More specifically, `Step<S, T, E>` is a function from input of type `S` to a `Layerable<T, E>` or a promise of one.

```
Step<S, T, E>
:= (S) => Promise<Layerable<T, E>> | Layerable<T, E>;

```

# Contributors

- [yuvalb](https://github.com/yuvalb) 🦜

( Contributions are welcome 😃🎉 )
