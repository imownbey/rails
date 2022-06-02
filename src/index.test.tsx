/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@esm-bundle/chai';
import {
  JSONObject,
  JSONValue,
  Replicache,
  WriteTransaction,
  TEST_LICENSE_KEY,
} from 'replicache';
import {z, ZodError, ZodTypeAny} from 'zod';
import {nanoid} from 'nanoid';
import {entitySchema, generate, ListOptions} from './index';

const e1 = entitySchema.extend({
  str: z.string(),
  optStr: z.string().optional(),
});
type E1 = z.infer<typeof e1>;

const [createE1, getE1, updateE1, deleteE1, listE1] = generate('e1', e1);

async function directWrite(
  tx: WriteTransaction,
  {key, val}: {key: string; val: JSONValue},
) {
  await tx.put(key, val);
}

const mutators = {
  createE1,
  getE1,
  updateE1,
  deleteE1,
  listE1,
  directWrite,
};

test('create', async () => {
  type Case = {
    name: string;
    preexisting: boolean;
    input: unknown;
    expectError?: JSONValue;
  };

  const id = 'id1';

  const cases: Case[] = [
    {
      name: 'null',
      preexisting: false,
      input: null,
      expectError: {_errors: ['Expected object, received null']},
    },
    {
      name: 'undefined',
      preexisting: false,
      input: undefined,
      expectError: {_errors: ['Required']},
    },
    {
      name: 'string',
      preexisting: false,
      input: 'foo',
      expectError: {_errors: ['Expected object, received string']},
    },
    {
      name: 'no-id',
      preexisting: false,
      input: {str: 'foo'},
      expectError: {_errors: [], id: {_errors: ['Required']}},
    },
    {
      name: 'no-str',
      preexisting: false,
      input: {id},
      expectError: {_errors: [], str: {_errors: ['Required']}},
    },
    {
      name: 'valid',
      preexisting: false,
      input: {id, str: 'foo'},
    },
    {
      name: 'with-opt-filed',
      preexisting: false,
      input: {id, str: 'foo', optStr: 'bar'},
    },
    {
      name: 'preexisting',
      preexisting: true,
      input: {id, str: 'foo'},
    },
  ];

  for (const c of cases) {
    const rep = new Replicache({
      name: nanoid(),
      mutators,
      licenseKey: TEST_LICENSE_KEY,
    });

    if (c.preexisting) {
      await rep.mutate.createE1({id, str: 'preexisting'});
    }

    let error = undefined;
    try {
      await rep.mutate.createE1(c.input as E1);
    } catch (e) {
      error = (e as ZodError).format();
    }

    const actual = await rep.query(async tx => await tx.get(`e1/${id}`));
    if (c.expectError !== undefined) {
      expect(error).deep.eq(c.expectError);
      expect(actual).undefined;
    } else {
      expect(error).undefined;
      expect(actual).deep.eq(c.input);
    }
  }
});

test('get', async () => {
  type Case = {
    name: string;
    stored: unknown;
    expectError?: JSONValue;
  };

  const id = 'id1';

  const cases: Case[] = [
    {
      name: 'null',
      stored: null,
      expectError: {_errors: ['Expected object, received null']},
    },
    {
      name: 'undefined',
      stored: undefined,
    },
    {
      name: 'string',
      stored: 'foo',
      expectError: {_errors: ['Expected object, received string']},
    },
    {
      name: 'no-id',
      stored: {str: 'foo'},
      expectError: {_errors: [], id: {_errors: ['Required']}},
    },
    {
      name: 'no-str',
      stored: {id},
      expectError: {_errors: [], str: {_errors: ['Required']}},
    },
    {
      name: 'valid',
      stored: {id, str: 'foo'},
    },
    {
      name: 'with-opt-filed',
      stored: {id, str: 'foo', optStr: 'bar'},
    },
  ];

  for (const c of cases) {
    const rep = new Replicache({
      name: nanoid(),
      mutators,
      licenseKey: TEST_LICENSE_KEY,
    });

    if (c.stored !== undefined) {
      await rep.mutate.directWrite({key: `e1/${id}`, val: c.stored as E1});
    }
    const {actual, error} = await rep.query(async tx => {
      try {
        return {actual: await getE1(tx, id)};
      } catch (e) {
        return {error: (e as ZodError).format()};
      }
    });
    expect(error).deep.eq(c.expectError, c.name);
    expect(actual).deep.eq(c.expectError ? undefined : c.stored, c.name);
  }
});

