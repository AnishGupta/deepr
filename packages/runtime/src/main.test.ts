import {invokeQuery} from './main';

describe('@deepr/runtime', () => {
  describe('Simple queries', () => {
    describe('Synchronous', () => {
      test('Get attributes of an object', () => {
        expect(
          invokeQuery(
            {movie: {title: 'Inception', year: 2010, country: 'USA'}},
            {movie: {title: true, year: true}}
          )
        ).toEqual({
          movie: {title: 'Inception', year: 2010}
        });
      });

      test('Call a method on a collection', () => {
        expect(
          invokeQuery(
            {
              movies: {
                find() {
                  return [{title: 'Inception'}, {title: 'The Matrix'}];
                },
                count() {
                  return 2;
                }
              }
            },
            {movies: {count: {'()': []}}}
          )
        ).toEqual({
          movies: {count: 2}
        });
      });

      test('Get attributes of collection elements', () => {
        expect(
          invokeQuery(
            {
              movies: [
                {title: 'Inception', year: 2010},
                {title: 'The Matrix', year: 1999}
              ]
            },
            {movies: {'[]': [], 'title': true, 'year': true}}
          )
        ).toEqual({
          movies: [
            {title: 'Inception', year: 2010},
            {title: 'The Matrix', year: 1999}
          ]
        });
      });

      test('Call a method on a collection and get attributes of collection elements', () => {
        expect(
          invokeQuery(
            {
              movies: {
                *[Symbol.iterator]() {
                  yield {title: 'Inception', year: 2010};
                  yield {title: 'The Matrix', year: 1999};
                },
                count() {
                  return 2;
                }
              }
            },
            {movies: {'count': {'()': []}, '=>items': {'[]': [], 'title': true, 'year': true}}}
          )
        ).toEqual({
          movies: {
            count: 2,
            items: [
              {title: 'Inception', year: 2010},
              {title: 'The Matrix', year: 1999}
            ]
          }
        });
      });

      test('Get a slice of a collection', () => {
        const object = {
          movies: [
            {title: 'Inception', year: 2010},
            {title: 'The Matrix', year: 1999}
          ]
        };

        expect(invokeQuery(object, {movies: {'[]': [0, 1], 'title': true, 'year': true}})).toEqual({
          movies: [{title: 'Inception', year: 2010}]
        });

        expect(invokeQuery(object, {movies: {'[]': [-1], 'title': true, 'year': true}})).toEqual({
          movies: [{title: 'The Matrix', year: 1999}]
        });
      });

      test('Get an item of a collection', () => {
        const object = {
          movies: [
            {title: 'Inception', year: 2010},
            {title: 'The Matrix', year: 1999}
          ]
        };

        expect(
          invokeQuery(object, {'movies=>movie': {'[]': 0, 'title': true, 'year': true}})
        ).toEqual({
          movie: {title: 'Inception', year: 2010}
        });

        expect(
          invokeQuery(object, {'movies=>movie': {'[]': -1, 'title': true, 'year': true}})
        ).toEqual({
          movie: {title: 'The Matrix', year: 1999}
        });
      });
    });

    describe('Asynchronous', () => {
      test('Get attributes of an object', async () => {
        expect(
          await invokeQuery(
            {movie: makePromise({title: 'Inception', year: 2010, country: 'USA'})},
            {movie: {title: true, year: true}}
          )
        ).toEqual({
          movie: {title: 'Inception', year: 2010}
        });
      });

      test('Call a method on a collection', async () => {
        expect(
          await invokeQuery(
            {
              movies: {
                find() {
                  return [{title: 'Inception'}, {title: 'The Matrix'}];
                },
                async count() {
                  return 2;
                }
              }
            },
            {movies: {count: {'()': []}}}
          )
        ).toEqual({
          movies: {count: 2}
        });
      });

      test('Get attributes of collection elements', async () => {
        expect(
          await invokeQuery(
            {
              movies: makePromise([
                {title: 'Inception', year: 2010},
                {title: 'The Matrix', year: 1999}
              ])
            },
            {movies: {'[]': [], 'title': true, 'year': true}}
          )
        ).toEqual({
          movies: [
            {title: 'Inception', year: 2010},
            {title: 'The Matrix', year: 1999}
          ]
        });
      });

      test('Call a method on a collection and get attributes of collection elements', async () => {
        expect(
          await invokeQuery(
            {
              movies: {
                *[Symbol.iterator]() {
                  yield makePromise({title: 'Inception', year: 2010});
                  yield makePromise({title: 'The Matrix', year: 1999});
                },
                async count() {
                  return 2;
                }
              }
            },
            {movies: {'count': {'()': []}, '=>items': {'[]': [], 'title': true, 'year': true}}}
          )
        ).toEqual({
          movies: {
            count: 2,
            items: [
              {title: 'Inception', year: 2010},
              {title: 'The Matrix', year: 1999}
            ]
          }
        });
      });
    });
  });

  describe('Parameters', () => {
    test('Call a function with multiple parameters', () => {
      expect(
        invokeQuery(
          {
            sum(a: number, b: number) {
              return a + b;
            }
          },
          {sum: {'()': [1, 2]}}
        )
      ).toEqual({sum: 3});
    });

    test('Call a static method of a class', () => {
      class Movies {
        static count() {
          return 2;
        }
      }
      expect(invokeQuery({Movies}, {Movies: {count: {'()': []}}})).toEqual({
        Movies: {count: 2}
      });
    });

    test('Get an attribute of a method', () => {
      class Movies {
        static count() {
          return 2;
        }
      }
      (Movies.count as any).route = '/movies/count';
      expect(invokeQuery({Movies}, {Movies: {count: {route: true}}})).toEqual({
        Movies: {count: {route: '/movies/count'}}
      });
    });
  });

  describe('Keys', () => {
    test('"key" variant', () => {
      expect(
        invokeQuery({movie: {title: 'Inception', year: 2010}}, {movie: {title: true}})
      ).toEqual({movie: {title: 'Inception'}});
    });

    test('"sourceKey=>targetKey" variant', () => {
      expect(
        invokeQuery(
          {
            movies({filter: {genre}}: {filter: {genre: string}}) {
              if (genre === 'action') {
                return [{title: 'Inception'}, {title: 'The Matrix'}];
              }
              if (genre === 'drama') {
                return [{title: 'Forrest Gump'}];
              }
              return [];
            }
          },
          {
            'movies=>actionMovies': {
              '()': [{filter: {genre: 'action'}}],
              '=>': {'[]': [], 'title': true}
            },
            'movies=>dramaMovies': {
              '()': [{filter: {genre: 'drama'}}],
              '=>': {'[]': [], 'title': true}
            }
          }
        )
      ).toEqual({
        actionMovies: [{title: 'Inception'}, {title: 'The Matrix'}],
        dramaMovies: [{title: 'Forrest Gump'}]
      });
    });

    test('"=>targetKey" variant', () => {
      expect(
        invokeQuery(
          {
            movies: {
              *[Symbol.iterator]() {
                yield {title: 'Inception', year: 2010};
                yield {title: 'The Matrix', year: 1999};
              },
              count() {
                return 2;
              }
            }
          },
          {movies: {'count': {'()': []}, '=>items': {'[]': [], 'title': true}}}
        )
      ).toEqual({
        movies: {
          count: 2,
          items: [{title: 'Inception'}, {title: 'The Matrix'}]
        }
      });
    });

    test('"sourceKey=>" variant', () => {
      expect(
        invokeQuery({movie: {title: 'Inception', year: 2010}}, {movie: {'title=>': true}})
      ).toEqual({movie: 'Inception'});
    });

    test('"=>" variant', () => {
      const object = {
        movie({id}: {id: string}) {
          if (id === 'cjrts72gy00ik01rv6eins4se') {
            return {title: 'Inception', year: 2010, country: 'USA'};
          }
          return undefined;
        }
      };

      expect(
        invokeQuery(object, {
          movie: {'()': [{id: 'cjrts72gy00ik01rv6eins4se'}], '=>': {title: true, year: true}}
        })
      ).toEqual({movie: {title: 'Inception', year: 2010}});

      expect(
        invokeQuery(object, {
          movie: {'()': [{id: 'cjrts72gy00ik01rv6eins4se'}], 'title': true, 'year': true}
        })
      ).toEqual({movie: {title: 'Inception', year: 2010}});
    });
  });

  describe('Values', () => {
    test('Boolean `true`', () => {
      expect(
        invokeQuery(
          {movie: {title: 'Inception', year: 2010, country: 'USA'}},
          {movie: {title: true, year: true}}
        )
      ).toEqual({movie: {title: 'Inception', year: 2010}});
    });

    test('Object', () => {
      expect(
        invokeQuery(
          {movie: {title: 'Star Wars', director: {name: 'Georges Lucas', popularity: 70}}},
          {movie: {director: {name: true}}}
        )
      ).toEqual({movie: {director: {name: 'Georges Lucas'}}});
    });

    test('Array', () => {
      expect(
        invokeQuery(
          {movie: {title: 'Inception', year: 2020}},
          {movie: [{title: true}, {year: true}]}
        )
      ).toEqual({movie: [{title: 'Inception'}, {year: 2020}]});
    });
  });

  describe('Fault-tolerant queries', () => {
    describe('Synchronous', () => {
      test('Get attributes of an object', () => {
        expect(() =>
          invokeQuery(
            {movie: {title: 'Inception'}},
            {movie: {title: true, director: {fullName: true}}}
          )
        ).toThrow(/Cannot execute a query on `undefined`/);

        expect(
          invokeQuery(
            {movie: {title: 'Inception'}},
            {movie: {'title': true, 'director?': {fullName: true}}}
          )
        ).toEqual({movie: {title: 'Inception'}});

        expect(
          invokeQuery({movie: {title: 'Inception'}}, {movie: {title: true, director: true}})
        ).toEqual({movie: {title: 'Inception'}});
      });

      test('Call a method on an object', () => {
        expect(() =>
          invokeQuery(
            {movie: {title: 'Inception'}},
            {movie: {title: true, actors: {'()': [{sort: {by: 'popularity'}}]}}}
          )
        ).toThrow(/Couldn't find a method matching the key/);

        expect(
          invokeQuery(
            {movie: {title: 'Inception'}},
            {movie: {'title': true, 'actors?': {'()': [{sort: {by: 'popularity'}}]}}}
          )
        ).toEqual({movie: {title: 'Inception'}});
      });
    });

    describe('Asynchronous', () => {
      test('Get attributes of an object', async () => {
        await expect(
          invokeQuery(
            {movie: makePromise({title: 'Inception'})},
            {movie: {title: true, director: {fullName: true}}}
          )
        ).rejects.toThrow();

        await expect(
          invokeQuery(
            {movie: makePromise({title: 'Inception'})},
            {movie: {'title': true, 'director?': {fullName: true}}}
          )
        ).resolves.toEqual({movie: {title: 'Inception'}});

        await expect(
          invokeQuery(
            {movie: makePromise({title: 'Inception'})},
            {movie: {title: true, director: true}}
          )
        ).resolves.toEqual({movie: {title: 'Inception'}});
      });

      test('Call a method on an object', async () => {
        await expect(
          invokeQuery(
            {movie: makePromise({title: 'Inception'})},
            {movie: {title: true, actors: {'()': [{sort: {by: 'popularity'}}]}}}
          )
        ).rejects.toThrow();

        await expect(
          invokeQuery(
            {movie: makePromise({title: 'Inception'})},
            {movie: {'title': true, 'actors?': {'()': [{sort: {by: 'popularity'}}]}}}
          )
        ).resolves.toEqual({movie: {title: 'Inception'}});
      });
    });
  });

  describe('Source values', () => {
    test('Call a method on an object', () => {
      expect(
        invokeQuery(
          {},
          {
            '<=': {
              _type: 'Movie',
              title: 'Avatar',
              country: 'USA',
              save() {
                const {_type, title, country} = this;
                return {_type, id: 'cjrts72gy00ik01rv6eins4se', title, country};
              }
            },
            'save=>movie': {
              '()': [],
              'id': true
            }
          }
        )
      ).toEqual({
        movie: {
          id: 'cjrts72gy00ik01rv6eins4se'
        }
      });
    });
  });

  describe('Parallel queries', () => {
    test('Call a method two times concurrently', async () => {
      let counter: number;
      let brokenCounter: number;

      const root = {
        increment: async () => {
          const currentBrokenCounter = brokenCounter;
          await sleep(10);
          counter++;
          brokenCounter = currentBrokenCounter + 1;
        }
      };

      // Sequential execution
      counter = 0;
      brokenCounter = 0;
      await invokeQuery(root, [{increment: {'()': []}}, {increment: {'()': []}}]);
      expect(counter).toBe(2);
      expect(brokenCounter).toBe(2);

      // Parallel execution
      counter = 0;
      brokenCounter = 0;
      await invokeQuery(root, {'||': [{increment: {'()': []}}, {increment: {'()': []}}]});
      expect(counter).toBe(2);
      expect(brokenCounter).toBe(1);
    });
  });

  describe('Options', () => {
    test('context', () => {
      expect(
        invokeQuery(
          {
            movie({id}: {id: string}, {accessToken}: {accessToken?: string}) {
              if (accessToken !== 'super-secret-token') {
                throw new Error('Access denied');
              }
              if (id === 'cjrts72gy00ik01rv6eins4se') {
                return {title: 'Inception', year: 2010, country: 'USA'};
              }
              throw new Error('Movie not found');
            }
          },
          {
            movie: {'()': [{id: 'cjrts72gy00ik01rv6eins4se'}], '=>': {title: true}}
          },
          {context: {accessToken: 'super-secret-token'}}
        )
      ).toEqual({movie: {title: 'Inception'}});
    });

    test('ignoreKeys', () => {
      expect(
        invokeQuery(
          {
            user: {
              username: 'steve',
              password: 'secret',
              _privateMethod() {
                return 'private information';
              }
            }
          },
          {
            user: {username: true, password: true, _privateMethod: {'()': []}}
          },
          {ignoreKeys: ['password', /^_/]}
        )
      ).toEqual({user: {username: 'steve'}});
    });

    test('acceptKeys', () => {
      expect(
        invokeQuery(
          {
            user: {
              _id: 'abc123',
              username: 'steve',
              _password: 'secret'
            }
          },
          {
            user: {_id: true, username: true, _password: true}
          },
          {ignoreKeys: /^_/, acceptKeys: '_id'}
        )
      ).toEqual({user: {_id: 'abc123', username: 'steve'}});
    });

    test('ignoreBuiltInKeys', () => {
      const root = {
        user: {
          username: 'steve'
        }
      };

      const query = {
        user: {username: true, hasOwnProperty: {'()': ['username']}}
      };

      expect(invokeQuery(root, query)).toEqual({
        user: {username: 'steve'}
      });

      expect(invokeQuery(root, query, {ignoreBuiltInKeys: false})).toEqual({
        user: {username: 'steve', hasOwnProperty: true}
      });
    });

    test('authorizer', () => {
      const root = {
        user: {
          username: 'steve',
          password: 'secret',
          publicMethod() {
            return 'public information';
          },
          privateMethod() {
            return 'private information';
          }
        }
      };

      const options = {
        authorizer(key: string, operation: string) {
          if (key === 'user' && operation === 'get') {
            return true;
          }
          if (key === 'username' && operation === 'get') {
            return true;
          }
          if (key === 'publicMethod' && operation === 'call') {
            return true;
          }
          return false;
        }
      };

      expect(
        invokeQuery(
          root,
          {
            user: {
              username: true,
              publicMethod: {'()': []}
            }
          },
          options
        )
      ).toEqual({user: {username: 'steve', publicMethod: 'public information'}});

      expect(() =>
        invokeQuery(
          root,
          {
            user: {
              username: true,
              password: true
            }
          },
          options
        )
      ).toThrow('Cannot get the value of an attribute that is not allowed');

      expect(() =>
        invokeQuery(
          root,
          {
            user: {
              publicMethod: {'()': []},
              privateMethod: {'()': []}
            }
          },
          options
        )
      ).toThrow('Cannot execute a method that is not allowed');
    });

    test('errorHandler', () => {
      const root = {
        user: {
          username: 'steve',
          syncMethod() {
            throw new Error('An error occurred while executing a synchronous method');
          },
          asyncMethod() {
            throw new Error('An error occurred while executing an asynchronous method');
          }
        }
      };

      const options = {
        errorHandler(error: Error) {
          return {__error: error.message};
        }
      };

      expect(
        invokeQuery(
          root,
          {
            user: {
              username: true,
              syncMethod: {'()': []},
              asyncMethod: {'()': []}
            }
          },
          options
        )
      ).toEqual({
        user: {
          username: 'steve',
          syncMethod: {__error: 'An error occurred while executing a synchronous method'}
        }
      });

      expect(
        invokeQuery(
          root,
          {
            user: {
              username: true,
              asyncMethod: {'()': []},
              syncMethod: {'()': []}
            }
          },
          options
        )
      ).toEqual({
        user: {
          username: 'steve',
          asyncMethod: {__error: 'An error occurred while executing an asynchronous method'}
        }
      });
    });
  });
});

function makePromise(value: any) {
  return new Promise((resolve) => {
    setTimeout(() => {
      while (typeof value === 'function') {
        value = value();
      }
      resolve(value);
    }, 5);
  });
}

function sleep(duration: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
