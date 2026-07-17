import { assertVendorModelIdsFit, maxVendorModelIdLength } from './vendor-model-contract';

describe('vendor model identity contract', () => {
  it('reserves room for the Provider slug and separator', () => {
    expect(maxVendorModelIdLength('example')).toBe(192);
    expect(() => assertVendorModelIdsFit('example', ['x'.repeat(192)])).not.toThrow();
  });

  it('rejects an id that would overflow the canonical model id', () => {
    expect(() => assertVendorModelIdsFit('example', ['x'.repeat(193)])).toThrow(
      'vendor model id exceeds 192 characters',
    );
  });
});