test('update', async () => {
  type Case = {
    name: string;
    prev?: unknown;
    update: JSONObject;
    expected?: unknown;
    expectError?: JSONValue;
  };

  const id = 'id1';

  const cases: Case[] = [
    {
      name: 'prev-invalid',
      prev: null,
      update: {},
      expected: undefined,
      expectError: {_errors: ['Expected object, received null']},
    },
    {
      name: 'not-existing-update-id',
      prev: {id, str: 'foo', optStr: 'bar'},
      update: {id: 'bonk', str: 'bar'},
      expected: {id, str: 'foo', optStr: 'bar'},
      expectError: undefined,
    },
    {
      name: 'invalid-update',
      prev: {id, str: 'foo', optStr: 'bar'},
      update: {id, str: 42},
      expected: {id, str: 'foo', optStr: 'bar'},
      expectError: {
        _errors: [],
        str: {_errors: ['Expected string, received number']},
      },
    },
    {
      name: 'valid-update',
      prev: {id, str: 'foo', optStr: 'bar'},
      update: {id, str: 'baz'},
      expected: {id, str: 'baz', optStr: 'bar'},
      expectError: undefined,
    },
  ];

  for (const c of cases) {
    const rep = new Replicache({
      name: nanoid(),
      mutators,
      licenseKey: TEST_LICENSE_KEY,
    });

    if (c.prev !== undefined) {
      await rep.mutate.directWrite({key: `e1/${id}`, val: c.prev as E1});
    }

    let error = undefined;
    let actual = undefined;
    try {
      await rep.mutate.updateE1(c.update as E1);
      actual = await rep.query(async tx => await getE1(tx, id));
    } catch (e) {
      if (e instanceof ZodError) {
        error = e.format();
      } else {
        error = e;
      }
    }
    expect(error).deep.eq(c.expectError, c.name);
    expect(actual).deep.eq(c.expectError ? undefined : c.expected, c.name);
  }
});

test('delete', async () => {
  type Case = {
    name: string;
    prevExist: boolean;
  };

  const id = 'id1';

  const cases: Case[] = [
    {
      name: 'prev-exist',
      prevExist: true,
    },
    {
      name: 'prev-not-exist',
      prevExist: false,
    },
  ];

  for (const c of cases) {
    const rep = new Replicache({
      name: nanoid(),
      mutators,
      licenseKey: TEST_LICENSE_KEY,
    });

    if (c.prevExist) {
      await rep.mutate.directWrite({
        key: `e1/${id}`,
        val: {id, str: 'foo', optStr: 'bar'},
      });
    }
    await rep.mutate.directWrite({
      key: `e1/id2`,
      val: {id: 'id2', str: 'hot', optStr: 'dog'},
    });

    await rep.mutate.deleteE1(id);
    const actualE1 = await rep.query(async tx => await getE1(tx, id));
    const actualE12 = await rep.query(async tx => await getE1(tx, 'id2'));
    expect(actualE1).undefined;
    expect(actualE12).deep.eq({id: 'id2', str: 'hot', optStr: 'dog'});
  }
});

test('list', async () => {
  type Case = {
    name: string;
    prefix: string;
    schema: ZodTypeAny;
    options?: ListOptions;
    expected?: JSONValue[];
    expectError?: JSONValue;
  };

  const cases: Case[] = [
    {
      name: 'all',
      prefix: 'e1',
      schema: e1,
      expected: [
        {id: 'bar', str: 'barstr'},
        {id: 'baz', str: 'bazstr'},
        {id: 'foo', str: 'foostr'},
      ],
      expectError: undefined,
    },
    {
      name: 'keystart',
      prefix: 'e1',
      schema: e1,
      options: {
        startAtID: 'f',
      },
      expected: [{id: 'foo', str: 'foostr'}],
      expectError: undefined,
    },
    {
      name: 'keystart+limit',
      prefix: 'e1',
      schema: e1,
      options: {
        startAtID: 'bas',
        limit: 1,
      },
      expected: [{id: 'baz', str: 'bazstr'}],
      expectError: undefined,
    },
  ];

  for (const c of cases) {
    const rep = new Replicache({
      name: nanoid(),
      mutators,
      licenseKey: TEST_LICENSE_KEY,
    });

    await rep.mutate.directWrite({
      key: `e1/foo`,
      val: {id: 'foo', str: 'foostr'},
    });
    await rep.mutate.directWrite({
      key: `e1/bar`,
      val: {id: 'bar', str: 'barstr'},
    });
    await rep.mutate.directWrite({
      key: `e1/baz`,
      val: {id: 'baz', str: 'bazstr'},
    });

    let error = undefined;
    let actual = undefined;
    try {
      actual = await rep.query(async tx => await listE1(tx, c.options));
    } catch (e) {
      if (e instanceof ZodError) {
        error = e.format();
      } else {
        error = e;
      }
    }
    expect(error).deep.eq(c.expectError, c.name);
    expect(actual).deep.eq(c.expected, c.name);
  }
});
