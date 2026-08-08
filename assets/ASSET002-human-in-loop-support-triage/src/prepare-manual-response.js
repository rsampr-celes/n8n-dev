const reason = 'invalid_response_input';
return [{ json: { response_preparation: { status: 'manual_handling', proposed_response: null, sources: [], confidence: 0, recommended_agent_action: 'manual_response', warnings: [reason], requires_human_approval: true }, validation: { is_valid: false, errors: [{ field: 'response_preparation', code: reason }] } } }];
