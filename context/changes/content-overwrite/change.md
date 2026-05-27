---
change_id: content-overwrite
title: Prevent get command from deleting or overwriting user-modified files
status: preparing
created: 2026-05-27
updated: 2026-05-27
archived_at: null
---

## Notes

Users reported me a following issue: Zbigniew Ciołak
10x3
10xDevs [ENG]
2h
Nie wiem czy to zamierzone, ale w moim przypadku prompt file pobrany przez:

npx @przeprogramowani/10x-cli@latest get m1l2
zostaje automatycznie usunięty w momencie pobrania kolejnej lekcji, np.:

npx @przeprogramowani/10x-cli@latest get m2l1
Udało mi się to obejść zmieniając nazwę skill-explainer.md na inną, natomiast zastanawiam się czy powinienem też uważać na inne pliki (skille/prompty/instrukcje) w kontekście ich retencji pomiędzy lekcjami. Jaka jest tu ogólna polityka? Czy powinienem się spodziewać, że 10x-cli będzie nadpisywał i sprzątał pliki w raz z postępem kursu? Możliwe, że to jakiś bug, ale w logach nie ma informacji o usuniętym pliku:

zbigniew.ciolak@ZCIOLAK1M-WAR1 bartenders_guide % npx @przeprogramowani/10x-cli@latest get m1l2
m1l2 — Tech Stack Selection: From PRD to Recommendation
Greenfield: Use /10x-tech-stack-selector to turn a PRD into a chain hand-off: a recommended starter and a small machine-readable tech-stack.md /10x-bootstrapper consumes. Brownfield: Use /10x-stack-assess to evaluate the current tech stack and dependencies.

Wrote to .github/:
  [unchanged] skill  /Users/zbigniew.ciolak/10xDevs/bartenders_guide/.github/skills/10x-init/SKILL.md
  skill  10x-shape (2 files)
    [unchanged] references/prd-schema.md
    [unchanged] SKILL.md
  [unchanged] skill  /Users/zbigniew.ciolak/10xDevs/bartenders_guide/.github/skills/10x-prd/SKILL.md
  skill  10x-tech-stack-selector (7 files)
    [unchanged] references/agent-friendly-criteria.md
    [unchanged] references/decision-flow.md
    [unchanged] references/eval-cases.md
    [unchanged] references/handoff-schema.md
    [unchanged] references/residual-interview.md
    [unchanged] references/starter-registry.yaml
    [unchanged] SKILL.md
  skill  10x-stack-assess (2 files)
    [unchanged] references/agent-friendly-criteria.md
    [unchanged] SKILL.md
  [created] prompt /Users/zbigniew.ciolak/10xDevs/bartenders_guide/.github/prompts/skill-explainer.md
  [unchanged] rules  .github/copilot-instructions.md (1 block)

zbigniew.ciolak@ZCIOLAK1M-WAR1 bartenders_guide % npx @przeprogramowani/10x-cli@latest get m2l1
m2l1 — MVP Roadmap: TPM Mindset, Milestones, and Agent-Ready Backlog
Open the 10xDevs Workflow by shifting from developer execution to technical project management. Use `/10x-roadmap` to turn Module 1 foundation docs into a vertical-first `context/foundation/roadmap.md`, then translate selected roadmap items into backlog-ready work with stable change identifiers. Covers vertical slices, bounded horizontal enablers, solo/team roadmap tradeoffs, and Jira/Linear MCP as shared project memory without teaching implementation planning yet.

Wrote to .github/:
  [unchanged] skill  /Users/zbigniew.ciolak/10xDevs/bartenders_guide/.github/skills/10x-init/SKILL.md
  skill  10x-shape (2 files)
    [unchanged] references/prd-schema.md
    [unchanged] SKILL.md
  [unchanged] skill  /Users/zbigniew.ciolak/10xDevs/bartenders_guide/.github/skills/10x-prd/SKILL.md
  skill  10x-tech-stack-selector (7 files)
    [unchanged] references/agent-friendly-criteria.md
    [unchanged] references/decision-flow.md
    [unchanged] references/eval-cases.md
    [unchanged] references/handoff-schema.md
    [unchanged] references/residual-interview.md
    [unchanged] references/starter-registry.yaml
    [unchanged] SKILL.md
  skill  10x-stack-assess (2 files)
    [unchanged] references/agent-friendly-criteria.md
    [unchanged] SKILL.md
  skill  10x-bootstrapper (8 files)
    [created] references/bootstrapper-config.yaml
    [created] references/handoff-consumer.md
    [created] references/post-scaffold-verification.md
    [created] references/pre-scaffold-verification.md
    [created] references/refusal-protocol.md
    [created] references/scaffold-merge.md
    [created] references/verification-log-schema.md
    [created] SKILL.md
  skill  10x-health-check (2 files)
    [created] references/health-check-schema.md
    [created] SKILL.md
  [created] skill  /Users/zbigniew.ciolak/10xDevs/bartenders_guide/.github/skills/10x-agents-md/SKILL.md
  [created] skill  /Users/zbigniew.ciolak/10xDevs/bartenders_guide/.github/skills/10x-rule-review/SKILL.md
  [created] skill  /Users/zbigniew.ciolak/10xDevs/bartenders_guide/.github/skills/10x-lesson/SKILL.md
  skill  10x-infra-research (2 files)
    [created] references/agent-friendly-criteria.md
    [created] SKILL.md
  [created] skill  /Users/zbigniew.ciolak/10xDevs/bartenders_guide/.github/skills/10x-roadmap/SKILL.md
  [updated] rules  .github/copilot-instructions.md (1 block)
See less

Like
Reply
Marcin Czarkowski
Admin
AIPH2
2h

Przeprogramowani.pl / Opanuj.ai
Zbigniew Ciołak tak nie powinno się dziać i najpewniej to jednostkowy problem - przeanalizuje sprawę 


Like
Reply
Filip Korpet
10x3
21m

Verification Engineer @ Synopsys
Zbigniew Ciołak U mnie działa to (niestety) tak, że jak sobie ściągnę lekcje np m1l3, zmienię coś w skillach i ściągnę m1l4 to wszystkie zmiany przepadają :/  / It shouldnt work this way. Prompt shouldnt disapear at all and regarding the skill update maybe we should also ask if we detect that skill locally is different from previous version(s) from the api (to understand that user made some custom change) if user want to overwrite, or create a new version so they can merge on their own?
