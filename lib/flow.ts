import { Either, isLeft } from "fp-ts/lib/Either";
import { normalizeError, normalizeResult, partitionArray } from "./util";
import * as _ from "lodash";

export type Layerable<T, E> = Either<E, T>[] | T[] | Either<E, T> | T;
export type Layer<T, E> = Either<E, T>[];

export type Step<S, T, E> = (s: S) => Layerable<T, E> | PromiseLike<Layerable<T, E>>;
export type Source<T, E> = Step<void, T, E>;
export type FlowOrStep<S, T, E> = Flow<S, T, E> | Step<S, T, E>;

export class Flow<S, T, E extends unknown = Error> {
  private static _errIdentity = <E extends unknown = Error>(e: Error) => e as E;

  static lift<S, T, E>(
    f: Array<(s: S) => Layerable<T, E> | PromiseLike<Layerable<T, E>>>,
    mapError: (e: Error) => E
  ): Flow<S, T, E>;
  static lift<S, T, E>(
    f: (s: S) => Layerable<T, E> | PromiseLike<Layerable<T, E>>,
    mapError: (e: Error) => E
  ): Flow<S, T, E>;
  static lift<S, T, E extends Error = Error>(
    f: Array<(s: S) => Layerable<T, E> | PromiseLike<Layerable<T, E>>>
  ): Flow<S, T, E>;
  static lift<S, T, E extends Error = Error>(
    f: (s: S) => Layerable<T, E> | PromiseLike<Layerable<T, E>>
  ): Flow<S, T, E>;

  static lift<S, T, E = Error>(
    flowFunctions:
      | Array<(s: S) => Layerable<T, E> | PromiseLike<Layerable<T, E>>>
      | ((s: S) => Layerable<T, E> | PromiseLike<Layerable<T, E>>),
    mapError: (e: Error) => E = Flow._errIdentity
  ): Flow<S, T, E> {
    const nFlowFunctions = Array.isArray(flowFunctions)
      ? flowFunctions
      : [flowFunctions];

    return new Flow((s: S) => {
      const results = _.map(nFlowFunctions, (_) => {
        try {
          return _(s);
        } catch (e) {
          return normalizeError(mapError)(e);
        }
      });

      const promiseResults = _.map(results, (result) => Promise.resolve(result));

      const normalizedResults = _.map(promiseResults, (_) =>
        _.then(normalizeResult).catch(normalizeError(mapError))
      );

      return Promise.all(normalizedResults).then(_.flatten);
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

  private chain<U>(flows: Flow<T, U, E>[]): Flow<S, U, E> {
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

  then<U>(...flowsOrSteps: Array<Flow<T, U, E> | Step<T, U, E>>): Flow<S, U, E> {
    const flows = _.map(flowsOrSteps, (flowOrStep) =>
      Flow.isFlow<T, U, E>(flowOrStep)
        ? flowOrStep
        : Flow.lift(flowOrStep, this._mapError)
    );

    return this.chain(flows);
  }

  private converge<U>(flows: Flow<T[], U, E>[]): Flow<S, U, E> {
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

  to<U>(...flowsOrSteps: Array<Flow<T[], U, E> | Step<T[], U, E>>): Flow<S, U, E> {
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
