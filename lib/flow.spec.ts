import * as assert from "assert";
import { isLeft, isRight, left, Left, Right } from "fp-ts/lib/Either";
import * as _ from "lodash";
import { Flow } from "./flow";
import { isEither, partitionArray } from "./util";

describe("flow", () => {
  const num = Math.random();
  const arr = [1, 2, 3, 4, 5];
  const flow = Flow.lift<void, number>(() => arr);

  const err = new Error("oops");
  const ferr = (e: Error) => ({ err });
  const errFlow = () => {
    throw err;
  };

  it("should lift a unit result to array", async () => {
    const results = await Flow.lift<void, number>(() => num).exec();
    assert.equal(Array.isArray(results), true);
    assert.equal(isEither(results[0]), true);
  });

  it("should lift a function", async () => {
    const results = await Flow.lift<void, number>(() => num).exec();
    assert.equal(results.length, 1);
    assert.equal(isRight(results[0]), true);
    assert.equal((<Right<number>>results[0]).right, num);
  });

  it("should lift an array of functions", async () => {
    const f1 = (x: number): number => 10 * x;
    const f2 = (x: number): number => f1(f1(x));
    const functions = [f1, f2];
    const num = 5;

    const results = await Flow.lift<number, number>(functions).exec(num);
    const [rights] = partitionArray(results, isRight);
    const rightValues = _.map(rights, (_) => _.right);

    assert.equal(results.length, functions.length);
    assert.equal(results.length, rightValues.length);

    functions.forEach((f) => assert.equal(_.includes(rightValues, f(num)), true));
  });

  it("should terminate on left output", async () => {
    const termination = { err: "oops" };
    const results = await Flow.lift<void, number, { err: string }>(
      () => left(termination),
      (e: Error) => ({ err: e.message })
    ).exec();
    assert.equal(results.length, 1);
    assert.equal(isLeft(results[0]), true);
    assert.equal((<Left<{ err: string }>>results[0]).left, termination);
  });

  describe("errors", () => {
    it("should return the mapped termination", async () => {
      const results = await Flow.lift((_: void) => {
        throw err;
      }, ferr).exec();
      assert.equal(results.length, 1);
      assert.equal(isLeft(results[0]), true);
      assert.deepEqual((<Left<{ err: typeof err }>>results[0]).left, ferr(err));
    });

    it("should return a Left error on erroneous function with no specified error mapper", async () => {
      const results = await Flow.lift((_: void) => {
        throw err;
      }).exec();
      assert.equal(results.length, 1);
      assert.equal(isLeft(results[0]), true);
      assert.equal((<Left<Error>>results[0]).left, err);
    });

    it("should return partial results on partially failing lifted flows", async () => {
      const num = Math.random();
      const succeeding = (_: void) => num;
      const failing = (_: void) => {
        throw err;
      };

      const results = await Flow.lift([failing, succeeding]).exec();
      const [lefts, rights] = partitionArray(results, isLeft);
      const leftValues = _.map(lefts, (_) => _.left);
      const rightValues = _.map(rights, (_) => _.right);

      assert.equal(results.length, 2);
      assert.equal(leftValues.length, 1);
      assert.equal(_.includes(leftValues, err), true);
      assert.equal(rightValues.length, 1);
      assert.equal(_.includes(rightValues, num), true);
    });

    it("should return the mapped termination on multiple flows", async () => {
      const f = (_: void) => {
        throw err;
      };
      const functions = [f, f];
      const results = await Flow.lift(functions, ferr).exec();
      const [lefts] = partitionArray(results, isLeft);
      const leftValues = _.map(lefts, (_) => _.left);

      assert.equal(results.length, 2);
      assert.equal(leftValues.length, results.length);
      leftValues.forEach((leftValue) => assert.deepEqual(leftValue, ferr(err)));
    });
  });

  describe("chain, then", () => {
    it("should split the results", async () => {
      const results = await flow.exec();
      assert.equal(results.length, arr.length);
      assert.equal(results.filter(isRight).length, arr.length);
      assert.equal(
        results.filter((r, idx) => (<Right<number>>r).right === arr[idx]).length,
        arr.length
      );
    });

    it("should apply the function on every result", async () => {
      const results = await flow.then((x) => x + 1).exec();
      assert.equal(results.length, arr.length);
      assert.equal(
        results.filter((r, idx) => (<Right<number>>r).right === arr[idx] + 1).length,
        arr.length
      );
    });

    it("should pass on its error mapper", async () => {
      const results = await Flow.lift((_: void) => 5, ferr)
        .then(errFlow)
        .exec();
      assert.equal(results.length, 1);
      assert.equal(isLeft(results[0]), true);
      assert.deepEqual((<Left<ReturnType<typeof ferr>>>results[0]).left, ferr(err));
    });

    it("should run multiple flows", async () => {
      const f1 = (x: number) => x * 10;
      const f2 = (x: number) => f1(f1(x));

      const results = await flow.then(f1, f2).exec();
      const [rights] = partitionArray(results, isRight);

      assert.equal(results.length, rights.length);
      assert.equal(rights.length, 2 * arr.length);

      const rightValues = _.map(rights, (r) => r.right);

      const firstMatches = _.intersection(arr.map(f1), rightValues);
      const secondMatches = _.intersection(arr.map(f2), rightValues);

      assert.equal(firstMatches.length, arr.length);
      assert.equal(secondMatches.length, arr.length);
    });

    describe("errors", () => {
      const errSyncFlow = () => {
        throw err;
      };
      const errAsyncFlow = async () => {
        throw err;
      };

      it("should pass error on erroneous sync flow", async () => {
        const results = await flow.then(errSyncFlow).exec();
        assert.equal(results.length, arr.length);
        assert.equal(results.filter(isLeft).length, arr.length);
        assert.equal(
          results.filter((r) => (<Left<Error>>r).left === err).length,
          arr.length
        );
      });

      it("should pass error on erroneous async flow", async () => {
        const results = await flow.then(errAsyncFlow).exec();
        assert.equal(results.length, arr.length);
        assert.equal(results.filter(isLeft).length, arr.length);
        assert.equal(
          results.filter((r) => (<Left<Error>>r).left === err).length,
          arr.length
        );
      });

      it("should pass erros of subset of failing flows", async () => {
        const f1 = (x: number) => x * 10;
        const f2 = (x: number) => {
          throw err;
        };

        const results = await flow.then(f1, f2).exec();
        const [lefts, rights] = partitionArray(results, isLeft);

        assert.equal(results.length, rights.length + lefts.length);
        assert.equal(rights.length, arr.length);
        assert.equal(lefts.length, arr.length);

        const rightValues = _.map(rights, (r) => r.right);
        const leftValues = _.map(lefts, (l) => l.left);

        const firstMatches = _.intersection(arr.map(f1), rightValues);
        const secondMatches = _.filter(leftValues, (lv) => lv === err);

        assert.equal(firstMatches.length, arr.length);
        assert.equal(secondMatches.length, arr.length);
      });
    });
  });

  describe("converge, to", () => {
    it("should converge multiple results to a single result", async () => {
      const results = await flow.to((nums) => num).exec();
      assert.equal(results.length, 1);
      assert.equal(isRight(results[0]), true);
      assert.equal((<Right<number>>results[0]).right, num);
    });

    it("should converge multiple results to multiple results", async () => {
      const results = await flow.to((nums) => arr).exec();
      assert.equal(results.length, arr.length);
      assert.equal(results.filter(isRight).length, arr.length);
      assert.equal(
        results.filter((r, idx) => (<Right<number>>r).right === arr[idx]).length,
        arr.length
      );
    });

    it("should apply multiple flows on multiple results to turn to multiple results", async () => {
      const f1 = (nums: number[]) => _.map(nums, (x) => 10 * x);
      const f2 = (nums: number[]) => f1(f1(nums));

      const results = await flow.to(f1, f2).exec();
      const [rights] = partitionArray(results, isRight);
      const rightValues = _.map(rights, (_) => _.right);

      assert.equal(results.length, 2 * arr.length);
      assert.equal(_.filter(results, isRight).length, results.length);

      const f1Results = _.intersection(rightValues, f1(arr));
      const f2Results = _.intersection(rightValues, f2(arr));

      assert.equal(f1Results.length, arr.length);
      assert.equal(f2Results.length, arr.length);
    });

    describe("errors", () => {
      it("should converge to a single error on erroneous flow", async () => {
        const results = await flow.to(errFlow).exec();
        assert.equal(results.length, 1);
        assert.equal(isLeft(results[0]), true);
        assert.equal((<Left<Error>>results[0]).left, err);
      });

      it("should converge to partial erroneous results on partially halting flows", async () => {
        const f1 = (nums: number[]) => _.map(nums, (x) => 10 * x);

        const results = await flow.to(f1, errFlow).exec();
        const [lefts, rights] = partitionArray(results, isLeft);
        const leftValues = _.map(lefts, (_) => _.left);
        const rightValues = _.map(rights, (_) => _.right);

        assert.equal(results.length, arr.length + 1);
        assert.equal(lefts.length, 1);
        assert.equal(rights.length, arr.length);
        assert.equal(_.first(leftValues), err);
      });
    });
  });

  describe("exec", () => {
    it("should pass the initial value along", async () => {
      const results = await Flow.lift((_: void) => num).exec();
      assert.equal(results.length, 1);
      assert.equal(isRight(results[0]), true);
      if (isRight(results[0])) {
        assert.equal(results[0].right, num);
      }
    });

    describe("errors", () => {
      it("should return Left with error on erroneous flow", async () => {
        const results = await flow.then(errFlow).exec();
        assert.equal(results.length, arr.length);
        assert.equal(isLeft(results[0]), true);
        assert.equal(
          results.filter((r) => (<Left<Error>>r).left === err).length,
          arr.length
        );
      });
    });
  });
});
