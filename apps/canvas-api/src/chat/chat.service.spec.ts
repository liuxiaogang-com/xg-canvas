import { MAX_MODEL_ID_LENGTH } from '@xgcanvas/shared-types';
import { ChatService } from './chat.service';

describe('ChatService Catalog model identifiers', () => {
  it('persists and invokes a model id at the shared maximum length', async () => {
    const modelId = `local:${'m'.repeat(MAX_MODEL_ID_LENGTH - 6)}`;
    const conversations = {
      create: jest.fn((value) => ({ id: 'conversation-1', ...value })),
      save: jest.fn(async (value) => value),
    };
    const messages = {
      create: jest.fn((value) => ({ id: `message-${value.role}`, ...value })),
      save: jest.fn(async (value) => value),
      find: jest.fn(async () => []),
    };
    const invoke = {
      invoke: jest.fn(async () => ({ status: 'succeeded', text: 'ok', assets: [] })),
    };
    const service = new ChatService(conversations as never, messages as never, invoke as never);

    await service.send('owner-1', 'workspace-1', { model_id: modelId, message: 'hi' });

    expect(conversations.create).toHaveBeenCalledWith(
      expect.objectContaining({ model_id: modelId }),
    );
    expect(invoke.invoke).toHaveBeenCalledWith(expect.objectContaining({ model_id: modelId }));
  });
});
