import { ValidateBy, type ValidationOptions } from 'class-validator';

import { parseOptionalModelInputContract } from './model-input-contract.schema';

export function IsModelInputContract(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isModelInputContract',
      validator: {
        validate(value: unknown): boolean {
          return parseOptionalModelInputContract(value).success;
        },
        defaultMessage(): string {
          return 'input_contract must contain valid modes and reference slots';
        },
      },
    },
    validationOptions,
  );
}
