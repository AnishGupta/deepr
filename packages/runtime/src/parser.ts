import {Query} from './query';
import {Expression, SingleExpression, isParallel} from './expression';

/*
parseQuery(query) => expression

Transform a query:

{
  "getMovies=>actionMovies": {
    "()": [{"genre": "action"}],
    "reverse=>": {
      "()": [],
      "=>" {"[]": [], "title": true, "year": true}
    }
  }
}

Into an expression that is easier to execute by the runtime:

{
  "sourceKey": "",
  "nestedExpressions": {
    "actionMovies": {
      "sourceKey": "getMovies",
      "params": [{"genre": "action"}],
      "nextExpression": {
        "sourceKey": "reverse",
        "params": [],
        "useCollectionElements": [],
        "nestedExpressions": {
          "title": {
            "sourceKey": "title"
          },
          "year": {
            "sourceKey": "year"
          }
        }
      }
    }
  }
}
*/

export type ParseQueryOptions = {
  ignoreKeys?: Pattern | Pattern[];
  acceptKeys?: Pattern | Pattern[];
  ignoreBuiltInKeys?: boolean;
};

type Pattern = string | RegExp;

export function parseQuery(
  query: Query,
  {ignoreKeys = [], acceptKeys = [], ignoreBuiltInKeys = true}: ParseQueryOptions = {}
): Expression {
  if (query === undefined) {
    throw new Error(`The 'query' parameter is missing`);
  }

  if (!Array.isArray(ignoreKeys)) {
    ignoreKeys = [ignoreKeys];
  }

  if (!Array.isArray(acceptKeys)) {
    acceptKeys = [acceptKeys];
  }

  return _parseQuery(query, {}, {ignoreKeys, acceptKeys, ignoreBuiltInKeys});
}

function _parseQuery(
  query: Query,
  {sourceKey = '', isOptional}: {sourceKey?: string; isOptional?: boolean},
  {
    ignoreKeys,
    acceptKeys,
    ignoreBuiltInKeys
  }: {ignoreKeys: Pattern[]; acceptKeys: Pattern[]; ignoreBuiltInKeys: boolean}
): Expression {
  if (Array.isArray(query)) {
    return query.map((query) =>
      _parseQuery(query, {sourceKey, isOptional}, {ignoreKeys, acceptKeys, ignoreBuiltInKeys})
    ) as SingleExpression[];
  }

  const parallelQueries = (query as any)?.['||'];

  if (parallelQueries !== undefined) {
    if (Object.keys(query).length !== 1) {
      throw new Error(`A parallel query key must be the unique entry of an object`);
    }

    if (!Array.isArray(parallelQueries)) {
      throw new Error(`A parallel query key ('||') must be associated with an array`);
    }

    const expressions = parallelQueries.map((query) =>
      _parseQuery(query, {sourceKey, isOptional}, {ignoreKeys, acceptKeys, ignoreBuiltInKeys})
    ) as SingleExpression[];

    Object.defineProperty(expressions, isParallel, {value: true});

    return expressions;
  }

  const expression: Expression = {sourceKey, isOptional};

  if (query === true) {
    return expression;
  }

  if (typeof query !== 'object' || query === null) {
    throw new Error(`Invalid query found: ${JSON.stringify(query)}`);
  }

  let params: any[] | undefined;
  let useCollectionElements: number | [number?, number?] | undefined;
  let sourceValue: any;
  let nestedExpressions: {[key: string]: Expression} | undefined;
  let nextExpression: Expression | undefined;

  for (const [key, value] of Object.entries(query)) {
    if (key === '()') {
      if (params !== undefined) {
        throw new Error('Multiple parameters found at the same level');
      }

      if (Array.isArray(value)) {
        params = value;
        continue;
      }

      throw new Error('Parameters must be specified in an array');
    }

    if (key === '[]') {
      if (useCollectionElements !== undefined) {
        throw new Error('Multiple item accessors found at the same level');
      }

      if (typeof value === 'number') {
        useCollectionElements = value;
        continue;
      }

      if (
        Array.isArray(value) &&
        (value.length === 0 ||
          (value.length === 1 && typeof value[0] === 'number') ||
          (value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number'))
      ) {
        useCollectionElements = value as [number?, number?];
        continue;
      }

      throw new Error('Item accessors must be a number, or an array of 0, 1, or 2 numbers');
    }

    if (key === '<=') {
      if (sourceValue !== undefined) {
        throw new Error('Multiple source values found at the same level');
      }

      sourceValue = value;
      continue;
    }

    const {sourceKey, targetKey, isOptional} = parseKey(key);

    if (ignoreBuiltInKeys && getBuiltInKeys().includes(sourceKey)) {
      continue;
    }

    if (testKey(sourceKey, ignoreKeys) && !testKey(sourceKey, acceptKeys)) {
      continue;
    }

    const subexpression = _parseQuery(
      value,
      {sourceKey, isOptional},
      {ignoreKeys, acceptKeys, ignoreBuiltInKeys}
    );

    if (targetKey) {
      if (nestedExpressions === undefined) {
        nestedExpressions = {};
      }

      nestedExpressions[targetKey] = subexpression;
    } else {
      if (nextExpression) {
        throw new Error('Multiple empty targets found at the same level');
      }

      nextExpression = subexpression;
    }
  }

  if (params !== undefined) {
    expression.params = params;
  }

  if (useCollectionElements !== undefined) {
    expression.useCollectionElements = useCollectionElements;
  }

  if (sourceValue !== undefined) {
    expression.sourceValue = sourceValue;
  }

  if (nextExpression !== undefined) {
    if (nestedExpressions) {
      throw new Error('Empty and non-empty targets found at the same level');
    }
    expression.nextExpression = nextExpression;
  }

  if (nestedExpressions !== undefined) {
    expression.nestedExpressions = nestedExpressions;
  }

  return expression;
}

function parseKey(key: string) {
  let sourceKey: string;
  let targetKey: string;
  let isOptional: boolean | undefined;

  const parts = key.split('=>');

  if (parts.length === 1) {
    sourceKey = parts[0];
    ({sourceKey, isOptional} = parseSourceKey(sourceKey));
    targetKey = sourceKey;
  } else if (parts.length === 2) {
    sourceKey = parts[0];
    ({sourceKey, isOptional} = parseSourceKey(sourceKey));
    targetKey = parts[1];
  } else {
    throw new Error(`Invalid key found: '${key}'`);
  }

  return {sourceKey, targetKey, isOptional};
}

function parseSourceKey(sourceKey: string) {
  let isOptional: boolean | undefined;

  if (sourceKey.endsWith('?')) {
    isOptional = true;
    sourceKey = sourceKey.slice(0, -1);
  }

  return {sourceKey, isOptional};
}

function testKey(key: string, patterns: Pattern[]) {
  return patterns.some((pattern) =>
    typeof pattern === 'string' ? pattern === key : pattern.test(key)
  );
}

let _builtInKeys: string[];

function getBuiltInKeys() {
  if (_builtInKeys === undefined) {
    _builtInKeys = [];

    class Obj {}
    const obj = new Obj();
    const func = function () {};

    _addKeys(_builtInKeys, obj);
    _addKeys(_builtInKeys, func);
    _addKeys(_builtInKeys, Obj);
  }

  return _builtInKeys;
}

function _addKeys(array: string[], object: object) {
  while (object) {
    for (const key of Object.getOwnPropertyNames(object)) {
      if (!(key === 'name' || key === 'length' || array.indexOf(key) !== -1)) {
        array.push(key);
      }
    }

    object = Object.getPrototypeOf(object);
  }
}
