import { validate } from 'class-validator';

import { CreateTaskDto } from './task.dto';

describe('CreateTaskDto', () => {
  it('accepts a declared task type', async () => {
    const dto = Object.assign(new CreateTaskDto(), {
      task_type: 'gen.image',
      model_id: 'example:model',
      params: {},
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects undeclared task types at the public boundary', async () => {
    const dto = Object.assign(new CreateTaskDto(), {
      task_type: 'vendor.private_action',
      model_id: 'example:model',
      params: {},
    });

    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'task_type' })]),
    );
  });
});
