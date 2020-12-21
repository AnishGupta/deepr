import {possiblyAsync} from 'possibly-async';
import {hasOwnProperty, PromiseLikeable} from 'core-helpers';

import {Expression, SingleExpression, isParallel} from './expression';

export type InvokeExpressionOptions = {
  context?: any;
  authorizer?: Authorizer;
  errorHandler?: ErrorHandler;
};

type Authorizer = (key: string, operation: string, params?: any[]) => PromiseLikeable<boolean>;

type ErrorHandler = (error: Error) => unknown;

export function invokeExpression(
  target: any,
  expression: Expression,
  options: InvokeExpressionOptions = {}
) {
  if (target === undefined) {
    throw new Error(`'target' parameter is missing`);
  }

  if (expression === undefined) {
    throw new Error(`'expression' parameter is missing`);
  }

  return _invokeExpression(target, expression, options);
}

function _invokeExpression(
  target: any,
  expression: Expression,
  options: InvokeExpressionOptions,
  _isMapping = false
): unknown {
  if (Array.isArray(expression)) {
    if (hasOwnProperty(expression, isParallel)) {
      return possiblyAsync.all(
        expression.map((expression) => _invokeExpression(target, expression, options))
      );
    }

    return possiblyAsync.map(expression, (expression) =>
      _invokeExpression(target, expression, options, true)
    );
  }

  const {errorHandler} = options;

  return possiblyAsync.invoke(
    function () {
      return __invokeExpression(target, expression, options);
    },
    function (result) {
      return result;
    },
    function (error: Error) {
      if (errorHandler === undefined) {
        throw error;
      }

      const result = errorHandler.call(target, error);

      return _isMapping ? {[possiblyAsync.breakSymbol]: result} : result;
    }
  );
}

function __invokeExpression(
  target: any,
  {
    sourceKey,
    isOptional,
    params,
    sourceValue,
    useCollectionElements,
    nestedExpressions,
    nextExpression
  }: SingleExpression,
  options: InvokeExpressionOptions
): unknown {
  target = sourceKey ? evaluateKey(target, sourceKey, {params, isOptional}, options) : target;

  return possiblyAsync(target, function (target: any) {
    if (sourceValue !== undefined) {
      target = sourceValue;
    }

    if (!(nestedExpressions || nextExpression)) {
      return target;
    }

    if (target === undefined) {
      if (isOptional) {
        return undefined;
      }

      throw new Error(`Cannot execute a query on \`undefined\` (key: '${sourceKey}')`);
    }

    if (useCollectionElements !== undefined) {
      let collection = target;

      if (typeof useCollectionElements === 'number') {
        let index = useCollectionElements;

        if (index < 0) {
          index = collection.length + index;
        }

        target = collection[index];

        if (target === undefined) {
          if (isOptional) {
            return undefined;
          }

          throw new Error(
            `Cannot execute a query on a missing collection item (key: '${sourceKey}', index: ${index})`
          );
        }
      } else {
        const indexes = useCollectionElements;

        if (indexes.length > 0) {
          collection = collection.slice(...indexes);
        }

        const results = possiblyAsync.map(collection, function (item: any) {
          return _invokeExpression(
            item,
            {sourceKey: '', nestedExpressions, nextExpression},
            options,
            true
          );
        });

        return results;
      }
    }

    if (nextExpression) {
      return _invokeExpression(target, nextExpression, options);
    }

    const results = possiblyAsync.mapValues(nestedExpressions!, function (
      nestedExpression: Expression
    ) {
      return _invokeExpression(target, nestedExpression, options, true);
    });

    return results;
  });
}

function evaluateKey(
  target: any,
  key: string,
  {params, isOptional}: {params?: any[]; isOptional?: boolean},
  options: InvokeExpressionOptions
) {
  const value = target[key];

  if (params === undefined) {
    return evaluateAttribute(target, key, value, options);
  }

  return evaluateMethod(target, key, value, {params, isOptional}, options);
}

function evaluateAttribute(
  target: any,
  key: string,
  value: unknown,
  {authorizer}: InvokeExpressionOptions
) {
  return possiblyAsync(evaluateAuthorizer(target, authorizer, key, 'get'), function (
    isAllowed: boolean
  ) {
    if (!isAllowed) {
      throw new Error(`Cannot get the value of an attribute that is not allowed (name: '${key}')`);
    }

    return value;
  });
}

function evaluateMethod(
  target: any,
  key: string,
  method: (...args: any[]) => unknown,
  {params, isOptional}: {params: any[]; isOptional?: boolean},
  {context, authorizer}: InvokeExpressionOptions
) {
  if (method === undefined) {
    if (isOptional) {
      return undefined;
    }

    throw new Error(`Couldn't find a method matching the key '${key}'`);
  }

  return possiblyAsync(evaluateAuthorizer(target, authorizer, key, 'call', params), function (
    isAllowed: boolean
  ) {
    if (!isAllowed) {
      throw new Error(`Cannot execute a method that is not allowed (name: '${key}')`);
    }

    return method.call(target, ...params, context);
  });
}

function evaluateAuthorizer(
  target: any,
  authorizer: Authorizer | undefined,
  key: string,
  operation: string,
  params?: any[]
) {
  if (authorizer === undefined) {
    return true;
  }

  return authorizer.call(target, key, operation, params);
}
