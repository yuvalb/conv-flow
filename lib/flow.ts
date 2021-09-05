import { Either, isLeft } from "fp-ts/lib/Either";
import { normalizeError, normalizeResult, partitionArray } from "./util";
import * as _ from "lodash";

export type Layer<T, E> = Either<E, T>[];

export type Layerable<T, E> = (Either<E, T> | T)[] | Either<E, T> | T;

export type Step<S, T, E> = (
  s: S
) => Promise<Layerable<T, E>> | Layerable<T, E>;

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

  then<U>(...flowsOrSteps: Array<FlowOrStep<T, U, E>>): Flow<S, U, E> {
    const flows = _.map(flowsOrSteps, (flowOrStep) =>
      Flow.isFlow<T, U, E>(flowOrStep)
        ? flowOrStep
        : Flow.lift(flowOrStep, this._mapError)
    );

    return this.chain(flows);
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
}
