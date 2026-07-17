import { validate } from 'class-validator';
import { CreateChannelDto } from '../channel/create-channel.dto';
import { CreateProviderDto } from '../provider/create-provider.dto';

describe('outbound config DTO validation', () => {
  it('rejects a non-HTTPS Provider endpoint before the Catalog write', async () => {
    const dto = Object.assign(new CreateProviderDto(), {
      slug: 'example',
      display_name: 'Example',
      adapter_keys: ['openai-compat'],
      base_url: 'http://gateway.example/v1',
    });

    expect((await validate(dto)).map((error) => error.property)).toContain('base_url');
  });

  it('rejects nested Channel authorization material before the Catalog write', async () => {
    const dto = Object.assign(new CreateChannelDto(), {
      slug: 'example-default',
      display_name: 'Example Default',
      invocation_method: 'http',
      adapter_keys: ['openai-compat'],
      base_url: 'https://gateway.example/v1',
      request_config: { headers: { Authorization: 'Bearer secret' } },
    });

    expect((await validate(dto)).map((error) => error.property)).toContain('request_config');
  });

  it('rejects nested Provider authorization material before the Catalog write', async () => {
    const dto = Object.assign(new CreateProviderDto(), {
      slug: 'example',
      display_name: 'Example',
      adapter_keys: ['openai-compat'],
      auth_config: { headers: { Authorization: 'Bearer secret' } },
    });

    expect((await validate(dto)).map((error) => error.property)).toContain('auth_config');
  });
});
