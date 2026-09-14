// Text imports are embedded by both Node-target and standalone Bun builds.
// The packaging regression checks this inventory against the complete source trees.
import setup from "../../skills/10x-cli-setup/SKILL.md" with { type: "text" };
import setupReference from "../../skills/10x-cli-setup/references/compatibility.md" with { type: "text" };
import guide from "../../skills/10x-cli-guide/SKILL.md" with { type: "text" };
import guideReference from "../../skills/10x-cli-guide/references/compatibility.md" with { type: "text" };

export const BUNDLED_HELPERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "10x-cli-setup": { "SKILL.md": setup, "references/compatibility.md": setupReference },
  "10x-cli-guide": { "SKILL.md": guide, "references/compatibility.md": guideReference },
};
