import { Either, isLeft } from "fp-ts/lib/Either";
import { normalizeError, normalizeResult, partitionArray } from "./util";
import * as _ from "lodash";

export type Layer<T, E> = Either<E, T>[];

export type Layerable<T, E> = (Either<E, T> | T)[] | Either<E, T> | T;

export type Step<S, T, E> = (
  s: S
) => PromiseLike<Layerable<T, E>> | Layerable<T, E>;

export type FlowOrStep<S, T, E> = Flow<S, T, E> | Step<S, T, E>;

export class Flow<S, T, E extends unknown = Error> {
  private static _errIdentity = <E extends unknown = Error>(e: Error) => e as E;

  static lift<S, T, E>(
    f: Array<Step<S, T, E>>,
    mapError: (e: Error) => E
  ): Flow<S, T, E>;

  static lift<S, T, E>(
    f: Step<S, T, E>,
    mapError: (e: Error) => E
  ): Flow<S, T, E>;

  static lift<S, T, E extends Error = Error>(
    f: Array<Step<S, T, E>>
  ): Flow<S, T, E>;

  static lift<S, T, E extends Error = Error>(f: Step<S, T, E>): Flow<S, T, E>;

  /**
   * This method lifts a step function or an array of step functions into a new flow.
   *
   * *** Definitions
   *
   * ** Layer
   * A layer of type T with termination E is an array of either values of type T
   * that signifiy an ongoing computation, or values of type E which signify terminated
   * computations.
   *
   * i.e.
   * Layer<T, E> := Array of Either<E, T>
   *
   * where:
   * * Left<E> values are terminated computations and are piped through steps to the next layer.
   * * Right<T> values are results of ongoing, passable computations.
   *
   * ** Layerable
   * A Layerable is a value that can be normalized into a Layer.
   *
   * As a layer is an array of Either value T or termination E, values that can become
   * an array of Eithers are:
   * * A single or array of either values of type T or terminations of type E
   * * A single or array of values of type T
   *
   * ** Step
   * A step function from type S to type T with termination type E,
   * is a function from input of type S to a Layerable<T, E> or a promise of one.
   *
   * ** Flow
   * A flow from type S to type T with termination E is a computational unit that
   * when executed on input of type S, it returns a layer of either ongoing values of type T,
   * or terminations of type E
   *
   * @param stepFunctions Steps or array of steps from type S to type T with termination E
   * @param mapError A function to map errors into terminations of type E
   * @returns A flow from input of type S to layer of type T
   */
  static lift<S, T, E = Error>(
    stepFunctions: Array<Step<S, T, E>> | Step<S, T, E>,
    mapError: (e: Error) => E = Flow._errIdentity
  ): Flow<S, T, E> {
    // Normalize stepFunctions to be of type array
    const nStepFunctions = Array.isArray(stepFunctions)
      ? stepFunctions
      : [stepFunctions];

    return new Flow((s: S) => {
      // Collect step function results, both promises and primitives.
      const results = _.map(nStepFunctions, (step) => {
        try {
          return step(s);
        } catch (e) {
          return normalizeError(mapError)(e); // Wrap errors with injected mapError function
        }
      });

      // Normalize all results to be Promises (with primitives being pre-resolved)
      const promiseResults = _.map(results, (result) =>
        Promise.resolve(result)
          .then((_) => normalizeResult<T, E>(_))
          .catch(normalizeError<E, T>(mapError))
      );

      // Collect and then flatten the layer
      const layer: Promise<Layer<T, E>> = Promise.all(promiseResults).then(
        _.flatten
      );

      return layer;
    }, mapError);
  }

  static isFlow<S, T, E>(
    maybeFlow: Flow<S, T, E> | any
  ): maybeFlow is Flow<S, T, E> {
    const flow = maybeFlow as Flow<S, T, E>;
    return flow._f !== undefined && flow._mapError !== undefined;
  }

  private constructor(
    private readonly _f: (s: S) => Promise<Layer<T, E>>,
    private readonly _mapError: (e: Error) => E = Flow._errIdentity
  ) {}

  private chain<U>(flows: Array<Flow<T, U, E>>): Flow<S, U, E> {
    return new Flow((s: S) =>
      this._f(s).then(async (results) => {
        const [lefts, rights] = partitionArray(results, isLeft);

        const rightValues = _.map(rights, (_) => _.right);

        const rightRuns: Promise<Layer<U, E>>[] = _.flatMap(
          rightValues,
          (rightValue) =>
            flows.map(async (flow) =>
              flow.exec(rightValue).catch(normalizeError<E, U>(this._mapError))
            )
        );

        const rightResults = await Promise.all(rightRuns);

        return (<Layer<U, E>>lefts).concat(...rightResults);
      })
    );
  }

  then<U>(...flowsOrSteps: Array<FlowOrStep<T, U, E>>): Flow<S, U, E> {
    const flows = _.map(flowsOrSteps, (flowOrStep) =>
      Flow.isFlow<T, U, E>(flowOrStep)
        ? flowOrStep
        : Flow.lift(flowOrStep, this._mapError)
    );

    return this.chain(flows);
  }

  private converge<U>(flows: Array<Flow<T[], U, E>>): Flow<S, U, E> {
    return new Flow((s: S) =>
      this._f(s).then(async (tArr) => {
        const [lefts, rights] = partitionArray(tArr, isLeft);

        const rightValues = _.map(rights, (_) => _.right);

        const rightRuns = _.flatMap(flows, (flow) =>
          flow.exec(rightValues).catch(normalizeError(this._mapError))
        );

        const rightResults = await Promise.all(rightRuns);

        return (<Layer<U, E>>lefts).concat(...rightResults);
      })
    );
  }

  to<U>(...flowsOrSteps: Array<FlowOrStep<T[], U, E>>): Flow<S, U, E> {
    const flows = _.map(flowsOrSteps, (flowOrStep) =>
      Flow.isFlow<T[], U, E>(flowOrStep)
        ? flowOrStep
        : Flow.lift(flowOrStep, this._mapError)
    );
    return this.converge(flows);
  }

  exec(s: S): Promise<Layer<T, E>> {
    return this._f(s);
  }
}
