const requestInput = $('When Executed by Another Workflow').first().json;
const response = $input.first()?.json ?? {};
const content = response.choices?.[0]?.message?.content ?? null;

return [{ json: { workflow_input: requestInput, provider_content: content } }];
