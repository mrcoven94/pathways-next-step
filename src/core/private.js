// Text a student wrote for a person, not for software. A sealed note prints as "[private]" in JSON,
// strings, templates, logs and errors, so a careless line of code can't carry it anywhere.
// The only way to read it is Sealed.open, and every open leaves a record of who and why, never the text.

const MARK = '[private]';
const PURPOSES = ['advisor_read'];

export class Sealed {
  #text;

  constructor(text) {
    this.#text = String(text ?? '');
    Object.freeze(this);
  }

  /** True when there is nothing inside. Lets the inbox say a note exists without opening it. */
  get empty() { return this.#text.length === 0; }

  toJSON() { return MARK; }
  toString() { return MARK; }
  [Symbol.toPrimitive]() { return MARK; }
  [Symbol.for('nodejs.util.inspect.custom')]() { return MARK; }

  /**
   * @param {Sealed} sealed
   * @param {Array<object>} audit the list every open is appended to; there is no way to open without one
   * @param {{purpose: string, code: string}} why
   */
  static open(sealed, audit, { purpose, code }) {
    if (!(sealed instanceof Sealed) || !(#text in sealed)) throw new TypeError('Not a sealed note.');
    if (!Array.isArray(audit)) throw new TypeError('An open must be recorded.');
    if (!PURPOSES.includes(purpose)) throw new TypeError('Not an allowed reason to open a note.');
    audit.push({ purpose, code: String(code), at: new Date().toISOString() });
    return sealed.#text;
  }
}

export const seal = (text) => new Sealed(text);
