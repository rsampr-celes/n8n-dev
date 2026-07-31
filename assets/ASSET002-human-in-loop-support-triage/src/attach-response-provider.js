const selected = $('Select Approved Knowledge').first().json;
const response = $input.first()?.json ?? {};
return [{ json: { selected, provider_content: response.choices?.[0]?.message?.content ?? null } }];
