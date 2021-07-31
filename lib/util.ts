import { Either, isLeft, isRight, left, right } from "./";
import { Layerable, Layer } from ".";

export const isEither = <E = never, A = never>(
  e: Either<E, A> | A | undefined
): e is Either<E, A> =>
  !!e && (isRight(e as Either<E, A>) || isLeft(e as Either<E, A>));

export const liftEither = <E = never, A = never>(
  le: Either<E, A> | A
): Either<E, A> => (isEither(le) ? le : right(le));

export const normalizeResult = <T, E>(r: Layerable<T, E>): Layer<T, E> => {
  if (Array.isArray(r)) {
    return (r as (Either<E, T> | T)[]).map((k: Either<E, T> | T) =>
      liftEither(k)
    );
  } else {
    return [liftEither(r)];
  }
};

export function normalizeError<E, T = any>(
  mapError: (e: Error) => E
): (e: Error) => Layer<T, E> {
  return (e: Error) => [left(mapError(e))];
}

export const partitionArray = <T, A extends T>(
  arr: T[],
  predicate: (t: T) => t is A
): [A[], Exclude<T, A>[]] =>
  arr.reduce(
    (acc, t) => {
      if (predicate(t)) {
        acc[0].push(t);
      } else {
        acc[1].push(t as Exclude<T, A>);
      }
      return acc;
    },
    [[] as A[], [] as Exclude<T, A>[]]
  );

export const flatten = <T>(arr: T[][]): T[] =>
  arr.reduce((acc, a) => acc.concat(a), []);
