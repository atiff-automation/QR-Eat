# Style and Language

## Default

Use plain, direct English.

- Prefer short sentences.
- Prefer active voice.
- State the action, condition, and expected result.
- Define terms in `GLOSSARY.md`.
- Avoid marketing language and filler.

## STE-lite

STE-lite is an original style profile inspired by public descriptions of ASD-STE100 Simplified Technical English. It is not the standard and does not claim compliance.

Use STE-lite for operational artifacts:

- runbooks;
- deployment and rollback steps;
- security procedures;
- incident steps;
- approval gates;
- handoff contracts;
- user-facing error messages;
- reproduction and test steps.

Do not force it on:

- architecture rationale;
- trade-off analysis;
- research notes;
- product discovery;
- creative work;
- legal text;
- code identifiers and API names.

## Rules

1. One instruction per sentence.
2. Use the imperative for steps: “Run the test,” not “The test should be run.”
3. Put the condition before the action.
4. Keep sentences short: target 20 words for procedures, 25 for description.
5. One topic per paragraph; target 6 sentences maximum.
6. Use one term for one concept; define it in `GLOSSARY.md`.
7. Repeat the noun instead of using an ambiguous pronoun.
8. State units, paths, commands, and expected results.
9. Put warnings before the risky action.
10. Remove filler and marketing language.

## Examples

### Bad

> In order to ensure that the deployment process is able to be completed successfully, it is recommended that the operator should verify that all of the necessary environment variables have been properly configured prior to commencing the deployment.

### Better

> Before you deploy, check the environment variables.
> Run `./scripts/check-env.sh`.
> The command must exit with code 0.
> If it fails, correct the variables and run the command again.

### Bad

> The system will automatically handle any errors that may occur during the payment process.

### Better

> If the payment provider returns an error, show the error message.
> Keep the order in `pending` state.
> Do not mark the order as paid.
> Retry the webhook according to the retry policy.

## ASD-STE100

Facts:

- ASD-STE100 is a controlled natural language for technical documentation.
- Current issue: Issue 9, January 2025.
- It has 53 writing rules and a controlled dictionary of about 900 approved words.
- It is owned by ASD and is copyrighted/trademarked.
- It is not intended for general-purpose writing.
- The official AI white paper says AI is assistive only and human oversight is required.

Rules for this kit:

- Do not copy the ASD-STE100 dictionary or rules into this repository.
- Do not claim an output is “ASD-STE100 compliant.”
- Use STE-lite for operational clarity.
- If full compliance is required by contract or regulation, obtain the official standard and use human review.

## Agent-facing writing

For `AGENTS.md`, agent prompts, and skills:

- put the action first;
- state hard rules explicitly;
- state what not to do;
- use concrete examples for fragile operations;
- avoid vague advice like “write clean code”;
- point to canonical sources instead of duplicating them.

## Human-facing writing

For approvals and reports:

- lead with the decision or outcome;
- state evidence;
- separate facts from assumptions;
- state residual risk;
- state what is not verified.

## Terminology

- One concept, one term.
- Add synonyms only when they are genuinely used by users or the domain.
- Update the glossary when a term changes.
- Do not use three names for the same entity across UI, API, and database.
