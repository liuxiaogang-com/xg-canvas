import { PATH_METADATA } from '@nestjs/common/constants';

import { REQUIRE_PERM } from '../../authz/require-perm.decorator';
import { FeatureConfigController } from './feature-config.controller';
import type { FeatureConfigService } from './feature-config.service';

describe('FeatureConfigController model options', () => {
  it('exposes a purpose-specific projection under the feature-config permission', () => {
    const options = [{ resource_uid: 'model-uid' }];
    const service = { getModelOptions: jest.fn().mockReturnValue(options) };
    const controller = new FeatureConfigController(service as unknown as FeatureConfigService);

    expect(controller.modelOptions()).toBe(options);
    expect(service.getModelOptions).toHaveBeenCalledTimes(1);
    expect(Reflect.getMetadata(PATH_METADATA, controller.modelOptions)).toBe('model-options');
    expect(Reflect.getMetadata(REQUIRE_PERM, controller.modelOptions)).toEqual({
      permission: 'system.config.manage',
      scope: 'system',
    });
  });
});
