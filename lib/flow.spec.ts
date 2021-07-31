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
    assert.strictEqual(Array.isArray(results), true);
    assert.strictEqual(isEither(results[0]), true);
  });

  it("should lift a function", async () => {
    const results = await Flow.lift<void, number>(() => num).exec();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(isRight(results[0]), true);
    assert.strictEqual((<Right<number>>results[0]).right, num);
  });

  it("should lift an array of functions", async () => {
    const f1 = (x: number): number => 10 * x;
    const f2 = (x: number): number => f1(f1(x));
    const functions = [f1, f2];
    const num = 5;

    const results = await Flow.lift<number, number>(functions).exec(num);
    const [rights] = partitionArray(results, isRight);
    const rightValues = _.map(rights, (_) => _.right);

    assert.strictEqual(results.length, functions.length);
    assert.strictEqual(results.length, rightValues.length);

    functions.forEach((f) =>
      assert.strictEqual(_.includes(rightValues, f(num)), true)
    );
  });

  it("should terminate on left output", async () => {
    const termination = { err: "oops" };
    const results = await Flow.lift<void, number, { err: string }>(
      () => left(termination),
      (e: Error) => ({ err: e.message })
    ).exec();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(isLeft(results[0]), true);
    assert.strictEqual((<Left<{ err: string }>>results[0]).left, termination);
  });

  describe("errors", () => {
    it("should return the mapped termination", async () => {
      const results = await Flow.lift((_: void) => {
        throw err;
      }, ferr).exec();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(isLeft(results[0]), true);
      assert.deepStrictEqual(
        (<Left<{ err: typeof err }>>results[0]).left,
        ferr(err)
      );
    });

    it("should return a Left error on erroneous function with no specified error mapper", async () => {
      const results = await Flow.lift((_: void) => {
        throw err;
      }).exec();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(isLeft(results[0]), true);
      assert.strictEqual((<Left<Error>>results[0]).left, err);
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

      assert.strictEqual(results.length, 2);
      assert.strictEqual(leftValues.length, 1);
      assert.strictEqual(_.includes(leftValues, err), true);
      assert.strictEqual(rightValues.length, 1);
      assert.strictEqual(_.includes(rightValues, num), true);
    });

    it("should return the mapped termination on multiple flows", async () => {
      const f = (_: void) => {
        throw err;
      };
      const functions = [f, f];
      const results = await Flow.lift(functions, ferr).exec();
      const [lefts] = partitionArray(results, isLeft);
      const leftValues = _.map(lefts, (_) => _.left);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(leftValues.length, results.length);
      leftValues.forEach((leftValue) => assert.deepEqual(leftValue, ferr(err)));
    });
  });

  describe("chain, then", () => {
    it("should split the results", async () => {
      const results = await flow.exec();
      assert.strictEqual(results.length, arr.length);
      assert.strictEqual(results.filter(isRight).length, arr.length);
      assert.strictEqual(
        results.filter((r, idx) => (<Right<number>>r).right === arr[idx])
          .length,
        arr.length
      );
    });

    it("should apply the function on every result", async () => {
      const results = await flow.then((x) => x + 1).exec();
      assert.strictEqual(results.length, arr.length);
      assert.strictEqual(
        results.filter((r, idx) => (<Right<number>>r).right === arr[idx] + 1)
          .length,
        arr.length
      );
    });

    it("should pass on its error mapper", async () => {
      const results = await Flow.lift((_: void) => 5, ferr)
        .then(errFlow)
        .exec();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(isLeft(results[0]), true);
      assert.deepEqual(
        (<Left<ReturnType<typeof ferr>>>results[0]).left,
        ferr(err)
      );
    });

    it("should run multiple flows", async () => {
      const f1 = (x: number) => x * 10;
      const f2 = (x: number) => f1(f1(x));

      const results = await flow.then(f1, f2).exec();
      const [rights] = partitionArray(results, isRight);

      assert.strictEqual(results.length, rights.length);
      assert.strictEqual(rights.length, 2 * arr.length);

      const rightValues = _.map(rights, (r) => r.right);

      const firstMatches = _.intersection(arr.map(f1), rightValues);
      const secondMatches = _.intersection(arr.map(f2), rightValues);

      assert.strictEqual(firstMatches.length, arr.length);
      assert.strictEqual(secondMatches.length, arr.length);
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
        assert.strictEqual(results.length, arr.length);
        assert.strictEqual(results.filter(isLeft).length, arr.length);
        assert.strictEqual(
          results.filter((r) => (<Left<Error>>r).left === err).length,
          arr.length
        );
      });

      it("should pass error on erroneous async flow", async () => {
        const results = await flow.then(errAsyncFlow).exec();
        assert.strictEqual(results.length, arr.length);
        assert.strictEqual(results.filter(isLeft).length, arr.length);
        assert.strictEqual(
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

        assert.strictEqual(results.length, rights.length + lefts.length);
        assert.strictEqual(rights.length, arr.length);
        assert.strictEqual(lefts.length, arr.length);

        const rightValues = _.map(rights, (r) => r.right);
        const leftValues = _.map(lefts, (l) => l.left);

        const firstMatches = _.intersection(arr.map(f1), rightValues);
        const secondMatches = _.filter(leftValues, (lv) => lv === err);

        assert.strictEqual(firstMatches.length, arr.length);
        assert.strictEqual(secondMatches.length, arr.length);
      });
    });
  });

  describe("converge, to", () => {
    it("should converge multiple results to a single result", async () => {
      const results = await flow.to((nums) => num).exec();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(isRight(results[0]), true);
      assert.strictEqual((<Right<number>>results[0]).right, num);
    });

    it("should converge multiple results to multiple results", async () => {
      const results = await flow.to((nums) => arr).exec();
      assert.strictEqual(results.length, arr.length);
      assert.strictEqual(results.filter(isRight).length, arr.length);
      assert.strictEqual(
        results.filter((r, idx) => (<Right<number>>r).right === arr[idx])
          .length,
        arr.length
      );
    });

    it("should apply multiple flows on multiple results to turn to multiple results", async () => {
      const f1 = (nums: number[]) => _.map(nums, (x) => 10 * x);
      const f2 = (nums: number[]) => f1(f1(nums));

      const results = await flow.to(f1, f2).exec();
      const [rights] = partitionArray(results, isRight);
      const rightValues = _.map(rights, (_) => _.right);

      assert.strictEqual(results.length, 2 * arr.length);
      assert.strictEqual(_.filter(results, isRight).length, results.length);

      const f1Results = _.intersection(rightValues, f1(arr));
      const f2Results = _.intersection(rightValues, f2(arr));

      assert.strictEqual(f1Results.length, arr.length);
      assert.strictEqual(f2Results.length, arr.length);
    });

    describe("errors", () => {
      it("should converge to a single error on erroneous flow", async () => {
        const results = await flow.to(errFlow).exec();
        assert.strictEqual(results.length, 1);
        assert.strictEqual(isLeft(results[0]), true);
        assert.strictEqual((<Left<Error>>results[0]).left, err);
      });

      it("should converge to partial erroneous results on partially halting flows", async () => {
        const f1 = (nums: number[]) => _.map(nums, (x) => 10 * x);

        const results = await flow.to(f1, errFlow).exec();
        const [lefts, rights] = partitionArray(results, isLeft);
        const leftValues = _.map(lefts, (_) => _.left);
        const rightValues = _.map(rights, (_) => _.right);

        assert.strictEqual(results.length, arr.length + 1);
        assert.strictEqual(lefts.length, 1);
        assert.strictEqual(rights.length, arr.length);
        assert.strictEqual(_.first(leftValues), err);
      });
    });
  });

  describe("exec", () => {
    it("should pass the initial value along", async () => {
      const results = await Flow.lift((_: void) => num).exec();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(isRight(results[0]), true);
      if (isRight(results[0])) {
        assert.strictEqual(results[0].right, num);
      }
    });

    describe("errors", () => {
      it("should return Left with error on erroneous flow", async () => {
        const results = await flow.then(errFlow).exec();
        assert.strictEqual(results.length, arr.length);
        assert.strictEqual(isLeft(results[0]), true);
        assert.strictEqual(
          results.filter((r) => (<Left<Error>>r).left === err).length,
          arr.length
        );
      });
    });
  });
});
