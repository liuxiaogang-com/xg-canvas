export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Parsed structured patch from the assistant — for "apply" button. */
  patch?: import('../../api/agent').AgentReply['patch'];
}
