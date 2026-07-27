# ASSET001 validation scenarios

The automated suite in `validation.test.mjs` executes the JavaScript embedded in
the exported n8n workflow. This catches drift between the tested contract and
the code that is imported into n8n.

| ID | Scenario | Expected |
| --- | --- | --- |
| V01 | Complete valid lead | Valid canonical lead |
| V02 | Missing full name | `required` |
| V03 | Blank full name | `required` |
| V04 | Invalid email | `invalid_format` |
| V05 | Email over 254 characters | `max_length` |
| V06 | Consent absent | `consent_required` |
| V07 | Consent unchecked | `consent_required` |
| V08 | Invalid phone | `invalid_format` |
| V09 | Valid E.164 phone | Valid |
| V10 | Invalid website | `invalid_format` |
| V11 | Non-HTTP website | `invalid_format` |
| V12 | Unknown service | `invalid_enum` |
| V13 | Unknown budget | `invalid_enum` |
| V14 | Unknown timeline | `invalid_enum` |
| V15 | Message missing | `required` |
| V16 | Message over 5,000 characters | `max_length` |
| V17 | Optional fields blank | Converted to `null`; valid |
| V18 | Multiple invalid fields | All errors returned |
| V19 | Extra canonical property | Rejected by schema |
| V20 | Unsafe control characters | Removed before validation |

Run from the repository root:

```powershell
npm install
npm test
```
